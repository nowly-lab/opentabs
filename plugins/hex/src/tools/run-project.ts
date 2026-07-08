import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { runProject } from '../hex-api.js';
import { runResultSchema } from './schemas.js';

export const runProjectTool = defineTool({
  name: 'run_project',
  displayName: 'Run Project',
  description:
    'Trigger a Hex project draft run through the project logic session. Provide priority_cell_ids to prioritize specific query cells, or omit them to run the project normally. This starts execution and returns run metadata; query result rows are not returned by this tool.',
  summary: 'Trigger a Hex project run',
  icon: 'play',
  group: 'Runs',
  input: z.object({
    project_id: z.string().min(1).describe('Hex project ID'),
    priority_cell_ids: z
      .array(z.string())
      .optional()
      .describe('Optional cell IDs to prioritize during the run (default empty array)'),
    force_overwrite_cache: z
      .boolean()
      .optional()
      .describe('Whether Hex should overwrite cached results for the run (default false)'),
  }),
  output: z.object({
    run: runResultSchema.describe('Hex run trigger result'),
  }),
  handle: async params => ({
    run: await runProject(params.project_id, params.priority_cell_ids ?? [], params.force_overwrite_cache ?? false),
  }),
});
