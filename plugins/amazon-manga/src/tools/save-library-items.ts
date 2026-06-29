import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

const sanitizeFilenamePart = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'amazon-manga-library';

const encodeBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const readText = (element: Element | null): string => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const makeReaderUrl = (asin: string, index: number, refPrefix: string): string => {
  const url = new URL(`/manga/${asin}`, location.origin);
  url.searchParams.set('ref_', `${refPrefix}_${index}`);
  return url.href;
};

const getDefaultRefPrefix = (): string => {
  const url = new URL(location.href);
  const sortType = url.searchParams.get('sortType');
  if (sortType === 'acquisition_asc') return 'kwl_kr_iv_aqd_asc';
  if (sortType === 'acquisition_desc') return 'kwl_kr_iv_aqd_dsc';
  return 'kwl_kr_iv_pos_des';
};

const collectVisibleItems = (refPrefix: string): LibraryItem[] => {
  const items = new Map<string, LibraryItem>();

  for (const listItem of document.querySelectorAll<HTMLElement>('li[id^="library-item-option-"]')) {
    const asin = listItem.id.replace(/^library-item-option-/, '').trim();
    if (!asin) continue;

    const title =
      readText(document.getElementById(`title-${asin}`)) ||
      readText(document.getElementById(`coverContainer-${asin}`)?.firstElementChild ?? null) ||
      readText(listItem).split(/\s{2,}/)[0] ||
      asin;
    const author = readText(document.getElementById(`author-${asin}`)) || undefined;
    const coverImage = document.getElementById(`cover-${asin}`) as HTMLImageElement | null;

    items.set(asin, {
      asin,
      title,
      author,
      url: makeReaderUrl(asin, items.size + 1, refPrefix),
      cover_image_url: coverImage?.src,
    });
  }

  return Array.from(items.values());
};

interface LibraryItem {
  asin: string;
  title: string;
  author?: string;
  url: string;
  cover_image_url?: string;
}

interface DownloadContext {
  downloadBase64File?(base64: string, filename: string, mimeType?: string): Promise<{ downloadId: number }>;
}

export const saveLibraryItems = defineTool({
  name: 'save_library_items',
  displayName: 'Save Library Items',
  description:
    'Save each currently loaded Amazon Kindle manga library item title with the manga URL opened by selecting it.',
  summary: 'Save manga library titles and URLs',
  icon: 'download',
  group: 'Library',
  input: z.object({
    filename: z.string().optional().describe('Download filename. Defaults to amazon-manga/library/<timestamp>.json.'),
    ref_prefix: z
      .string()
      .optional()
      .describe('URL ref_ prefix for item links. Defaults from the current library sort query.'),
    scroll_step_px: z.number().int().min(100).max(5000).optional().describe('Deprecated. This tool no longer scrolls.'),
    wait_ms: z.number().int().min(50).max(5000).optional().describe('Deprecated. This tool no longer scrolls.'),
    stable_iterations: z.number().int().min(2).max(20).optional().describe('Deprecated. This tool no longer scrolls.'),
    bottom_probe_scrolls: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe('Deprecated. This tool no longer scrolls.'),
    max_scrolls: z.number().int().min(1).max(5000).optional().describe('Deprecated. This tool no longer scrolls.'),
    reset_to_top: z.boolean().optional().describe('Deprecated. This tool no longer scrolls.'),
    return_items: z.boolean().optional().describe('Return collected items in the tool result. Defaults to false.'),
  }),
  output: z.object({
    count: z.number(),
    filename: z.string(),
    items: z.array(
      z.object({
        asin: z.string(),
        title: z.string(),
        author: z.string().optional(),
        url: z.string(),
        cover_image_url: z.string().optional(),
      }),
    ),
  }),
  handle: async (params, context) => {
    const downloadContext = context as typeof context & DownloadContext;
    if (!downloadContext.downloadBase64File) {
      throw ToolError.internal('Directory-preserving browser downloads are not available in this OpenTabs runtime.');
    }
    if (!location.pathname.startsWith('/kindle-library')) {
      throw ToolError.validation('Save Library Items must run on the Amazon Kindle library page.');
    }

    const refPrefix = params.ref_prefix ?? getDefaultRefPrefix();
    const seen = new Map<string, LibraryItem>();

    for (const item of collectVisibleItems(refPrefix)) {
      if (!seen.has(item.asin)) {
        seen.set(item.asin, { ...item, url: makeReaderUrl(item.asin, seen.size + 1, refPrefix) });
      }
    }

    const items = Array.from(seen.values());
    const filename =
      params.filename ??
      `amazon-manga/library/${sanitizeFilenamePart(document.title)}-${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace(/Z$/, '')}.json`;
    const payload = JSON.stringify(
      {
        source_url: location.href,
        saved_at: new Date().toISOString(),
        count: items.length,
        items,
      },
      null,
      2,
    );

    await downloadContext.downloadBase64File(encodeBase64(payload), filename, 'application/json');

    return {
      count: items.length,
      filename,
      items: params.return_items === true ? items : [],
    };
  },
});
