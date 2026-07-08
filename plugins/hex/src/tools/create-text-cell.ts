import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { createTextCellInProject } from '../hex-authoring.js';
import { atomicOperationSchema, createdCellSchema } from './schemas.js';

export const createTextCell = defineTool({
  name: 'create_text_cell',
  displayName: 'Create Text Cell',
  description:
    'Create a text cell in a Hex project draft using Hex atomic operations. The cell can be shown in the app/dashboard view and is useful for dashboard headings, section labels, and notes.',
  summary: 'Add a text cell to a Hex project',
  icon: 'text',
  group: 'Cells',
  input: z.object({
    project_id: z.string().min(1).describe('Hex project ID'),
    text: z.string().min(1).describe('Text content to place in the cell'),
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
  }),
  output: z.object({
    project_id: z.string().describe('Hex project ID'),
    version_id: z.string().describe('Draft Hex version ID mutated by the operation'),
    cell: createdCellSchema.describe('Created text cell'),
    operation: atomicOperationSchema.describe('Hex atomic operation summary'),
  }),
  handle: async params =>
    createTextCellInProject({
      projectId: params.project_id,
      text: params.text,
      orderIndex: params.order_index,
      visibleInApp: params.visible_in_app,
    }),
});
