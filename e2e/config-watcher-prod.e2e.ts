/**
 * Config watcher E2E tests — production mode.
 *
 * Verifies that config.json changes are detected and applied in production mode
 * (server started without --dev flag), without requiring POST /reload or restart.
 *
 * All tests use dynamic ports and isolated config directories. No test calls
 * POST /reload — the config file watcher must detect changes automatically.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { McpClient, McpServer } from './fixtures.js';
import {
  cleanupTestConfigDir,
  createMcpClient,
  E2E_TEST_PLUGIN_DIR,
  expect,
  readPluginToolNames,
  startMcpServer,
  test,
  writeTestConfig,
} from './fixtures.js';
import { BROWSER_TOOL_NAMES, waitForLog, waitForToolList } from './helpers.js';

// ---------------------------------------------------------------------------
// Config watcher — production mode auto-discovery
// ---------------------------------------------------------------------------

test.describe('Config watcher — production mode auto-discovery', () => {
  test('adding a plugin path to config.json auto-discovers plugin tools in production mode', async () => {
    let configDir: string | undefined;
    let server: McpServer | undefined;
    let client: McpClient | undefined;
    try {
      // Start with empty config (no plugins)
      configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentabs-e2e-cwp-add-'));
      writeTestConfig(configDir, { localPlugins: [], tools: {} });

      // Start server in production mode (no --dev flag)
      server = await startMcpServer(configDir, false, undefined, undefined, true);
      client = createMcpClient(server.port, server.secret);
      await client.initialize();

      // Wait for config watcher to be set up
      await waitForLog(server, 'Config watcher: Watching', 10_000);

      // Initially only browser tools and platform tools should be present
      const toolsBefore = await client.listTools();
      const builtInToolSet = new Set([
        ...BROWSER_TOOL_NAMES,
        'plugin_inspect',
        'plugin_mark_reviewed',
        'plugin_get_workflow',
      ]);
      const pluginToolsBefore = toolsBefore.filter(t => !builtInToolSet.has(t.name));
      expect(pluginToolsBefore.length).toBe(0);

      for (const bt of BROWSER_TOOL_NAMES) {
        expect(toolsBefore.map(t => t.name)).toContain(bt);
      }

      // Write new config.json with the e2e-test plugin path
      const absPluginPath = path.resolve(E2E_TEST_PLUGIN_DIR);
      const prefixedToolNames = readPluginToolNames();
      const tools: Record<string, boolean> = {};
      for (const t of prefixedToolNames) {
        tools[t] = true;
      }
      writeTestConfig(configDir, { localPlugins: [absPluginPath], tools });

      // Poll until plugin tools appear — the config watcher should auto-detect
      // the change without any manual reload
      const toolsAfter = await waitForToolList(
        client,
        list => list.some(t => t.name.startsWith('e2e-test_')),
        15_000,
        300,
        'e2e-test plugin tools to appear after config.json change in production mode',
      );

      // Verify all e2e-test plugin tools are present
      const e2eTools = toolsAfter.filter(t => t.name.startsWith('e2e-test_'));
      expect(e2eTools.length).toBe(prefixedToolNames.length);

      // Browser tools should still be present
      for (const bt of BROWSER_TOOL_NAMES) {
        expect(toolsAfter.map(t => t.name)).toContain(bt);
      }
    } finally {
      await client?.close();
      await server?.kill();
      if (configDir) cleanupTestConfigDir(configDir);
    }
  });
});
