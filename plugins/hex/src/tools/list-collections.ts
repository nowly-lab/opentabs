import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgId, graphQL } from '../hex-api.js';
import { collectionSchema, mapCollection, mapConnectionNodes, mapPageInfo, pageInfoSchema } from './schemas.js';
import type { RawCollection, RawConnection } from './schemas.js';

interface CollectionsResponse {
  collections?: RawConnection<RawCollection>;
}

export const listCollections = defineTool({
  name: 'list_collections',
  displayName: 'List Collections',
  description:
    'List Hex collections available in the current organization for project filtering and browsing. Returns collection metadata and pagination when provided by Hex.',
  summary: 'List Hex collections',
  icon: 'library',
  group: 'Organization',
  input: z.object({}),
  output: z.object({
    org_id: z.string().describe('Organization ID used for the query'),
    collections: z.array(collectionSchema).describe('Collections returned by Hex'),
    page_info: pageInfoSchema.describe('Pagination metadata'),
  }),
  handle: async () => {
    const orgId = getOrgId();
    const data = await graphQL<CollectionsResponse>('CollectionsForFilter', { orgId });
    return {
      org_id: orgId,
      collections: mapConnectionNodes(data.collections).map(mapCollection),
      page_info: mapPageInfo(data.collections?.pageInfo),
    };
  },
});
