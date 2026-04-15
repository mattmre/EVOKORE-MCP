/**
 * SessionIsolation — Multi-tenant session isolation for EVOKORE-MCP HTTP mode.
 *
 * Each HTTP connection (identified by a unique session ID from
 * StreamableHTTPServerTransport) gets an isolated SessionState that
 * stores activated tools, role, rate limit counters, and custom metadata.
 *
 * Sessions have a configurable TTL (default 1 hour) and are cleaned up
 * automatically when accessed or via explicit cleanExpired() calls.
 *
 * Supports pluggable session stores via the SessionStore interface.
 * When a store is provided, session state is persisted on create/destroy
 * and can be loaded back on demand. The in-memory Map remains the primary
 * fast-path for all synchronous operations.
 *
 * Default behavior (no store argument) uses MemorySessionStore,
 * which is functionally identical to the original in-memory implementation.
 */

// @AI:NAV[SEC:imports] Import declarations
import path from "path";
import os from "os";

import type { SessionStore } from "./SessionStore";
import { MemorySessionStore } from "./stores/MemorySessionStore";
import { AuditLog } from "./AuditLog";
// @AI:NAV[END:imports]

const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Resolve the EVOKORE runtime home directory, honoring the EVOKORE_HOME
 * override used by SessionManifest and hook scripts. Resolved at call time
 * (not module-load time) so tests can flip the env var between cases.
 */
// @AI:NAV[SEC:function-evokorehome] function evokoreHome
function evokoreHome(): string {
  return process.env.EVOKORE_HOME ?? path.join(os.homedir(), ".evokore");
}
// @AI:NAV[END:function-evokorehome]

/**
 * Sanitize a tenantId for safe use as a single path component.
 * Keeps alphanumerics, hyphen, dot, and underscore; replaces everything
 * else (including path separators and `..`) with underscores. Truncates
 * to 128 characters to bound filesystem path length.
 */
// @AI:NAV[SEC:function-sanitizetenantid] function sanitizeTenantId
export function sanitizeTenantId(tenantId: string): string {
  return tenantId.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 128);
}
// @AI:NAV[END:function-sanitizetenantid]

/**
 * Resolve the per-tenant sessions directory.
 *
 * When `EVOKORE_TENANT_SCOPING` is unset (or `tenantId` is missing), returns
 * the legacy flat layout `{EVOKORE_HOME}/sessions`. When scoping is enabled
 * and a tenantId is provided, returns
 * `{EVOKORE_HOME}/tenants/{sanitized-tenantId}/sessions`.
 *
 * This is exported as a free function so stores and hook scripts can share
 * the same path-resolution logic without requiring a SessionIsolation
 * instance.
 */
// @AI:NAV[SEC:function-resolvetenantsessiondir] function resolveTenantSessionDir
export function resolveTenantSessionDir(tenantId?: string): string {
  const base = path.join(evokoreHome(), "sessions");
  if (process.env.EVOKORE_TENANT_SCOPING !== "true" || !tenantId) {
    return base;
  }
  const safe = sanitizeTenantId(tenantId);
  if (!safe) return base;
  return path.join(evokoreHome(), "tenants", safe, "sessions");
}
// @AI:NAV[END:function-resolvetenantsessiondir]

// @AI:NAV[SEC:interface-sessionstate] interface SessionState
export interface SessionState {
  /** Unique session identifier (typically a UUID from the HTTP transport). */
  sessionId: string;

  /** Timestamp (ms since epoch) when this session was created. */
  createdAt: number;

  /** Timestamp (ms since epoch) of the last access to this session. */
  lastAccessedAt: number;

  /** Set of activated tool names for this session's dynamic discovery. */
  activatedTools: Set<string>;

  /** RBAC role for this session, or null for flat permissions. */
  role: string | null;

  /** Per-tool rate limit counters: tool name -> { tokens, lastRefill }. */
  rateLimitCounters: Map<string, { tokens: number; lastRefillAt: number }>;

  /** Arbitrary metadata that integrations can attach to a session. */
  metadata: Map<string, unknown>;

  /**
   * Optional tenant identifier, sourced from the OAuth JWT `sub` claim.
   * When set and `EVOKORE_TENANT_SCOPING=true`, session artifacts are
   * namespaced under `~/.evokore/tenants/{tenantId}/sessions/`.
   */
  tenantId?: string;
}
// @AI:NAV[END:interface-sessionstate]

