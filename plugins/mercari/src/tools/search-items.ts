import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { searchMercariItems } from '../mercari-api.js';
import { mapSearchResult, searchResultSchema } from './schemas.js';

const sortValues = ['SORT_SCORE', 'SORT_CREATED_TIME', 'SORT_PRICE', 'SORT_NUM_LIKES'] as const;
const statusValues = ['STATUS_ON_SALE', 'STATUS_TRADING', 'STATUS_SOLD_OUT'] as const;

export const searchItems = defineTool({
  name: 'search_items',
  displayName: 'Search Items',
  description:
    'Search Mercari Japan by keyword for sourcing candidates. Returns item IDs, titles, prices in JPY, images, status, seller IDs, brand/category IDs, and auction fields when present. Use eBay titles or simplified product keywords as the query.',
  summary: 'Search Mercari sourcing candidates',
  icon: 'search',
  group: 'Sourcing',
  input: z.object({
    query: z.string().min(1).describe('Search keywords, e.g. an eBay title or simplified product name'),
    page_token: z.string().default('').describe('Mercari next page token from a previous search, default empty'),
    page_size: z.number().int().min(1).max(120).default(50).describe('Results per page, default 50'),
    sort: z.enum(sortValues).default('SORT_SCORE').describe('Mercari sort enum, default SORT_SCORE'),
    status: z.array(z.enum(statusValues)).default([]).describe('Optional status filters'),
  }),
  output: searchResultSchema,
  handle: async (params) =>
    mapSearchResult(
      await searchMercariItems(params.query, params.page_token, params.page_size, params.sort, params.status),
    ),
});
