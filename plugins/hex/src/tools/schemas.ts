import { z } from 'zod';
import { buildProjectUrl } from '../hex-api.js';

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  name: z.string().describe('Display name'),
  email: z.string().describe('Email address'),
  org_role: z.string().describe('Organization role for the current Hex organization'),
  platform_role: z.string().describe('Platform role for the current Hex account'),
  created_date: z.string().describe('ISO 8601 timestamp when the user account was created'),
  has_api_access: z.boolean().describe('Whether the user has Hex API access'),
});

export interface RawUser {
  id?: string;
  name?: string;
  email?: string;
  orgRole?: string;
  platformRole?: string;
  createdDate?: string;
  hasApiAccess?: boolean;
}

export const mapUser = (user: RawUser) => ({
  id: user.id ?? '',
  name: user.name ?? '',
  email: user.email ?? '',
  org_role: user.orgRole ?? '',
  platform_role: user.platformRole ?? '',
  created_date: user.createdDate ?? '',
  has_api_access: user.hasApiAccess ?? false,
});

export const organizationSchema = z.object({
  id: z.string().describe('Organization ID'),
  name: z.string().describe('Organization display name'),
  default_status_id: z.string().describe('Default project status ID for the organization'),
  allow_magic: z.boolean().describe('Whether Hex Magic features are enabled for the organization'),
});

export interface RawOrganization {
  id?: string;
  name?: string;
  displayName?: string;
  defaultStatusId?: string;
  allowMagic?: boolean;
}

export const mapOrganization = (organization: RawOrganization) => ({
  id: organization.id ?? '',
  name: organization.name ?? organization.displayName ?? '',
  default_status_id: organization.defaultStatusId ?? '',
  allow_magic: organization.allowMagic ?? false,
});

export const currentContextSchema = z.object({
  origin: z.string().describe('Current Hex instance origin'),
  org_id: z.string().describe('Current organization ID from the URL path'),
  section: z.string().describe('Current Hex route section, such as home, app, or hex'),
  project_id: z
    .string()
    .describe('Project route identifier from the current URL, or empty when not on a project route'),
  url: z.string().describe('Current browser URL'),
  title: z.string().describe('Current browser page title'),
});

export const pageInfoSchema = z.object({
  has_next_page: z.boolean().describe('Whether another page of results is available'),
  has_previous_page: z.boolean().describe('Whether a previous page of results is available'),
  start_cursor: z.string().nullable().describe('Cursor for the first result, or null when unavailable'),
  end_cursor: z.string().nullable().describe('Cursor for the last result, or null when unavailable'),
});

export interface RawPageInfo {
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  startCursor?: string | null;
  endCursor?: string | null;
}

export const mapPageInfo = (pageInfo: RawPageInfo = {}) => ({
  has_next_page: pageInfo.hasNextPage ?? false,
  has_previous_page: pageInfo.hasPreviousPage ?? false,
  start_cursor: pageInfo.startCursor ?? null,
  end_cursor: pageInfo.endCursor ?? null,
});

export const statusSchema = z.object({
  id: z.string().describe('Status ID'),
  name: z.string().describe('Status name'),
  color: z.string().describe('Status color value'),
  description: z.string().describe('Status description'),
});

export interface RawStatus {
  id?: string;
  name?: string;
  color?: string;
  description?: string;
}

export const mapStatus = (status: RawStatus) => ({
  id: status.id ?? '',
  name: status.name ?? '',
  color: status.color ?? '',
  description: status.description ?? '',
});

export const categorySchema = z.object({
  id: z.string().describe('Category ID'),
  name: z.string().describe('Category name'),
  color: z.string().describe('Category color value'),
  description: z.string().describe('Category description'),
});

export interface RawCategory {
  id?: string;
  name?: string;
  color?: string;
  description?: string;
}

export const mapCategory = (category: RawCategory) => ({
  id: category.id ?? '',
  name: category.name ?? '',
  color: category.color ?? '',
  description: category.description ?? '',
});

