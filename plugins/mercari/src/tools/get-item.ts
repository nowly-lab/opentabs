import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getMercariItem } from '../mercari-api.js';
import { detailSchema, mapDetail } from './schemas.js';

export const getItem = defineTool({
  name: 'get_item',
  displayName: 'Get Item',
  description:
    'Get Mercari Japan listing details by item ID or item URL. Returns price, status, description, images, condition, seller ratings, shipping, category, likes, and comments for sourcing analysis.',
  summary: 'Get Mercari item details',
  icon: 'package',
  group: 'Sourcing',
  input: z.object({
    item_id: z.string().min(1).describe('Mercari item ID, e.g. m47599413813, or a full item URL'),
  }),
  output: z.object({ item: detailSchema }),
  handle: async (params) => ({ item: mapDetail(await getMercariItem(params.item_id)) }),
});
