import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

const textFromSelector = (selector: string): string | undefined => {
  const text = document.querySelector(selector)?.textContent?.trim();
  return text && text.length > 0 ? text : undefined;
};

const parseIntegerText = (text: string | undefined, field: string): number => {
  const value = text === undefined ? NaN : Number.parseInt(text.replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(value)) {
    throw ToolError.notFound(`Could not read ${field} from the Amazon manga reader page info.`);
  }
  return value;
};

export const getReaderPageInfo = defineTool({
  name: 'get_reader_page_info',
  displayName: 'Get Reader Page Info',
  description: 'Get the current page, total pages, and percent shown in the Amazon manga reader chrome.',
  summary: 'Get manga reader page info',
  icon: 'book-open-check',
  group: 'Reader',
  input: z.object({}),
  output: z.object({
    current_page: z.number().describe('Current reader page number'),
    total_pages: z.number().describe('Total reader page count'),
    percent: z.number().describe('Current reader progress percentage'),
    source: z.literal('pageInfo').describe('Where the page info was read from'),
    url: z.string().describe('Current reader URL'),
  }),
  handle: async () => ({
    current_page: parseIntegerText(textFromSelector('#pageInfoCurrentPage'), 'current page'),
    total_pages: parseIntegerText(textFromSelector('#pageInfoTotalPage'), 'total page count'),
    percent: parseIntegerText(textFromSelector('#pageInfoPercent'), 'progress percent'),
    source: 'pageInfo' as const,
    url: location.href,
  }),
});
