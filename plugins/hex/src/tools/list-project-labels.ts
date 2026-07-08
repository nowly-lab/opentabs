import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgId, graphQL } from '../hex-api.js';
import { categorySchema, mapCategory, mapStatus, statusSchema } from './schemas.js';
import type { RawCategory, RawStatus } from './schemas.js';

interface ProjectLabelsResponse {
  orgById?: {
    statuses?: RawStatus[];
    categories?: RawCategory[];
  };
}

export const listProjectLabels = defineTool({
  name: 'list_project_labels',
  displayName: 'List Project Labels',
  description:
    'List both project statuses and categories for the current Hex organization in a single request for label/filter setup.',
  summary: 'List Hex statuses and categories',
  icon: 'badge',
  group: 'Organization',
  input: z.object({}),
  output: z.object({
    org_id: z.string().describe('Organization ID used for the query'),
    statuses: z.array(statusSchema).describe('Project statuses configured for the organization'),
    categories: z.array(categorySchema).describe('Project categories configured for the organization'),
  }),
  handle: async () => {
    const orgId = getOrgId();
    const data = await graphQL<ProjectLabelsResponse>('GetProjectLabelsForHome', { orgId });
    return {
      org_id: orgId,
      statuses: (data.orgById?.statuses ?? []).map(mapStatus),
      categories: (data.orgById?.categories ?? []).map(mapCategory),
    };
  },
});