const projectPersonSchema = z.object({
  id: z.string().describe('User ID'),
  name: z.string().describe('User display name'),
  email: z.string().describe('User email address'),
});

export interface RawProjectPerson {
  id?: string;
  name?: string;
  email?: string;
}

const mapProjectPerson = (person: RawProjectPerson = {}) => ({
  id: person.id ?? '',
  name: person.name ?? '',
  email: person.email ?? '',
});

export const projectSchema = z.object({
  id: z.string().describe('Project ID'),
  title: z.string().describe('Project title'),
  description: z.string().describe('Plain text project description'),
  hex_type: z.string().describe('Hex project type'),
  project_language: z.string().describe('Primary project language'),
  effective_role: z.string().describe('Current user effective role for the project'),
  can_share: z.boolean().describe('Whether the current user can share the project'),
  can_view_logic: z.boolean().describe('Whether the current user can view the project logic'),
  can_use_app: z.boolean().describe('Whether the current user can use the app view'),
  starred_by_viewer: z.boolean().describe('Whether the current user has starred the project'),
  trashed: z.boolean().describe('Whether the project is in trash'),
  trash_date: z.string().describe('ISO 8601 timestamp when the project was trashed, or empty when not trashed'),
  user_updated_date: z.string().describe('ISO 8601 timestamp when the project was last updated'),
  last_viewed_by_me: z.string().describe('ISO 8601 timestamp when the current user last viewed the project'),
  date_created: z.string().describe('ISO 8601 timestamp when the project was created'),
  total_view_count: z.number().int().describe('Total view count reported by Hex'),
  status: statusSchema.describe('Project status'),
  categories: z.array(categorySchema).describe('Categories attached to the project'),
  owner: projectPersonSchema.describe('Project owner'),
  creator: projectPersonSchema.describe('Project creator'),
  app_url: z.string().describe('URL for the project app route'),
  logic_url: z.string().describe('URL for the project logic route'),
});

export const authoredProjectSchema = z.object({
  id: z.string().describe('Hex project ID'),
  title: z.string().describe('Project title'),
  org_id: z.string().describe('Organization ID that owns the project'),
  draft_version_id: z.string().describe('Draft Hex version ID used for authoring operations'),
  logic_session_id: z.string().describe('Logic session ID used to run project cells'),
  app_url: z.string().describe('URL for the project app route'),
  logic_url: z.string().describe('URL for the project logic route'),
});

interface RawPublishedVersion {
  totalViewCount?: number;
}

interface RawProjectAnalytics {
  totalViewCount?: number;
}

export interface RawProject {
  id?: string;
  title?: string;
  description?: unknown;
  hexType?: string;
  projectLanguage?: string;
  effectiveRole?: string;
  canShare?: boolean;
  canViewLogic?: boolean;
  canUseApp?: boolean;
  starredByViewer?: boolean;
  trashDate?: string | null;
  userUpdatedDate?: string;
  lastViewedByMe?: string | null;
  dateCreated?: string;
  status?: RawStatus | null;
  categories?: RawCategory[];
  owner?: RawProjectPerson | null;
  creator?: RawProjectPerson | null;
  lastPublishedVersion?: RawPublishedVersion | null;
  projectAnalytics?: RawProjectAnalytics | null;
}

const textFromDescription = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textFromDescription).filter(Boolean).join('\n');
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  const ownText = typeof record.text === 'string' ? record.text : '';
  const childText = Array.isArray(record.children) ? record.children.map(textFromDescription).join('') : '';
  return ownText || childText;
};

