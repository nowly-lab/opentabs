import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgId, graphQL } from '../hex-api.js';
import { categorySchema, mapCategory } from './schemas.js';
import type { RawCategory } from './schemas.js';

interface CategoriesResponse {
  orgById?: {
    categories?: RawCategory[];
  };
}

export const listCategories = defineTool({
  name: 'list_categories',
  displayName: 'List Categories',
  description: 'List project categories configured for the current Hex organization.',
  summary: 'List Hex project categories',
  icon: 'tags',
  group: 'Organization',
  input: z.object({}),
  output: z.object({
    org_id: z.string().describe('Organization ID used for the query'),
    categories: z.array(categorySchema).describe('Project categories configured for the organization'),
  }),
  handle: async () => {
    const orgId = getOrgId();
    const data = await graphQL<CategoriesResponse>('GetOrgCategories', { orgId });
    return {
      org_id: orgId,
      categories: (data.orgById?.categories ?? []).map(mapCategory),
    };
  },
});
