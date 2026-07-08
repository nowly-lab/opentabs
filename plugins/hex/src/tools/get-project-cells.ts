import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphQL } from '../hex-api.js';
import { mapProjectCell, mapProjectVersion, projectCellSchema, projectVersionSchema } from './schemas.js';
import type { RawProjectCell, RawProjectVersion } from './schemas.js';

interface ProjectCellsResponse {
  hexById?: {
    id?: string;
    title?: string;
    effectiveRole?: string;
    canEdit?: boolean;
    canViewLogic?: boolean;
  };
  hexVersionByNumber?: RawProjectVersion & {
    canEdit?: boolean;
    cells?: RawProjectCell[];
  };
}

export const getProjectCells = defineTool({
  name: 'get_project_cells',
  displayName: 'Get Project Cells',
  description:
    'Get cells from a Hex project version, including labels, types, result variables, data connection IDs, and source text when requested. Use this to inspect existing dashboard logic and SQL.',
  summary: 'Inspect Hex project cells and source',
  icon: 'braces',
  group: 'Projects',
  input: z.object({
    project_id: z.string().min(1).describe('Hex project ID'),
    version: z.string().optional().describe('Hex version string to inspect (default draft)'),
    include_source: z.boolean().optional().describe('Whether to include cell source text in the output (default true)'),
    include_deleted: z.boolean().optional().describe('Whether to include deleted cells (default false)'),
    limit: z.number().int().min(1).max(250).optional().describe('Maximum number of cells to return (default 100)'),
  }),
  output: z.object({
    project: z
      .object({
        id: z.string().describe('Hex project ID'),
        title: z.string().describe('Project title'),
        effective_role: z.string().describe('Current user effective role for the project'),
        can_edit: z.boolean().describe('Whether the current user can edit this project'),
        can_view_logic: z.boolean().describe('Whether the current user can view project logic'),
      })
      .describe('Project metadata returned with the version model'),
    version: projectVersionSchema.describe('Hex version metadata'),
    cells: z.array(projectCellSchema).describe('Cells in the requested Hex project version'),
  }),
  handle: async params => {
    const requestedVersion = params.version ?? 'draft';
    const data = await graphQL<ProjectCellsResponse>('HexVersionMPModel', {
      hexId: params.project_id,
      version: requestedVersion,
      hexAlreadyLoaded: false,
      canViewCategoriesOrStatuses: true,
    });

    const includeSource = params.include_source ?? true;
    const cells = (data.hexVersionByNumber?.cells ?? [])
      .map(cell => mapProjectCell(cell, includeSource))
      .filter(cell => (params.include_deleted ? true : !cell.deleted))
      .slice(0, params.limit ?? 100);

    return {
      project: {
        id: data.hexById?.id ?? params.project_id,
        title: data.hexById?.title ?? '',
        effective_role: data.hexById?.effectiveRole ?? '',
        can_edit: data.hexVersionByNumber?.canEdit ?? data.hexById?.canEdit ?? false,
        can_view_logic: data.hexById?.canViewLogic ?? (data.hexVersionByNumber?.cells?.length ?? 0) > 0,
      },
      version: mapProjectVersion(data.hexVersionByNumber ?? {}, requestedVersion),
      cells,
    };
  },
});
