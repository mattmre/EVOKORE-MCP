/**
 * SessionStore — Pluggable session state persistence interface for EVOKORE-MCP.
 *
 * Implementations provide the storage backend for SessionIsolation.
 * The default MemorySessionStore replicates the original in-memory behavior.
 * FileSessionStore adds single-node persistence without external dependencies.
 *
 * Session state is serialized as a plain object for storage; Set and Map fields
 * are converted to arrays/objects during serialization and restored on read.
 */

import type { SessionState } from "./SessionIsolation";

/**
 * Serializable representation of SessionState for storage backends.
 * Set<string> becomes string[], Map<K,V> becomes Record<string, V>.
 */
export interface SerializedSessionState {
  sessionId: string;
  createdAt: number;
  lastAccessedAt: number;
  activatedTools: string[];
  role: string | null;
  rateLimitCounters: Record<string, { tokens: number; lastRefillAt: number }>;
  metadata: Record<string, unknown>;
}

/**
 * Convert a live SessionState (with Set/Map) to a plain serializable object.
 */
export function serializeSessionState(state: SessionState): SerializedSessionState {
  return {
    sessionId: state.sessionId,
    createdAt: state.createdAt,
    lastAccessedAt: state.lastAccessedAt,
    activatedTools: Array.from(state.activatedTools),
    role: state.role,
    rateLimitCounters: Object.fromEntries(state.rateLimitCounters),
    metadata: Object.fromEntries(state.metadata),
  };
}

/**
 * Restore a serialized session object back into a live SessionState.
 */
export function deserializeSessionState(data: SerializedSessionState): SessionState {
  return {
    sessionId: data.sessionId,
    createdAt: data.createdAt,
    lastAccessedAt: data.lastAccessedAt,
    activatedTools: new Set(data.activatedTools),
    role: data.role,
    rateLimitCounters: new Map(Object.entries(data.rateLimitCounters)),
    metadata: new Map(Object.entries(data.metadata)),
  };
}

/**
 * Pluggable session store interface.
 *
 * All methods are async to support both in-memory and I/O-backed implementations.
 */
export interface SessionStore {
  /** Retrieve a session by ID. Returns undefined if not found. */
  get(sessionId: string): Promise<SessionState | undefined>;

  /** Persist a session state. Overwrites any existing entry for the same ID. */
  set(sessionId: string, state: SessionState): Promise<void>;

  /** Delete a session by ID. */
  delete(sessionId: string): Promise<void>;

  /** List all stored session IDs. */
  list(): Promise<string[]>;

  /**
   * Remove sessions whose lastAccessedAt is older than maxAgeMs from now.
   * Returns the number of sessions removed.
   */
  cleanup(maxAgeMs: number): Promise<number>;
}
