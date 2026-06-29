import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { extractItemIdFromUrl, fetchPage, parseItemStore } from '../ebay-api.js';
import { itemStoreSchema, mapItemStore } from './schemas.js';

export const getItemStore = defineTool({
  name: 'get_item_store',
  displayName: 'Get Item Store',
  description:
    'Read an eBay item page and extract the seller/store link. Use this after search_items when you need to move from a listing to the seller store.',
  summary: 'Find the store for an eBay item',
  icon: 'store',
  group: 'Items',
  input: z
    .object({
      item_id: z.string().min(1).optional().describe('eBay item ID (numeric string, e.g., "236495878573")'),
      item_url: z.string().min(1).optional().describe('Full eBay item URL from search results'),
    })
    .refine(params => Boolean(params.item_id) || Boolean(params.item_url), {
      message: 'Provide either item_id or item_url',
    }),
  output: z.object({
    item_store: itemStoreSchema.describe('Item details plus the detected seller store URL'),
  }),
  handle: async params => {
    const itemId = params.item_id ?? (params.item_url ? extractItemIdFromUrl(params.item_url) : '');
    if (!itemId) throw ToolError.validation('Could not determine item_id from input');

    const itemUrl = params.item_url ?? `https://www.ebay.com/itm/${itemId}`;
    const html = await fetchPage(itemUrl);
    const itemStore = parseItemStore(html, itemId, itemUrl);

    return { item_store: mapItemStore(itemStore) };
  },
});
