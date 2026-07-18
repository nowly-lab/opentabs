import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isChatworkGatewayReady } from './chatwork-gateway.js';
import { inspectContext } from './tools/get-my-status.js';
import { listUnreadRooms } from './tools/list-unread-rooms.js';
import { readMessages } from './tools/read-messages.js';
import { sendMessage } from './tools/send-message.js';

class ChatworkPlugin extends OpenTabsPlugin {
  readonly name = 'chatwork';
  readonly description = 'OpenTabs plugin for reading unread ChatWork messages and sending replies';
  override readonly displayName = 'ChatWork';
  override readonly homepage = 'https://www.chatwork.com/';
  readonly urlPatterns = ['*://www.chatwork.com/*', '*://*.chatwork.com/*'];
  readonly tools: ToolDefinition[] = [inspectContext, listUnreadRooms, readMessages, sendMessage];

  async isReady(): Promise<boolean> {
    return isChatworkGatewayReady();
  }
}

export default new ChatworkPlugin();
