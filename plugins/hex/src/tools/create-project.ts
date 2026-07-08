import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { createHexProject } from '../hex-api.js';
import { authoredProjectSchema } from './schemas.js';

export const createProject = defineTool({
  name: 'create_project',
  displayName: 'Create Project',
  description:
    'Create a new Hex project in the current organization and resolve its draft version and logic session IDs. Use this before adding query or text cells programmatically.',
  summary: 'Create a Hex project for authoring',
  icon: 'folder-plus',
  group: 'Projects',
  input: z.object({
    title: z.string().min(1).describe('Project title to create'),
    description: z.string().optional().describe('Plain text project description (default empty)'),
    project_language: z
      .enum(['PYTHON', 'R'])
      .optional()
      .describe('Project language for new code cells (default PYTHON)'),
    status_id: z.string().optional().describe('Optional Hex status ID to assign to the project'),
    category_ids: z.array(z.string()).optional().describe('Optional Hex category IDs to assign to the project'),
    collection_id: z.string().optional().describe('Optional Hex collection ID to create the project in'),
  }),
  output: z.object({
    project: authoredProjectSchema.describe('Created Hex project and authoring identifiers'),
  }),
  handle: async params => ({
    project: await createHexProject({
      title: params.title,
      description: params.description,
      projectLanguage: params.project_language,
      statusId: params.status_id,
      categoryIds: params.category_ids,
      collectionId: params.collection_id,
    }),
  }),
});
