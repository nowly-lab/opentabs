import {
  ToolError,
  buildQueryString,
  fetchText,
  getAuthCache,
  getCurrentUrl,
  getPageGlobal,
  postJSON,
  querySelectorAll,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

interface OperationHashCache {
  scriptUrls: string[];
  operations: Record<string, string>;
}

interface GraphQLErrorResponse {
  message?: string;
  extensions?: {
    code?: string;
  };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLErrorResponse[];
}

interface GraphQLOptions {
  extra?: string;
}

export interface CreatedHexProject {
  id: string;
  title: string;
  org_id: string;
  draft_version_id: string;
  logic_session_id: string;
  app_url: string;
  logic_url: string;
}

export interface CreateHexProjectParams {
  title: string;
  description?: string;
  projectLanguage?: 'PYTHON' | 'R';
  statusId?: string | null;
  categoryIds?: string[];
  collectionId?: string | null;
}

interface CreateHexResponse {
  createHex?: {
    id?: string;
    title?: string;
    org?: {
      id?: string;
    } | null;
  } | null;
}

export interface DraftVersion {
  project_id: string;
  version_id: string;
  logic_session_id: string;
}

interface HexVersionResponse {
  hexVersionByNumber?: {
    id?: string;
    logicSessionId?: string | null;
  } | null;
}

export interface HexAtomicOperationRequest {
  mpClientId: string;
  operation: {
    type: string;
    payload: Record<string, unknown>;
  };
  revisionOverride?: null;
}

interface HexAtomicOperationResponse {
  revision?: number | null;
  responses?: unknown[];
}

interface HexVersionAtomicOperationResponse {
  doHexVersionAtomicOperation?: HexAtomicOperationResponse | null;
  doHexVersionAtomicOperationV2?: HexAtomicOperationResponse | null;
}

interface AppSessionAtomicOperationResponse {
  doAppSessionAtomicOperation?: HexAtomicOperationResponse | null;
  doAppSessionAtomicOperationV2?: HexAtomicOperationResponse | null;
}

export interface AtomicOperationSummary {
  response_count: number;
  response_types: string[];
  revision: number | null;
  last_run_start: string;
}

export interface ProjectRunResult {
  project_id: string;
  logic_session_id: string;
  started: boolean;
  priority_cell_ids: string[];
  force_overwrite_cache: boolean;
  last_run_start: string;
  response_count: number;
  response_types: string[];
}

const CACHE_NAMESPACE = 'hex';

const FALLBACK_OPERATION_HASHES: Record<string, string> = {
  CollectionsForFilter: '462a3d4abd8d3267afd8287ceb960561c21501358df9ee8715ad24acb0dd2d41',
  CreateHex: '716f549e1e4901051be3d02e091f7534f8b3bd5ef271106e517c3448206c4600',
  CreateHexFromHome: 'd7b7386710489490bc1f477a21d2eeb3163620fbe5a4774dcf54865e8a93ae89',
  doAppSessionAtomicOperation: '992dc618f7f7a2d28d33332e68c8e2175fd43051786bdb2d4dd456c9208e20d1',
  doHexVersionAtomicOperation: '4cadb318249f8ca6a2ddf35369af575947b0af691e9cd60f2fda544e1ada346a',
  GetDataConnectionsForHomePageSidebar: 'bd7c3099dcc2e3411937555cf51e1a84c549d4cb43620c17727d8a1114c5375e',
  GetExplores: 'b866bab8544aeacbf4f246a7574d7adf1cd2a17f718aa9d556284f9f262d4823',
  GetHexesForHome: '47eec24be05da5528678d9b212181072e717331c89f8ef24d832d156bf30dc55',
  GetHexVersion: 'ce87b62607dbcd9187368ae2d210130599bc756b1134f315fb89bfbc9ea52593',
  GetLogicSessionId: 'dd8801955ea8c2b2d4ee326d758b6f1c7e095471fefcf360427a0bb8339cab31',
  HexVersionMPModel: '019db38b640f582892b29a966a0402878d3081a3dc5dc1e8bed5be02fb49f2d5',
  GetOrgCategories: 'c8a68c0afc9c55df866594a8e0170772bbf473f9e36a858f82302e587fbf14c8',
  GetOrgStatuses: '024f7a32a4e8feab5b17020ea4f1bd9984c4beda4e55b9d00d9fb707f7daa615',
  GetProjectLabelsForHome: '7589c73ad9c51fc481256149ab98f59c29838014c93be778a8b688b4d64f0534',
  GetRecentThreads: '1b8126a2a04b8e73f508c82df273e7779bcff05f456ec040458c8d9cd02c841e',
  GetSafeOrUnknownHexesForHome: 'd5da34e7b30ac605cb02adbdc2ba7f56a4ec1f6a4219292a292879a75f799e4c',
  Me: '442871bec9991e3b7cded771cab93235918a990c9ba868fcdd0a6f044900835f',
  ProductVersions: '1f0d5841e07d4a5db2a812bf81fb00073e2d19f19cfd27e8082bdbb1ed3978b4',
  UpdateHexTitle: '2aa36a53bbbdf7b7c8fe508cdf9b9cb1977a5ff30e3c50c2a1851d436ab0fe82',
};

const OPERATION_HASH_PATTERNS = [
  /"([A-Za-z][A-Za-z0-9_]{1,80})":"([a-f0-9]{64})"/g,
  /\\"([A-Za-z][A-Za-z0-9_]{1,80})\\":\\"([a-f0-9]{64})\\"/g,
];

export const isAuthenticated = (): boolean => {
  const launchDarklyUser = getPageGlobal('launchDarklyContext.user');
  if (launchDarklyUser && typeof launchDarklyUser === 'object') return true;

  const hexVersion = getPageGlobal('launchDarklyContext.user.hexVersion');
  return typeof hexVersion === 'string' && hexVersion.length > 0;
};

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

export const getOrgId = (): string => {
  const pathSegment = new URL(getCurrentUrl()).pathname.split('/').filter(Boolean)[0];
  return pathSegment ?? 'global';
};

export const getCurrentContext = () => {
  const url = new URL(getCurrentUrl());
  const pathParts = url.pathname.split('/').filter(Boolean);
  const orgId = pathParts[0] ?? 'global';
  const section = pathParts[1] ?? '';
  const projectId = ['app', 'hex'].includes(section) ? (pathParts[2] ?? '') : '';

  return {
    origin: url.origin,
    org_id: orgId,
    section,
    project_id: projectId,
    url: url.href,
    title: document.title,
  };
};

export const buildProjectUrl = (projectId: string, mode: 'app' | 'logic' = 'app'): string => {
  const url = new URL(getCurrentUrl());
  const encodedProjectId = encodeURIComponent(projectId);
  url.pathname =
    mode === 'logic'
      ? `/${getOrgId()}/hex/${encodedProjectId}/draft/logic`
      : `/${getOrgId()}/app/${encodedProjectId}/latest`;
  url.search = '';
  url.hash = '';
  return url.href;
};

export const navigateToProject = (projectId: string, mode: 'app' | 'logic' = 'app'): string => {
  const url = buildProjectUrl(projectId, mode);
  window.location.href = url;
  return url;
};

const getAgentVersion = (): string => {
  const hexVersion = getPageGlobal('launchDarklyContext.user.hexVersion');
  return typeof hexVersion === 'string' ? hexVersion : '';
};

const getGraphQLHeaders = (): Record<string, string> => ({
  'x-agent-type': 'WEB_CLIENT',
  'x-agent-version': getAgentVersion(),
  'x-csrf-safe': 'safe',
  'x-org-id': getOrgId(),
});

const isHexScriptUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url, getCurrentUrl());
    return parsed.hostname === 'static.hex.site' && parsed.pathname.endsWith('.js');
  } catch {
    return false;
  }
};

