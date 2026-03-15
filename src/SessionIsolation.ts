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
 * This is the initial in-memory-only implementation — no persistence.
 */

const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

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
}

export interface SessionIsolationOptions {
  /** Session time-to-live in milliseconds. Defaults to EVOKORE_SESSION_TTL_MS env var or 1 hour. */
  ttlMs?: number;
}

export class SessionIsolation {
  private sessions: Map<string, SessionState> = new Map();
  private ttlMs: number;

  constructor(options?: SessionIsolationOptions) {
    const envTtl = Number(process.env.EVOKORE_SESSION_TTL_MS);
    this.ttlMs = options?.ttlMs
      ?? (Number.isFinite(envTtl) && envTtl > 0 ? envTtl : DEFAULT_SESSION_TTL_MS);
  }

  /**
   * Create a new isolated session.
   * If a session with the given ID already exists, it is replaced.
   */
  createSession(sessionId: string, role?: string | null): SessionState {
    const now = Date.now();
    const state: SessionState = {
      sessionId,
      createdAt: now,
      lastAccessedAt: now,
      activatedTools: new Set(),
      role: role ?? null,
      rateLimitCounters: new Map(),
      metadata: new Map(),
    };
    this.sessions.set(sessionId, state);
    return state;
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
      return null;
    }

    state.lastAccessedAt = Date.now();
    return state;
  }

  /**
   * Destroy a session, removing all its state.
   * Returns true if the session existed and was removed.
   */
  destroySession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
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
        removed++;
      }
    }

    return removed;
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
