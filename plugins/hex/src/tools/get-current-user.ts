import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphQL } from '../hex-api.js';
import { mapOrganization, mapUser, organizationSchema, userSchema } from './schemas.js';
import type { RawOrganization, RawUser } from './schemas.js';

interface CurrentUserResponse {
  me?: RawUser;
  myOrg?: RawOrganization;
}

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated Hex user and current organization metadata from the same GraphQL operation used by the Hex web app.',
  summary: 'Get the authenticated Hex user',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: userSchema.describe('Authenticated Hex user'),
    organization: organizationSchema.describe('Current Hex organization'),
  }),
  handle: async () => {
    const data = await graphQL<CurrentUserResponse>('Me', { orgIdOverride: null });
    return {
      user: mapUser(data.me ?? {}),
      organization: mapOrganization(data.myOrg ?? {}),
    };
  },
});
