import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { queryProjects } from './project-query.js';
import { pageInfoSchema, projectSchema } from './schemas.js';

export const listPublishedApps = defineTool({
  name: 'list_published_apps',
  displayName: 'List Published Apps',
  description:
    'List published Hex apps visible in the current organization. Returns published projects with permissions, owners, status, categories, and URLs.',
  summary: 'List published Hex apps',
  icon: 'panel-top',
  group: 'Projects',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of apps to return (default 20)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
    ownership_level: z
      .enum(['ALL', 'OWN'])
      .optional()
      .describe(
        'Project ownership filter: ALL for organization-wide visible apps, OWN for apps owned by you (default ALL)',
      ),
  }),
  output: z.object({
    org_id: z.string().describe('Organization ID used for the query'),
    projects: z.array(projectSchema).describe('Published Hex apps returned by Hex'),
    page_info: pageInfoSchema.describe('Pagination metadata'),
  }),
  handle: async params =>
    queryProjects({
      onlyPublished: true,
      limit: params.limit,
      after: params.after,
      ownershipLevel: params.ownership_level,
    }),
});
