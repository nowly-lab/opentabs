import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { navigateToProject } from '../hex-api.js';

export const navigateToProjectTool = defineTool({
  name: 'navigate_to_project',
  displayName: 'Navigate To Project',
  description:
    'Navigate the current Hex tab to a project app or logic route. The tool returns immediately after setting the browser location.',
  summary: 'Open a Hex project in the current tab',
  icon: 'external-link',
  group: 'Projects',
  input: z.object({
    project_id: z.string().min(1).describe('Hex project ID'),
    mode: z.enum(['app', 'logic']).optional().describe('Project route to open: app or logic (default app)'),
  }),
  output: z.object({
    url: z.string().describe('URL that the current Hex tab was navigated to'),
  }),
  handle: async params => ({ url: navigateToProject(params.project_id, params.mode ?? 'app') }),
});
