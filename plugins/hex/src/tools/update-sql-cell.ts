import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { buildCellOrder, readDraftCells } from '../hex-authoring.js';
import { doHexVersionAtomicOperation, getDraftVersion } from '../hex-api.js';
import type { HexAtomicOperationRequest } from '../hex-api.js';
import { atomicOperationSchema, mapProjectCell, projectCellSchema } from './schemas.js';

const isSqlCell = (contentsType: string, cellType: string): boolean =>
  contentsType.toLowerCase().includes('sql') || cellType.toUpperCase() === 'SQL';

export const updateSqlCell = defineTool({
  name: 'update_sql_cell',
  displayName: 'Update SQL Cell',
  description:
    'Update the SQL source and optionally the data connection or result variable for an existing Hex SQL cell in the project draft. If contents_id is omitted, the tool reads the draft cells to resolve it from the cell ID.',
  summary: 'Update an existing Hex SQL cell',
  icon: 'pencil',
  group: 'Cells',
  input: z.object({
    project_id: z.string().min(1).describe('Hex project ID'),
    cell_id: z.string().min(1).describe('Hex cell ID to update'),
    contents_id: z
      .string()
      .optional()
      .describe('SQL cell contents ID. Omit to resolve it by reading the project draft cells.'),
    source: z.string().min(1).describe('Replacement SQL source text'),
    result_variable: z
      .string()
      .optional()
      .describe('Optional replacement output dataframe variable name for the SQL cell.'),
    connection_id: z.string().optional().describe('Optional replacement Hex data connection ID for the SQL cell.'),
  }),
  output: z.object({
    project_id: z.string().describe('Hex project ID'),
    version_id: z.string().describe('Draft Hex version ID mutated by the operation'),
    cell: projectCellSchema.describe('Updated SQL cell as read back from the project draft'),
    operation: atomicOperationSchema.describe('Hex atomic operation summary'),
  }),
  handle: async params => {
    const draftVersion = await getDraftVersion(params.project_id);
    const cells = await readDraftCells(params.project_id);
    const existingCell = cells.find(cell => cell.id === params.cell_id);
    const mappedExistingCell = existingCell ? mapProjectCell(existingCell, true) : null;
    const contentsId = params.contents_id ?? mappedExistingCell?.contents_id;

    if (!existingCell || !mappedExistingCell) throw ToolError.notFound(`Hex cell not found: ${params.cell_id}`);
    if (!contentsId) throw ToolError.notFound(`Hex SQL cell contents ID not found for cell: ${params.cell_id}`);
    if (!isSqlCell(mappedExistingCell.contents_type, mappedExistingCell.cell_type)) {
      throw ToolError.validation(`Hex cell is not a SQL cell: ${params.cell_id}`);
    }

    const operations: HexAtomicOperationRequest[] = [
      {
        mpClientId: crypto.randomUUID(),
        operation: {
          type: 'UPDATE_SQL_CELL',
          payload: {
            sqlCellId: contentsId,
            cellId: params.cell_id,
            key: 'source',
            value: params.source,
          },
        },
      },
    ];

    if (params.connection_id !== undefined) {
      operations.push({
        mpClientId: crypto.randomUUID(),
        operation: {
          type: 'UPDATE_SQL_CELL',
          payload: {
            sqlCellId: contentsId,
            cellId: params.cell_id,
            key: 'connectionId',
            value: params.connection_id.trim() || null,
          },
        },
      });
    }

    if (params.result_variable !== undefined) {
      operations.push({
        mpClientId: crypto.randomUUID(),
        operation: {
          type: 'UPDATE_SQL_CELL',
          payload: {
            sqlCellId: contentsId,
            cellId: params.cell_id,
            key: 'resultVariable',
            value: params.result_variable.trim() || 'dataframe',
          },
        },
      });
    }

    const operation = await doHexVersionAtomicOperation(draftVersion.version_id, operations, 'UPDATE_SQL_CELL');

    const updatedCells = await readDraftCells(params.project_id);
    const updatedCell = updatedCells.find(cell => cell.id === params.cell_id);
    const mappedCell = updatedCell
      ? mapProjectCell(updatedCell, true)
      : {
          ...mappedExistingCell,
          connection_id: params.connection_id ?? mappedExistingCell.connection_id,
          order: mappedExistingCell.order || buildCellOrder(1),
          result_variable: params.result_variable ?? mappedExistingCell.result_variable,
          source: params.source,
        };

    return {
      project_id: params.project_id,
      version_id: draftVersion.version_id,
      cell: mappedCell,
      operation,
    };
  },
});
