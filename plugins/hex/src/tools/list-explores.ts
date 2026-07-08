import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphQL } from '../hex-api.js';
import { exploreSchema, mapConnectionNodes, mapExplore, mapPageInfo, pageInfoSchema } from './schemas.js';
import type { RawConnection, RawExplore } from './schemas.js';

interface ExploresResponse {
  exploresV2?: RawConnection<RawExplore>;
}

export const listExplores = defineTool({
  name: 'list_explores',
  displayName: 'List Explores',
  description:
    'List Hex explores ordered by creation date descending. Returns IDs, titles, descriptions, creators, timestamps, and pagination metadata.',
  summary: 'List Hex explores',
  icon: 'compass',
  group: 'Explores',
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of explores to return (default 10)'),
  }),
  output: z.object({
    explores: z.array(exploreSchema).describe('Explores returned by Hex'),
    page_info: pageInfoSchema.describe('Pagination metadata'),
  }),
  handle: async params => {
    const data = await graphQL<ExploresResponse>('GetExplores', {
      sortField: 'CREATED_DATE',
      sortDirection: 'DESC',
      saved: 'INCLUDE',
      after: null,
      before: null,
      last: null,
      first: params.limit ?? 10,
    });
    return {
      explores: mapConnectionNodes(data.exploresV2).map(mapExplore),
      page_info: mapPageInfo(data.exploresV2?.pageInfo),
    };
  },
});
