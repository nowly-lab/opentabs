import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { createInputCellInProject } from '../hex-authoring.js';
import { atomicOperationSchema, createdCellSchema } from './schemas.js';

const inputCellTypeSchema = z
  .enum([
    'TEXT_INPUT',
    'NUMERIC_INPUT',
    'DROPDOWN',
    'TABLE',
    'SLIDER',
    'DATE',
    'BUTTON',
    'CHECKBOX',
    'MULTISELECT',
    'FILE_UPLOAD',
  ])
  .describe('Hex input cell type. Use DATE for date controls.');

const inputOutputTypeSchema = z
  .enum(['STRING', 'NUMBER', 'DATA_FRAME', 'DATETIME', 'BOOLEAN', 'DYNAMIC', 'LIST_STRING', 'LIST_NUMBER'])
  .describe('Hex output data type produced by the input cell. DATE inputs normally use DATETIME.');

const inputValueOptionSchema = z.object({
  key: z.string().describe('Option key stored by Hex'),
  value: z.string().describe('Option display value stored by Hex'),
});

const variableBackedOptionsSchema = z.object({
  variableName: z
    .string()
    .nullable()
    .describe('Hex variable name used to populate options, or null for static options'),
});

const inputCellOptionsSchema = z
  .object({
    multiline: z.boolean().optional().describe('Whether a text input should allow multiple lines'),
    increment: z.number().optional().describe('Numeric input increment step'),
    min: z.number().optional().describe('Slider minimum value'),
    max: z.number().optional().describe('Slider maximum value'),
    step: z.number().optional().describe('Slider step size'),
    enableTime: z.boolean().optional().describe('Whether a DATE input should include time selection'),
    showRelativeDates: z.boolean().optional().describe('Whether a DATE input should allow relative date shortcuts'),
    useDateRange: z.boolean().optional().describe('Whether a DATE input should use Hex date-range mode'),
    valueOptions: z
      .union([z.array(inputValueOptionSchema), variableBackedOptionsSchema])
      .optional()
      .describe('Dropdown options as static key/value pairs or a variable-backed option source'),
    multiValueOptions: z
      .union([z.array(inputValueOptionSchema), variableBackedOptionsSchema])
      .optional()
      .describe('Multiselect options as static key/value pairs or a variable-backed option source'),
    style: z.enum(['checkbox', 'switch']).optional().describe('Checkbox input display style'),
    text: z.string().optional().describe('Button or checkbox text'),
    intent: z.string().optional().describe('Button style intent'),
    icon: z.string().optional().describe('Button icon name'),
    uploadType: z.enum(['csv', 'excel', 'binary']).optional().describe('File upload input type'),
  })
  .describe('Optional Hex input configuration. Omit for Hex-compatible defaults.');

export const createInputCell = defineTool({
  name: 'create_input_cell',
  displayName: 'Create Input Cell',
  description:
    'Create an input/parameter cell in a Hex project draft using Hex atomic operations. Use DATE input cells with DATETIME output to create visible app filters that SQL cells can reference through Hex variables.',
  summary: 'Create a Hex input or filter cell',
  icon: 'sliders-horizontal',
  group: 'Cells',
  input: z.object({
    project_id: z.string().min(1).describe('Hex project ID'),
    name: z
      .string()
      .min(1)
      .describe('Hex variable name for the input cell, such as start_date. SQL cells can reference this name.'),
    input_type: inputCellTypeSchema.optional().describe('Hex input cell type (default TEXT_INPUT)'),
    output_type: inputOutputTypeSchema.optional().describe('Output data type. Omit to use the Hex-compatible default.'),
    default_value_string: z
      .string()
      .optional()
      .describe('Optional default value string stored by Hex, such as 2026-07-01 for DATE inputs'),
    required: z.boolean().optional().describe('Whether the input requires a value (default false)'),
    options: inputCellOptionsSchema.optional().describe('Optional input-specific configuration'),
    order_index: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('1-based position used to build a deterministic Hex order value (default 1)'),
    visible_in_app: z.boolean().optional().describe('Whether the cell should be visible in the app/dashboard view'),
  }),
  output: z.object({
    project_id: z.string().describe('Hex project ID'),
    version_id: z.string().describe('Draft Hex version ID mutated by the operation'),
    cell: createdCellSchema.describe('Created Hex input cell metadata'),
    operation: atomicOperationSchema.describe('Hex atomic operation summary'),
  }),
  handle: async params =>
    createInputCellInProject({
      projectId: params.project_id,
      name: params.name,
      inputType: params.input_type,
      outputType: params.output_type,
      defaultValueString: params.default_value_string,
      required: params.required,
      options: params.options,
      orderIndex: params.order_index,
      visibleInApp: params.visible_in_app,
    }),
});
