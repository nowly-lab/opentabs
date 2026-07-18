import { z } from 'zod';
import type { ChatworkMessage, ChatworkRoom } from '../chatwork-gateway.js';

export const roomSchema = z.object({
  room_id: z.number().describe('ChatWork room ID'),
  name: z.string().describe('Room name'),
  unread_num: z.number().describe('Unread message count'),
  mention_num: z.number().describe('Unread mention count'),
  selected: z.boolean().describe('Whether this room is currently open'),
  last_update_time: z.number().nullable().describe('Unix timestamp of the latest room update, when available'),
});

export const messageSchema = z.object({
  message_id: z.string().describe('ChatWork message ID'),
  account_id: z.number().describe('Sender account ID'),
  account_name: z.string().describe('Sender display name'),
  body: z.string().describe('Message body'),
  send_time: z.number().describe('Unix timestamp when the message was sent'),
  room_id: z.number().describe('ChatWork room ID'),
});

export const mapRoom = (room: ChatworkRoom): z.infer<typeof roomSchema> => ({
  room_id: room.room_id,
  name: room.name,
  unread_num: room.unread_num,
  mention_num: room.mention_num,
  selected: room.selected,
  last_update_time: room.last_update_time,
});

export const mapMessage = (message: ChatworkMessage): z.infer<typeof messageSchema> => ({
  message_id: message.message_id,
  account_id: message.account_id,
  account_name: message.account_name,
  body: message.body,
  send_time: message.send_time,
  room_id: message.room_id,
});
