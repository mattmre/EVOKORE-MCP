// @AI:NAV[SEC:imports] Import declarations
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
// @AI:NAV[END:imports]

const DEFAULT_MEMORY_DIR = path.join(os.homedir(), ".evokore", "memory");

// @AI:NAV[SEC:memory-kinds] Memory kinds and default TTLs
export type MemoryKind =
  | "knowledge"
  | "context"
  | "task"
  | "result"
  | "error"
  | "metric"
  | "decision"
  | "working";

const MEMORY_KINDS: ReadonlyArray<MemoryKind> = [
  "knowledge",
  "context",
  "task",
  "result",
  "error",
  "metric",
  "decision",
  "working",
];

const DEFAULT_TTL: Record<MemoryKind, number | null> = {
  knowledge: null,
  context: null,
  task: 4 * 60 * 60 * 1000,
  result: 24 * 60 * 60 * 1000,
  error: 7 * 24 * 60 * 60 * 1000,
  metric: 30 * 24 * 60 * 60 * 1000,
  decision: null,
  working: 60 * 60 * 1000,
};
// @AI:NAV[END:memory-kinds]

// @AI:NAV[SEC:interface-memoryentry] interface MemoryEntry
export interface MemoryEntry {
  id: string;
  session_id: string;
  key: string;
  kind: MemoryKind;
  value: unknown;
  tags: string[];
  created_at: number;
  updated_at: number;
  expires_at: number | null;
}
// @AI:NAV[END:interface-memoryentry]

// @AI:NAV[SEC:backend-interface] Backend abstraction
interface MemoryBackend {
  upsert(entry: MemoryEntry): void;
  findBySession(sessionId: string, now: number): MemoryEntry[];
}
// @AI:NAV[END:backend-interface]

// @AI:NAV[SEC:json-backend] JSON file backend
/**
 * JSON file-based backend. One file per session at
 * `{dir}/{sessionId-safe}.json`. Chosen as the default when node:sqlite
 * is not available (Node < 22.5) or when sqlite bindings cannot load.
 *
 * This backend keeps the whole session memory set in memory and flushes
 * to disk on every upsert. Memory sets per session are expected to be
 * small (< a few thousand entries), so the simplicity is worth the cost.
 */
class JsonFileBackend implements MemoryBackend {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // ignore — surfaced on first write
    }
  }

  private safeSessionId(sessionId: string): string {
    return sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  private filePath(sessionId: string): string {
    return path.join(this.dir, `${this.safeSessionId(sessionId)}.json`);
  }

  private loadSession(sessionId: string): MemoryEntry[] {
    const file = this.filePath(sessionId);
    try {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as MemoryEntry[];
      }
      return [];
    } catch {
      return [];
    }
  }

  private saveSession(sessionId: string, entries: MemoryEntry[]): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const file = this.filePath(sessionId);
    fs.writeFileSync(file, JSON.stringify(entries, null, 2), "utf8");
  }

  upsert(entry: MemoryEntry): void {
    const entries = this.loadSession(entry.session_id);
    const idx = entries.findIndex(
      (e) => e.session_id === entry.session_id && e.key === entry.key
    );
    if (idx >= 0) {
      // Preserve created_at on update
      entry.created_at = entries[idx].created_at;
      entries[idx] = entry;
    } else {
      entries.push(entry);
    }
    this.saveSession(entry.session_id, entries);
  }

  findBySession(sessionId: string, now: number): MemoryEntry[] {
    const entries = this.loadSession(sessionId);
    return entries.filter(
      (e) => e.expires_at === null || e.expires_at > now
    );
  }
}
// @AI:NAV[END:json-backend]

// @AI:NAV[SEC:sqlite-backend] node:sqlite backend
/**
 * SQLite-backed memory store using the built-in `node:sqlite` module
 * (Node 22.5+). One `.db` file per session at `{dir}/{sessionId}.db`.
 *
 * This module is loaded lazily via `tryLoadSqliteBackend()` so Node
 * versions without `node:sqlite` transparently fall back to JSON.
 */
interface SqliteDbLike {
  exec(sql: string): void;
  prepare(sql: string): {
    run: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => Array<Record<string, unknown>>;
  };
}

class SqliteBackend implements MemoryBackend {
  private readonly dir: string;
  private readonly DatabaseSync: new (p: string) => SqliteDbLike;
  private readonly dbCache = new Map<string, SqliteDbLike>();

  constructor(dir: string, DatabaseSync: new (p: string) => SqliteDbLike) {
    this.dir = dir;
    this.DatabaseSync = DatabaseSync;
    fs.mkdirSync(dir, { recursive: true });
  }

