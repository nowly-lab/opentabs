import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getCurrentRoomId, loadMessages } from '../chatwork-gateway.js';
import { mapMessage, messageSchema } from './schemas.js';

export const readMessages = defineTool({
  name: 'read_messages',
  displayName: 'Read Messages',
  description: 'Read messages from a ChatWork room using the same-origin ChatWork gateway used by the web client.',
  summary: 'Read ChatWork room messages',
  icon: 'book-open',
  group: 'Messages',
  input: z.object({
    room_id: z.number().int().positive().optional().describe('ChatWork room ID. Defaults to the current room.'),
    limit: z.number().int().min(1).max(100).default(50).describe('Maximum messages to return'),
    force: z
      .boolean()
      .default(false)
      .describe('When true, request recent messages instead of only unread/new messages.'),
  }),
  output: z.object({
    room_id: z.number(),
    messages: z.array(messageSchema),
  }),
  handle: async params => {
    const roomId = params.room_id ?? getCurrentRoomId();
    if (!roomId)
      throw ToolError.validation('No ChatWork room_id was provided and the current URL does not contain #!rid...');
    const messages = await loadMessages(roomId, params.limit, params.force);
    return {
      room_id: roomId,
      messages: messages.map(mapMessage),
    };
  },
});