const getScriptUrls = (): string[] => {
  const scriptUrls = querySelectorAll<HTMLScriptElement>('script[src]').map(script => script.src);
  const resourceUrls = performance
    .getEntriesByType('resource')
    .map(entry => entry.name)
    .filter(url => typeof url === 'string');

  return Array.from(new Set([...scriptUrls, ...resourceUrls].filter(isHexScriptUrl)));
};

const readHashCache = (scriptUrls: string[]): OperationHashCache | null => {
  const cache = getAuthCache<OperationHashCache>(CACHE_NAMESPACE);
  if (!cache) return null;
  if (cache.scriptUrls.length !== scriptUrls.length) return null;
  if (cache.scriptUrls.some((url, index) => url !== scriptUrls[index])) return null;
  return cache;
};

const extractOperations = (text: string, operations: Record<string, string>): void => {
  for (const pattern of OPERATION_HASH_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null) {
      const [, operationName, hash] = match;
      if (operationName && hash) operations[operationName] = hash;
      match = pattern.exec(text);
    }
  }
};

const discoverOperationHashes = async (
  requiredOperation?: string,
  forceRefresh = false,
): Promise<OperationHashCache> => {
  const scriptUrls = getScriptUrls();
  const cached = readHashCache(scriptUrls);
  if (!forceRefresh && cached && (!requiredOperation || cached.operations[requiredOperation])) return cached;

  const operations: Record<string, string> = {};
  for (const url of scriptUrls) {
    try {
      const text = await fetchText(url, { credentials: 'omit', timeout: 15_000 });
      extractOperations(text, operations);
      if (requiredOperation && operations[requiredOperation]) break;
    } catch {
      // Static bundle discovery is best-effort. A known operation table is used
      // when the currently loaded bundles do not expose a requested operation.
    }
  }

  const nextCache = {
    scriptUrls,
    operations: { ...FALLBACK_OPERATION_HASHES, ...operations },
  };
  setAuthCache(CACHE_NAMESPACE, nextCache);
  return nextCache;
};

