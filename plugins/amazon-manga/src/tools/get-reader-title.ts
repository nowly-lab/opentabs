import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

const READER_TITLE_SELECTOR = '#readerChromeTitle';

const textFromSelector = (selector: string): string | undefined => {
  const text = document.querySelector(selector)?.textContent?.trim();
  return text && text.length > 0 ? text : undefined;
};

const getTitleFallback = (): string => {
  const ariaTitle = textFromSelector('[aria-label][id*="Title"], [aria-label][class*="title"]');
  if (ariaTitle) return ariaTitle;

  const documentTitle = document.title.trim();
  return documentTitle.length > 0 ? documentTitle : location.href;
};

export const getReaderTitle = defineTool({
  name: 'get_reader_title',
  displayName: 'Get Reader Title',
  description: 'Get the book title shown in the Amazon manga reader chrome.',
  summary: 'Get manga reader title',
  icon: 'book-open-text',
  group: 'Reader',
  input: z.object({}),
  output: z.object({
    title: z.string().describe('Book title shown by the Amazon manga reader'),
    source: z.enum(['readerChromeTitle', 'fallback']).describe('Where the title was read from'),
    url: z.string().describe('Current reader URL'),
  }),
  handle: async () => {
    const title = textFromSelector(READER_TITLE_SELECTOR);
    return {
      title: title ?? getTitleFallback(),
      source: title ? ('readerChromeTitle' as const) : ('fallback' as const),
      url: location.href,
    };
  },
});