export const mapProject = (project: RawProject) => ({
  id: project.id ?? '',
  title: project.title ?? '',
  description: textFromDescription(project.description),
  hex_type: project.hexType ?? '',
  project_language: project.projectLanguage ?? '',
  effective_role: project.effectiveRole ?? '',
  can_share: project.canShare ?? false,
  can_view_logic: project.canViewLogic ?? false,
  can_use_app: project.canUseApp ?? false,
  starred_by_viewer: project.starredByViewer ?? false,
  trashed: project.trashDate !== null && project.trashDate !== undefined,
  trash_date: project.trashDate ?? '',
  user_updated_date: project.userUpdatedDate ?? '',
  last_viewed_by_me: project.lastViewedByMe ?? '',
  date_created: project.dateCreated ?? '',
  total_view_count: project.projectAnalytics?.totalViewCount ?? project.lastPublishedVersion?.totalViewCount ?? 0,
  status: mapStatus(project.status ?? {}),
  categories: (project.categories ?? []).map(mapCategory),
  owner: mapProjectPerson(project.owner ?? {}),
  creator: mapProjectPerson(project.creator ?? {}),
  app_url: project.id ? buildProjectUrl(project.id, 'app') : '',
  logic_url: project.id ? buildProjectUrl(project.id, 'logic') : '',
});

export const collectionSchema = z.object({
  id: z.string().describe('Collection ID'),
  name: z.string().describe('Collection name'),
  description: z.string().describe('Collection description'),
  project_count: z.number().int().describe('Number of projects in the collection when reported by Hex'),
  starred_by_viewer: z.boolean().describe('Whether the current user has starred the collection'),
});

export interface RawCollection {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  hexCount?: number;
  projectCount?: number;
  starredByViewer?: boolean;
}

export const mapCollection = (collection: RawCollection) => ({
  id: collection.id ?? '',
  name: collection.name ?? collection.title ?? '',
  description: collection.description ?? '',
  project_count: collection.hexCount ?? collection.projectCount ?? 0,
  starred_by_viewer: collection.starredByViewer ?? false,
});

export const dataConnectionSchema = z.object({
  id: z.string().describe('Data connection ID'),
  name: z.string().describe('Data connection name when reported by Hex'),
  type: z.string().describe('Data connection type'),
  description: z.string().describe('Data connection description'),
  is_multi_database: z.boolean().describe('Whether this connection supports multiple databases'),
});

export interface RawDataConnection {
  id?: string;
  name?: string;
  displayName?: string;
  connectionType?: string;
  type?: string;
  description?: string;
  isMultiDatabase?: boolean;
}

export const mapDataConnection = (connection: RawDataConnection) => ({
  id: connection.id ?? '',
  name: connection.name ?? connection.displayName ?? '',
  type: connection.connectionType ?? connection.type ?? '',
  description: connection.description ?? '',
  is_multi_database: connection.isMultiDatabase ?? false,
});

export const threadSchema = z.object({
  id: z.string().describe('Thread ID'),
  title: z.string().describe('Thread title'),
  thread_type: z.string().describe('Thread type'),
  created_date: z.string().describe('ISO 8601 timestamp when the thread was created'),
  updated_date: z.string().describe('ISO 8601 timestamp when the thread was last updated'),
});

export interface RawThread {
  id?: string;
  title?: string;
  name?: string;
  threadType?: string;
  createdDate?: string;
  updatedDate?: string;
}

export const mapThread = (thread: RawThread) => ({
  id: thread.id ?? '',
  title: thread.title ?? thread.name ?? '',
  thread_type: thread.threadType ?? '',
  created_date: thread.createdDate ?? '',
  updated_date: thread.updatedDate ?? '',
});

export const exploreSchema = z.object({
  id: z.string().describe('Explore ID'),
  title: z.string().describe('Explore title'),
  description: z.string().describe('Explore description'),
  created_date: z.string().describe('ISO 8601 timestamp when the explore was created'),
  updated_date: z.string().describe('ISO 8601 timestamp when the explore was last updated'),
  creator: projectPersonSchema.describe('Explore creator'),
});

export interface RawExplore {
  id?: string;
  title?: string;
  name?: string;
  description?: string;
  createdDate?: string;
  updatedDate?: string;
  creator?: RawProjectPerson | null;
}

