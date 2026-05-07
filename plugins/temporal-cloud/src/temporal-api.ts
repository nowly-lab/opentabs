import {
  ToolError,
  buildQueryString,
  fetchJSON,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
  findLocalStorageEntry,
  getCurrentUrl,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

const AUTH0_CLIENT_ID = 'nTmmPY5xUpQnSr7gRZh7s33hNamtCeDg';
const AUTH0_AUDIENCE = 'https://saas-api.tmprl.cloud';

interface TemporalAuth {
  token: string;
}

interface Auth0CacheEntry {
  body?: {
    access_token?: string;
    expires_in?: number;
  };
  expiresAt?: number;
}

const getToken = (): string | null => {
  const entry = findLocalStorageEntry(
    key => key.startsWith(`@@auth0spajs@@::${AUTH0_CLIENT_ID}::`) && key.includes(AUTH0_AUDIENCE),
  );
  if (!entry) return null;

  try {
    const data = JSON.parse(entry.value) as Auth0CacheEntry;
    if (!data.body?.access_token) return null;
    if (data.expiresAt && data.expiresAt * 1000 < Date.now()) return null;
    return data.body.access_token;
  } catch {
    return null;
  }
};

const getAuth = (): TemporalAuth | null => {
  const cached = getAuthCache<TemporalAuth>('temporal-cloud');
  if (cached) {
    const freshToken = getToken();
    if (freshToken && freshToken !== cached.token) {
      const updated = { token: freshToken };
      setAuthCache('temporal-cloud', updated);
      return updated;
    }
    return cached;
  }

  const token = getToken();
  if (!token) return null;

  const auth: TemporalAuth = { token };
  setAuthCache('temporal-cloud', auth);
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

const getDefaultNamespace = (): string | null => {
  const url = getCurrentUrl();
  const match = url.match(/\/namespaces\/([^/]+)/);
  if (match?.[1]) return match[1];
  const hostMatch = url.match(/^https?:\/\/([^.]+)\.web\.tmprl\.cloud/);
  return hostMatch?.[1] ?? null;
};

export const resolveNamespace = (namespace?: string): string => {
  const ns = namespace || getDefaultNamespace();
  if (!ns) {
    throw ToolError.validation(
      'No namespace specified and none detected from the current page URL. Pass a namespace parameter explicitly.',
    );
  }
  return ns;
};

export const api = async <T>(
  namespace: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Temporal Cloud.');

  const baseUrl = `https://${namespace}.web.tmprl.cloud/api/v1`;
  const qs = query ? buildQueryString(query) : '';
  const url = qs ? `${baseUrl}${path}?${qs}` : `${baseUrl}${path}`;

  try {
    const result = await fetchJSON<T>(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    return result as T;
  } catch (err: unknown) {
    if (err instanceof ToolError) {
      if (err.category === 'auth') {
        clearAuthCache('temporal-cloud');
      }
      throw err;
    }
    throw ToolError.internal(`Temporal API error: ${err instanceof Error ? err.message : String(err)}`);
  }
};
