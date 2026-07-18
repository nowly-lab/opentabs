import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { buildReplyBody, getCurrentRoomId, loadMessages, postMessage } from '../chatwork-gateway.js';

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description: 'Send a message to ChatWork through the same-origin gateway. To reply, pass reply_to_message_id.',
  summary: 'Send or reply in ChatWork',
  icon: 'send',
  group: 'Messages',
  input: z.object({
    room_id: z.number().int().positive().optional().describe('ChatWork room ID. Defaults to the current room.'),
    body: z.string().min(1).describe('Message body to send'),
    reply_to_message_id: z.string().optional().describe('Optional message ID to reply to'),
    dry_run: z
      .boolean()
      .default(false)
      .describe('When true, return the final body without posting. Use this to verify reply formatting.'),
  }),
  output: z.object({
    room_id: z.number(),
    message_id: z.string().describe('Created ChatWork message ID, or empty when dry_run=true'),
    body: z.string().describe('Final message body submitted or prepared'),
    sent: z.boolean(),
  }),
  handle: async params => {
    const roomId = params.room_id ?? getCurrentRoomId();
    if (!roomId) throw ToolError.validation('No room_id was provided and the current URL does not contain #!rid...');
    let body = params.body;
    if (params.reply_to_message_id) {
      const messages = await loadMessages(roomId, 100, true);
      const target = messages.find(message => message.message_id === params.reply_to_message_id);
      if (!target) {
        throw ToolError.notFound(`Message ${params.reply_to_message_id} was not found in room ${roomId}`);
      }
      body = buildReplyBody(roomId, target, params.body);
    }

    if (params.dry_run) {
      return { room_id: roomId, message_id: '', body, sent: false };
    }

    const messageId = await postMessage(roomId, body);
    return { room_id: roomId, message_id: messageId, body, sent: true };
  },
});
