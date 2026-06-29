import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { goToPage } from './tools/go-to-page.js';
import { getReaderPageInfo } from './tools/get-reader-page-info.js';
import { getReaderTitle } from './tools/get-reader-title.js';
import { inspectReader } from './tools/inspect-reader.js';
import { saveAllPagesFromFirst } from './tools/save-all-pages-from-first.js';
import { saveLibraryItems } from './tools/save-library-items.js';
import { saveVisiblePages } from './tools/save-visible-pages.js';
import { turnPage } from './tools/turn-page.js';

class AmazonMangaPlugin extends OpenTabsPlugin {
  readonly name = 'amazon-manga';
  readonly description = 'Save the currently visible Amazon manga reader page as a screenshot';
  override readonly displayName = 'Amazon Manga';
  override readonly homepage = 'https://read.amazon.co.jp';
  readonly urlPatterns = ['*://read.amazon.co.jp/*', '*://*.read.amazon.co.jp/*'];
  readonly tools: ToolDefinition[] = [
    inspectReader,
    getReaderTitle,
    getReaderPageInfo,
    goToPage,
    saveAllPagesFromFirst,
    saveLibraryItems,
    saveVisiblePages,
    turnPage,
  ];

  async isReady(): Promise<boolean> {
    return location.hostname.endsWith('read.amazon.co.jp') && document.readyState !== 'loading';
  }
}

export default new AmazonMangaPlugin();
