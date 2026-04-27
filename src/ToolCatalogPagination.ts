/**
 * Sprint 1.2 — MCP cursor pagination helper for `tools/list`.
 *
 * The MCP spec allows clients to page through `tools/list` by passing an
 * opaque `cursor` parameter. EVOKORE encodes a `{ offset, epoch }` JSON
 * payload as base64url:
 *   - `offset` is the next-page start index in the projected tool array.
 *   - `epoch` is bumped on every `tools/list_changed` notification so
 *     stale cursors decode but reset to the first page (graceful UX,
 *     no thrown error).
 *
 * The helper is pure and has no runtime imports, so it is trivially
 * unit-testable from compiled `dist/` JS without booting the server.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface PageCursor {
  offset: number;
  epoch: number;
}

/**
 * Encode a cursor as base64url JSON. Browsers/Node both accept
 * standard base64; we use the URL-safe variant so the cursor is
 * safe to embed in JSON, query strings, or logs without escaping.
 */
export function encodeCursor(cursor: PageCursor): string {
  const json = JSON.stringify({ offset: cursor.offset, epoch: cursor.epoch });
  return Buffer.from(json, "utf8").toString("base64url");
}

/**
 * Decode a cursor string. Returns `null` on any malformed input
 * (corrupted base64, non-JSON payload, missing fields, wrong types).
 * Callers should treat null as "start from page 1".
 */
export function decodeCursor(input: string): PageCursor | null {
  if (typeof input !== "string" || input.length === 0) {
    return null;
  }

  let raw: string;
  try {
    raw = Buffer.from(input, "base64url").toString("utf8");
  } catch {
    return null;
  }

  if (raw.length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const candidate = parsed as Record<string, unknown>;
  const { offset, epoch } = candidate;

  if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0) {
    return null;
  }
  if (typeof epoch !== "number" || !Number.isInteger(epoch) || epoch < 0) {
    return null;
  }

  return { offset, epoch };
}

export interface PaginateResult {
  tools: Tool[];
  nextCursor?: string;
}

/**
 * Slice `tools` into a single page.
 *
 * - When `cursor` is undefined, returns the first page.
 * - When `cursor` decodes successfully but its `epoch` does not match
 *   `currentEpoch`, the cursor is treated as stale and the first page
 *   is returned (graceful reset; no throw).
 * - When `cursor` is malformed, the first page is returned (graceful
 *   reset; no throw). Operators can detect this via stderr only if they
 *   wrap the helper themselves.
 * - `pageSize` is clamped to `[1, tools.length]` for the returned slice.
 *   A non-positive `pageSize` falls back to 1 to guarantee progress.
 */
export function paginateTools(
  tools: Tool[],
  pageSize: number,
  cursor: string | undefined,
  currentEpoch: number,
): PaginateResult {
  const total = tools.length;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0
    ? Math.floor(pageSize)
    : 1;

  let offset = 0;
  if (typeof cursor === "string" && cursor.length > 0) {
    const decoded = decodeCursor(cursor);
    if (decoded && decoded.epoch === currentEpoch) {
      offset = decoded.offset;
    }
    // Otherwise: malformed or stale — fall back to first page (offset 0).
  }

  if (offset >= total) {
    // Past-end offsets behave like "no more pages": return empty slice
    // with no nextCursor. Clients that pass an out-of-range cursor get
    // a clean terminal page rather than a thrown error.
    return { tools: [] };
  }

  const end = Math.min(offset + safePageSize, total);
  const pageTools = tools.slice(offset, end);
  const result: PaginateResult = { tools: pageTools };

  if (end < total) {
    result.nextCursor = encodeCursor({ offset: end, epoch: currentEpoch });
  }

  return result;
}
