import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { queryProjects } from './project-query.js';
import { pageInfoSchema, projectSchema } from './schemas.js';

export const searchProjects = defineTool({
  name: 'search_projects',
  displayName: 'Search Projects',
  description:
    'Search Hex projects in the current organization by text. Returns the same project metadata as list_projects and supports cursor pagination.',
  summary: 'Search visible Hex projects',
  icon: 'search',
  group: 'Projects',
  input: z.object({
    search_term: z.string().min(1).describe('Text to search for in Hex projects'),
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
    projects: z.array(projectSchema).describe('Projects matching the search text'),
    page_info: pageInfoSchema.describe('Pagination metadata'),
  }),
  handle: async params =>
    queryProjects({
      searchTerm: params.search_term,
      limit: params.limit,
      after: params.after,
      ownershipLevel: params.ownership_level,
    }),
});