// @AI:NAV[SEC:interface-sessionisolationoptions] interface SessionIsolationOptions
export interface SessionIsolationOptions {
  /** Session time-to-live in milliseconds. Defaults to EVOKORE_SESSION_TTL_MS env var or 1 hour. */
  ttlMs?: number;

  /** Maximum number of concurrent sessions. When exceeded, the least-recently-accessed session is evicted. Defaults to 100. */
  maxSessions?: number;

  /** Optional pluggable session store for persistence. Defaults to MemorySessionStore. */
  store?: SessionStore;
}
// @AI:NAV[END:interface-sessionisolationoptions]

const DEFAULT_MAX_SESSIONS = 100;

// @AI:NAV[SEC:class-sessionisolation] class SessionIsolation
export class SessionIsolation {
  private sessions: Map<string, SessionState> = new Map();
  private ttlMs: number;
  private maxSessions: number;
  private store: SessionStore;

  constructor(options?: SessionIsolationOptions) {
    const envTtl = Number(process.env.EVOKORE_SESSION_TTL_MS);
    this.ttlMs = options?.ttlMs
      ?? (Number.isFinite(envTtl) && envTtl > 0 ? envTtl : DEFAULT_SESSION_TTL_MS);
    this.maxSessions = options?.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.store = options?.store ?? new MemorySessionStore();
  }

  /**
   * Get the configured session store instance.
   */
  getStore(): SessionStore {
    return this.store;
  }

  /**
   * Resolve the sessions directory for a given tenant.
   *
   * When `EVOKORE_TENANT_SCOPING` is unset or `tenantId` is missing, returns
   * the legacy flat `{EVOKORE_HOME}/sessions` path, keeping single-operator
   * deployments bit-for-bit identical to pre-tenant behavior. When scoping
   * is enabled, returns `{EVOKORE_HOME}/tenants/{sanitized-tenantId}/sessions`.
   */
  resolveTenantSessionDir(tenantId?: string): string {
    return resolveTenantSessionDir(tenantId);
  }

  /**
   * Create a new isolated session.
   * If a session with the given ID already exists, it is replaced.
   * When at capacity, the least-recently-accessed session is evicted (LRU).
   */
  createSession(sessionId: string, role?: string | null, tenantId?: string): SessionState {
    // If this session already exists, the set-below will replace it, no eviction needed.
    if (!this.sessions.has(sessionId)) {
      this.evictIfAtCapacity();
    }

    const now = Date.now();
    const state: SessionState = {
      sessionId,
      createdAt: now,
      lastAccessedAt: now,
      activatedTools: new Set(),
      role: role ?? null,
      rateLimitCounters: new Map(),
      metadata: new Map(),
      tenantId: tenantId ?? undefined,
    };
    this.sessions.set(sessionId, state);

    // Fire-and-forget persist to store (errors logged but not thrown)
    this.store.set(sessionId, state).catch(() => {
      // Store persistence is best-effort for the synchronous createSession path
    });

    return state;
  }

  /**
   * If we are at or above maxSessions, evict expired sessions first,
   * then evict the least-recently-accessed session to make room.
   */
  private evictIfAtCapacity(): void {
    if (this.sessions.size < this.maxSessions) {
      return;
    }

    // First pass: remove expired sessions
    this.cleanExpired();

    if (this.sessions.size < this.maxSessions) {
      return;
    }

    // O(1) LRU eviction: the first entry in the Map is the oldest (least recently accessed)
    const oldestEntry = this.sessions.entries().next();
    if (!oldestEntry.done) {
      const [oldestId] = oldestEntry.value;
      this.sessions.delete(oldestId);
      this.store.delete(oldestId).catch(() => {});
    }
  }

  /**
   * Get the configured max sessions limit.
   */
  getMaxSessions(): number {
    return this.maxSessions;
  }

  /**
   * Retrieve a session by ID.
   * Returns null if the session does not exist or has expired.
   * Touching the session updates its lastAccessedAt timestamp.
   */
  getSession(sessionId: string): SessionState | null {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return null;
    }

    if (this.isExpired(state)) {
      this.sessions.delete(sessionId);
      this.store.delete(sessionId).catch(() => {});
      return null;
    }

