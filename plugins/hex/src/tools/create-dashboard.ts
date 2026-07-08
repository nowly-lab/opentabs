import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { createSqlCellInProject, createTextCellInProject } from '../hex-authoring.js';
import type { CreatedCell } from '../hex-authoring.js';
import { createHexProject, runProject } from '../hex-api.js';
import { authoredProjectSchema, createdCellSchema, runResultSchema } from './schemas.js';

const dashboardSqlCellInputSchema = z.object({
  title: z.string().optional().describe('Optional text heading to insert immediately before this SQL cell'),
  source: z.string().min(1).describe('SQL source text for the query cell'),
  result_variable: z.string().optional().describe('Output dataframe variable name for this SQL cell'),
  connection_id: z.string().optional().describe('Optional Hex data connection ID for this SQL cell'),
});

export const createDashboard = defineTool({
  name: 'create_dashboard',
  displayName: 'Create Dashboard',
  description:
    'Create a new Hex project and populate its draft with dashboard-ready text and SQL cells. This is the end-to-end authoring tool for creating a read-only dashboard scaffold from SQL queries. It can optionally trigger a run after the cells are created; it does not publish the app or return query result rows.',
  summary: 'Create a Hex dashboard scaffold with SQL cells',
  icon: 'layout-dashboard',
  group: 'Dashboards',
  input: z.object({
    title: z.string().min(1).describe('Title for the new Hex project/dashboard'),
    description: z.string().optional().describe('Plain text project description (default empty)'),
    project_language: z
      .enum(['PYTHON', 'R'])
      .optional()
      .describe('Project language for new code cells (default PYTHON)'),
    collection_id: z.string().optional().describe('Optional Hex collection ID to create the project in'),
    text_sections: z
      .array(z.string().min(1))
      .max(25)
      .optional()
      .describe('Optional text sections to insert before the SQL cells'),
    sql_cells: z
      .array(dashboardSqlCellInputSchema)
      .min(1)
      .max(50)
      .describe('SQL cells to add to the dashboard, in order'),
    visible_in_app: z
      .boolean()
      .optional()
      .describe('Whether created cells should be visible in the app/dashboard view (default true)'),
    run_after_create: z
      .boolean()
      .optional()
      .describe('Whether to trigger a project run after all SQL cells are created (default false)'),
  }),
  output: z.object({
    project: authoredProjectSchema.describe('Created Hex project and authoring identifiers'),
    cells: z.array(createdCellSchema).describe('Text and SQL cells created in the project draft'),
    run: runResultSchema.nullable().describe('Project run result when run_after_create is true, otherwise null'),
  }),
  handle: async (params, context) => {
    const headingCount = params.sql_cells.filter(cell => cell.title).length;
    const textSectionCount = params.text_sections?.length ?? 0;
    const runCount = params.run_after_create ? 1 : 0;
    const totalSteps = 1 + textSectionCount + headingCount + params.sql_cells.length + runCount;
    let completedSteps = 0;
    const visibleInApp = params.visible_in_app ?? true;

    const report = (message: string): void => {
      completedSteps += 1;
      context?.reportProgress({ progress: completedSteps, total: totalSteps, message });
    };

    const project = await createHexProject({
      title: params.title,
      description: params.description,
      projectLanguage: params.project_language,
      collectionId: params.collection_id,
    });
    report('Created Hex project');

    const cells: CreatedCell[] = [];
    let orderIndex = 1;

    for (const text of params.text_sections ?? []) {
      const result = await createTextCellInProject({
        projectId: project.id,
        text,
        orderIndex,
        visibleInApp,
      });
      cells.push(result.cell);
      orderIndex += 1;
      report('Created text section');
    }

    for (let index = 0; index < params.sql_cells.length; index += 1) {
      const sqlCell = params.sql_cells[index];
      if (!sqlCell) continue;

      if (sqlCell.title) {
        const titleResult = await createTextCellInProject({
          projectId: project.id,
          text: sqlCell.title,
          orderIndex,
          visibleInApp,
        });
        cells.push(titleResult.cell);
        orderIndex += 1;
        report('Created SQL section heading');
      }

      const sqlResult = await createSqlCellInProject({
        projectId: project.id,
        source: sqlCell.source,
        resultVariable: sqlCell.result_variable ?? `query_${index + 1}_data`,
        connectionId: sqlCell.connection_id,
        orderIndex,
        visibleInApp,
      });
      cells.push(sqlResult.cell);
      orderIndex += 1;
      report('Created SQL cell');
    }

    const priorityCellIds = cells.filter(cell => cell.cell_type === 'SQL').map(cell => cell.id);
    const run = params.run_after_create ? await runProject(project.id, priorityCellIds) : null;
    if (params.run_after_create) report('Triggered Hex project run');

    return { project, cells, run };
  },
});
