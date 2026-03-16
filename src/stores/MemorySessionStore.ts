/**
 * MemorySessionStore — In-memory session store implementation.
 *
 * Wraps a plain Map<string, SessionState> and implements the SessionStore
 * interface. This is the default store used by SessionIsolation when no
 * external store is configured. Behavior matches the original in-memory
 * implementation exactly.
 */

import type { SessionState } from "../SessionIsolation";
import type { SessionStore } from "../SessionStore";

export class MemorySessionStore implements SessionStore {
  private sessions: Map<string, SessionState> = new Map();

  async get(sessionId: string): Promise<SessionState | undefined> {
    return this.sessions.get(sessionId);
  }

  async set(sessionId: string, state: SessionState): Promise<void> {
    this.sessions.set(sessionId, state);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async list(): Promise<string[]> {
    return Array.from(this.sessions.keys());
  }

  async cleanup(maxAgeMs: number): Promise<number> {
    const now = Date.now();
    let removed = 0;

    for (const [sessionId, state] of this.sessions.entries()) {
      if ((now - state.lastAccessedAt) > maxAgeMs) {
        this.sessions.delete(sessionId);
        removed++;
      }
    }

    return removed;
  }
}
