/**
 * RedisSessionStore — Redis-backed session store implementation.
 *
 * Stores each session as a JSON string in Redis with automatic TTL
 * expiration. Suitable for multi-node deployments where session state
 * must be shared across processes.
 *
 * Key pattern: {prefix}:session:{sessionId}
 * Value: JSON-serialized SerializedSessionState
 *
 * Requires the `ioredis` package as an optional dependency.
 * If ioredis is not installed, the constructor throws a clear error
 * directing the operator to install it.
 *
 * Connection is lazy: the Redis client is not created until the first
 * store operation, avoiding startup failures when Redis is unreachable
 * but the store is not yet used.
 */

import type { SessionState } from "../SessionIsolation";
import type { SessionStore } from "../SessionStore";
import { serializeSessionState, deserializeSessionState } from "../SessionStore";

const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";
const DEFAULT_KEY_PREFIX = "evokore";
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface RedisSessionStoreOptions {
  /** Redis connection URL. Defaults to EVOKORE_REDIS_URL or redis://127.0.0.1:6379 */
  url?: string;
  /** Redis key namespace prefix. Defaults to EVOKORE_REDIS_KEY_PREFIX or 'evokore' */
  keyPrefix?: string;
  /** Session TTL in milliseconds. Defaults to EVOKORE_SESSION_TTL_MS or 3600000 (1 hour) */
  ttlMs?: number;
}

/**
 * Minimal type for the ioredis client interface we consume.
 * This avoids requiring ioredis types at compile time since it is optional.
 */
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  scan(cursor: string | number, ...args: any[]): Promise<[string, string[]]>;
  quit(): Promise<string>;
  status: string;
}

export class RedisSessionStore implements SessionStore {
  private url: string;
  private keyPrefix: string;
  private ttlMs: number;
  private client: RedisClient | null = null;
  private connectPromise: Promise<RedisClient> | null = null;

  constructor(options?: RedisSessionStoreOptions) {
    this.url = options?.url ?? DEFAULT_REDIS_URL;
    this.keyPrefix = options?.keyPrefix ?? DEFAULT_KEY_PREFIX;
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  }

  /**
   * Build the Redis key for a given session ID.
   */
  private key(sessionId: string): string {
    return `${this.keyPrefix}:session:${sessionId}`;
  }

  /**
   * Extract the session ID from a Redis key.
   */
  private sessionIdFromKey(key: string): string {
    const prefix = `${this.keyPrefix}:session:`;
    return key.slice(prefix.length);
  }

  /**
   * Lazily connect to Redis on first use.
   * Dynamically imports ioredis so it remains an optional dependency.
   */
  private async ensureClient(): Promise<RedisClient> {
    if (this.client && this.client.status === "ready") {
      return this.client;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      let Redis: any;
      try {
        // Use a variable to prevent TypeScript from resolving the optional
        // dependency at compile time. At runtime this is equivalent to
        // import("ioredis").
        const moduleName = "ioredis";
        const mod = await import(moduleName);
        Redis = mod.default ?? mod;
      } catch {
        throw new Error(
          "RedisSessionStore requires the 'ioredis' package. " +
            "Install it with: npm install ioredis"
        );
      }

      const client: RedisClient = new Redis(this.url, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      await (client as any).connect();
      this.client = client;
      return client;
    })();

    try {
      const client = await this.connectPromise;
      return client;
    } catch (err) {
      this.connectPromise = null;
      throw err;
    }
  }

  async get(sessionId: string): Promise<SessionState | undefined> {
    let client: RedisClient;
    try {
      client = await this.ensureClient();
    } catch {
      return undefined;
    }

    try {
      const raw = await client.get(this.key(sessionId));
      if (raw === null) {
        return undefined;
      }
      const data = JSON.parse(raw);
      return deserializeSessionState(data);
    } catch {
      return undefined;
    }
  }

  async set(sessionId: string, state: SessionState): Promise<void> {
    let client: RedisClient;
    try {
      client = await this.ensureClient();
    } catch {
      return;
    }

    try {
      const serialized = serializeSessionState(state);
      const json = JSON.stringify(serialized);
      await client.set(this.key(sessionId), json, "PX", this.ttlMs);
    } catch {
      // Fire-and-forget: swallow write errors for resilience
    }
  }

  async delete(sessionId: string): Promise<void> {
    let client: RedisClient;
    try {
      client = await this.ensureClient();
    } catch {
      return;
    }

    try {
      await client.del(this.key(sessionId));
    } catch {
      // Swallow errors for resilience
    }
  }

  async list(): Promise<string[]> {
    let client: RedisClient;
    try {
      client = await this.ensureClient();
    } catch {
      return [];
    }

    const pattern = `${this.keyPrefix}:session:*`;
    const sessionIds: string[] = [];

    try {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = nextCursor;
        for (const key of keys) {
          sessionIds.push(this.sessionIdFromKey(key));
        }
      } while (cursor !== "0");
    } catch {
      return [];
    }

    return sessionIds;
  }

  async cleanup(maxAgeMs: number): Promise<number> {
    // Redis handles TTL-based expiration natively. This method provides
    // an additional sweep for sessions whose lastAccessedAt indicates
    // they are stale but whose Redis TTL has not yet expired (e.g., when
    // the TTL was set higher than the desired cleanup age).
    let client: RedisClient;
    try {
      client = await this.ensureClient();
    } catch {
      return 0;
    }

    const now = Date.now();
    let removed = 0;
    const pattern = `${this.keyPrefix}:session:*`;

    try {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = nextCursor;

        for (const key of keys) {
          try {
            const raw = await client.get(key);
            if (raw === null) continue;
            const data = JSON.parse(raw);
            if (now - data.lastAccessedAt > maxAgeMs) {
              await client.del(key);
              removed++;
            }
          } catch {
            // Skip keys that cannot be read or parsed
          }
        }
      } while (cursor !== "0");
    } catch {
      // Return whatever we managed to clean
    }

    return removed;
  }

  /**
   * Gracefully close the Redis connection.
   * Call this during server shutdown for clean resource release.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        // Best-effort shutdown
      }
      this.client = null;
      this.connectPromise = null;
    }
  }

  /**
   * Get the configured Redis URL. Useful for testing.
   */
  getUrl(): string {
    return this.url;
  }

  /**
   * Get the configured key prefix. Useful for testing.
   */
  getKeyPrefix(): string {
    return this.keyPrefix;
  }

  /**
   * Get the configured TTL in milliseconds. Useful for testing.
   */
  getTtlMs(): number {
    return this.ttlMs;
  }
}
