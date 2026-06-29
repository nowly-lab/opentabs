import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { extractSellerDescriptionUrl, fetchPage, parseItemDetail } from '../ebay-api.js';
import { itemDetailSchema, mapItemDetail } from './schemas.js';

interface BackgroundFetchContext {
  fetchTextFromBackground: (
    url: string,
    opts?: { headers?: Record<string, string>; timeoutMs?: number; maxLength?: number },
  ) => Promise<string>;
}

const getBackgroundFetchContext = (context: unknown): BackgroundFetchContext | undefined => {
  if (!context || typeof context !== 'object') return undefined;
  const maybeContext = context as BackgroundFetchContext;
  return typeof maybeContext.fetchTextFromBackground === 'function' ? maybeContext : undefined;
};

const fetchSellerDescriptionHtml = async (url: string, context?: unknown): Promise<string> => {
  if (!url) return '';

  try {
    const backgroundContext = getBackgroundFetchContext(context);
    if (backgroundContext) {
      return await backgroundContext.fetchTextFromBackground(url, {
        headers: { Accept: 'text/html' },
        timeoutMs: 20_000,
        maxLength: 256_000,
      });
    }
  } catch {
    // Fall through to page-context fetch for older runtimes or transient bridge failures.
  }

  try {
    return await fetchPage(url);
  } catch {
    return '';
  }
};

export const getItem = defineTool({
  name: 'get_item',
  displayName: 'Get Item',
  description:
    'Get detailed information about a specific eBay item by its item ID. Returns title, price, condition, images, seller info, item specifics, seller description, shipping details, import fees, payment methods, and return policy.',
  summary: 'Get details for an eBay item listing',
  icon: 'package',
  group: 'Items',
  input: z.object({
    item_id: z.string().min(1).describe('eBay item ID (numeric string, e.g., "236495878573")'),
  }),
  output: z.object({ item: itemDetailSchema }),
  handle: async (params, context) => {
    const url = `https://www.ebay.com/itm/${params.item_id}`;
    const html = await fetchPage(url);
    const sellerDescriptionUrl = extractSellerDescriptionUrl(html);
    const sellerDescriptionHtml = await fetchSellerDescriptionHtml(sellerDescriptionUrl, context);

    const rawItem = parseItemDetail(html, params.item_id, { sellerDescriptionHtml });
    return { item: mapItemDetail(rawItem) };
  },
});