const getOperationHash = async (operationName: string): Promise<string> => {
  const cache = await discoverOperationHashes(operationName);
  const hash = cache.operations[operationName];
  if (!hash) throw ToolError.internal(`Hex operation hash not found for ${operationName}.`);
  return hash;
};

const isPersistedQueryError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('persisted') || message.includes('sha256') || message.includes('operation hash');
};

const buildGraphQLPath = (operationName: string, options: GraphQLOptions = {}): string => {
  const query = buildQueryString({
    op: operationName,
    extra: options.extra,
  });
  return `/graphql?${query}`;
};

const graphQLOnce = async <T>(
  operationName: string,
  variables: Record<string, unknown>,
  options: GraphQLOptions = {},
): Promise<T> => {
  if (!isAuthenticated()) throw ToolError.auth('Not authenticated — please log in to Hex.');

  const hash = await getOperationHash(operationName);
  const response = await postJSON<GraphQLResponse<T>>(
    buildGraphQLPath(operationName, options),
    {
      operationName,
      variables,
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: hash,
        },
      },
    },
    { headers: getGraphQLHeaders() },
  );

  if (!response) throw ToolError.internal(`Hex returned an empty response for ${operationName}.`);
  if (response.errors?.length) {
    const message = response.errors.map(error => error.message ?? error.extensions?.code ?? 'Unknown error').join('; ');
    throw ToolError.validation(`Hex GraphQL error for ${operationName}: ${message}`);
  }
  if (!response.data) throw ToolError.internal(`Hex response for ${operationName} did not include data.`);

  return response.data;
};

export const graphQL = async <T>(
  operationName: string,
  variables: Record<string, unknown>,
  options: GraphQLOptions = {},
): Promise<T> => {
  try {
    return await graphQLOnce<T>(operationName, variables, options);
  } catch (error) {
    if (!isPersistedQueryError(error)) throw error;
    await discoverOperationHashes(operationName, true);
    return graphQLOnce<T>(operationName, variables, options);
  }
};

const collectResponseTypes = (value: unknown, types = new Set<string>()): string[] => {
  if (!value || typeof value !== 'object') return Array.from(types);

  if (Array.isArray(value)) {
    for (const item of value) collectResponseTypes(item, types);
    return Array.from(types);
  }

  const record = value as Record<string, unknown>;
  const typename = record.__typename;
  if (typeof typename === 'string' && typename.length > 0) types.add(typename);

  const operationType = record.type;
  if (typeof operationType === 'string' && operationType.length > 0) types.add(operationType);

  for (const child of Object.values(record)) collectResponseTypes(child, types);
  return Array.from(types);
};

const findStringField = (value: unknown, fieldName: string): string => {
  if (!value || typeof value !== 'object') return '';

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringField(item, fieldName);
      if (found) return found;
    }
    return '';
  }

  const record = value as Record<string, unknown>;
  if (record.key === fieldName && typeof record.value === 'string') return record.value;

  const directValue = record[fieldName];
  if (typeof directValue === 'string') return directValue;

  for (const child of Object.values(record)) {
    const found = findStringField(child, fieldName);
    if (found) return found;
  }
  return '';
};

