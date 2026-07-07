import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { setReaderSliderPage } from '../reader-capture.js';

export const goToPage = defineTool({
  name: 'go_to_page',
  displayName: 'Go To Page',
  description: 'Move to a specific page using the visible Amazon manga reader slider.',
  summary: 'Move reader to page',
  icon: 'book-marked',
  group: 'Reader',
  input: z.object({
    page: z.number().int().min(1).describe('Reader page number to move to.'),
    wait_ms: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .optional()
      .describe('Milliseconds to wait after changing the slider before returning. Defaults to 1200.'),
  }),
  output: z.object({
    requested_page: z.number().describe('Page requested after clamping to the slider range.'),
    current_page: z.number().describe('Current reader page after the slider change.'),
    total_pages: z.number().describe('Total reader page count.'),
    slider_value_before: z.number().describe('Slider value before the page change.'),
    slider_value_after: z.number().describe('Slider value after the page change.'),
  }),
  handle: async params => setReaderSliderPage(params.page, params.wait_ms ?? 1200),
});
