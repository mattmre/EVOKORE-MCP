/**
 * FileSessionStore — File-based session store implementation.
 *
 * Stores each session as a JSON file in a configurable directory
 * (default: ~/.evokore/session-store/). Suitable for single-node
 * persistence without external dependencies like Redis.
 *
 * Each session is stored as {sessionId}.json. Serialization handles
 * Set and Map conversion via the shared serialize/deserialize helpers.
 *
 * All I/O uses fs.promises for async operation.
 */

import fs from "fs/promises";
import path from "path";
import os from "os";

import type { SessionState } from "../SessionIsolation";
import type { SessionStore } from "../SessionStore";
import { serializeSessionState, deserializeSessionState } from "../SessionStore";

const DEFAULT_STORE_DIR = path.join(os.homedir(), ".evokore", "session-store");

export interface FileSessionStoreOptions {
  /** Directory to store session JSON files. Defaults to ~/.evokore/session-store/ */
  directory?: string;
}

export class FileSessionStore implements SessionStore {
  private directory: string;
  private initialized: boolean = false;
  private writeChains: Map<string, Promise<void>> = new Map();

  constructor(options?: FileSessionStoreOptions) {
    this.directory = options?.directory ?? DEFAULT_STORE_DIR;
  }

  /**
   * Ensure the storage directory exists. Called lazily on first write.
   */
  private async ensureDir(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.directory, { recursive: true });
    this.initialized = true;
  }

  private sessionFilePath(sessionId: string): string {
    // Sanitize session ID to be filesystem-safe (replace non-alphanumeric except hyphens/underscores)
    const safeName = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.directory, `${safeName}.json`);
  }

  private tempFilePath(filePath: string): string {
    const uniqueSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${filePath}.${uniqueSuffix}.tmp`;
  }

  async get(sessionId: string): Promise<SessionState | undefined> {
    const filePath = this.sessionFilePath(sessionId);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      return deserializeSessionState(data);
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return undefined;
      }
      throw err;
    }
  }

  async set(sessionId: string, state: SessionState): Promise<void> {
    await this.ensureDir();
    const filePath = this.sessionFilePath(sessionId);
    const serialized = serializeSessionState(state);
    const content = JSON.stringify(serialized, null, 2);

    const writeOperation = async (): Promise<void> => {
      // Use a unique temp file per write so overlapping persists do not race on the same .tmp path.
      const tmpPath = this.tempFilePath(filePath);
      await fs.writeFile(tmpPath, content, "utf-8");
      await fs.rename(tmpPath, filePath);
    };

    const previousWrite = this.writeChains.get(filePath) ?? Promise.resolve();
    const currentWrite = previousWrite
      .catch(() => {})
      .then(writeOperation);

    this.writeChains.set(filePath, currentWrite);

    try {
      await currentWrite;
    } finally {
      if (this.writeChains.get(filePath) === currentWrite) {
        this.writeChains.delete(filePath);
      }
    }
  }

  async delete(sessionId: string): Promise<void> {
    const filePath = this.sessionFilePath(sessionId);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code === "ENOENT") {
        // Already gone, that is fine
      } else {
        throw err;
      }
    } finally {
      this.writeChains.delete(filePath);
    }
  }

  async list(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.directory);
      return entries
        .filter((entry) => entry.endsWith(".json") && !entry.endsWith(".tmp"))
        .map((entry) => {
          // Read the actual sessionId from inside the file would be costly;
          // instead strip the .json extension (this matches the sanitized name).
          // For correct round-trip, we read the file to get the real sessionId.
          return entry.slice(0, -5);
        });
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  async cleanup(maxAgeMs: number): Promise<number> {
    const now = Date.now();
    let removed = 0;

    let entries: string[];
    try {
      entries = await fs.readdir(this.directory);
    } catch (err: any) {
      if (err.code === "ENOENT") return 0;
      throw err;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".json") || entry.endsWith(".tmp")) continue;

      const filePath = path.join(this.directory, entry);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const data = JSON.parse(content);
        if ((now - data.lastAccessedAt) > maxAgeMs) {
          await fs.unlink(filePath);
          removed++;
        }
      } catch {
        // Skip files that cannot be read or parsed
      }
    }

    return removed;
  }

  /**
   * Get the configured storage directory path. Useful for testing.
   */
  getDirectory(): string {
    return this.directory;
  }
}