export const mapExplore = (explore: RawExplore) => ({
  id: explore.id ?? '',
  title: explore.title ?? explore.name ?? '',
  description: explore.description ?? '',
  created_date: explore.createdDate ?? '',
  updated_date: explore.updatedDate ?? '',
  creator: mapProjectPerson(explore.creator ?? {}),
});

export const productVersionSchema = z.object({
  id: z.string().describe('Product version ID'),
  app_version: z.string().describe('Hex app version'),
  client_version: z.string().describe('Hex client version'),
  kernel_version: z.string().describe('Hex kernel version'),
  sidecar_version: z.string().describe('Hex sidecar version'),
});

export interface RawProductVersion {
  id?: string;
  appVersion?: string;
  clientVersion?: string;
  kernelVersion?: string;
  sidecarVersion?: string;
}

export const mapProductVersion = (version: RawProductVersion) => ({
  id: version.id ?? '',
  app_version: version.appVersion ?? '',
  client_version: version.clientVersion ?? '',
  kernel_version: version.kernelVersion ?? '',
  sidecar_version: version.sidecarVersion ?? '',
});

export const projectCellSchema = z.object({
  id: z.string().describe('Cell ID'),
  static_id: z.string().describe('Stable cell ID used across versions'),
  contents_id: z.string().describe('Cell contents ID used by update operations, or empty when unavailable'),
  input_cell_id: z.string().describe('Hex input-cell contents ID for Parameter cells, or empty when unavailable'),
  order: z.string().describe('Cell ordering value reported by Hex'),
  label: z.string().describe('Cell label, or empty when the cell has no label'),
  cell_type: z.string().describe('Hex cell type, such as SQL, MARKDOWN, CODE, or CHART'),
  contents_type: z.string().describe('GraphQL cell contents typename, such as SqlCell or MarkdownCell'),
  result_variable: z
    .string()
    .describe('Output dataframe name for cells that produce one, or input variable name for Parameter cells'),
  connection_id: z.string().describe('Data connection ID used by SQL cells, or empty when not applicable'),
  input_type: z.string().describe('Hex input type for Parameter cells, such as DATE or TEXT_INPUT'),
  output_type: z.string().describe('Hex output data type for Parameter cells, such as DATETIME or STRING'),
  default_value_string: z.string().describe('Default value string stored by Hex for Parameter cells'),
  source: z.string().describe('Cell source text when requested and available'),
  deleted: z.boolean().describe('Whether the cell is marked deleted'),
});

export const createdCellSchema = z.object({
  id: z.string().describe('Cell ID'),
  static_id: z.string().describe('Stable cell ID used across versions'),
  contents_id: z.string().describe('Cell contents ID used by update operations'),
  story_element_id: z.string().describe('Story element ID Hex created for the cell'),
  order: z.string().describe('Cell ordering value sent to Hex'),
  cell_type: z.string().describe('Hex cell type, such as SQL or TEXT'),
  result_variable: z.string().describe('Output variable/dataframe name for SQL cells, or empty when not applicable'),
  connection_id: z.string().describe('Data connection ID used by SQL cells, or empty when not applicable'),
  source: z.string().describe('Cell source text'),
});

export const atomicOperationSchema = z.object({
  response_count: z.number().int().describe('Number of atomic operation responses returned by Hex'),
  response_types: z.array(z.string()).describe('Response type names returned by Hex for the atomic operation'),
  revision: z.number().int().nullable().describe('Revision returned by Hex, or null when not returned'),
  last_run_start: z.string().describe('Run start timestamp reported by Hex, or empty when not applicable'),
});

