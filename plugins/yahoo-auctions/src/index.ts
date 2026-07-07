import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { getItem } from './tools/get-item.js';
import { searchItems } from './tools/search-items.js';

class YahooAuctionsPlugin extends OpenTabsPlugin {
  readonly name = 'yahoo-auctions';
  readonly description = 'OpenTabs plugin for Yahoo! Auctions Japan sourcing research';
  override readonly displayName = 'Yahoo! Auctions';
  override readonly homepage = 'https://auctions.yahoo.co.jp/';
  readonly urlPatterns = ['*://auctions.yahoo.co.jp/*', '*://*.auctions.yahoo.co.jp/*'];
  readonly tools: ToolDefinition[] = [searchItems, getItem];

  async isReady(): Promise<boolean> {
    return location.hostname.endsWith('auctions.yahoo.co.jp') && document.readyState !== 'loading';
  }
}

export default new YahooAuctionsPlugin();