    // Update timestamp and re-insert to maintain LRU order (Map tail = most recent)
    state.lastAccessedAt = Date.now();
    this.sessions.delete(sessionId);
    this.sessions.set(sessionId, state);
    return state;
  }

  /**
   * Check whether a non-expired session exists for the given ID.
   * Unlike getSession(), this does NOT update lastAccessedAt,
   * making it safe for use in cleanup/audit paths that should not
   * inadvertently extend session lifetimes.
   */
  hasSession(sessionId: string): boolean {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return false;
    }

    if (this.isExpired(state)) {
      this.sessions.delete(sessionId);
      this.store.delete(sessionId).catch(() => {});
      return false;
    }

    return true;
  }

  /**
   * Destroy a session, removing all its state.
   * Returns true if the session existed and was removed.
   */
  destroySession(sessionId: string): boolean {
    const existed = this.sessions.delete(sessionId);
    if (existed) {
      this.store.delete(sessionId).catch(() => {});
    }
    return existed;
  }

  /**
   * List all active (non-expired) session IDs.
   * Expired sessions encountered during listing are removed.
   */
  listSessions(): string[] {
    const now = Date.now();
    const active: string[] = [];

    for (const [sessionId, state] of this.sessions.entries()) {
      if (this.isExpired(state, now)) {
        this.sessions.delete(sessionId);
        this.store.delete(sessionId).catch(() => {});
      } else {
        active.push(sessionId);
      }
    }

    return active;
  }

  /**
   * Remove all expired sessions.
   * Returns the number of sessions that were cleaned up.
   */
  cleanExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [sessionId, state] of this.sessions.entries()) {
      if (this.isExpired(state, now)) {
        this.sessions.delete(sessionId);
        this.store.delete(sessionId).catch(() => {});
        removed++;
      }
    }

    return removed;
  }

  /**
   * Persist the current state of a session to the backing store.
   * Call this after modifying session state to ensure it is durably stored.
   * No-op if the session does not exist in-memory.
   */
  async persistSession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (state) {
      await this.store.set(sessionId, state);
    }
  }

  /**
   * Update the RBAC role on an existing session.
   *
   * Returns true if the session exists (including as a no-op when the role is
   * unchanged), false if the session is missing or expired. A no-op (role
   * already matches) skips the audit write to avoid per-request spam when a
   * JWT with a stable role claim arrives on every request.
   *
   * The update is persisted to the backing store on a best-effort basis; the
   * in-memory change is still applied even if persistence fails.
   */
  async setSessionRole(sessionId: string, role: string | null): Promise<boolean> {
    const state = this.sessions.get(sessionId);
    if (!state || this.isExpired(state)) {
      return false;
    }

    const previousRole = state.role;
    if (previousRole === role) {
      // No-op: avoid audit-log noise for per-request JWT refresh.
      return true;
    }

    state.role = role;
    state.lastAccessedAt = Date.now();

    // Re-insert to keep LRU ordering coherent (Map tail = most recent).
    this.sessions.delete(sessionId);
    this.sessions.set(sessionId, state);

    try {
      await this.store.set(sessionId, state);
    } catch {
      // Persistence is best-effort; in-memory change still applies.
    }

    AuditLog.getInstance().log("config_change", "success", {
      sessionId,
      metadata: { action: "set_session_role", previousRole, newRole: role },
    });

    return true;
  }

  /**
   * Load a session from the backing store into the in-memory cache.
   * Returns null if the session is not found in the store or has expired.
   * Useful for restoring sessions after process restart.
   */
  async loadSession(sessionId: string): Promise<SessionState | null> {
    const state = await this.store.get(sessionId);
    if (!state) return null;

    if (this.isExpired(state)) {
      await this.store.delete(sessionId);
      return null;
    }

    state.lastAccessedAt = Date.now();
    this.sessions.set(sessionId, state);
    return state;
  }

  /**
   * Get the configured TTL in milliseconds.
   */
  getTtlMs(): number {
    return this.ttlMs;
  }

  /**
   * Get the total number of sessions (including potentially expired ones
   * that have not yet been cleaned). Use listSessions() for an accurate
   * count of active sessions.
   */
  get size(): number {
    return this.sessions.size;
  }

  private isExpired(state: SessionState, now = Date.now()): boolean {
    return (now - state.lastAccessedAt) > this.ttlMs;
  }
}
// @AI:NAV[END:class-sessionisolation]
