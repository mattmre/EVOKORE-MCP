import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

const DEFAULT_CLAIMS_DIR = path.join(os.homedir(), ".evokore", ".claims");
const DEFAULT_TTL_MS = 30_000;

export interface Claim {
  resource: string;
  agentId: string;
  pid: number;
  acquired: string;
  ttlMs: number;
  expiresAt: string;
}

export interface ClaimWithStatus extends Claim {
  expired: boolean;
  processDead: boolean;
}

export interface SweepResult {
  swept: number;
  alive: number;
}

/**
 * ClaimsManager provides an exclusive-claim primitive backed by sentinel files
 * under `~/.evokore/.claims/`. Each claim is a `{sha1(resource)}.lock` file
 * created atomically via `fs.promises.open(path, 'wx')`.
 *
 * Operations:
 *  - acquire: atomically create a lock (auto-cleans stale/dead-PID claims)
 *  - release: remove our own lock (idempotent, checks agent ownership)
 *  - list: list all current claims with staleness metadata
 *  - sweep: remove expired and dead-PID claims
 */
export class ClaimsManager {
  private readonly claimsDir: string;

  constructor(claimsDir: string = DEFAULT_CLAIMS_DIR) {
    this.claimsDir = claimsDir;
  }

  getClaimsDir(): string {
    return this.claimsDir;
  }

