import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { readRuntimeCellResult, waitForRuntimeCellResult } from '../hex-runtime.js';
import { cellResultSchema } from './schemas.js';

export const getCellResult = defineTool({
  name: 'get_cell_result',
  displayName: 'Get Cell Result',
  description:
    'Read the latest execution status and result rows for a Hex cell from the active project notebook runtime. The project logic tab must be open so Hex app-session state is loaded. Returns parsed display-table rows when available, plus SQL status and execution errors.',
  summary: 'Read latest Hex cell execution results',
  icon: 'table',
  group: 'Runs',
  input: z.object({
    project_id: z.string().min(1).describe('Hex project ID'),
    cell_id: z.string().min(1).describe('Hex cell ID to read results for'),
    result_variable: z
      .string()
      .optional()
      .describe('Optional output dataframe variable name for schema lookup, such as query_1_data'),
    row_limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum display-table rows to return (default 50, max 500)'),
    wait_for_completion: z
      .boolean()
      .optional()
      .describe('Whether to wait for the cell to reach a terminal execution state before reading (default false)'),
    timeout_ms: z
      .number()
      .int()
      .min(1000)
      .max(300000)
      .optional()
      .describe('Maximum wait time in milliseconds when wait_for_completion is true (default 30000)'),
  }),
  output: z.object({
    result: cellResultSchema.describe('Latest cell execution result read from Hex app-session state'),
  }),
  handle: async params => ({
    result: params.wait_for_completion
      ? await waitForRuntimeCellResult({
          projectId: params.project_id,
          cellId: params.cell_id,
          resultVariable: params.result_variable,
          rowLimit: params.row_limit,
          timeoutMs: params.timeout_ms,
        })
      : await readRuntimeCellResult({
          projectId: params.project_id,
          cellId: params.cell_id,
          resultVariable: params.result_variable,
          rowLimit: params.row_limit,
        }),
  }),
});
