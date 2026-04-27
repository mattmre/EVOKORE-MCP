import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import path from 'path';

/**
 * Sprint 3.x — schema-deferred `tools/list` + `describe_tool`.
 *
 * Backed by the client-compat matrix in
 * `docs/research/tools-list-deferred-schema-compat-2026-04-26.md`.
 *
 * Defaults under test:
 *   - `EVOKORE_TOOL_SCHEMA_MODE=full` (default) — every tool ships its
 *     full inputSchema, behavior is bit-identical to pre-3.x.
 *   - `deferred` mode — inputSchema is replaced with a placeholder and
 *     `_meta.schema_deferred = true` is set on every tool.
 *   - `describe_tool` is always visible and returns full schemas for
 *     known tools, with unknowns split into a parallel `unknown` list.
 *   - Compat probe: when no client invokes describe_tool within
 *     `EVOKORE_TOOL_SCHEMA_FALLBACK_MS` (default 60000), the runtime
 *     reverts to full mode and emits a one-time stderr warning.
 */
describe('schema-deferred tools/list', () => {
  const ROOT = path.resolve(__dirname, '../..');
  const indexJsPath = path.join(ROOT, 'dist', 'index.js');

  /**
   * Invoke the registered ListToolsRequest handler directly off the
   * server's request handler map. Mirrors
   * tools-list-cursor-pagination.test.ts so we exercise the production
   * handler closure without a real transport pair.
   */
  async function callListTools(server: any, params?: { cursor?: string }): Promise<any> {
    const handler = (server as any).server?._requestHandlers?.get('tools/list');
    if (!handler) throw new Error('tools/list handler not registered');
    const request = { method: 'tools/list', params: params ?? {} };
    return handler(request, { sessionId: undefined });
  }

  async function callTool(server: any, name: string, args?: any): Promise<any> {
    const handler = (server as any).server?._requestHandlers?.get('tools/call');
    if (!handler) throw new Error('tools/call handler not registered');
    const request = { method: 'tools/call', params: { name, arguments: args ?? {} } };
    return handler(request, { sessionId: undefined });
  }

  let originalSchemaMode: string | undefined;
  let originalFallbackMs: string | undefined;
  let originalPagination: string | undefined;
  let originalPageSize: string | undefined;

  beforeEach(() => {
    originalSchemaMode = process.env.EVOKORE_TOOL_SCHEMA_MODE;
    originalFallbackMs = process.env.EVOKORE_TOOL_SCHEMA_FALLBACK_MS;
    originalPagination = process.env.EVOKORE_TOOL_LIST_PAGINATION;
    originalPageSize = process.env.EVOKORE_TOOL_LIST_PAGE_SIZE;
  });

  afterEach(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('EVOKORE_TOOL_SCHEMA_MODE', originalSchemaMode);
    restore('EVOKORE_TOOL_SCHEMA_FALLBACK_MS', originalFallbackMs);
    restore('EVOKORE_TOOL_LIST_PAGINATION', originalPagination);
    restore('EVOKORE_TOOL_LIST_PAGE_SIZE', originalPageSize);
  });

  describe('default (full) mode', () => {
    it('preserves inputSchema on every tool', async () => {
      delete process.env.EVOKORE_TOOL_SCHEMA_MODE;
      const { EvokoreMCPServer } = require(indexJsPath);
      const server = new EvokoreMCPServer();
      const result = await callListTools(server);
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);

      // Every native tool must have its inputSchema populated.
      for (const tool of result.tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        // No tool should advertise the schema-deferred meta marker.
        expect(tool._meta?.schema_deferred).toBeFalsy();
      }

      // Anchor: search_skills is a stable native we expect to be present.
      const search = result.tools.find((t: any) => t.name === 'search_skills');
      expect(search).toBeDefined();
      expect(search.inputSchema.type).toBe('object');
      expect(search.inputSchema.properties.query).toBeDefined();
    });

    it('full mode is also picked up when EVOKORE_TOOL_SCHEMA_MODE is set to an unknown value', async () => {
      process.env.EVOKORE_TOOL_SCHEMA_MODE = 'bogus-value';
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { EvokoreMCPServer } = require(indexJsPath);
      const server = new EvokoreMCPServer();
      const result = await callListTools(server);
      // Should still ship full schemas (warning logged, fallback to full).
      const sample = result.tools[0];
      expect(sample.inputSchema).toBeDefined();
      expect(sample._meta?.schema_deferred).toBeFalsy();
      const sawWarn = errSpy.mock.calls.some((c) =>
        String(c[0] ?? '').includes("Unknown EVOKORE_TOOL_SCHEMA_MODE 'bogus-value'"),
      );
      expect(sawWarn).toBe(true);
      errSpy.mockRestore();
    });
  });

  describe('deferred mode', () => {
    it('strips inputSchema details and sets _meta.schema_deferred for every tool except describe_tool', async () => {
      process.env.EVOKORE_TOOL_SCHEMA_MODE = 'deferred';
      // Long fallback so the compat-probe timer doesn't fire mid-test.
      process.env.EVOKORE_TOOL_SCHEMA_FALLBACK_MS = '60000';

      const { EvokoreMCPServer } = require(indexJsPath);
      const server = new EvokoreMCPServer();
      const result = await callListTools(server);
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);

      for (const tool of result.tools) {
        if (tool.name === 'describe_tool') continue; // bootstrap exception
        expect(tool._meta?.schema_deferred).toBe(true);
        // Per the SDK Zod schema panel-B finding, inputSchema is required.
        // Deferred mode therefore ships a minimal placeholder, not omits.
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        // The placeholder has an empty properties bag and the deferral
        // marker on the schema itself.
        expect(tool.inputSchema['x-evokore-schema-deferred']).toBe(true);
      }

      // describe_tool itself must remain present and carry its full schema.
      const describe = result.tools.find((t: any) => t.name === 'describe_tool');
      expect(describe).toBeDefined();
      expect(describe.inputSchema.properties?.tools).toBeDefined();
      expect(describe._meta?.schema_deferred).toBeFalsy();
    });

    it('describe_tool returns full schemas for known tools and lists unknown names separately', async () => {
      process.env.EVOKORE_TOOL_SCHEMA_MODE = 'deferred';
      process.env.EVOKORE_TOOL_SCHEMA_FALLBACK_MS = '60000';
      const { EvokoreMCPServer } = require(indexJsPath);
      const server = new EvokoreMCPServer();

      const result = await callTool(server, 'describe_tool', {
        tools: ['search_skills', 'resolve_workflow', 'no_such_tool', 'search_skills'],
      });

      expect(result.structuredContent).toBeDefined();
      const { schemas, unknown } = result.structuredContent;
      expect(Array.isArray(schemas)).toBe(true);
      expect(Array.isArray(unknown)).toBe(true);

      const names = schemas.map((s: any) => s.name).sort();
      expect(names).toContain('search_skills');
      expect(names).toContain('resolve_workflow');
      // Returned schemas must carry full inputSchema (this is the
      // bootstrap path operators rely on).
      const search = schemas.find((s: any) => s.name === 'search_skills');
      expect(search.inputSchema.type).toBe('object');
      expect(search.inputSchema.properties.query).toBeDefined();
      // No deferral marker on schemas returned from describe_tool.
      expect(search._meta?.schema_deferred).toBeFalsy();

      expect(unknown).toEqual(['no_such_tool']);
      // Duplicates collapse into a single schemas entry.
      expect(schemas.filter((s: any) => s.name === 'search_skills')).toHaveLength(1);
    });

    it('compat probe: with no describe_tool call within fallback window, the next tools/list returns full schemas and a one-time stderr warning fires', async () => {
      process.env.EVOKORE_TOOL_SCHEMA_MODE = 'deferred';
      process.env.EVOKORE_TOOL_SCHEMA_FALLBACK_MS = '50';

      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { EvokoreMCPServer } = require(indexJsPath);
      const server = new EvokoreMCPServer();

      // First tools/list arms the compat probe.
      const first = await callListTools(server);
      const sampleFirst = first.tools.find((t: any) => t.name !== 'describe_tool');
      expect(sampleFirst._meta?.schema_deferred).toBe(true);

      // Wait past the fallback window without invoking describe_tool.
      await new Promise((resolve) => setTimeout(resolve, 200));

      const second = await callListTools(server);
      // After fallback, every tool must carry its full inputSchema and
      // no deferral marker.
      for (const tool of second.tools) {
        expect(tool._meta?.schema_deferred).toBeFalsy();
      }
      const search = second.tools.find((t: any) => t.name === 'search_skills');
      expect(search.inputSchema.properties.query).toBeDefined();

      // Stderr warning must fire exactly once with the expected text.
      // Window label is dynamic (50ms in this test) — match the
      // stable prefix so the assertion isn't tied to the configured
      // fallback duration.
      const fallbackWarnings = errSpy.mock.calls.filter((c) =>
        String(c[0] ?? '').includes('Schema-deferral fallback: client did not call describe_tool within '),
      );
      expect(fallbackWarnings.length).toBe(1);
      errSpy.mockRestore();
    });

    it('SDK Zod fallback: a synthetic tool whose schema fails Zod validation falls back to full schema with a one-time per-tool warning', async () => {
      process.env.EVOKORE_TOOL_SCHEMA_MODE = 'deferred';
      process.env.EVOKORE_TOOL_SCHEMA_FALLBACK_MS = '60000';

      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { EvokoreMCPServer } = require(indexJsPath);
      const server = new EvokoreMCPServer();

      // Inject a synthetic invalid tool by manipulating the catalog
      // directly. The SDK's ToolSchema requires inputSchema.type ===
      // 'object' at the root. We deliberately violate that to force the
      // per-tool fallback branch.
      const invalid: any = {
        name: 'broken_synthetic_tool',
        description: 'A deliberately malformed tool used to exercise the per-tool Zod fallback path.',
        // Wrong root type — Zod will reject this on safeParse.
        inputSchema: { type: 'array' },
      };
      // The internal projector reads from whatever array we hand to it.
      // Call the private helper directly to keep the test scoped.
      const projected = (server as any).projectDeferredTools([invalid]);
      expect(projected).toHaveLength(1);

      // Per-tool fallback returns the original (unprojected) tool.
      expect(projected[0].name).toBe('broken_synthetic_tool');
      // The original (still-invalid) inputSchema is preserved — no
      // deferral marker, no placeholder.
      expect(projected[0].inputSchema?.type).toBe('array');
      expect(projected[0]._meta?.schema_deferred).toBeFalsy();

      // Calling the projector again should NOT re-emit the warning
      // (one-time per offending tool name).
      (server as any).projectDeferredTools([invalid]);

      const zodWarnings = errSpy.mock.calls.filter((c) =>
        String(c[0] ?? '').includes("Schema-deferral per-tool fallback: 'broken_synthetic_tool'"),
      );
      expect(zodWarnings.length).toBe(1);
      errSpy.mockRestore();
    });
  });
});