export const dashboardGridRowSchema = z.object({
  id: z.string().describe('Hex app grid row ID created for the dashboard layout'),
  grid_layout_id: z.string().describe('Hex app grid layout ID containing this row'),
  grid_column_id: z.string().describe('Hex app grid column ID created for this row'),
  grid_element_id: z.string().describe('Hex app grid element ID created for the cell placement'),
  cell_id: z.string().describe('Hex cell ID placed into this grid row'),
  start: z.number().int().describe('Starting grid column, inclusive, on Hex 0-120 grid coordinates'),
  end: z.number().int().describe('Ending grid column, exclusive, on Hex 0-120 grid coordinates'),
  show_label: z.boolean().describe('Whether Hex should show the cell label in the app row'),
  hide_output: z.boolean().describe('Whether Hex should hide the cell output in the app row'),
  show_source: z.boolean().describe('Whether Hex should show source code in the app row'),
});

export const runResultSchema = z.object({
  project_id: z.string().describe('Hex project ID that was run'),
  logic_session_id: z.string().describe('Logic session ID used to trigger the run'),
  started: z.boolean().describe('Whether Hex accepted the run request'),
  priority_cell_ids: z.array(z.string()).describe('Cell IDs prioritized for the run'),
  force_overwrite_cache: z.boolean().describe('Whether Hex was asked to overwrite cached results'),
  last_run_start: z.string().describe('Run start timestamp reported by Hex, or empty when not returned'),
  response_count: z.number().int().describe('Number of atomic operation responses returned by Hex'),
  response_types: z.array(z.string()).describe('Response type names returned by Hex for the run operation'),
});

const cellResultValueSchema = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .describe('Cell result value as returned by Hex display-table output');

const cellResultOutputContentSchema = z.object({
  id: z.string().describe('Output content ID'),
  mime_type: z.string().describe('Hex output content MIME type'),
  status: z.string().describe('Output content loading status, such as READY'),
});

const cellResultOutputSchema = z.object({
  id: z.string().describe('Hex output ID'),
  output_type: z.string().describe('Hex output type, such as EXECUTE_RESULT, ERROR, or METADATA'),
  order: z.number().int().describe('Output order within the cell'),
  contents: z.array(cellResultOutputContentSchema).describe('Output content records attached to this output'),
});

const cellResultDataFrameSchema = z.object({
  columns: z.record(z.string(), z.string()).describe('Dataframe schema columns keyed by column name'),
  row_count: z.number().int().describe('Dataframe row count reported by Hex scope metadata'),
  row_count_is_truncated: z.boolean().describe('Whether Hex reported the dataframe schema row count as truncated'),
});

const cellResultColumnSchema = z.object({
  id: z.string().describe('Hex display-table column ID'),
  name: z.string().describe('Display-table column name'),
  type: z.string().describe('Display-table column type reported by Hex'),
});

const cellResultSqlStatusSchema = z.object({
  loaded_rows: z.number().int().describe('Number of rows loaded by the SQL query'),
  finished: z.boolean().describe('Whether Hex reported the SQL query stream as finished'),
  elapsed_time_ms: z.number().describe('Elapsed SQL status time in milliseconds when reported by Hex'),
});

export const cellResultSchema = z.object({
  project_id: z.string().describe('Hex project ID'),
  logic_session_id: z.string().describe('Logic session ID whose runtime state was read'),
  app_session_state: z.string().describe('Overall Hex app-session state, such as IDLE, RUNNING, or ERRORED'),
  app_session_last_run_start: z.string().describe('ISO 8601 timestamp for the last app-session run start'),
  app_session_last_run_end: z.string().describe('ISO 8601 timestamp for the last app-session run end'),
  cell_id: z.string().describe('Hex cell ID'),
  app_session_cell_id: z.string().describe('Runtime app-session cell ID corresponding to the Hex cell ID'),
  cell_state: z.string().describe('Terminal or current cell execution state, such as IDLE, RUNNING, or ERRORED'),
  last_execution_start: z.string().describe('ISO 8601 timestamp when this cell last started executing'),
  last_execution_end: z.string().describe('ISO 8601 timestamp when this cell last finished executing'),
  result_variable: z.string().describe('Output dataframe variable name for this cell, or empty when unavailable'),
  dataframe_schema: cellResultDataFrameSchema
    .nullable()
    .describe('Dataframe schema from Hex runtime scope, or null when the cell did not produce a dataframe'),
  columns: z.array(cellResultColumnSchema).describe('Display-table columns parsed from Hex output content'),
  rows: z
    .array(z.record(z.string(), cellResultValueSchema))
    .describe('Rows parsed from Hex display-table output, limited by row_limit'),
  row_count: z.number().int().describe('Total display-table row count reported by Hex'),
  returned_row_count: z.number().int().describe('Number of rows returned by this tool'),
  truncated: z.boolean().describe('Whether rows were truncated by this tool row_limit'),
  sql_status: cellResultSqlStatusSchema
    .nullable()
    .describe('SQL stream status output when Hex produced one, otherwise null'),
  errors: z.array(z.string()).describe('Execution error messages parsed from Hex error outputs'),
  outputs: z.array(cellResultOutputSchema).describe('Output records attached to the cell'),
});

