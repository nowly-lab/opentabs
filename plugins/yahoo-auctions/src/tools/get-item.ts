import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { buildItemUrl, fetchPage, parseItemDetail } from '../yahoo-auctions-api.js';
import { detailSchema, mapDetail } from './schemas.js';

export const getItem = defineTool({
  name: 'get_item',
  displayName: 'Get Item',
  description:
    'Get Yahoo! Auctions Japan listing details by auction ID or item URL. Returns current/buyout/start prices in JPY, bids, watchers, condition, seller, shipping, category, images, and description for sourcing analysis.',
  summary: 'Get Yahoo! Auctions item details',
  icon: 'package',
  group: 'Sourcing',
  input: z.object({
    auction_id: z.string().min(1).describe('Yahoo! Auctions auction ID, e.g. d1226654804, or a full item URL'),
  }),
  output: z.object({ item: detailSchema }),
  handle: async params => {
    const url = buildItemUrl(params.auction_id);
    const html = await fetchPage(url);
    return { item: mapDetail(parseItemDetail(html, url)) };
  },
});
