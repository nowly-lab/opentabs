import { defineTool, getCurrentUrl, getPageTitle } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getCurrentContext } from '../hex-api.js';
import { currentContextSchema } from './schemas.js';

export const getCurrentContextTool = defineTool({
  name: 'get_current_context',
  displayName: 'Get Current Context',
  description:
    'Read the active Hex browser context. Returns the current instance origin, organization ID, route section, project ID when present, URL, and page title.',
  summary: 'Read the current Hex route context',
  icon: 'map-pin',
  group: 'Account',
  input: z.object({}),
  output: currentContextSchema,
  handle: async () => ({
    ...getCurrentContext(),
    url: getCurrentUrl(),
    title: getPageTitle(),
  }),
});
