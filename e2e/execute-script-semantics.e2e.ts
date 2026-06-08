/**
 * E2E tests for browser_execute_script DevTools/REPL evaluation semantics.
 *
 * These tests pin the expression-first evaluation behavior introduced to
 * resolve GitHub issue #79: bare expressions, IIFEs, and arrow IIFEs now
 * return their value directly (without requiring `return`), matching the
 * semantics of the Chrome DevTools console and Node REPL.
 *
 * Covered shapes:
 *   - Bare expressions (number, string)
 *   - IIFE and arrow IIFE expressions (the exact issue #79 repro)
 *   - Object literal expression
 *   - `return X` syntax (backwards compat)
 *   - Multi-statement body with return
 *   - Top-level await expression
 *   - Top-level await inside statement body
 *   - Promise expression (auto-awaited)
 *   - DOM expression
 *   - Thrown errors (including throw statement, which parses as SyntaxError in
 *     expression position and falls back to statement path)
 *   - Expression evaluating to undefined (normalized to null)
 *   - ReferenceError (not retried as statements)
 */

import type { McpClient, McpServer } from './fixtures.js';
import { expect, test } from './fixtures.js';
import { parseToolResult, waitFor, waitForExtensionConnected, waitForLog } from './helpers.js';

// ---------------------------------------------------------------------------
// Shared setup helper
// ---------------------------------------------------------------------------

/**
 * Initialize the MCP server connection, open a test tab, and wait for it to
 * fully load. Returns the tabId for use in browser_execute_script calls.
 */
