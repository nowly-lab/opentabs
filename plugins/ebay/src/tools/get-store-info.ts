import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { buildStoreUrl, fetchPage, parseStoreInfo } from '../ebay-api.js';
import { mapStoreInfo, storeInfoSchema } from './schemas.js';

export const getStoreInfo = defineTool({
  name: 'get_store_info',
  displayName: 'Get Store Info',
  description:
    'Read an eBay store page and return store profile information, including whether the page indicates that items ship from Japan.',
  summary: 'Get eBay store information',
  icon: 'store',
  group: 'Stores',
  input: z
    .object({
      store_url: z.string().min(1).optional().describe('Full eBay store URL, e.g. "https://www.ebay.com/str/name"'),
      store_slug: z.string().min(1).optional().describe('Store slug from /str/{slug}'),
    })
    .refine(params => Boolean(params.store_url) || Boolean(params.store_slug), {
      message: 'Provide either store_url or store_slug',
    }),
  output: z.object({
    store: storeInfoSchema.describe('Store profile and Japan-shipping detection result'),
  }),
  handle: async params => {
    const storeUrl = buildStoreUrl({ storeUrl: params.store_url, storeSlug: params.store_slug });
    const html = await fetchPage(storeUrl);
    const store = parseStoreInfo(html, storeUrl);

    return { store: mapStoreInfo(store) };
  },
});
