import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgId, graphQL } from '../hex-api.js';
import { mapStatus, statusSchema } from './schemas.js';
import type { RawStatus } from './schemas.js';

interface StatusesResponse {
  orgById?: {
    statuses?: RawStatus[];
    defaultStatusId?: string;
    allowMagic?: boolean;
  };
}

export const listStatuses = defineTool({
  name: 'list_statuses',
  displayName: 'List Statuses',
  description:
    'List project statuses configured for the current Hex organization, including the default status ID and Magic availability flag.',
  summary: 'List Hex project statuses',
  icon: 'list-checks',
  group: 'Organization',
  input: z.object({}),
  output: z.object({
    org_id: z.string().describe('Organization ID used for the query'),
    default_status_id: z.string().describe('Default project status ID for the organization'),
    allow_magic: z.boolean().describe('Whether Hex Magic features are enabled for the organization'),
    statuses: z.array(statusSchema).describe('Project statuses configured for the organization'),
  }),
  handle: async () => {
    const orgId = getOrgId();
    const data = await graphQL<StatusesResponse>('GetOrgStatuses', { orgId });
    return {
      org_id: orgId,
      default_status_id: data.orgById?.defaultStatusId ?? '',
      allow_magic: data.orgById?.allowMagic ?? false,
      statuses: (data.orgById?.statuses ?? []).map(mapStatus),
    };
  },
});
