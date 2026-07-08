import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphQL } from '../hex-api.js';
import { mapProductVersion, productVersionSchema } from './schemas.js';
import type { RawProductVersion } from './schemas.js';

interface ProductVersionsResponse {
  productVersions?: RawProductVersion | RawProductVersion[];
}

export const getProductVersions = defineTool({
  name: 'get_product_versions',
  displayName: 'Get Product Versions',
  description:
    'Get Hex product version metadata including app, client, kernel, and sidecar versions reported by the current web client.',
  summary: 'Get Hex product version metadata',
  icon: 'badge-info',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    versions: z.array(productVersionSchema).describe('Product versions reported by Hex'),
  }),
  handle: async () => {
    const data = await graphQL<ProductVersionsResponse>('ProductVersions', {});
    const versions = Array.isArray(data.productVersions)
      ? data.productVersions
      : data.productVersions
        ? [data.productVersions]
        : [];
    return { versions: versions.map(mapProductVersion) };
  },
});
