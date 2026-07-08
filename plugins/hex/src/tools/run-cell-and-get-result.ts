import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { runProject } from '../hex-api.js';
import { waitForRuntimeCellResult } from '../hex-runtime.js';
import { cellResultSchema, runResultSchema } from './schemas.js';

export const runCellAndGetResult = defineTool({
  name: 'run_cell_and_get_result',
  displayName: 'Run Cell And Get Result',
  description:
    'Run a single Hex project cell by prioritizing it in the draft app session, then wait for Hex runtime state to expose the terminal cell status and parsed display-table rows. Use this for agent iteration after changing SQL because it verifies the new query result instead of only confirming that Hex accepted a run request.',
  summary: 'Run one Hex cell and return parsed results',
  icon: 'play',
  group: 'Runs',
  input: z.object({
    project_id: z.string().min(1).describe('Hex project ID'),
    cell_id: z.string().min(1).describe('Hex cell ID to run and read results for'),
    result_variable: z
      .string()
      .optional()
      .describe('Optional output dataframe variable name for schema lookup, such as query_1_data'),
    force_overwrite_cache: z
      .boolean()
      .optional()
      .describe('Whether Hex should overwrite cached results for this run (default true)'),
    row_limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum display-table rows to return (default 50, max 500)'),
    timeout_ms: z
      .number()
      .int()
      .min(1000)
      .max(300000)
      .optional()
      .describe('Maximum wait time in milliseconds for terminal cell state (default 30000)'),
  }),
  output: z.object({
    run: runResultSchema.describe('Hex run trigger metadata'),
    result: cellResultSchema.describe('Terminal cell execution result read from Hex app-session state'),
  }),
  handle: async params => {
    const startedAt = new Date().toISOString();
    const run = await runProject(params.project_id, [params.cell_id], params.force_overwrite_cache ?? true);
    const result = await waitForRuntimeCellResult({
      projectId: params.project_id,
      cellId: params.cell_id,
      resultVariable: params.result_variable,
      rowLimit: params.row_limit,
      minExecutionStart: run.last_run_start || startedAt,
      timeoutMs: params.timeout_ms,
    });

    return { run, result };
  },
});
