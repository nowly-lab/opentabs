import { getOrgId, graphQL } from '../hex-api.js';
import type { RawConnection, RawProject } from './schemas.js';
import { mapConnectionNodes, mapPageInfo, mapProject } from './schemas.js';

export interface ProjectQueryParams {
  limit?: number;
  after?: string;
  searchTerm?: string;
  ownershipLevel?: 'ALL' | 'OWN';
  onlyStarred?: boolean;
  onlyPublished?: boolean;
  projectIds?: string[];
}

interface ProjectQueryResponse {
  safeOrUnknownHexes?: RawConnection<RawProject>;
}

export const queryProjects = async (params: ProjectQueryParams = {}) => {
  const data = await graphQL<ProjectQueryResponse>('GetSafeOrUnknownHexesForHome', {
    orgId: getOrgId(),
    ownershipLevel: params.ownershipLevel ?? 'ALL',
    onlyPublished: params.onlyPublished ?? false,
    after: params.after ?? null,
    before: null,
    first: params.limit ?? 20,
    last: null,
    trashed: false,
    includeCreatorImgUrl: false,
    order: 'RECENTLY_VIEWED',
    archived: 'INCLUDE',
    searchTerm: params.searchTerm,
    onlyStarred: params.onlyStarred,
    hexIds: params.projectIds,
  });

  const connection = data.safeOrUnknownHexes;
  return {
    org_id: getOrgId(),
    projects: mapConnectionNodes(connection).map(mapProject),
    page_info: mapPageInfo(connection?.pageInfo),
  };
};
