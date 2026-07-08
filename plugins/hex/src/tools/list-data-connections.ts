import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgId, graphQL } from '../hex-api.js';
import { dataConnectionSchema, mapDataConnection } from './schemas.js';
import type { RawDataConnection } from './schemas.js';

interface DataConnectionsResponse {
  orgDataConnections?: RawDataConnection[];
}

export const listDataConnections = defineTool({
  name: 'list_data_connections',
  displayName: 'List Data Connections',
  description:
    'List data connections available from the current Hex organization home sidebar. Returns IDs, names, types, and descriptions when reported by Hex.',
  summary: 'List Hex data connections',
  icon: 'database',
  group: 'Organization',
  input: z.object({}),
  output: z.object({
    org_id: z.string().describe('Organization ID used for the query'),
    data_connections: z.array(dataConnectionSchema).describe('Data connections available in the organization'),
  }),
  handle: async () => {
    const orgId = getOrgId();
    const data = await graphQL<DataConnectionsResponse>('GetDataConnectionsForHomePageSidebar', { orgId });
    return {
      org_id: orgId,
      data_connections: (data.orgDataConnections ?? []).map(mapDataConnection),
    };
  },
});
