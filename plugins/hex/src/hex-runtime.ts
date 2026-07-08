import { ToolError, getPageGlobal, waitUntil } from '@opentabs-dev/plugin-sdk';
import { getDraftVersion } from './hex-api.js';

type JsonValue = string | number | boolean | null;

interface RuntimeStore {
  getState?: () => RawRuntimeState;
}

interface RawRuntimeState {
  appSessionMP?: Record<string, RawAppSessionBundle | undefined>;
  outputContent?: Record<string, RawOutputContentBundle | undefined>;
  hexVersionMP?: Record<string, RawHexVersionBundle | undefined>;
}

interface RawAppSessionBundle {
  appSession?: RawAppSession;
  appSessionCells?: {
    entities?: Record<string, RawAppSessionCell | undefined>;
  };
  outputs?: {
    entities?: Record<string, RawOutput | undefined>;
  };
  scope?: {
    entities?: Record<string, RawScopeItem | undefined>;
  };
  cellIdToAppSessionCellId?: Record<string, string | undefined>;
  appSessionCellIdToOutputIds?: Record<string, string[] | undefined>;
}

interface RawAppSession {
  state?: string;
  lastRunStart?: string | null;
  lastRunEnd?: string | null;
}

interface RawAppSessionCell {
  id?: string;
  cellId?: string;
  state?: string;
  lastExecutionStartTime?: string | null;
  lastExecutionEndTime?: string | null;
}

interface RawOutput {
  id?: string;
  appSessionCellId?: string;
  outputType?: string;
  order?: number;
  frontendOutputContents?: RawOutputContentRef[];
}

interface RawOutputContentRef {
  id?: string;
  outputId?: string;
  mimeType?: string;
}

interface RawOutputContentBundle {
  outputContents?: Record<string, RawOutputContent | undefined>;
}

interface RawOutputContent {
  id?: string;
  outputId?: string;
  status?: string;
  contents?: string;
}

interface RawScopeItem {
  name?: string;
  type?: string;
  rawType?: string;
  displayValue?: string;
  dataFrameSchema?: RawDataFrameSchema | null;
}

interface RawDataFrameSchema {
  columns?: Record<string, string>;
  columnsCount?: number;
  rowCount?: number;
  rowCountIsTruncated?: boolean;
}

interface RawHexVersionBundle {
  cellContents?: {
    entities?: Record<string, RawRuntimeCellContents | undefined>;
  };
}

interface RawRuntimeCellContents {
  resultVariable?: string;
}

interface DisplayTableColumn {
  columnId?: string;
  columnName?: string[];
  columnNameDefault?: string;
  columnNameOverride?: string;
  columnType?: string;
  columnData?: JsonValue[];
}

interface DisplayTableContent {
  rowCount?: number;
  columns?: DisplayTableColumn[];
  rowCountBeforeTruncation?: number;
  rowCountOfPreview?: boolean;
  warnings?: string[];
}

interface SqlStatusContent {
  loadedRows?: number;
  finished?: boolean;
  elapsedTime?: number;
}

interface CustomErrorContent {
  errorType?: string;
  traceback?: string;
}

export interface RuntimeOutputSummary {
  id: string;
  output_type: string;
  order: number;
  contents: Array<{
    id: string;
    mime_type: string;
    status: string;
  }>;
}

export interface RuntimeCellResult {
  project_id: string;
  logic_session_id: string;
  app_session_state: string;
  app_session_last_run_start: string;
  app_session_last_run_end: string;
  cell_id: string;
  app_session_cell_id: string;
  cell_state: string;
  last_execution_start: string;
  last_execution_end: string;
  result_variable: string;
  dataframe_schema: {
    columns: Record<string, string>;
    row_count: number;
    row_count_is_truncated: boolean;
  } | null;
  columns: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  rows: Record<string, JsonValue>[];
  row_count: number;
  returned_row_count: number;
  truncated: boolean;
  sql_status: {
    loaded_rows: number;
    finished: boolean;
    elapsed_time_ms: number;
  } | null;
  errors: string[];
  outputs: RuntimeOutputSummary[];
}

export interface ReadRuntimeCellResultOptions {
  projectId: string;
  cellId?: string;
  resultVariable?: string;
  rowLimit?: number;
}

export interface WaitForRuntimeCellResultOptions extends ReadRuntimeCellResultOptions {
  minExecutionStart?: string;
  timeoutMs?: number;
}

const storeFromPage = (): RuntimeStore => {
  const store = getPageGlobal('__APP_SESSION_AO_CONTROLLER__.dataStore');
  if (!store || typeof store !== 'object') {
    throw ToolError.validation('Hex app session runtime is not loaded. Open the project notebook tab and try again.');
  }
  return store as RuntimeStore;
};

const getRuntimeState = (): RawRuntimeState => {
  const state = storeFromPage().getState?.();
  if (!state) throw ToolError.validation('Hex app session state is not available in the current tab.');
  return state;
};

