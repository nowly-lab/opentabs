import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { clickVisiblePageLeftHalf } from '../reader-capture.js';

const sleep = (ms: number): Promise<void> => new Promise(resolve => window.setTimeout(resolve, ms));

export const turnPage = defineTool({
  name: 'turn_page',
  displayName: 'Turn Page',
  description:
    'Turn one page in the current Amazon manga reader by clicking the left half of the largest visible manga surface.',
  summary: 'Click left half to turn one page',
  icon: 'chevron-left',
  group: 'Reader',
  input: z.object({
    x_ratio: z
      .number()
      .min(0.05)
      .max(0.49)
      .optional()
      .describe(
        'Horizontal click position within the visible page surface. Defaults to 0.25, safely inside the left half.',
      ),
    y_ratio: z
      .number()
      .min(0.1)
      .max(0.9)
      .optional()
      .describe('Vertical click position within the visible page surface. Defaults to 0.5.'),
    wait_ms: z
      .number()
      .int()
      .min(0)
      .max(5000)
      .optional()
      .describe('Milliseconds to wait after the click before returning. Defaults to 800.'),
  }),
  output: z.object({
    clicked: z.boolean().describe('Whether the click sequence was dispatched'),
    x: z.number().describe('Viewport X coordinate that was clicked'),
    y: z.number().describe('Viewport Y coordinate that was clicked'),
    target_tag: z.string().describe('DOM tag name that received the click'),
    surface_kind: z.enum(['canvas', 'image']).describe('Detected manga surface type'),
    surface_index: z.number().describe('Detected manga surface index'),
    surface_rect: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
    waited_ms: z.number().describe('Milliseconds waited after dispatching the click'),
  }),
  handle: async params => {
    const waitMs = params.wait_ms ?? 800;
    const result = clickVisiblePageLeftHalf({
      xRatio: params.x_ratio ?? 0.25,
      yRatio: params.y_ratio ?? 0.5,
    });
    if (waitMs > 0) await sleep(waitMs);

    return {
      ...result,
      waited_ms: waitMs,
    };
  },
});
