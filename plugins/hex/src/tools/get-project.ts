import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { queryProjects } from './project-query.js';
import { projectSchema } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description:
    'Get a single Hex project by project ID using the home project GraphQL query. Returns project metadata, permissions, status, categories, owners, and URLs.',
  summary: 'Get one Hex project by ID',
  icon: 'folder-open',
  group: 'Projects',
  input: z.object({
    project_id: z.string().min(1).describe('Hex project ID'),
  }),
  output: z.object({
    project: projectSchema.describe('Project matching the requested ID'),
  }),
  handle: async params => {
    const result = await queryProjects({ projectIds: [params.project_id], limit: 1 });
    const project = result.projects[0];
    if (!project) throw ToolError.notFound(`Hex project not found: ${params.project_id}`);
    return { project };
  },
});
