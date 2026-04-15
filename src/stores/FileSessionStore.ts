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
import { resolveTenantSessionDir } from "../SessionIsolation";
import type { SessionStore } from "../SessionStore";
import { serializeSessionState, deserializeSessionState } from "../SessionStore";

const DEFAULT_STORE_DIR = path.join(os.homedir(), ".evokore", "session-store");

export interface FileSessionStoreOptions {
  /**
   * Directory to store session JSON files. Defaults to ~/.evokore/session-store/.
   * When `EVOKORE_TENANT_SCOPING=true` and a session carries a `tenantId`,
   * writes are redirected to `{EVOKORE_HOME}/tenants/{tenantId}/sessions/`
   * instead. The configured `directory` remains the legacy/default read path.
   */
  directory?: string;
}

export class FileSessionStore implements SessionStore {
  private directory: string;
  private initialized: boolean = false;
  private fileOps: Map<string, Promise<void>> = new Map();

  constructor(options?: FileSessionStoreOptions) {
    this.directory = options?.directory ?? DEFAULT_STORE_DIR;
  }

  /**
   * Ensure the storage directory exists. Called lazily on first write.
   */
  private async ensureDir(dir: string = this.directory): Promise<void> {
    if (dir === this.directory && this.initialized) return;
    await fs.mkdir(dir, { recursive: true });
    if (dir === this.directory) {
      this.initialized = true;
    }
  }

  private safeSessionName(sessionId: string): string {
    // Sanitize session ID to be filesystem-safe (replace non-alphanumeric except hyphens/underscores)
    return sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  private sessionFilePath(sessionId: string): string {
    return path.join(this.directory, `${this.safeSessionName(sessionId)}.json`);
  }

  /**
   * Resolve the concrete file path for a session, honoring tenant scoping.
   * When `EVOKORE_TENANT_SCOPING=true` and `tenantId` is set, the file lives
   * under `{EVOKORE_HOME}/tenants/{tenantId}/sessions/`. Otherwise the
   * configured flat `directory` is used.
   */
  private tenantSessionFilePath(sessionId: string, tenantId?: string): string {
    const safeName = this.safeSessionName(sessionId);
    if (process.env.EVOKORE_TENANT_SCOPING === "true" && tenantId) {
      return path.join(resolveTenantSessionDir(tenantId), `${safeName}.json`);
    }
    return path.join(this.directory, `${safeName}.json`);
  }

  private tempFilePath(filePath: string): string {
    const uniqueSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${filePath}.${uniqueSuffix}.tmp`;
  }

  private async waitForPendingFileOp(filePath: string): Promise<void> {
    const pending = this.fileOps.get(filePath);
    if (pending) {
      await pending.catch(() => {});
    }
  }

  private async queueFileOp(filePath: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.fileOps.get(filePath) ?? Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(operation);

    this.fileOps.set(filePath, current);

    try {
      await current;
    } finally {
      if (this.fileOps.get(filePath) === current) {
        this.fileOps.delete(filePath);
      }
    }
  }

  /**
   * Read a session file and return its deserialized state, or `undefined`
   * when the file is missing. Non-ENOENT errors surface to the caller.
   */
  private async readSessionFile(filePath: string): Promise<SessionState | undefined> {
    await this.waitForPendingFileOp(filePath);
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

  async get(sessionId: string): Promise<SessionState | undefined> {
    // Fast path: legacy/default flat directory first so single-operator
    // deployments are untouched.
    const flatPath = this.sessionFilePath(sessionId);
    const flat = await this.readSessionFile(flatPath);
    if (flat) return flat;

    // Fallback: when tenant scoping is enabled, scan tenant subdirs for the
    // sessionId. This supports reload after process restart when we do not
    // yet know which tenant owns the session id.
    if (process.env.EVOKORE_TENANT_SCOPING === "true") {
      const tenantsRoot = path.join(
        process.env.EVOKORE_HOME ?? path.join(os.homedir(), ".evokore"),
        "tenants"
      );
      let tenantDirs: string[];
      try {
        tenantDirs = await fs.readdir(tenantsRoot);
      } catch (err: any) {
        if (err.code === "ENOENT") return undefined;
        throw err;
      }

      const safeName = this.safeSessionName(sessionId);
      for (const tenantDir of tenantDirs) {
        const candidate = path.join(tenantsRoot, tenantDir, "sessions", `${safeName}.json`);
        const found = await this.readSessionFile(candidate);
        if (found) return found;
      }
    }

    return undefined;
  }

  async set(sessionId: string, state: SessionState): Promise<void> {
    const filePath = this.tenantSessionFilePath(sessionId, state.tenantId);
    const targetDir = path.dirname(filePath);
    const serialized = serializeSessionState(state);
    const content = JSON.stringify(serialized, null, 2);

    await this.queueFileOp(filePath, async () => {
      await this.ensureDir(targetDir);
      // Use a unique temp file per write so overlapping persists do not race on the same .tmp path.
      const tmpPath = this.tempFilePath(filePath);
      await fs.writeFile(tmpPath, content, "utf-8");
      await fs.rename(tmpPath, filePath);
    });
  }

  async delete(sessionId: string): Promise<void> {
    // Delete from flat dir plus any tenant-scoped copy. Both are ENOENT-safe.
    const targets: string[] = [this.sessionFilePath(sessionId)];

    if (process.env.EVOKORE_TENANT_SCOPING === "true") {
      const tenantsRoot = path.join(
        process.env.EVOKORE_HOME ?? path.join(os.homedir(), ".evokore"),
        "tenants"
      );
      let tenantDirs: string[] = [];
      try {
        tenantDirs = await fs.readdir(tenantsRoot);
      } catch (err: any) {
        if (err.code !== "ENOENT") throw err;
      }

      const safeName = this.safeSessionName(sessionId);
      for (const tenantDir of tenantDirs) {
        targets.push(path.join(tenantsRoot, tenantDir, "sessions", `${safeName}.json`));
      }
    }

    for (const filePath of targets) {
      await this.queueFileOp(filePath, async () => {
        try {
          await fs.unlink(filePath);
        } catch (err: any) {
          if (err.code === "ENOENT") {
            // Already gone, that is fine
            return;
          }
          throw err;
        }
      });
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
        await this.queueFileOp(filePath, async () => {
          const content = await fs.readFile(filePath, "utf-8");
          const data = JSON.parse(content);
          if ((now - data.lastAccessedAt) > maxAgeMs) {
            await fs.unlink(filePath);
            removed++;
          }
        });
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