const parseMaybeJson = (value: string): unknown => {
  let parsed: unknown = value;
  for (let index = 0; index < 3; index += 1) {
    if (typeof parsed !== 'string') return parsed;
    const trimmed = parsed.trim();
    if (!trimmed) return '';
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return parsed;
    }
  }
  return parsed;
};

const parseContent = (content: RawOutputContent | undefined): unknown =>
  typeof content?.contents === 'string' ? parseMaybeJson(content.contents) : null;

const ansiEscapePattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const stripAnsi = (value: string): string => value.replace(ansiEscapePattern, '');

const summarizeErrorText = (value: string): string =>
  stripAnsi(value)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('traceId:'))
    .slice(0, 4)
    .join(' | ');

const normalizeError = (value: unknown, depth = 0): string => {
  if (typeof value === 'string') {
    const parsed = parseMaybeJson(value);
    if (parsed !== value && depth < 3) return normalizeError(parsed, depth + 1);
    return summarizeErrorText(value);
  }
  if (Array.isArray(value)) {
    return value
      .map(item => normalizeError(item, depth + 1))
      .filter(Boolean)
      .join('; ');
  }
  if (!value || typeof value !== 'object') return '';

  const record = value as CustomErrorContent;
  const traceback = record.traceback ? summarizeErrorText(record.traceback) : '';
  if (record.errorType && traceback) return `${record.errorType}: ${traceback}`;
  if (traceback) return traceback;
  if (record.errorType) return record.errorType;
  return '';
};

const coerceJsonValue = (value: unknown): JsonValue => {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value as JsonValue;
  return JSON.stringify(value);
};

const resolveColumnName = (column: DisplayTableColumn): string =>
  column.columnNameOverride ?? column.columnNameDefault ?? column.columnName?.join('.') ?? column.columnId ?? '';

const rowsFromDisplayTable = (
  displayTable: DisplayTableContent | null,
  rowLimit: number,
): {
  columns: RuntimeCellResult['columns'];
  rows: RuntimeCellResult['rows'];
  row_count: number;
  truncated: boolean;
} => {
  if (!displayTable?.columns?.length) {
    return { columns: [], rows: [], row_count: displayTable?.rowCount ?? 0, truncated: false };
  }

  const rowCount =
    displayTable.rowCount ?? Math.max(...displayTable.columns.map(column => column.columnData?.length ?? 0), 0);
  const returnedRowCount = Math.min(rowLimit, rowCount);
  const rows = Array.from({ length: returnedRowCount }, (_, rowIndex) => {
    const row: Record<string, JsonValue> = {};
    for (const column of displayTable.columns ?? []) {
      const name = resolveColumnName(column);
      if (!name) continue;
      row[name] = coerceJsonValue(column.columnData?.[rowIndex] ?? null);
    }
    return row;
  });

  return {
    columns: displayTable.columns.map(column => ({
      id: column.columnId ?? '',
      name: resolveColumnName(column),
      type: column.columnType ?? '',
    })),
    rows,
    row_count: rowCount,
    truncated: rowCount > returnedRowCount,
  };
};

const findOutputContent = (
  outputContent: RawOutputContentBundle | undefined,
  contentRef: RawOutputContentRef,
): RawOutputContent | undefined => outputContent?.outputContents?.[contentRef.id ?? ''];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const findDisplayTable = (
  outputs: RawOutput[],
  outputContent: RawOutputContentBundle | undefined,
): DisplayTableContent | null => {
  for (const output of outputs) {
    for (const contentRef of output.frontendOutputContents ?? []) {
      if (contentRef.mimeType !== 'application/vnd.hex.displaytable+json') continue;
      const parsed = parseContent(findOutputContent(outputContent, contentRef));
      if (isRecord(parsed)) return parsed as DisplayTableContent;
    }
  }
  return null;
};

const findSqlStatus = (
  outputs: RawOutput[],
  outputContent: RawOutputContentBundle | undefined,
): RuntimeCellResult['sql_status'] => {
  for (const output of outputs) {
    for (const contentRef of output.frontendOutputContents ?? []) {
      if (contentRef.mimeType !== 'application/vnd.hex.sqlstatus+json') continue;
      const parsed = parseContent(findOutputContent(outputContent, contentRef));
      if (!isRecord(parsed)) continue;
      const status = parsed as SqlStatusContent;
      return {
        loaded_rows: status.loadedRows ?? 0,
        finished: status.finished ?? false,
        elapsed_time_ms: status.elapsedTime ?? 0,
      };
    }
  }
  return null;
};

const collectErrors = (outputs: RawOutput[], outputContent: RawOutputContentBundle | undefined): string[] => {
  const errors: string[] = [];
  for (const output of outputs) {
    if (output.outputType !== 'ERROR') continue;
    for (const contentRef of output.frontendOutputContents ?? []) {
      const message = normalizeError(parseContent(findOutputContent(outputContent, contentRef)));
      if (message) errors.push(message);
    }
  }
  return Array.from(new Set(errors));
};

