import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { listUnreadRoomsFromDom } from '../chatwork-gateway.js';
import { mapRoom, roomSchema } from './schemas.js';

export const listUnreadRooms = defineTool({
  name: 'list_unread_rooms',
  displayName: 'List Unread Rooms',
  description: 'List ChatWork rooms with unread badges from the loaded ChatWork web app',
  summary: 'List unread ChatWork rooms',
  icon: 'inbox',
  group: 'Messages',
  input: z.object({
    limit: z.number().int().min(1).max(500).default(100).describe('Maximum rooms to return'),
    include_mentions_only: z
      .boolean()
      .default(false)
      .describe('When true, only return rooms with unread mentions instead of all unread rooms'),
  }),
  output: z.object({
    rooms: z.array(roomSchema),
  }),
  handle: async params => {
    const rooms = listUnreadRoomsFromDom(params.limit);
    const filtered = rooms
      .filter(room => (params.include_mentions_only ? room.mention_num > 0 : room.unread_num > 0))
      .map(mapRoom);
    return { rooms: filtered };
  },
});
