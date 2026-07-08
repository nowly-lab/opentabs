import { ToolError, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { doHexVersionAtomicOperation, getDraftVersion, graphQL } from './hex-api.js';
import type { AtomicOperationSummary, HexAtomicOperationRequest } from './hex-api.js';
import type { RawProjectCell, RawProjectVersion } from './tools/schemas.js';

interface ProjectCellsResponse {
  hexVersionByNumber?: RawProjectVersion & {
    cells?: RawProjectCell[];
  };
}

export interface CreatedCell {
  id: string;
  static_id: string;
  contents_id: string;
  story_element_id: string;
  order: string;
  cell_type: string;
  result_variable: string;
  connection_id: string;
  source: string;
}

export interface CreateSqlCellParams {
  projectId: string;
  source: string;
  resultVariable?: string;
  connectionId?: string;
  orderIndex?: number;
  visibleInApp?: boolean;
}

export interface CreateTextCellParams {
  projectId: string;
  text: string;
  orderIndex?: number;
  visibleInApp?: boolean;
}

export type HexInputCellType =
  | 'TEXT_INPUT'
  | 'NUMERIC_INPUT'
  | 'DROPDOWN'
  | 'TABLE'
  | 'SLIDER'
  | 'DATE'
  | 'BUTTON'
  | 'CHECKBOX'
  | 'MULTISELECT'
  | 'FILE_UPLOAD';

export type HexInputOutputType =
  | 'STRING'
  | 'NUMBER'
  | 'DATA_FRAME'
  | 'DATETIME'
  | 'BOOLEAN'
  | 'DYNAMIC'
  | 'LIST_STRING'
  | 'LIST_NUMBER';

export interface HexInputValueOption {
  key: string;
  value: string;
}

export interface HexInputCellOptions {
  multiline?: boolean;
  increment?: number;
  min?: number;
  max?: number;
  step?: number;
  enableTime?: boolean;
  showRelativeDates?: boolean;
  useDateRange?: boolean;
  valueOptions?: HexInputValueOption[] | { variableName: string | null };
  multiValueOptions?: HexInputValueOption[] | { variableName: string | null };
  style?: 'checkbox' | 'switch';
  text?: string;
  intent?: string;
  icon?: string;
  uploadType?: 'csv' | 'excel' | 'binary';
}

export interface CreateInputCellParams {
  projectId: string;
  name: string;
  inputType?: HexInputCellType;
  outputType?: HexInputOutputType;
  defaultValueString?: string;
  required?: boolean;
  options?: HexInputCellOptions;
  orderIndex?: number;
  visibleInApp?: boolean;
}

export interface CellMutationResult {
  project_id: string;
  version_id: string;
  cell: CreatedCell;
  operation: AtomicOperationSummary;
}

interface RuntimeStore {
  getState?: () => RawLayoutRuntimeState;
}

interface RawLayoutRuntimeState {
  hexVersionMP?: Record<string, RawLayoutHexVersionBundle | undefined>;
}

interface RawLayoutHexVersionBundle {
  gridLayouts?: {
    entities?: Record<string, RawGridLayout | undefined>;
  };
  gridRows?: {
    entities?: Record<string, RawGridRow | undefined>;
  };
}

interface RawGridLayout {
  id?: string;
  deletedDate?: string | null;
}

interface RawGridRow {
  id?: string;
  gridLayoutId?: string;
  deletedDate?: string | null;
  gridColumns?: RawGridColumn[];
}

interface RawGridColumn {
  gridElements?: RawGridElement[];
}

interface RawGridElement {
  type?: string;
  entityId?: string;
  deletedDate?: string | null;
}

export interface DashboardLayoutRowInput {
  cellId: string;
  start?: number;
  end?: number;
  showLabel?: boolean;
  hideOutput?: boolean;
  showSource?: boolean;
}

export interface DashboardLayoutRow {
  id: string;
  grid_layout_id: string;
  grid_column_id: string;
  grid_element_id: string;
  cell_id: string;
  start: number;
  end: number;
  show_label: boolean;
  hide_output: boolean;
  show_source: boolean;
}

export interface UpsertDashboardLayoutParams {
  projectId: string;
  gridLayoutId?: string;
  rows: DashboardLayoutRowInput[];
  replaceExisting?: boolean;
  deleteGridRowIds?: string[];
}

export interface DashboardLayoutMutationResult {
  project_id: string;
  version_id: string;
  grid_layout_id: string;
  deleted_grid_row_ids: string[];
  created_grid_rows: DashboardLayoutRow[];
  operations: AtomicOperationSummary[];
}

const newId = (): string => {
  if (!crypto.randomUUID) throw ToolError.internal('Hex authoring requires browser crypto.randomUUID support.');
  return crypto.randomUUID();
};

export const buildCellOrder = (orderIndex: number): string => `O${String(orderIndex).padStart(9, '0')}`;

const normalizeConnectionId = (connectionId: string | undefined): string | null => {
  const trimmed = connectionId?.trim();
  return trimmed ? trimmed : null;
};

const buildAtomicRequest = (operationType: string, payload: Record<string, unknown>): HexAtomicOperationRequest => ({
  mpClientId: newId(),
  operation: {
    type: operationType,
    payload,
  },
});

const buildStoryElement = (storyElementId: string, now: string, visibleInApp: boolean): Record<string, unknown> => ({
  id: storyElementId,
  createdDate: now,
  updatedDate: now,
  revision: 0,
  visible: visibleInApp,
  showLabel: true,
});

const buildTextRichText = (text: string): Array<Record<string, unknown>> =>
  text.split(/\r?\n/).map(line => ({
    type: 'paragraph',
    children: [{ text: line }],
  }));

const getLoadedLayoutBundle = (versionId: string): RawLayoutHexVersionBundle => {
  const store = getPageGlobal('__APP_SESSION_AO_CONTROLLER__.dataStore') as RuntimeStore | undefined;
  const state = store?.getState?.();
  const bundle = state?.hexVersionMP?.[versionId];
  if (!bundle) {
    throw ToolError.validation(
      'Hex app layout state for this draft is not loaded. Open the project app/logic editor tab and try again.',
    );
  }
  return bundle;
};

const isActiveLayout = (layout: RawGridLayout | undefined): layout is RawGridLayout =>
  Boolean(layout?.id) && layout?.deletedDate == null;

const isActiveGridRow = (row: RawGridRow | undefined, gridLayoutId: string): row is RawGridRow =>
  Boolean(row?.id) && row?.gridLayoutId === gridLayoutId && row?.deletedDate == null;

const resolveGridLayoutId = (versionId: string, gridLayoutId: string | undefined): string => {
  const explicitGridLayoutId = gridLayoutId?.trim();
  if (explicitGridLayoutId) return explicitGridLayoutId;

  const bundle = getLoadedLayoutBundle(versionId);
  const gridLayouts = Object.values(bundle.gridLayouts?.entities ?? {}).filter(isActiveLayout);
  const resolvedGridLayoutId = gridLayouts[0]?.id;
  if (!resolvedGridLayoutId) {
    throw ToolError.notFound('Hex did not expose an active app grid layout for this draft.');
  }
  return resolvedGridLayoutId;
};

const readActiveGridRows = (versionId: string, gridLayoutId: string): RawGridRow[] => {
  const bundle = getLoadedLayoutBundle(versionId);
  return Object.values(bundle.gridRows?.entities ?? {}).filter(row => isActiveGridRow(row, gridLayoutId));
};

const normalizeGridRowInput = (row: DashboardLayoutRowInput): Required<DashboardLayoutRowInput> => {
  const start = row.start ?? 0;
  const end = row.end ?? 120;
  if (start < 0 || start > 119) throw ToolError.validation(`Grid row start is out of range: ${start}`);
  if (end < 1 || end > 120) throw ToolError.validation(`Grid row end is out of range: ${end}`);
  if (start >= end) throw ToolError.validation(`Grid row start must be less than end: ${start} >= ${end}`);

  return {
    cellId: row.cellId,
    start,
    end,
    showLabel: row.showLabel ?? true,
    hideOutput: row.hideOutput ?? false,
    showSource: row.showSource ?? false,
  };
};

const buildGridRowRequest = (row: DashboardLayoutRowInput, gridLayoutId: string): DashboardLayoutRow => {
  const normalizedRow = normalizeGridRowInput(row);
  return {
    id: newId(),
    grid_layout_id: gridLayoutId,
    grid_column_id: newId(),
    grid_element_id: newId(),
    cell_id: normalizedRow.cellId,
    start: normalizedRow.start,
    end: normalizedRow.end,
    show_label: normalizedRow.showLabel,
    hide_output: normalizedRow.hideOutput,
    show_source: normalizedRow.showSource,
  };
};

export const readDraftCells = async (projectId: string): Promise<RawProjectCell[]> => {
  const data = await graphQL<ProjectCellsResponse>('HexVersionMPModel', {
    hexId: projectId,
    version: 'draft',
    hexAlreadyLoaded: false,
    canViewCategoriesOrStatuses: true,
  });

  return data.hexVersionByNumber?.cells ?? [];
};

export const createTextCellInProject = async (params: CreateTextCellParams): Promise<CellMutationResult> => {
  const draftVersion = await getDraftVersion(params.projectId);
  const cellId = newId();
  const staticCellId = newId();
  const contentsId = newId();
  const storyElementId = newId();
  const now = new Date().toISOString();
  const order = buildCellOrder(params.orderIndex ?? 1);

  const operation = await doHexVersionAtomicOperation(
    draftVersion.version_id,
    [
      buildAtomicRequest('CREATE_CELL', {
        cellId,
        staticCellId,
        insertAt: order,
        contents: {
          type: 'TEXT',
          id: contentsId,
          createdDate: now,
          updatedDate: now,
          revision: 0,
          richText: buildTextRichText(params.text),
          cellReferencesV2: null,
          cellReferencesParseError: null,
        },
        storyElement: buildStoryElement(storyElementId, now, params.visibleInApp ?? true),
        componentImportCellId: null,
        blockCellId: null,
        origin: 'ADD_CELL_BAR',
      }),
    ],
    'CREATE_CELL',
  );

  return {
    project_id: params.projectId,
    version_id: draftVersion.version_id,
    cell: {
      id: cellId,
      static_id: staticCellId,
      contents_id: contentsId,
      story_element_id: storyElementId,
      order,
      cell_type: 'TEXT',
      result_variable: '',
      connection_id: '',
      source: params.text,
    },
    operation,
  };
};

const defaultInputOptions = (
  inputType: HexInputCellType,
  options: HexInputCellOptions | undefined,
): HexInputCellOptions => {
  if (options) return options;

  if (inputType === 'DATE') {
    return {
      enableTime: false,
      showRelativeDates: true,
      useDateRange: false,
    };
  }

  return {};
};

const defaultInputOutputType = (inputType: HexInputCellType): HexInputOutputType => {
  switch (inputType) {
    case 'TEXT_INPUT':
    case 'DROPDOWN':
      return 'STRING';
    case 'NUMERIC_INPUT':
    case 'SLIDER':
      return 'NUMBER';
    case 'TABLE':
    case 'FILE_UPLOAD':
      return 'DATA_FRAME';
    case 'DATE':
      return 'DATETIME';
    case 'BUTTON':
    case 'CHECKBOX':
      return 'BOOLEAN';
    case 'MULTISELECT':
      return 'LIST_STRING';
  }
};

export const createInputCellInProject = async (params: CreateInputCellParams): Promise<CellMutationResult> => {
  const draftVersion = await getDraftVersion(params.projectId);
  const cellId = newId();
  const staticCellId = newId();
  const contentsId = newId();
  const storyElementId = newId();
  const now = new Date().toISOString();
  const order = buildCellOrder(params.orderIndex ?? 1);
  const inputType = params.inputType ?? 'TEXT_INPUT';
  const outputType = params.outputType ?? defaultInputOutputType(inputType);
  const name = params.name.trim();

  if (!name) throw ToolError.validation('Hex input cell name cannot be empty.');

  const operation = await doHexVersionAtomicOperation(
    draftVersion.version_id,
    [
      buildAtomicRequest('CREATE_CELL', {
        cellId,
        staticCellId,
        insertAt: order,
        contents: {
          type: 'INPUT',
          id: contentsId,
          createdDate: now,
          updatedDate: now,
          revision: 0,
          name,
          inputType,
          outputType,
          defaultValueString: params.defaultValueString,
          required: params.required ?? false,
          options: defaultInputOptions(inputType, params.options),
        },
        storyElement: buildStoryElement(storyElementId, now, params.visibleInApp ?? true),
        componentImportCellId: null,
        blockCellId: null,
        origin: 'ADD_CELL_BAR',
      }),
    ],
    'CREATE_CELL',
  );

  return {
    project_id: params.projectId,
    version_id: draftVersion.version_id,
    cell: {
      id: cellId,
      static_id: staticCellId,
      contents_id: contentsId,
      story_element_id: storyElementId,
      order,
      cell_type: 'INPUT',
      result_variable: name,
      connection_id: '',
      source: params.defaultValueString ?? '',
    },
    operation,
  };
};

export const upsertDashboardLayoutInProject = async (
  params: UpsertDashboardLayoutParams,
): Promise<DashboardLayoutMutationResult> => {
  const draftVersion = await getDraftVersion(params.projectId);
  const gridLayoutId = resolveGridLayoutId(draftVersion.version_id, params.gridLayoutId);
  const operations: AtomicOperationSummary[] = [];
  const deletedGridRowIds = new Set<string>();

  for (const gridRowId of params.deleteGridRowIds ?? []) {
    const trimmedGridRowId = gridRowId.trim();
    if (trimmedGridRowId) deletedGridRowIds.add(trimmedGridRowId);
  }

  if (params.replaceExisting) {
    for (const row of readActiveGridRows(draftVersion.version_id, gridLayoutId)) {
      if (row.id) deletedGridRowIds.add(row.id);
    }
  }

  const deleteRequests = Array.from(deletedGridRowIds).map(gridRowId =>
    buildAtomicRequest('DELETE_GRID_ROW', { gridRowId }),
  );
  if (deleteRequests.length > 0) {
    operations.push(await doHexVersionAtomicOperation(draftVersion.version_id, deleteRequests, 'DELETE_GRID_ROW'));
  }

  const createdGridRows: DashboardLayoutRow[] = [];
  for (let index = 0; index < params.rows.length; index += 1) {
    const row = params.rows[index];
    if (!row) continue;

    const gridRow = buildGridRowRequest(row, gridLayoutId);
    createdGridRows.push(gridRow);
    operations.push(
      await doHexVersionAtomicOperation(
        draftVersion.version_id,
        [
          buildAtomicRequest('CREATE_GRID_ROW', {
            gridLayoutId,
            gridRowId: gridRow.id,
            insertAt: buildCellOrder(index + 1),
            gridColumns: [
              {
                id: gridRow.grid_column_id,
                start: gridRow.start,
                end: gridRow.end,
                gridElements: [
                  {
                    id: gridRow.grid_element_id,
                    entityId: gridRow.cell_id,
                    type: 'CELL',
                    hideOutput: gridRow.hide_output,
                    showLabel: gridRow.show_label,
                    showSource: gridRow.show_source,
                  },
                ],
              },
            ],
          }),
        ],
        'CREATE_GRID_ROW',
      ),
    );
  }

  return {
    project_id: params.projectId,
    version_id: draftVersion.version_id,
    grid_layout_id: gridLayoutId,
    deleted_grid_row_ids: Array.from(deletedGridRowIds),
    created_grid_rows: createdGridRows,
    operations,
  };
};

export const createSqlCellInProject = async (params: CreateSqlCellParams): Promise<CellMutationResult> => {
  const draftVersion = await getDraftVersion(params.projectId);
  const cellId = newId();
  const staticCellId = newId();
  const contentsId = newId();
  const storyElementId = newId();
  const now = new Date().toISOString();
  const order = buildCellOrder(params.orderIndex ?? 1);
  const connectionId = normalizeConnectionId(params.connectionId);
  const resultVariable = params.resultVariable?.trim() || 'dataframe';

  await doHexVersionAtomicOperation(
    draftVersion.version_id,
    [
      buildAtomicRequest('CREATE_CELL', {
        cellId,
        staticCellId,
        insertAt: order,
        contents: {
          type: 'SQL',
          id: contentsId,
          createdDate: now,
          updatedDate: now,
          revision: 0,
          source: '',
          resultVariable,
          castDecimals: true,
          useNativeDates: true,
          useRichDisplay: false,
          enablePreview: true,
          connectionId,
          dataFrameCell: false,
          sqlDisplayTableConfig: null,
          loadIntoDataFrame: true,
          cellReferencesV2: null,
          cellReferencesParseError: null,
          sqlCellReferencesV3: null,
          jinjaCellReferencesV3: null,
          jinjaSqlReferences: null,
          sqlCellOutputType: 'PANDAS',
          allowDuplicateColumns: false,
        },
        storyElement: buildStoryElement(storyElementId, now, params.visibleInApp ?? true),
        componentImportCellId: null,
        blockCellId: null,
        origin: 'ADD_CELL_BAR',
      }),
    ],
    'CREATE_CELL',
  );

  const operation = await doHexVersionAtomicOperation(
    draftVersion.version_id,
    [
      buildAtomicRequest('UPDATE_SQL_CELL', {
        sqlCellId: contentsId,
        cellId,
        key: 'source',
        value: params.source,
      }),
    ],
    'UPDATE_SQL_CELL',
  );

  return {
    project_id: params.projectId,
    version_id: draftVersion.version_id,
    cell: {
      id: cellId,
      static_id: staticCellId,
      contents_id: contentsId,
      story_element_id: storyElementId,
      order,
      cell_type: 'SQL',
      result_variable: resultVariable,
      connection_id: connectionId ?? '',
      source: params.source,
    },
    operation,
  };
};
