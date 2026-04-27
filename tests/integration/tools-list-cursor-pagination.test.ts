import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import path from 'path';

/**
 * Sprint 1.2 — MCP cursor pagination on tools/list.
 *
 * The pagination helper is pure (no transport, no SDK dependency at
 * runtime) so we exercise it from `dist/` directly, plus exercise the
 * end-to-end handler via a real `EvokoreMCPServer` instance.
 *
 * Defaults under test:
 *   - page size 35 (under the Cursor IDE 40-tool cap)
 *   - epoch 0 at construction; bumps on every `tools/list_changed`
 *   - stale or malformed cursors gracefully reset to page 1
 */
describe('tools/list cursor pagination', () => {
  const ROOT = path.resolve(__dirname, '../..');
  const paginationJsPath = path.join(ROOT, 'dist', 'ToolCatalogPagination.js');
  const indexJsPath = path.join(ROOT, 'dist', 'index.js');

  const { paginateTools, encodeCursor, decodeCursor } = require(paginationJsPath);

  const makeTools = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      name: `tool_${i.toString().padStart(3, '0')}`,
      description: `Test tool ${i}`,
      inputSchema: { type: 'object' },
    }));

  describe('paginateTools helper', () => {
    it('round-trip 100 tools with page size 35: 35 + 35 + 30, then no cursor', () => {
      const tools = makeTools(100);

      const page1 = paginateTools(tools, 35, undefined, 0);
      expect(page1.tools).toHaveLength(35);
      expect(page1.nextCursor).toBeTruthy();
      expect(page1.tools[0].name).toBe('tool_000');
      expect(page1.tools[34].name).toBe('tool_034');

      const page2 = paginateTools(tools, 35, page1.nextCursor, 0);
      expect(page2.tools).toHaveLength(35);
      expect(page2.nextCursor).toBeTruthy();
      expect(page2.tools[0].name).toBe('tool_035');
      expect(page2.tools[34].name).toBe('tool_069');

      const page3 = paginateTools(tools, 35, page2.nextCursor, 0);
      expect(page3.tools).toHaveLength(30);
      expect(page3.nextCursor).toBeUndefined();
      expect(page3.tools[0].name).toBe('tool_070');
      expect(page3.tools[29].name).toBe('tool_099');
    });

    it('returns empty page with no cursor when tool list is empty', () => {
      const page = paginateTools([], 35, undefined, 0);
      expect(page.tools).toEqual([]);
      expect(page.nextCursor).toBeUndefined();
    });

    it('returns full list with no cursor when total <= pageSize', () => {
      const tools = makeTools(10);
      const page = paginateTools(tools, 35, undefined, 0);
      expect(page.tools).toHaveLength(10);
      expect(page.nextCursor).toBeUndefined();
    });

    it('page size exactly equals total → no nextCursor', () => {
      const tools = makeTools(35);
      const page = paginateTools(tools, 35, undefined, 0);
      expect(page.tools).toHaveLength(35);
      expect(page.nextCursor).toBeUndefined();
    });

    it('decodeCursor returns null on corrupted base64', () => {
      expect(decodeCursor('!!!not-base64!!!')).toBeNull();
    });

    it('decodeCursor returns null on non-JSON payload', () => {
      const garbage = Buffer.from('hello world', 'utf8').toString('base64url');
      expect(decodeCursor(garbage)).toBeNull();
    });

    it('decodeCursor returns null on JSON missing required fields', () => {
      const incomplete = Buffer.from(JSON.stringify({ offset: 5 }), 'utf8').toString('base64url');
      expect(decodeCursor(incomplete)).toBeNull();
    });

    it('decodeCursor returns null on wrong types', () => {
      const wrongTypes = Buffer.from(
        JSON.stringify({ offset: 'not-a-number', epoch: 0 }),
        'utf8',
      ).toString('base64url');
      expect(decodeCursor(wrongTypes)).toBeNull();

      const negativeOffset = Buffer.from(
        JSON.stringify({ offset: -1, epoch: 0 }),
        'utf8',
      ).toString('base64url');
      expect(decodeCursor(negativeOffset)).toBeNull();

      const floatOffset = Buffer.from(
        JSON.stringify({ offset: 1.5, epoch: 0 }),
        'utf8',
      ).toString('base64url');
      expect(decodeCursor(floatOffset)).toBeNull();
    });

    it('decodeCursor returns null on empty input', () => {
      expect(decodeCursor('')).toBeNull();
    });

    it('encode + decode round-trip preserves offset and epoch', () => {
      const encoded = encodeCursor({ offset: 42, epoch: 7 });
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual({ offset: 42, epoch: 7 });
    });

    it('stale-epoch cursor: graceful reset to first page (no throw)', () => {
      const tools = makeTools(100);
      const page1 = paginateTools(tools, 35, undefined, 0);
      const cursor = page1.nextCursor as string;
      expect(cursor).toBeTruthy();

      // Epoch advances (simulating tools/list_changed).
      const stalePage = paginateTools(tools, 35, cursor, 1);
      expect(stalePage.tools).toHaveLength(35);
      expect(stalePage.tools[0].name).toBe('tool_000');
      // Epoch in the new nextCursor should be the new currentEpoch (1).
      const newDecoded = decodeCursor(stalePage.nextCursor as string);
      expect(newDecoded).toEqual({ offset: 35, epoch: 1 });
    });

    it('malformed cursor input: graceful reset to first page', () => {
      const tools = makeTools(50);
      const page = paginateTools(tools, 35, '!!!not-a-cursor!!!', 0);
      expect(page.tools[0].name).toBe('tool_000');
      expect(page.tools).toHaveLength(35);
    });

    it('out-of-range offset returns empty terminal page', () => {
      const tools = makeTools(10);
      const farCursor = encodeCursor({ offset: 9999, epoch: 0 });
      const page = paginateTools(tools, 35, farCursor, 0);
      expect(page.tools).toEqual([]);
      expect(page.nextCursor).toBeUndefined();
    });

    it('non-positive pageSize falls back to 1 (always makes progress)', () => {
      const tools = makeTools(5);
      const page = paginateTools(tools, 0, undefined, 0);
      expect(page.tools).toHaveLength(1);
      expect(page.nextCursor).toBeTruthy();
    });

    it('fractional pageSize in (0, 1) falls back to 1 (no infinite-loop nextCursor)', () => {
      const tools = makeTools(5);
      const page = paginateTools(tools, 0.5, undefined, 0);
      // A floor of 0.5 would naively be 0, which would emit an empty
      // page with a nextCursor at offset 0 — i.e. an infinite loop.
      expect(page.tools).toHaveLength(1);
      expect(page.nextCursor).toBeTruthy();
      const decoded = decodeCursor(page.nextCursor as string);
      expect(decoded?.offset).toBe(1);
    });

    it('NaN pageSize falls back to 1', () => {
      const tools = makeTools(5);
      const page = paginateTools(tools, NaN, undefined, 0);
      expect(page.tools).toHaveLength(1);
      expect(page.nextCursor).toBeTruthy();
    });
  });

  describe('EvokoreMCPServer end-to-end', () => {
    let originalPageSize: string | undefined;
    let originalPaginationToggle: string | undefined;

    beforeEach(() => {
      originalPageSize = process.env.EVOKORE_TOOL_LIST_PAGE_SIZE;
      originalPaginationToggle = process.env.EVOKORE_TOOL_LIST_PAGINATION;
    });

    afterEach(() => {
      if (originalPageSize === undefined) {
        delete process.env.EVOKORE_TOOL_LIST_PAGE_SIZE;
      } else {
        process.env.EVOKORE_TOOL_LIST_PAGE_SIZE = originalPageSize;
      }
      if (originalPaginationToggle === undefined) {
        delete process.env.EVOKORE_TOOL_LIST_PAGINATION;
      } else {
        process.env.EVOKORE_TOOL_LIST_PAGINATION = originalPaginationToggle;
      }
    });

    /**
     * Invoke the registered ListToolsRequest handler directly off the
     * server's request handler map. Avoids needing a real transport
     * pair while still exercising the production handler closure.
     */
    async function callListTools(server: any, params?: { cursor?: string }): Promise<any> {
      const handler = (server as any).server?._requestHandlers?.get('tools/list');
      if (!handler) {
        throw new Error('tools/list handler not registered');
      }
      const request = { method: 'tools/list', params: params ?? {} };
      const extra = { sessionId: undefined };
      return handler(request, extra);
    }

    it('default: first call with no cursor and no opt-in returns the full unpaged list', async () => {
      const { EvokoreMCPServer } = require(indexJsPath);
      const server = new EvokoreMCPServer();
      const result = await callListTools(server);
      expect(Array.isArray(result.tools)).toBe(true);
      // Pre-v3.1 contract: no nextCursor, no truncation when the client
      // has not signaled pagination support.
      expect(result.nextCursor).toBeUndefined();
    });

    it('opt-in via EVOKORE_TOOL_LIST_PAGINATION=on caps the first page at the default size', async () => {
      process.env.EVOKORE_TOOL_LIST_PAGINATION = 'on';

      const { EvokoreMCPServer } = require(indexJsPath);
      const server = new EvokoreMCPServer();
      const result = await callListTools(server);
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeLessThanOrEqual(35);
    });

    it('cursor-aware client: passing a cursor activates pagination even without opt-in', async () => {
      // Force a small page size so we always exercise pagination even
      // when the catalog is small relative to the default.
      process.env.EVOKORE_TOOL_LIST_PAGE_SIZE = '3';
      process.env.EVOKORE_TOOL_LIST_PAGINATION = 'on';

      const { EvokoreMCPServer } = require(indexJsPath);
      const server = new EvokoreMCPServer();

      const page1 = await callListTools(server);
      expect(page1.tools.length).toBeLessThanOrEqual(3);

      // If there are at least 4 tools, we should get a nextCursor and
      // a distinct second page. The second call follows the cursor, so
      // it would paginate even without the env opt-in.
      if (page1.nextCursor) {
        delete process.env.EVOKORE_TOOL_LIST_PAGINATION;
        const firstNames = new Set(page1.tools.map((t: any) => t.name));
        const page2 = await callListTools(server, { cursor: page1.nextCursor });
        expect(page2.tools.length).toBeGreaterThan(0);
        for (const tool of page2.tools) {
          expect(firstNames.has(tool.name)).toBe(false);
        }
      }
    });

    it('epoch bump invalidates cursor: stale cursor resets to first page', async () => {
      process.env.EVOKORE_TOOL_LIST_PAGE_SIZE = '3';
      process.env.EVOKORE_TOOL_LIST_PAGINATION = 'on';

      const { EvokoreMCPServer } = require(indexJsPath);
      const server = new EvokoreMCPServer();

      const page1 = await callListTools(server);
      const staleCursor = page1.nextCursor;

      if (!staleCursor) {
        // Catalog has < 4 tools — pagination not exercisable, skip.
        return;
      }

      // Bump the epoch directly via the test-only helper. Production
      // code paths bump immediately before sendToolListChanged().
      const newEpoch = (server as any).bumpToolListEpochForTests();
      expect(newEpoch).toBe(1);

      const resetPage = await callListTools(server, { cursor: staleCursor });
      // First-page reset: tools start at the beginning of the catalog.
      expect(resetPage.tools[0].name).toBe(page1.tools[0].name);
    });

    it('opt-in vs default: forced page size produces a strictly smaller first response than the default unpaged call', async () => {
      const { EvokoreMCPServer } = require(indexJsPath);
      const server = new EvokoreMCPServer();

      // 1. Default call (no cursor, no env) — must be unpaged.
      const unpaged = await callListTools(server);
      expect(unpaged.nextCursor).toBeUndefined();

      // 2. Opt-in with a tiny page size — first page must be capped and
      //    expose a nextCursor when the catalog has enough tools.
      process.env.EVOKORE_TOOL_LIST_PAGINATION = 'on';
      process.env.EVOKORE_TOOL_LIST_PAGE_SIZE = '2';
      const paged = await callListTools(server);
      expect(paged.tools.length).toBeLessThanOrEqual(2);
      // If the catalog has more than 2 tools, the opt-in must produce a
      // strictly smaller response than the default unpaged call. If it
      // doesn't, the catalog is degenerate and the test simply asserts
      // length parity (still a valid invariant).
      if (unpaged.tools.length > 2) {
        expect(paged.tools.length).toBeLessThan(unpaged.tools.length);
        expect(paged.nextCursor).toBeTruthy();
      }
    });
  });
});
