import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './hex-api.js';
import { createDashboard } from './tools/create-dashboard.js';
import { createInputCell } from './tools/create-input-cell.js';
import { createProject } from './tools/create-project.js';
import { createSqlCell } from './tools/create-sql-cell.js';
import { createTextCell } from './tools/create-text-cell.js';
import { getCurrentContextTool } from './tools/get-current-context.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getCellResult } from './tools/get-cell-result.js';
import { getProductVersions } from './tools/get-product-versions.js';
import { getProjectCells } from './tools/get-project-cells.js';
import { getProject } from './tools/get-project.js';
import { listCategories } from './tools/list-categories.js';
import { listCollections } from './tools/list-collections.js';
import { listDataConnections } from './tools/list-data-connections.js';
import { listExplores } from './tools/list-explores.js';
import { listProjectLabels } from './tools/list-project-labels.js';
import { listProjects } from './tools/list-projects.js';
import { listPublishedApps } from './tools/list-published-apps.js';
import { listRecentThreads } from './tools/list-recent-threads.js';
import { listStarredProjects } from './tools/list-starred-projects.js';
import { listStatuses } from './tools/list-statuses.js';
import { navigateToProjectTool } from './tools/navigate-to-project.js';
import { runCellAndGetResult } from './tools/run-cell-and-get-result.js';
import { runProjectTool } from './tools/run-project.js';
import { searchProjects } from './tools/search-projects.js';
import { updateSqlCell } from './tools/update-sql-cell.js';
import { upsertDashboardLayout } from './tools/upsert-dashboard-layout.js';

class HexPlugin extends OpenTabsPlugin {
  readonly name = 'hex';
  readonly description = 'OpenTabs plugin for Hex';
  override readonly displayName = 'Hex';
  readonly urlPatterns = ['*://*.hex.tech/*'];
  override readonly homepage = 'https://hex.tech';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentContextTool,
    getCurrentUser,
    getProductVersions,
    // Dashboards
    createDashboard,
    upsertDashboardLayout,
    // Projects
    createProject,
    listProjects,
    searchProjects,
    getProject,
    getProjectCells,
    listPublishedApps,
    listStarredProjects,
    navigateToProjectTool,
    // Cells
    createTextCell,
    createInputCell,
    createSqlCell,
    updateSqlCell,
    // Runs
    runProjectTool,
    runCellAndGetResult,
    getCellResult,
    // Organization
    listProjectLabels,
    listStatuses,
    listCategories,
    listCollections,
    listDataConnections,
    // Threads and explores
    listRecentThreads,
    listExplores,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new HexPlugin();
