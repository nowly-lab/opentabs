import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import {
  buildStoreItemsUrl,
  buildStoreUrl,
  fetchPage,
  parseStoreInfo,
  parseStoreItems,
  parseStoreResultCount,
} from '../ebay-api.js';
import { mapStoreInfo, mapStoreItem, storeInfoSchema, storeItemSchema } from './schemas.js';

type StoreItemResult = ReturnType<typeof mapStoreItem>;

export const listStoreItems = defineTool({
  name: 'list_store_items',
  displayName: 'List Store Items',
  description:
    'List items from an eBay store. By default, the tool first checks the store page and only scans listings when Japan shipping/from-Japan signals are detected.',
  summary: 'List items from a Japan-shipping eBay store',
  icon: 'list',
  group: 'Stores',
  input: z
    .object({
      store_url: z.string().min(1).optional().describe('Full eBay store URL, e.g. "https://www.ebay.com/str/name"'),
      store_slug: z.string().min(1).optional().describe('Store slug from /str/{slug}'),
      query: z.string().min(1).optional().describe('Optional keyword filter within the store'),
      page: z.number().int().min(1).optional().describe('First store listing page to scan (default 1)'),
      max_pages: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Maximum number of store pages to scan before returning (default 25)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .optional()
        .describe('Maximum number of listings to return (default 1000)'),
      require_japan_shipping: z
        .boolean()
        .optional()
        .describe(
          'When true, return no listings unless the store or first listing page indicates Japan shipping (default true)',
        ),
    })
    .refine(params => Boolean(params.store_url) || Boolean(params.store_slug), {
      message: 'Provide either store_url or store_slug',
    }),
  output: z.object({
    store: storeInfoSchema.describe('Store profile and Japan-shipping detection result'),
    total_results: z.number().describe('Approximate store listing count if detected'),
    scanned_pages: z.number().describe('Number of store listing pages fetched'),
    has_more: z.boolean().describe('True when max_pages or limit may have stopped a larger result set'),
    skipped_reason: z.string().describe('Reason listings were not scanned, empty when scanning ran'),
    items: z.array(storeItemSchema).describe('Store listings'),
  }),
  handle: async params => {
    const storeUrl = buildStoreUrl({ storeUrl: params.store_url, storeSlug: params.store_slug });
    const startPage = params.page ?? 1;
    const maxPages = params.max_pages ?? 25;
    const limit = params.limit ?? 1000;
    const requireJapanShipping = params.require_japan_shipping ?? true;

    const firstUrl = buildStoreItemsUrl(storeUrl, startPage, params.query);
    const firstHtml = await fetchPage(firstUrl);
    const firstPageItems = parseStoreItems(firstHtml);
    const firstPageJapanSignals = firstPageItems
      .filter(item => item.shipsFromJapan)
      .slice(0, 5)
      .map(item => `item ${item.itemId}: ${item.location || item.shipping || 'from Japan'}`);

    const parsedStore = parseStoreInfo(firstHtml, storeUrl);
    const store =
      firstPageJapanSignals.length > 0 && !parsedStore.shipsFromJapan
        ? {
            ...parsedStore,
            shipsFromJapan: true,
            japanSignals: [...parsedStore.japanSignals, ...firstPageJapanSignals],
          }
        : parsedStore;

    const totalResults = parseStoreResultCount(firstHtml);

    if (requireJapanShipping && !store.shipsFromJapan) {
      return {
        store: mapStoreInfo(store),
        total_results: totalResults,
        scanned_pages: 1,
        has_more: false,
        skipped_reason: 'Store page and first listing page did not show Japan shipping/from-Japan signals.',
        items: [],
      };
    }

    const items: StoreItemResult[] = [];
    const seen = new Set<string>();

    const addItems = (rawItems: typeof firstPageItems): void => {
      for (const item of rawItems) {
        if (items.length >= limit) return;
        if (seen.has(item.itemId)) continue;
        seen.add(item.itemId);
        items.push(mapStoreItem(item));
      }
    };

    addItems(firstPageItems);
    let scannedPages = 1;
    let hasMore = firstPageItems.length > items.length;

    for (let pageOffset = 1; pageOffset < maxPages && items.length < limit; pageOffset += 1) {
      const page = startPage + pageOffset;
      const html = await fetchPage(buildStoreItemsUrl(storeUrl, page, params.query));
      scannedPages += 1;

      const rawItems = parseStoreItems(html);
      if (rawItems.length === 0) break;

      const before = items.length;
      addItems(rawItems);
      if (items.length >= limit) {
        hasMore = true;
        break;
      }
      if (items.length === before) break;
    }

    const reportedTotal = totalResults || items.length;
    hasMore = hasMore || reportedTotal > items.length || scannedPages >= maxPages;

    return {
      store: mapStoreInfo(store),
      total_results: reportedTotal,
      scanned_pages: scannedPages,
      has_more: hasMore,
      skipped_reason: '',
      items,
    };
  },
});
