import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphQL } from '../hex-api.js';
import { mapConnectionNodes, mapPageInfo, mapThread, pageInfoSchema, threadSchema } from './schemas.js';
import type { RawConnection, RawThread } from './schemas.js';

interface RecentThreadsResponse {
  agentChatThreadsConnection?: RawConnection<RawThread>;
}

export const listRecentThreads = defineTool({
  name: 'list_recent_threads',
  displayName: 'List Recent Threads',
  description:
    'List recent Hex Ask threads for the authenticated user. Returns thread IDs, titles, type, and timestamps with cursor pagination.',
  summary: 'List recent Hex Ask threads',
  icon: 'messages-square',
  group: 'Threads',
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of threads to return (default 10)'),
  }),
  output: z.object({
    threads: z.array(threadSchema).describe('Recent Ask threads returned by Hex'),
    page_info: pageInfoSchema.describe('Pagination metadata'),
  }),
  handle: async params => {
    const data = await graphQL<RecentThreadsResponse>('GetRecentThreads', {
      first: params.limit ?? 10,
      threadType: 'ASK',
    });
    return {
      threads: mapConnectionNodes(data.agentChatThreadsConnection).map(mapThread),
      page_info: mapPageInfo(data.agentChatThreadsConnection?.pageInfo),
    };
  },
});