const summarizeAtomicOperation = (operation: HexAtomicOperationResponse | null | undefined): AtomicOperationSummary => {
  const responses = (operation?.responses ?? []).flat(Number.POSITIVE_INFINITY);
  return {
    response_count: responses.length,
    response_types: collectResponseTypes(responses),
    revision: operation?.revision ?? null,
    last_run_start: findStringField(responses, 'lastRunStart'),
  };
};

export const getDraftVersion = async (projectId: string): Promise<DraftVersion> => {
  const [versionData, logicSessionData] = await Promise.all([
    graphQL<HexVersionResponse>('GetHexVersion', { hexId: projectId, version: 'draft' }),
    graphQL<HexVersionResponse>('GetLogicSessionId', { hexId: projectId, version: 'draft' }),
  ]);

  const versionId = versionData.hexVersionByNumber?.id;
  if (!versionId) throw ToolError.notFound(`Hex draft version not found for project: ${projectId}`);

  return {
    project_id: projectId,
    version_id: versionId,
    logic_session_id:
      logicSessionData.hexVersionByNumber?.logicSessionId ?? versionData.hexVersionByNumber?.logicSessionId ?? '',
  };
};

export const createHexProject = async (params: CreateHexProjectParams): Promise<CreatedHexProject> => {
  const data = await graphQL<CreateHexResponse>('CreateHex', {
    getProjectCount: false,
    isTour: false,
    hexType: 'PROJECT',
    name: params.title,
    projectLanguage: params.projectLanguage ?? 'PYTHON',
    description: params.description ?? '',
    statusId: params.statusId ?? null,
    categoryIds: params.categoryIds ?? [],
    kernelImage: null,
    kernelSize: null,
    collectionId: params.collectionId ?? null,
    collectionProjectRole: null,
  });

  const project = data.createHex;
  if (!project?.id) throw ToolError.internal('Hex did not return a project ID after creation.');

  const draftVersion = await getDraftVersion(project.id);
  return {
    id: project.id,
    title: project.title ?? params.title,
    org_id: project.org?.id ?? getOrgId(),
    draft_version_id: draftVersion.version_id,
    logic_session_id: draftVersion.logic_session_id,
    app_url: buildProjectUrl(project.id, 'app'),
    logic_url: buildProjectUrl(project.id, 'logic'),
  };
};

export const doHexVersionAtomicOperation = async (
  hexVersionId: string,
  requests: HexAtomicOperationRequest[],
  extra: string,
): Promise<AtomicOperationSummary> => {
  const data = await graphQL<HexVersionAtomicOperationResponse>(
    'doHexVersionAtomicOperation',
    {
      requests,
      hexVersionId,
      skipSideEffects: false,
    },
    { extra },
  );

  return summarizeAtomicOperation(data.doHexVersionAtomicOperation ?? data.doHexVersionAtomicOperationV2);
};

export const runAppSession = async (
  projectId: string,
  logicSessionId: string,
  priorityCellIds: string[] = [],
  forceOverwriteCache = false,
): Promise<ProjectRunResult> => {
  if (!logicSessionId) throw ToolError.notFound(`Hex logic session not found for project: ${projectId}`);

  const data = await graphQL<AppSessionAtomicOperationResponse>(
    'doAppSessionAtomicOperation',
    {
      requests: [
        {
          mpClientId: crypto.randomUUID(),
          operation: {
            type: 'RUN_APP_SESSION',
            payload: {
              forceOverwriteCache,
              executeTrace: false,
              priorityCellIds,
            },
          },
          revisionOverride: null,
        },
      ],
      appSessionId: logicSessionId,
      skipSideEffects: false,
    },
    { extra: 'RUN_APP_SESSION' },
  );

  const summary = summarizeAtomicOperation(data.doAppSessionAtomicOperation ?? data.doAppSessionAtomicOperationV2);
  return {
    project_id: projectId,
    logic_session_id: logicSessionId,
    started: true,
    priority_cell_ids: priorityCellIds,
    force_overwrite_cache: forceOverwriteCache,
    last_run_start: summary.last_run_start,
    response_count: summary.response_count,
    response_types: summary.response_types,
  };
};

export const runProject = async (
  projectId: string,
  priorityCellIds: string[] = [],
  forceOverwriteCache = false,
): Promise<ProjectRunResult> => {
  const draftVersion = await getDraftVersion(projectId);
  return runAppSession(projectId, draftVersion.logic_session_id, priorityCellIds, forceOverwriteCache);
};
