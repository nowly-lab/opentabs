import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { summarizeReader } from '../reader-capture.js';

export const inspectReader = defineTool({
  name: 'inspect_reader',
  displayName: 'Inspect Reader',
  description:
    'Inspect the current Amazon manga reader tab and report visible canvas/image surfaces that can be saved. Does not capture or download content.',
  summary: 'Inspect visible manga surfaces',
  icon: 'scan-search',
  group: 'Reader',
  input: z.object({}),
  output: z.object({
    url: z.string().describe('Current tab URL'),
    title: z.string().describe('Current document title'),
    canvas_count: z.number().describe('Number of canvas elements on the page'),
    image_count: z.number().describe('Number of image elements on the page'),
    visible_candidates: z
      .array(
        z.object({
          index: z.number().describe('Element index among canvas/img elements'),
          kind: z.enum(['canvas', 'image']).describe('Surface element type'),
          width: z.number().describe('Source pixel width'),
          height: z.number().describe('Source pixel height'),
          rect: z.object({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
          }),
          visible_area: z.number().describe('Approximate visible area in viewport pixels'),
        }),
      )
      .describe('Visible candidate manga surfaces sorted by visible area'),
  }),
  handle: async () => summarizeReader(),
});