const summarizeOutputs = (
  outputs: RawOutput[],
  outputContent: RawOutputContentBundle | undefined,
): RuntimeOutputSummary[] =>
  outputs.map(output => ({
    id: output.id ?? '',
    output_type: output.outputType ?? '',
    order: output.order ?? 0,
    contents: (output.frontendOutputContents ?? []).map(contentRef => ({
      id: contentRef.id ?? '',
      mime_type: contentRef.mimeType ?? '',
      status: findOutputContent(outputContent, contentRef)?.status ?? '',
    })),
  }));

const resolveResultVariable = (state: RawRuntimeState, cellId: string, explicitResultVariable: string): string => {
  if (explicitResultVariable) return explicitResultVariable;

  for (const version of Object.values(state.hexVersionMP ?? {})) {
    const resultVariable = version?.cellContents?.entities?.[cellId]?.resultVariable;
    if (resultVariable) return resultVariable;
  }

  return '';
};

const resolveCellId = (state: RawRuntimeState, session: RawAppSessionBundle, resultVariable: string): string => {
  if (!resultVariable) return '';

  for (const version of Object.values(state.hexVersionMP ?? {})) {
    for (const [cellId, contents] of Object.entries(version?.cellContents?.entities ?? {})) {
      if (contents?.resultVariable === resultVariable && session.cellIdToAppSessionCellId?.[cellId]) return cellId;
    }
  }

  return '';
};

export const readRuntimeCellResult = async (options: ReadRuntimeCellResultOptions): Promise<RuntimeCellResult> => {
  const draftVersion = await getDraftVersion(options.projectId);
  const state = getRuntimeState();
  const session = state.appSessionMP?.[draftVersion.logic_session_id];
  if (!session) {
    throw ToolError.validation('Hex app session state for this project is not loaded in the current tab.');
  }

  const requestedResultVariable = options.resultVariable?.trim() ?? '';
  const cellId = options.cellId?.trim() || resolveCellId(state, session, requestedResultVariable);
  if (!cellId)
    throw ToolError.validation('Provide a Hex cell ID. Result-variable lookup requires a loaded cell mapping.');

  const appSessionCellId = session.cellIdToAppSessionCellId?.[cellId] ?? '';
  if (!appSessionCellId) throw ToolError.notFound(`Hex app session cell not found for cell: ${cellId}`);

  const appSessionCell = session.appSessionCells?.entities?.[appSessionCellId];
  const outputIds = session.appSessionCellIdToOutputIds?.[appSessionCellId] ?? [];
  const outputs = outputIds.flatMap(outputId => {
    const output = session.outputs?.entities?.[outputId];
    return output ? [output] : [];
  });
  const outputContent = state.outputContent?.[draftVersion.logic_session_id];
  const displayTable = findDisplayTable(outputs, outputContent);
  const table = rowsFromDisplayTable(displayTable, options.rowLimit ?? 50);
  const resultVariable = resolveResultVariable(state, cellId, requestedResultVariable);
  const scopeItem = resultVariable ? session.scope?.entities?.[resultVariable] : undefined;

  return {
    project_id: options.projectId,
    logic_session_id: draftVersion.logic_session_id,
    app_session_state: session.appSession?.state ?? '',
    app_session_last_run_start: session.appSession?.lastRunStart ?? '',
    app_session_last_run_end: session.appSession?.lastRunEnd ?? '',
    cell_id: cellId,
    app_session_cell_id: appSessionCellId,
    cell_state: appSessionCell?.state ?? '',
    last_execution_start: appSessionCell?.lastExecutionStartTime ?? '',
    last_execution_end: appSessionCell?.lastExecutionEndTime ?? '',
    result_variable: resultVariable,
    dataframe_schema: scopeItem?.dataFrameSchema
      ? {
          columns: scopeItem.dataFrameSchema.columns ?? {},
          row_count: scopeItem.dataFrameSchema.rowCount ?? 0,
          row_count_is_truncated: scopeItem.dataFrameSchema.rowCountIsTruncated ?? false,
        }
      : null,
    columns: table.columns,
    rows: table.rows,
    row_count: table.row_count,
    returned_row_count: table.rows.length,
    truncated: table.truncated,
    sql_status: findSqlStatus(outputs, outputContent),
    errors: collectErrors(outputs, outputContent),
    outputs: summarizeOutputs(outputs, outputContent),
  };
};

const isTerminalCellState = (state: string): boolean => !['', 'QUEUED', 'RUNNING', 'PENDING'].includes(state);

export const waitForRuntimeCellResult = async (
  options: WaitForRuntimeCellResultOptions,
): Promise<RuntimeCellResult> => {
  const minStartMs = options.minExecutionStart ? Date.parse(options.minExecutionStart) : 0;

  await waitUntil(
    async () => {
      try {
        const result = await readRuntimeCellResult(options);
        const executionStartMs = result.last_execution_start ? Date.parse(result.last_execution_start) : 0;
        return isTerminalCellState(result.cell_state) && (!minStartMs || executionStartMs >= minStartMs);
      } catch {
        return false;
      }
    },
    { interval: 500, timeout: options.timeoutMs ?? 30_000 },
  );

  return readRuntimeCellResult(options);
};
