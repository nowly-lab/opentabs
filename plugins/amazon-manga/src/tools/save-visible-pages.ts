import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { defaultFilename, triggerPngDownload } from '../reader-capture.js';

const getPngDimensions = (base64: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Could not decode captured PNG dimensions.'));
    image.src = `data:image/png;base64,${base64}`;
  });

interface ScreenshotContext {
  captureVisibleTabScreenshot?(): Promise<string>;
}

export const saveVisiblePages = defineTool({
  name: 'save_visible_pages',
  displayName: 'Save Visible Pages',
  description: 'Save the current Amazon manga reader viewport as a single PNG screenshot download.',
  summary: 'Save current manga screenshot',
  icon: 'download',
  group: 'Reader',
  input: z.object({
    filename: z.string().optional().describe('Optional PNG filename. Defaults to amazon-manga-<timestamp>.png'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(2)
      .optional()
      .describe('Deprecated. Screenshots always save the visible viewport as one PNG.'),
    return_base64: z
      .boolean()
      .optional()
      .describe('Return the PNG content as base64 in addition to starting the browser download. Defaults to false.'),
  }),
  output: z.object({
    filename: z.string().describe('Downloaded PNG filename'),
    downloaded: z.boolean().describe('Whether the browser download was started'),
    width: z.number().describe('Output image width in pixels'),
    height: z.number().describe('Output image height in pixels'),
    captured_surfaces: z.number().describe('Number of visible page surfaces included'),
    encoding: z.literal('base64').optional().describe('Returned content encoding when return_base64=true'),
    content: z.string().optional().describe('Base64 PNG content when return_base64=true'),
  }),
  handle: async (params, context) => {
    const screenshotContext = context as typeof context & ScreenshotContext;
    if (!screenshotContext.captureVisibleTabScreenshot) {
      throw ToolError.internal('Screenshot capture is not available in this OpenTabs runtime.');
    }

    const base64 = await screenshotContext.captureVisibleTabScreenshot();
    const dimensions = await getPngDimensions(base64);
    const filename = params.filename ?? defaultFilename('amazon-manga');
    triggerPngDownload(base64, filename);

    return {
      filename,
      downloaded: true,
      width: dimensions.width,
      height: dimensions.height,
      captured_surfaces: 1,
      encoding: params.return_base64 ? ('base64' as const) : undefined,
      content: params.return_base64 ? base64 : undefined,
    };
  },
});