const initAndOpenTab = async (mcpServer: McpServer, mcpClient: McpClient, testServerUrl: string): Promise<number> => {
  await waitForExtensionConnected(mcpServer);
  await waitForLog(mcpServer, 'plugin(s) mapped');

  const openResult = await mcpClient.callTool('browser_open_tab', { url: testServerUrl });
  expect(openResult.isError).toBe(false);
  const tabInfo = parseToolResult(openResult.content);
  const tabId = tabInfo.id as number;

  await waitFor(
    async () => {
      try {
        const result = await mcpClient.callTool('browser_execute_script', {
          tabId,
          code: 'return document.readyState',
        });
        if (result.isError) return false;
        const data = parseToolResult(result.content);
        const value = data.value as Record<string, unknown> | undefined;
        return value?.value === 'complete';
      } catch {
        return false;
      }
    },
    10_000,
    300,
    'tab readyState === complete',
  );

  return tabId;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('browser_execute_script — DevTools/REPL semantics', () => {
  test('bare number expression returns value directly', async ({
    mcpServer,
    extensionContext: _ext,
    mcpClient,
    testServer,
  }) => {
    const tabId = await initAndOpenTab(mcpServer, mcpClient, testServer.url);

    const result = await mcpClient.callTool('browser_execute_script', { tabId, code: '42' });
    expect(result.isError).toBe(false);
    const data = parseToolResult(result.content);
    expect((data.value as { value: unknown }).value).toBe(42);
  });

  test('bare string expression returns value directly', async ({
    mcpServer,
    extensionContext: _ext,
    mcpClient,
    testServer,
  }) => {
    const tabId = await initAndOpenTab(mcpServer, mcpClient, testServer.url);

    const result = await mcpClient.callTool('browser_execute_script', { tabId, code: "'hello'" });
    expect(result.isError).toBe(false);
    const data = parseToolResult(result.content);
    expect((data.value as { value: unknown }).value).toBe('hello');
  });

  test('IIFE expression returns value (GitHub issue #79 repro)', async ({
    mcpServer,
    extensionContext: _ext,
    mcpClient,
    testServer,
  }) => {
    const tabId = await initAndOpenTab(mcpServer, mcpClient, testServer.url);

    const result = await mcpClient.callTool('browser_execute_script', {
      tabId,
      code: '(function(){return 42})()',
    });
    expect(result.isError).toBe(false);
    const data = parseToolResult(result.content);
    expect((data.value as { value: unknown }).value).toBe(42);
  });

  test('arrow IIFE expression returns value', async ({ mcpServer, extensionContext: _ext, mcpClient, testServer }) => {
    const tabId = await initAndOpenTab(mcpServer, mcpClient, testServer.url);

    const result = await mcpClient.callTool('browser_execute_script', {
      tabId,
      code: "(() => 'hi')()",
    });
    expect(result.isError).toBe(false);
    const data = parseToolResult(result.content);
    expect((data.value as { value: unknown }).value).toBe('hi');
  });

  test('object literal expression returns correct structure', async ({
    mcpServer,
    extensionContext: _ext,
    mcpClient,
    testServer,
  }) => {
    const tabId = await initAndOpenTab(mcpServer, mcpClient, testServer.url);

    const result = await mcpClient.callTool('browser_execute_script', {
      tabId,
      code: '({a: 1, b: [2, 3]})',
    });
    expect(result.isError).toBe(false);
    const data = parseToolResult(result.content);
    const value = (data.value as { value: unknown }).value as Record<string, unknown>;
    expect(value.a).toBe(1);
    expect(value.b).toEqual([2, 3]);
  });

  test('top-level return still works (backwards compat)', async ({
    mcpServer,
    extensionContext: _ext,
    mcpClient,
    testServer,
  }) => {
    const tabId = await initAndOpenTab(mcpServer, mcpClient, testServer.url);

    const result = await mcpClient.callTool('browser_execute_script', {
      tabId,
      code: 'return 42;',
    });
    expect(result.isError).toBe(false);
    const data = parseToolResult(result.content);
    expect((data.value as { value: unknown }).value).toBe(42);
  });

  test('multi-statement body with return returns computed value', async ({
    mcpServer,
    extensionContext: _ext,
    mcpClient,
    testServer,
  }) => {
    const tabId = await initAndOpenTab(mcpServer, mcpClient, testServer.url);

    const result = await mcpClient.callTool('browser_execute_script', {
      tabId,
      code: 'const x = 1; const y = 2; return x + y;',
    });
    expect(result.isError).toBe(false);
    const data = parseToolResult(result.content);
    expect((data.value as { value: unknown }).value).toBe(3);
  });

  test('top-level await expression returns resolved value', async ({
    mcpServer,
    extensionContext: _ext,
    mcpClient,
    testServer,
  }) => {
    const tabId = await initAndOpenTab(mcpServer, mcpClient, testServer.url);

    const result = await mcpClient.callTool('browser_execute_script', {
      tabId,
      code: 'await Promise.resolve(99)',
    });
    expect(result.isError).toBe(false);
    const data = parseToolResult(result.content);
    expect((data.value as { value: unknown }).value).toBe(99);
  });

  test('top-level await in statement body returns value via return', async ({
    mcpServer,
    extensionContext: _ext,
    mcpClient,
    testServer,
  }) => {
    const tabId = await initAndOpenTab(mcpServer, mcpClient, testServer.url);

    const result = await mcpClient.callTool('browser_execute_script', {
      tabId,
      code: 'const r = await Promise.resolve(7); return r * 2;',
    });
    expect(result.isError).toBe(false);
    const data = parseToolResult(result.content);
    expect((data.value as { value: unknown }).value).toBe(14);
  });

  test('Promise expression is awaited and returns resolved value', async ({
    mcpServer,
    extensionContext: _ext,
    mcpClient,
    testServer,
  }) => {
    const tabId = await initAndOpenTab(mcpServer, mcpClient, testServer.url);

    const result = await mcpClient.callTool('browser_execute_script', {
      tabId,
      code: 'Promise.resolve({ok: true})',
    });
    expect(result.isError).toBe(false);
    const data = parseToolResult(result.content);
    const value = (data.value as { value: unknown }).value as Record<string, unknown>;
    expect(value.ok).toBe(true);
  });

  test('DOM expression returns page title as string', async ({
    mcpServer,
    extensionContext: _ext,
    mcpClient,
    testServer,
  }) => {
    const tabId = await initAndOpenTab(mcpServer, mcpClient, testServer.url);

    const result = await mcpClient.callTool('browser_execute_script', {
      tabId,
      code: 'document.title',
    });
    expect(result.isError).toBe(false);
    const data = parseToolResult(result.content);
    const value = (data.value as { value: unknown }).value;
    expect(typeof value).toBe('string');
  });

  test('thrown error propagates as error envelope', async ({
    mcpServer,
    extensionContext: _ext,
    mcpClient,
    testServer,
  }) => {
    const tabId = await initAndOpenTab(mcpServer, mcpClient, testServer.url);

    const result = await mcpClient.callTool('browser_execute_script', {
      tabId,
      code: "throw new Error('boom')",
    });
    expect(result.isError).toBe(false);
    const data = parseToolResult(result.content);
    expect((data.value as { error?: string }).error).toBe('boom');
  });

  test('expression evaluating to undefined returns null (normalized)', async ({
    mcpServer,
    extensionContext: _ext,
    mcpClient,
    testServer,
  }) => {
    const tabId = await initAndOpenTab(mcpServer, mcpClient, testServer.url);

    const result = await mcpClient.callTool('browser_execute_script', {
      tabId,
      code: 'void 0',
    });
    expect(result.isError).toBe(false);
    const data = parseToolResult(result.content);
    expect((data.value as { value: unknown }).value).toBe(null);
  });

  test('ReferenceError surfaces as error envelope without retrying as statements', async ({
    mcpServer,
    extensionContext: _ext,
    mcpClient,
    testServer,
  }) => {
    const tabId = await initAndOpenTab(mcpServer, mcpClient, testServer.url);

    const result = await mcpClient.callTool('browser_execute_script', {
      tabId,
      code: 'nonexistentVariable',
    });
    expect(result.isError).toBe(false);
    const data = parseToolResult(result.content);
    expect((data.value as { error?: string }).error).toMatch(/nonexistentVariable|is not defined/i);
  });
});
