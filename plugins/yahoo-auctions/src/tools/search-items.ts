import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { buildSearchUrl, fetchSearchPage, parseSearchResults } from '../yahoo-auctions-api.js';
import { mapSearchResult, searchResultSchema } from './schemas.js';

export const searchItems = defineTool({
  name: 'search_items',
  displayName: 'Search Items',
  description:
    'Search Yahoo! Auctions Japan by keyword for sourcing candidates. Returns auction IDs, titles, current/buyout prices in JPY, bids, remaining time, shipping flag, image, and listing URL. Use eBay titles or simplified product keywords as the query.',
  summary: 'Search Yahoo! Auctions sourcing candidates',
  icon: 'search',
  group: 'Sourcing',
  input: z.object({
    query: z.string().min(1).describe('Search keywords, e.g. an eBay title or simplified product name'),
    page: z.number().int().min(1).default(1).describe('Search page number, default 1'),
    per_page: z.number().int().min(20).max(100).default(50).describe('Results per page, default 50'),
  }),
  output: searchResultSchema,
  handle: async params => {
    const url = buildSearchUrl(params.query, params.page, params.per_page);
    const html = await fetchSearchPage(url);
    return mapSearchResult(parseSearchResults(html, params.query, url));
  },
});
