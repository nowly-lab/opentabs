import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { getItem } from './tools/get-item.js';
import { loadProfileItems } from './tools/load-profile-items.js';
import { searchItems } from './tools/search-items.js';

class MercariPlugin extends OpenTabsPlugin {
  readonly name = 'mercari';
  readonly description = 'OpenTabs plugin for Mercari Japan sourcing research';
  override readonly displayName = 'Mercari';
  override readonly homepage = 'https://jp.mercari.com/';
  readonly urlPatterns = ['*://jp.mercari.com/*'];
  readonly tools: ToolDefinition[] = [searchItems, getItem, loadProfileItems];

  async isReady(): Promise<boolean> {
    return location.hostname === 'jp.mercari.com' && document.readyState !== 'loading';
  }
}

export default new MercariPlugin();
