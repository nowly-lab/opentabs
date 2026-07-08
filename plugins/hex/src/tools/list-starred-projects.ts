import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { queryProjects } from './project-query.js';
import { pageInfoSchema, projectSchema } from './schemas.js';

export const listStarredProjects = defineTool({
  name: 'list_starred_projects',
  displayName: 'List Starred Projects',
  description:
    'List Hex projects starred by the current user in the current organization. Returns project metadata, permissions, owners, status, categories, and URLs.',
  summary: 'List starred Hex projects',
  icon: 'star',
  group: 'Projects',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of projects to return (default 20)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
    ownership_level: z
      .enum(['ALL', 'OWN'])
      .optional()
      .describe(
        'Project ownership filter: ALL for organization-wide visible starred projects, OWN for owned starred projects (default ALL)',
      ),
  }),
  output: z.object({
    org_id: z.string().describe('Organization ID used for the query'),
    projects: z.array(projectSchema).describe('Starred projects returned by Hex'),
    page_info: pageInfoSchema.describe('Pagination metadata'),
  }),
  handle: async params =>
    queryProjects({
      onlyStarred: true,
      limit: params.limit,
      after: params.after,
      ownershipLevel: params.ownership_level,
    }),
});
