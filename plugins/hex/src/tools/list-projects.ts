import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { queryProjects } from './project-query.js';
import { pageInfoSchema, projectSchema } from './schemas.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description:
    'List Hex projects visible in the current organization, ordered by recently viewed. Returns project metadata, permissions, status, categories, owners, and app/logic URLs.',
  summary: 'List visible Hex projects',
  icon: 'folder',
  group: 'Projects',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of projects to return (default 20)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
    ownership_level: z
      .enum(['ALL', 'OWN'])
      .optional()
      .describe(
        'Project ownership filter: ALL for organization-wide visible projects, OWN for projects owned by you (default ALL)',
      ),
  }),
  output: z.object({
    org_id: z.string().describe('Organization ID used for the query'),
    projects: z.array(projectSchema).describe('Projects returned by Hex'),
    page_info: pageInfoSchema.describe('Pagination metadata'),
  }),
  handle: async params =>
    queryProjects({ limit: params.limit, after: params.after, ownershipLevel: params.ownership_level }),
});
