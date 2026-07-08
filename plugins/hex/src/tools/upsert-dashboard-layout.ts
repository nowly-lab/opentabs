import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { upsertDashboardLayoutInProject } from '../hex-authoring.js';
import { atomicOperationSchema, dashboardGridRowSchema } from './schemas.js';

const dashboardLayoutRowInputSchema = z.object({
  cell_id: z.string().min(1).describe('Hex cell ID to place in the app/dashboard grid row'),
  start: z
    .number()
    .int()
    .min(0)
    .max(119)
    .optional()
    .describe('Starting grid column, inclusive, on Hex 0-120 grid coordinates (default 0)'),
  end: z
    .number()
    .int()
    .min(1)
    .max(120)
    .optional()
    .describe('Ending grid column, exclusive, on Hex 0-120 grid coordinates (default 120)'),
  show_label: z.boolean().optional().describe('Whether Hex should show the cell label in the app row (default true)'),
  hide_output: z
    .boolean()
    .optional()
    .describe('Whether Hex should hide the cell output in the app row (default false)'),
  show_source: z.boolean().optional().describe('Whether Hex should show source code in the app row (default false)'),
});

export const upsertDashboardLayout = defineTool({
  name: 'upsert_dashboard_layout',
  displayName: 'Upsert Dashboard Layout',
  description:
    'Create Hex app/dashboard grid rows that place existing project cells into the draft app layout. Use this after creating or updating dashboard SQL/text cells so the app canvas renders those outputs. It can replace existing grid rows or delete specific grid row IDs first; it does not publish the app.',
  summary: 'Place Hex cells into the draft dashboard app layout',
  icon: 'layout-grid',
  group: 'Dashboards',
  input: z.object({
    project_id: z.string().min(1).describe('Hex project ID whose draft app layout should be updated'),
    grid_layout_id: z
      .string()
      .optional()
      .describe('Optional Hex grid layout ID. Omit to use the active grid layout loaded in the current editor tab.'),
    rows: z.array(dashboardLayoutRowInputSchema).min(1).max(100).describe('Rows to append to the app layout, in order'),
    replace_existing: z
      .boolean()
      .optional()
      .describe(
        'Whether to delete all existing rows in the selected grid layout before appending rows (default false)',
      ),
    delete_grid_row_ids: z
      .array(z.string().min(1))
      .optional()
      .describe('Specific existing grid row IDs to delete before appending rows'),
  }),
  output: z.object({
    project_id: z.string().describe('Hex project ID whose dashboard layout was updated'),
    version_id: z.string().describe('Draft Hex version ID mutated by the layout operations'),
    grid_layout_id: z.string().describe('Hex grid layout ID that received the rows'),
    deleted_grid_row_ids: z.array(z.string()).describe('Existing grid row IDs deleted before appending rows'),
    created_grid_rows: z.array(dashboardGridRowSchema).describe('Grid rows created for the requested cell placements'),
    operations: z.array(atomicOperationSchema).describe('Hex atomic operation summaries for deletes and row creation'),
  }),
  handle: async params =>
    upsertDashboardLayoutInProject({
      projectId: params.project_id,
      gridLayoutId: params.grid_layout_id,
      rows: params.rows.map(row => ({
        cellId: row.cell_id,
        start: row.start,
        end: row.end,
        showLabel: row.show_label,
        hideOutput: row.hide_output,
        showSource: row.show_source,
      })),
      replaceExisting: params.replace_existing,
      deleteGridRowIds: params.delete_grid_row_ids,
    }),
});
