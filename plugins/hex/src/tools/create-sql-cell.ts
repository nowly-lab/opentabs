import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { createSqlCellInProject } from '../hex-authoring.js';
import { runProject } from '../hex-api.js';
import { atomicOperationSchema, createdCellSchema, runResultSchema } from './schemas.js';

export const createSqlCell = defineTool({
  name: 'create_sql_cell',
  displayName: 'Create SQL Cell',
  description:
    'Create a SQL query cell in a Hex project draft and set its SQL source. Optionally trigger a project run after creating the query. Use list_data_connections first when the query must run against a specific warehouse connection.',
  summary: 'Add a SQL query cell to a Hex project',
  icon: 'database',
  group: 'Cells',
  input: z.object({
    project_id: z.string().min(1).describe('Hex project ID'),
    source: z.string().min(1).describe('SQL source text for the query cell'),
    result_variable: z
      .string()
      .optional()
      .describe('Output dataframe variable name for the SQL cell (default dataframe)'),
    connection_id: z
      .string()
      .optional()
      .describe('Optional Hex data connection ID. Omit for Hex default/null connection behavior.'),
    order_index: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('1-based position used to build a deterministic Hex order value (default 1)'),
    visible_in_app: z
      .boolean()
      .optional()
      .describe('Whether the cell should be visible in the app/dashboard view (default true)'),
    run_after_create: z
      .boolean()
      .optional()
      .describe('Whether to trigger a project run after creating and updating the SQL cell (default false)'),
  }),
  output: z.object({
    project_id: z.string().describe('Hex project ID'),
    version_id: z.string().describe('Draft Hex version ID mutated by the operation'),
    cell: createdCellSchema.describe('Created SQL cell'),
    operation: atomicOperationSchema.describe('Hex atomic operation summary for the SQL source update'),
    run: runResultSchema.nullable().describe('Project run result when run_after_create is true, otherwise null'),
  }),
  handle: async params => {
    const result = await createSqlCellInProject({
      projectId: params.project_id,
      source: params.source,
      resultVariable: params.result_variable,
      connectionId: params.connection_id,
      orderIndex: params.order_index,
      visibleInApp: params.visible_in_app,
    });

    return {
      ...result,
      run: params.run_after_create ? await runProject(params.project_id, [result.cell.id]) : null,
    };
  },
});