export interface RawCellContents {
  id?: string;
  sqlCellId?: string;
  textCellId?: string;
  inputCellId?: string;
  __typename?: string;
  source?: string;
  richText?: unknown;
  resultVariable?: string;
  name?: string;
  connectionId?: string | null;
  inputType?: string;
  outputType?: string;
  defaultValueString?: string | null;
  deletedDate?: string | null;
}

export interface RawProjectCell {
  id?: string;
  staticId?: string;
  order?: string | number;
  label?: string | null;
  cellType?: string;
  cellContents?: RawCellContents | null;
  deletedDate?: string | null;
}

export const mapProjectCell = (cell: RawProjectCell, includeSource: boolean) => ({
  id: cell.id ?? '',
  static_id: cell.staticId ?? '',
  contents_id:
    cell.cellContents?.id ??
    cell.cellContents?.sqlCellId ??
    cell.cellContents?.textCellId ??
    cell.cellContents?.inputCellId ??
    '',
  input_cell_id: cell.cellContents?.inputCellId ?? '',
  order: cell.order === undefined ? '' : String(cell.order),
  label: cell.label ?? '',
  cell_type: cell.cellType ?? '',
  contents_type: cell.cellContents?.__typename ?? '',
  result_variable: cell.cellContents?.resultVariable ?? cell.cellContents?.name ?? '',
  connection_id: cell.cellContents?.connectionId ?? '',
  input_type: cell.cellContents?.inputType ?? '',
  output_type: cell.cellContents?.outputType ?? '',
  default_value_string: cell.cellContents?.defaultValueString ?? '',
  source: includeSource ? (cell.cellContents?.source ?? textFromDescription(cell.cellContents?.richText)) : '',
  deleted: cell.deletedDate !== null && cell.deletedDate !== undefined,
});

export const projectVersionSchema = z.object({
  id: z.string().describe('Hex version ID'),
  version: z.string().describe('Hex version string requested, such as draft'),
  display_name: z.string().describe('Version display name'),
  published: z.boolean().describe('Whether this Hex version is published'),
  logic_session_id: z.string().describe('Logic session ID for this version when reported by Hex'),
});

export interface RawProjectVersion {
  id?: string;
  version?: string;
  displayName?: string | null;
  name?: string | null;
  published?: boolean;
  logicSessionId?: string | null;
}

export const mapProjectVersion = (version: RawProjectVersion, requestedVersion: string) => ({
  id: version.id ?? '',
  version: version.version ?? requestedVersion,
  display_name: version.displayName ?? version.name ?? '',
  published: version.published ?? false,
  logic_session_id: version.logicSessionId ?? '',
});

export interface RawConnection<T> {
  edges?: Array<{ node?: T | null } | null>;
  pageInfo?: RawPageInfo;
}

export const mapConnectionNodes = <T>(connection: RawConnection<T> | null | undefined): T[] =>
  (connection?.edges ?? []).flatMap(edge => (edge?.node ? [edge.node] : []));