  private claimPathFor(resource: string): string {
    const hash = crypto.createHash("sha1").update(resource).digest("hex");
    return path.join(this.claimsDir, `${hash}.lock`);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.claimsDir, { recursive: true });
  }

  private isProcessAlive(pid: number): boolean {
    if (!Number.isFinite(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      // ESRCH = no such process (dead). EPERM = process exists but we can't signal it (alive).
      if (err && err.code === "EPERM") return true;
      return false;
    }
  }

  private isExpired(claim: Claim, now: number = Date.now()): boolean {
    const exp = Date.parse(claim.expiresAt);
    if (!Number.isFinite(exp)) return true;
    return exp < now;
  }

  private async readClaimFile(claimPath: string): Promise<Claim | null> {
    try {
      const raw = await fs.readFile(claimPath, "utf8");
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.resource === "string" &&
        typeof parsed.agentId === "string" &&
        typeof parsed.pid === "number" &&
        typeof parsed.acquired === "string" &&
        typeof parsed.ttlMs === "number" &&
        typeof parsed.expiresAt === "string"
      ) {
        return parsed as Claim;
      }
      return null;
    } catch {
      return null;
    }
  }

  async acquire(resource: string, agentId: string, ttlMs: number = DEFAULT_TTL_MS): Promise<Claim> {
    if (!resource || typeof resource !== "string") {
      throw new Error("acquire: 'resource' must be a non-empty string");
    }
    if (!agentId || typeof agentId !== "string") {
      throw new Error("acquire: 'agentId' must be a non-empty string");
    }
    const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;

    await this.ensureDir();
    const claimPath = this.claimPathFor(resource);

    // Attempt exclusive create; if it fails with EEXIST, inspect staleness and retry once.
    for (let attempt = 0; attempt < 2; attempt++) {
      let handle: fs.FileHandle | null = null;
      try {
        handle = await fs.open(claimPath, "wx");
        const now = new Date();
        const claim: Claim = {
          resource,
          agentId,
          pid: process.pid,
          acquired: now.toISOString(),
          ttlMs: ttl,
          expiresAt: new Date(now.getTime() + ttl).toISOString(),
        };
        await handle.writeFile(JSON.stringify(claim), { encoding: "utf8" });
        return claim;
      } catch (err: any) {
        if (err && err.code === "EEXIST") {
          // Inspect the existing claim; if stale, clean it up and retry.
          const existing = await this.readClaimFile(claimPath);
          if (!existing) {
            // Unparseable claim file — treat as stale.
            try { await fs.unlink(claimPath); } catch { /* ignore */ }
            continue;
          }
          const expired = this.isExpired(existing);
          const dead = !this.isProcessAlive(existing.pid);
          if (expired || dead) {
            try { await fs.unlink(claimPath); } catch { /* ignore */ }
            continue;
          }
          throw new Error(
            `Resource '${resource}' is already claimed by agent '${existing.agentId}' (pid ${existing.pid}, expires ${existing.expiresAt})`
          );
        }
        throw err;
      } finally {
        if (handle) {
          try { await handle.close(); } catch { /* ignore */ }
        }
      }
    }
    throw new Error(`Failed to acquire claim for '${resource}' after retry`);
  }

  async release(resource: string, agentId: string): Promise<boolean> {
    const claimPath = this.claimPathFor(resource);
    const existing = await this.readClaimFile(claimPath);
    if (!existing) return false;
    if (existing.agentId !== agentId && !this.isExpired(existing)) {
      return false;
    }
    try {
      await fs.unlink(claimPath);
      return true;
    } catch (err: any) {
      if (err && err.code === "ENOENT") return false;
      throw err;
    }
  }

  async list(): Promise<ClaimWithStatus[]> {
    await this.ensureDir();
    let entries: string[];
    try {
      entries = await fs.readdir(this.claimsDir);
    } catch {
      return [];
    }
    const now = Date.now();
    const claims: ClaimWithStatus[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".lock")) continue;
      const full = path.join(this.claimsDir, entry);
      const claim = await this.readClaimFile(full);
      if (!claim) continue;
      claims.push({
        ...claim,
        expired: this.isExpired(claim, now),
        processDead: !this.isProcessAlive(claim.pid),
      });
    }
    return claims;
  }

  async sweep(): Promise<SweepResult> {
    await this.ensureDir();
    let entries: string[];
    try {
      entries = await fs.readdir(this.claimsDir);
    } catch {
      return { swept: 0, alive: 0 };
    }
    const now = Date.now();
    let swept = 0;
    let alive = 0;
    for (const entry of entries) {
      if (!entry.endsWith(".lock")) continue;
      const full = path.join(this.claimsDir, entry);
      const claim = await this.readClaimFile(full);
      if (!claim) {
        // Corrupt/unparseable — sweep it.
        try { await fs.unlink(full); swept++; } catch { /* ignore */ }
        continue;
      }
      const expired = this.isExpired(claim, now);
      const dead = !this.isProcessAlive(claim.pid);
      if (expired || dead) {
        try {
          await fs.unlink(full);
          swept++;
        } catch {
          // Raced unlink — still counts as swept.
          swept++;
        }
      } else {
        alive++;
      }
    }
    return { swept, alive };
  }

  // ---- MCP tool surface ----

  getTools(): Tool[] {
    return [
      {
        name: "claim_acquire",
        description:
          "Acquire an exclusive resource claim. Use when an agent needs to lock a resource for exclusive use (file, task, dataset). Returns the claim or error if already held.",
        inputSchema: {
          type: "object" as const,
          properties: {
            resource: {
              type: "string",
              description: "Arbitrary resource identifier (e.g. 'file:/abs/path' or 'agent:task-id')",
            },
            agentId: {
              type: "string",
              description: "Identifier of the agent acquiring the claim",
            },
            ttlMs: {
              type: "number",
              description: "Time-to-live in milliseconds (default 30000)",
              default: DEFAULT_TTL_MS,
            },
          },
          required: ["resource", "agentId"],
        },
        annotations: {
          title: "Acquire Resource Claim",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "claim_release",
        description:
          "Release a resource claim held by an agent. Idempotent -- returns false if claim not found or not owned.",
        inputSchema: {
          type: "object" as const,
          properties: {
            resource: {
              type: "string",
              description: "Resource identifier that was used to acquire the claim",
            },
            agentId: {
              type: "string",
              description: "Identifier of the agent that owns the claim",
            },
          },
          required: ["resource", "agentId"],
        },
        annotations: {
          title: "Release Resource Claim",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "claim_list",
        description:
          "List all active resource claims. Read-only. Returns array of claims with staleness info (expired, processDead).",
        inputSchema: {
          type: "object" as const,
          properties: {},
          required: [],
        },
        annotations: {
          title: "List Resource Claims",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "claim_sweep",
        description:
          "Sweep and remove expired or dead-process claims. Destructive. Returns count of swept vs alive claims.",
        inputSchema: {
          type: "object" as const,
          properties: {},
          required: [],
        },
        annotations: {
          title: "Sweep Stale Claims",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
    ];
  }

  isClaimTool(name: string): boolean {
    return (
      name === "claim_acquire" ||
      name === "claim_release" ||
      name === "claim_list" ||
      name === "claim_sweep"
    );
  }

  async handleToolCall(toolName: string, args: any): Promise<any> {
    try {
      if (toolName === "claim_acquire") {
        const resource: string = args?.resource;
        const agentId: string = args?.agentId;
        const ttlMs: number | undefined = typeof args?.ttlMs === "number" ? args.ttlMs : undefined;
        if (!resource || typeof resource !== "string") {
          return { isError: true, content: [{ type: "text", text: "Missing required argument: resource" }] };
        }
        if (!agentId || typeof agentId !== "string") {
          return { isError: true, content: [{ type: "text", text: "Missing required argument: agentId" }] };
        }
        const claim = await this.acquire(resource, agentId, ttlMs ?? DEFAULT_TTL_MS);
        return { content: [{ type: "text", text: JSON.stringify(claim, null, 2) }] };
      }

      if (toolName === "claim_release") {
        const resource: string = args?.resource;
        const agentId: string = args?.agentId;
        if (!resource || typeof resource !== "string") {
          return { isError: true, content: [{ type: "text", text: "Missing required argument: resource" }] };
        }
        if (!agentId || typeof agentId !== "string") {
          return { isError: true, content: [{ type: "text", text: "Missing required argument: agentId" }] };
        }
        const released = await this.release(resource, agentId);
        return { content: [{ type: "text", text: JSON.stringify({ released }, null, 2) }] };
      }

      if (toolName === "claim_list") {
        const claims = await this.list();
        return { content: [{ type: "text", text: JSON.stringify({ claims }, null, 2) }] };
      }

      if (toolName === "claim_sweep") {
        const result = await this.sweep();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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