  private safeSessionId(sessionId: string): string {
    return sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  private dbFor(sessionId: string): SqliteDbLike {
    const key = this.safeSessionId(sessionId);
    let db = this.dbCache.get(key);
    if (db) return db;
    const dbPath = path.join(this.dir, `${key}.db`);
    db = new this.DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        key TEXT NOT NULL,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        tags TEXT DEFAULT '[]',
        UNIQUE(session_id, key)
      );
      CREATE INDEX IF NOT EXISTS idx_session ON memories(session_id);
      CREATE INDEX IF NOT EXISTS idx_expires ON memories(expires_at);
    `);
    this.dbCache.set(key, db);
    return db;
  }

  upsert(entry: MemoryEntry): void {
    const db = this.dbFor(entry.session_id);
    // Preserve created_at when upserting an existing row
    const existing = db
      .prepare("SELECT created_at FROM memories WHERE session_id = ? AND key = ?")
      .all(entry.session_id, entry.key);
    const createdAt =
      existing.length > 0
        ? Number(existing[0].created_at)
        : entry.created_at;
    db.prepare(
      `INSERT INTO memories (id, session_id, key, kind, value, created_at, updated_at, expires_at, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, key) DO UPDATE SET
         id = excluded.id,
         kind = excluded.kind,
         value = excluded.value,
         updated_at = excluded.updated_at,
         expires_at = excluded.expires_at,
         tags = excluded.tags`
    ).run(
      entry.id,
      entry.session_id,
      entry.key,
      entry.kind,
      JSON.stringify(entry.value),
      createdAt,
      entry.updated_at,
      entry.expires_at,
      JSON.stringify(entry.tags)
    );
  }

  findBySession(sessionId: string, now: number): MemoryEntry[] {
    const db = this.dbFor(sessionId);
    const rows = db
      .prepare(
        `SELECT id, session_id, key, kind, value, created_at, updated_at, expires_at, tags
         FROM memories
         WHERE session_id = ? AND (expires_at IS NULL OR expires_at > ?)`
      )
      .all(sessionId, now);
    return rows.map((r) => ({
      id: String(r.id),
      session_id: String(r.session_id),
      key: String(r.key),
      kind: String(r.kind) as MemoryKind,
      value: safeJsonParse(String(r.value)),
      created_at: Number(r.created_at),
      updated_at: Number(r.updated_at),
      expires_at:
        r.expires_at === null || r.expires_at === undefined
          ? null
          : Number(r.expires_at),
      tags: safeJsonParseArray(String(r.tags ?? "[]")),
    }));
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function safeJsonParseArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

function tryLoadSqliteBackend(dir: string): MemoryBackend | null {
  try {
    // node:sqlite requires Node 22.5+ and is experimental; load lazily.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod: unknown = require("node:sqlite");
    if (!mod || typeof mod !== "object") return null;
    const DatabaseSync = (mod as { DatabaseSync?: unknown }).DatabaseSync;
    if (typeof DatabaseSync !== "function") return null;
    return new SqliteBackend(
      dir,
      DatabaseSync as unknown as new (p: string) => SqliteDbLike
    );
  } catch {
    return null;
  }
}
// @AI:NAV[END:sqlite-backend]

// @AI:NAV[SEC:class-memorymanager] class MemoryManager
/**
 * MemoryManager provides session-scoped persistent memory for agents with
 * automatic TTLs by kind. Storage is SQLite (via `node:sqlite`) when
 * available, JSON file otherwise. Each session owns an isolated store.
 *
 * MCP tools:
 *   - memory_store:  write/overwrite a keyed entry with optional tags/ttl
 *   - memory_search: search by key/value substring, kind, and required tags
 *   - memory_list:   list all active entries for a session
 */
export interface MemoryManagerOptions {
  dir?: string;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Force JSON backend (for tests) even when node:sqlite is available. */
  forceJsonBackend?: boolean;
}

export class MemoryManager {
  private readonly dir: string;
  private readonly now: () => number;
  private readonly backend: MemoryBackend;
  private readonly backendName: "node-sqlite" | "json-fallback";

  constructor(options: MemoryManagerOptions = {}) {
    this.dir = options.dir ?? DEFAULT_MEMORY_DIR;
    this.now = options.now ?? (() => Date.now());

    let backend: MemoryBackend | null = null;
    if (!options.forceJsonBackend) {
      backend = tryLoadSqliteBackend(this.dir);
    }
    if (backend) {
      this.backend = backend;
      this.backendName = "node-sqlite";
    } else {
      this.backend = new JsonFileBackend(this.dir);
      this.backendName = "json-fallback";
    }
  }

  getBackendName(): "node-sqlite" | "json-fallback" {
    return this.backendName;
  }

  getDir(): string {
    return this.dir;
  }

  // ---- Core operations ----

  store(input: {
    session_id: string;
    key: string;
    kind: MemoryKind;
    value: unknown;
    tags?: string[];
    ttl_ms?: number;
  }): MemoryEntry {
    if (!input.session_id || typeof input.session_id !== "string") {
      throw new Error("store: 'session_id' must be a non-empty string");
    }
    if (!input.key || typeof input.key !== "string") {
      throw new Error("store: 'key' must be a non-empty string");
    }
    if (!MEMORY_KINDS.includes(input.kind)) {
      throw new Error(
        `store: 'kind' must be one of ${MEMORY_KINDS.join(", ")}`
      );
    }
    const tags = Array.isArray(input.tags)
      ? input.tags.filter((t) => typeof t === "string")
      : [];

    const now = this.now();
    const id = crypto
      .createHash("sha256")
      .update(`${input.session_id}::${input.key}`)
      .digest("hex");

    let expiresAt: number | null;
    if (typeof input.ttl_ms === "number" && Number.isFinite(input.ttl_ms)) {
      expiresAt = input.ttl_ms > 0 ? now + input.ttl_ms : null;
    } else {
      const defaultTtl = DEFAULT_TTL[input.kind];
      expiresAt = defaultTtl === null ? null : now + defaultTtl;
    }

    const entry: MemoryEntry = {
      id,
      session_id: input.session_id,
      key: input.key,
      kind: input.kind,
      value: input.value,
      tags,
      created_at: now,
      updated_at: now,
      expires_at: expiresAt,
    };
    this.backend.upsert(entry);
    return entry;
  }

  list(sessionId: string, kindFilter?: MemoryKind): MemoryEntry[] {
    if (!sessionId || typeof sessionId !== "string") {
      throw new Error("list: 'session_id' must be a non-empty string");
    }
    const all = this.backend.findBySession(sessionId, this.now());
    const filtered =
      kindFilter !== undefined
        ? all.filter((e) => e.kind === kindFilter)
        : all;
    filtered.sort((a, b) => b.updated_at - a.updated_at);
    return filtered;
  }

  search(input: {
    session_id: string;
    query?: string;
    kind?: MemoryKind;
    tags?: string[];
    limit?: number;
  }): MemoryEntry[] {
    if (!input.session_id || typeof input.session_id !== "string") {
      throw new Error("search: 'session_id' must be a non-empty string");
    }
    const limit =
      typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0
        ? Math.floor(input.limit)
        : 20;

    const all = this.backend.findBySession(input.session_id, this.now());

    const query = (input.query ?? "").toLowerCase();
    const requiredTags = Array.isArray(input.tags)
      ? input.tags.filter((t) => typeof t === "string")
      : [];

    const results = all.filter((e) => {
      if (input.kind !== undefined && e.kind !== input.kind) return false;
      if (requiredTags.length > 0) {
        for (const t of requiredTags) {
          if (!e.tags.includes(t)) return false;
        }
      }
      if (query) {
        const keyMatch = e.key.toLowerCase().includes(query);
        let valueMatch = false;
        try {
          valueMatch = JSON.stringify(e.value).toLowerCase().includes(query);
        } catch {
          valueMatch = false;
        }
        if (!keyMatch && !valueMatch) return false;
      }
      return true;
    });

    results.sort((a, b) => b.updated_at - a.updated_at);
    return results.slice(0, limit);
  }

  // ---- MCP tool surface ----

  getTools(): Tool[] {
    const kindEnum = [...MEMORY_KINDS];
    return [
      {
        name: "memory_store",
        description:
          "Store a value in agent memory with an associated key, kind, and optional tags. Overwrites existing entry for the same session+key pair. Use for persisting facts, decisions, results, or working notes across tool calls.",
        inputSchema: {
          type: "object" as const,
          properties: {
            session_id: {
              type: "string",
              description: "Session identifier that scopes this memory entry",
            },
            key: {
              type: "string",
              description:
                "Unique identifier for this memory entry within the session",
            },
            kind: {
              type: "string",
              enum: kindEnum,
              description:
                "Memory kind. Controls default TTL: knowledge/context/decision=no expiry, working=1h, task=4h, result=24h, error=7d, metric=30d",
            },
            value: {
              description: "Any JSON-serializable value to store",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional tags for search/retrieval",
            },
            ttl_ms: {
              type: "number",
              description:
                "Optional explicit TTL in milliseconds. Overrides the kind default. Use <= 0 for no expiry.",
            },
          },
          required: ["session_id", "key", "kind", "value"],
        },
        annotations: {
          title: "Store Agent Memory",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "memory_search",
        description:
          "Search agent memory by key pattern, tags, or kind filter. Returns matching entries ordered by most recently updated. Expired entries are excluded.",
        inputSchema: {
          type: "object" as const,
          properties: {
            session_id: {
              type: "string",
              description: "Session identifier that scopes the search",
            },
            query: {
              type: "string",
              description: "Substring match on key or JSON-serialized value",
            },
            kind: {
              type: "string",
              enum: kindEnum,
              description: "Filter by memory kind",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Entries must have ALL specified tags",
            },
            limit: {
              type: "number",
              description: "Maximum results to return (default 20)",
              default: 20,
            },
          },
          required: ["session_id"],
        },
        annotations: {
          title: "Search Agent Memory",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "memory_list",
        description:
          "List all active (non-expired) memory entries for a session. Read-only.",
        inputSchema: {
          type: "object" as const,
          properties: {
            session_id: {
              type: "string",
              description: "Session identifier to list",
            },
            kind: {
              type: "string",
              enum: kindEnum,
              description: "Optional kind filter",
            },
          },
          required: ["session_id"],
        },
        annotations: {
          title: "List Agent Memory",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
    ];
  }

  isMemoryTool(name: string): boolean {
    return (
      name === "memory_store" ||
      name === "memory_search" ||
      name === "memory_list"
    );
  }

  async handleToolCall(toolName: string, args: any): Promise<any> {
    try {
      if (toolName === "memory_store") {
        const sessionId: string = args?.session_id;
        const key: string = args?.key;
        const kind: MemoryKind = args?.kind;
        if (!sessionId || typeof sessionId !== "string") {
          return {
            isError: true,
            content: [{ type: "text", text: "Missing required argument: session_id" }],
          };
        }
        if (!key || typeof key !== "string") {
          return {
            isError: true,
            content: [{ type: "text", text: "Missing required argument: key" }],
          };
        }
        if (!kind || !MEMORY_KINDS.includes(kind)) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Missing or invalid 'kind'. Must be one of: ${MEMORY_KINDS.join(", ")}`,
              },
            ],
          };
        }
        if (args?.value === undefined) {
          return {
            isError: true,
            content: [{ type: "text", text: "Missing required argument: value" }],
          };
        }
        const entry = this.store({
          session_id: sessionId,
          key,
          kind,
          value: args.value,
          tags: Array.isArray(args?.tags) ? args.tags : undefined,
          ttl_ms: typeof args?.ttl_ms === "number" ? args.ttl_ms : undefined,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify({ stored: true, entry }, null, 2) },
          ],
        };
      }

      if (toolName === "memory_search") {
        const sessionId: string = args?.session_id;
        if (!sessionId || typeof sessionId !== "string") {
          return {
            isError: true,
            content: [{ type: "text", text: "Missing required argument: session_id" }],
          };
        }
        if (args?.kind !== undefined && !MEMORY_KINDS.includes(args.kind)) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Invalid 'kind'. Must be one of: ${MEMORY_KINDS.join(", ")}`,
              },
            ],
          };
        }
        const entries = this.search({
          session_id: sessionId,
          query: typeof args?.query === "string" ? args.query : undefined,
          kind: args?.kind,
          tags: Array.isArray(args?.tags) ? args.tags : undefined,
          limit: typeof args?.limit === "number" ? args.limit : undefined,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ count: entries.length, entries }, null, 2),
            },
          ],
        };
      }

      if (toolName === "memory_list") {
        const sessionId: string = args?.session_id;
        if (!sessionId || typeof sessionId !== "string") {
          return {
            isError: true,
            content: [{ type: "text", text: "Missing required argument: session_id" }],
          };
        }
        if (args?.kind !== undefined && !MEMORY_KINDS.includes(args.kind)) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Invalid 'kind'. Must be one of: ${MEMORY_KINDS.join(", ")}`,
              },
            ],
          };
        }
        const entries = this.list(sessionId, args?.kind);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ count: entries.length, entries }, null, 2),
            },
          ],
        };
      }

      return null;
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: err?.message || String(err) }],
      };
    }
  }
}
// @AI:NAV[END:class-memorymanager]

// Re-export for downstream consumers.
export { DEFAULT_TTL, MEMORY_KINDS };
// Kept for ergonomic test suites that want async cleanup helpers.
export async function removeMemoryDir(dir: string): Promise<void> {
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
