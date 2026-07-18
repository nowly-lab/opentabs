import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { inspectGatewayContext, listUnreadRoomsFromDom } from '../chatwork-gateway.js';

export const inspectContext = defineTool({
  name: 'inspect_context',
  displayName: 'Inspect Context',
  description: 'Inspect ChatWork web gateway readiness and visible unread counts',
  summary: 'Inspect ChatWork gateway context',
  icon: 'activity',
  group: 'Messages',
  input: z.object({}),
  output: z.object({
    authReady: z.boolean(),
    myid: z.union([z.string(), z.number()]).nullable(),
    hasAccessToken: z.boolean(),
    clientVersion: z.string().nullable(),
    currentRoomId: z.number().nullable(),
    origin: z.string(),
    visibleUnreadRoomCount: z.number(),
    visibleUnreadMessageCount: z.number(),
  }),
  handle: async () => {
    const rooms = listUnreadRoomsFromDom(500);
    const context = inspectGatewayContext();
    return {
      authReady: Boolean(context.authReady),
      myid: typeof context.myid === 'string' || typeof context.myid === 'number' ? context.myid : null,
      hasAccessToken: Boolean(context.hasAccessToken),
      clientVersion: typeof context.clientVersion === 'string' ? context.clientVersion : null,
      currentRoomId: typeof context.currentRoomId === 'number' ? context.currentRoomId : null,
      origin: typeof context.origin === 'string' ? context.origin : '',
      visibleUnreadRoomCount: rooms.length,
      visibleUnreadMessageCount: rooms.reduce((sum, room) => sum + room.unread_num, 0),
    };
  },
});
