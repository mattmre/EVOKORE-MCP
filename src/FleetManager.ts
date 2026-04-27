// @AI:NAV[SEC:imports] imports and types
import { spawn, execFileSync, ChildProcess } from "child_process";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
// @AI:NAV[END:imports]

// @AI:NAV[SEC:types] FleetEntry, FleetStatus types
export type FleetStatus = "running" | "claimed" | "released";

export interface FleetEntry {
  pid: number;
  pgid?: number;
  resource?: string;
  status: FleetStatus;
  spawnedAt: number;
}

export interface FleetEntryWithId extends FleetEntry {
  agentId: string;
  alive: boolean;
}

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};
// @AI:NAV[END:types]

// @AI:NAV[SEC:killtree] Platform-aware killTree helper
/**
 * Kill a process and its entire child tree in a platform-aware way.
 *
 *  - On Windows, uses `taskkill /F /T /PID` which walks child processes by
 *    parent-PID and force-terminates the whole tree.
 *  - On POSIX, signals the negative PGID (`-pgid`) with SIGKILL, which
 *    requires the child to have been spawned with `detached: true` so that
 *    Node gave it its own process group.
 *
 * Silent on error; a missing PID is not a failure mode for release/stop.
 */
export function killTree(pid: number, pgid?: number): void {
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
      });
    } else {
      if (pgid && pgid > 0) {
        process.kill(-pgid, "SIGKILL");
      } else {
        process.kill(pid, "SIGKILL");
      }
    }
  } catch {
    // ignore — process may already be dead, or we lost the race
  }
}
// @AI:NAV[END:killtree]

// @AI:NAV[SEC:liveness] Process liveness probe
/**
 * Returns true if the PID appears to be a live process. Uses signal 0
 * which performs the permission check without actually sending a signal.
 * ESRCH means "no such process"; any other error (e.g. EPERM) still
 * indicates a live process we just cannot signal.
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    if (err && err.code === "ESRCH") {
      return false;
    }
    return true;
  }
}
// @AI:NAV[END:liveness]

// @AI:NAV[SEC:panel-concurrency] Wave 0d-f panel concurrency cap
/**
 * Wave 0d-f — resolve the panel concurrency cap.
 *
 * Defaults to 5 concurrent in-flight `fleet_spawn` operations. Operators
 * can override via EVOKORE_PANEL_MAX_CONCURRENCY, clamped to [1, 50].
 * Non-numeric / out-of-range values fall back to the default rather
 * than silently disabling the cap.
 */
export function resolvePanelMaxConcurrency(): number {
  const raw = parseInt(process.env.EVOKORE_PANEL_MAX_CONCURRENCY || "", 10);
  if (!Number.isFinite(raw)) return 5;
  if (raw < 1) return 1;
  if (raw > 50) return 50;
  return raw;
}
// @AI:NAV[END:panel-concurrency]

// @AI:NAV[SEC:class] FleetManager class
/**
 * FleetManager tracks spawned child processes (agents/workers) and
 * exposes fleet_* MCP tools for spawning, claiming resources, releasing
 * (kill-tree), and querying fleet status.
 *
 * Identifiers are monotonically increasing `FA-NNN` strings.
 */
export class FleetManager {
  private agents: Map<string, FleetEntry> = new Map();
  private nextId = 1;
  private started = false;

  // Wave 0d-f — concurrency cap state.
  // `inFlight` counts agents whose spawn slot has been acquired but not
  // yet released. `pendingSpawnQueue` holds resolvers for spawn requests
  // currently blocked on the semaphore — drained FIFO by
  // `releaseSpawnSlot()`. `slotHolders` tracks which agentIds have an
  // outstanding slot so we can guarantee exactly-once release on
  // fleet_release / stop().
  private maxConcurrency: number = resolvePanelMaxConcurrency();
  private inFlight: number = 0;
  private pendingSpawnQueue: Array<() => void> = [];
  private slotHolders: Set<string> = new Set();

  /** Reserved for future lifecycle work (e.g. sweeper, reaper). */
  start(): void {
    this.started = true;
  }

  /** Force-release every non-released fleet member and clear the map. */
  stop(): void {
    for (const [, entry] of this.agents) {
      if (entry.status === "released") continue;
      killTree(entry.pid, entry.pgid);
      entry.status = "released";
    }
    this.agents.clear();
    this.started = false;
    // Wave 0d-f — drain any spawn requests that were still queued so
    // their callers do not deadlock waiting on a slot.
    const drained = this.pendingSpawnQueue.splice(0);
    for (const resolve of drained) {
      try {
        resolve();
      } catch {
        /* ignore */
      }
    }
    this.inFlight = 0;
    this.slotHolders.clear();
  }

  /**
   * Wave 0d-f — diagnostic snapshot of the concurrency state. Exposed
   * for tests + future ops surfaces. Does not mutate.
   */
  getConcurrencyState(): {
    max: number;
    inFlight: number;
    queued: number;
  } {
    return {
      max: this.maxConcurrency,
      inFlight: this.inFlight,
      queued: this.pendingSpawnQueue.length
    };
  }

  /**
   * Wave 0d-f — test-only override for the concurrency cap. Production
   * code reads `EVOKORE_PANEL_MAX_CONCURRENCY` at construction time and
   * does not mutate the cap at runtime. Tests use this to drive
   * deterministic semaphore behavior without touching env vars.
   */
  setMaxConcurrencyForTests(cap: number): void {
    if (typeof cap !== "number" || !Number.isFinite(cap) || cap < 1) return;
    this.maxConcurrency = Math.min(50, Math.floor(cap));
    // Drain any waiters that the new (possibly larger) cap allows.
    while (
      this.inFlight < this.maxConcurrency &&
      this.pendingSpawnQueue.length > 0
    ) {
      const resolve = this.pendingSpawnQueue.shift()!;
      this.inFlight++;
      resolve();
    }
  }

  /**
   * Wave 0d-f — acquire a spawn slot. Resolves immediately when
   * `inFlight < maxConcurrency`, otherwise queues a resolver that will
   * fire FIFO once a slot is freed by `releaseSpawnSlot()`.
   */
  private acquireSpawnSlot(): Promise<void> {
    if (this.inFlight < this.maxConcurrency) {
      this.inFlight++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.pendingSpawnQueue.push(() => {
        // inFlight is incremented here (not by the caller) so the
        // semaphore stays accurate even if the awaiter races with stop().
        resolve();
      });
    });
  }

  /**
   * Wave 0d-f — release a spawn slot. Called once per `fleet_release`
   * (or once per spawn-failure path). Drains the next waiter FIFO when
   * the cap allows.
   */
  private releaseSpawnSlot(): void {
    if (this.inFlight > 0) this.inFlight--;
    if (
      this.inFlight < this.maxConcurrency &&
      this.pendingSpawnQueue.length > 0
    ) {
      const resolve = this.pendingSpawnQueue.shift()!;
      this.inFlight++;
      resolve();
    }
  }

  /** Test / introspection helper: snapshot of the internal map. */
  getAgents(): Map<string, FleetEntry> {
    return this.agents;
  }

  private nextAgentId(): string {
    const id = `FA-${String(this.nextId).padStart(3, "0")}`;
    this.nextId += 1;
    return id;
  }

  private spawnChild(
    command: string,
    args: string[]
  ): { pid: number; pgid?: number } {
    const isWin = process.platform === "win32";
    const child: ChildProcess = spawn(command, args, {
      detached: !isWin,
      stdio: "ignore",
      windowsHide: true,
    });
    if (typeof child.pid !== "number") {
      throw new Error("spawn returned no pid");
    }
    // On POSIX with detached: true, the child leads a new process group
    // whose PGID equals its PID. On Windows, pgid stays undefined.
    const pgid = isWin ? undefined : child.pid;
    // Detach so the parent does not wait on this child.
    try {
      child.unref();
    } catch {
      /* ignore */
    }
    return { pid: child.pid, pgid };
  }

  // ---- MCP tool surface ----

  getTools(): Tool[] {
    return [
      {
        name: "fleet_spawn",
        description:
          "Spawn a child process and register it in the fleet. Returns an agentId (FA-NNN) and the child pid. On POSIX the child is detached into its own process group so the whole tree can be killed later.",
        inputSchema: {
          type: "object" as const,
          properties: {
            command: {
              type: "string",
              description: "Executable path to spawn",
            },
            args: {
              type: "array",
              items: { type: "string" },
              description: "Arguments",
            },
            resource: {
              type: "string",
              description: "Resource to claim (optional)",
            },
          },
          required: ["command"],
        },
        annotations: {
          title: "Spawn Fleet Agent",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "fleet_claim",
        description:
          "Associate a running fleet agent with a resource name and mark it claimed.",
        inputSchema: {
          type: "object" as const,
          properties: {
            agentId: { type: "string" },
            resource: { type: "string" },
          },
          required: ["agentId", "resource"],
        },
        annotations: {
          title: "Claim Fleet Resource",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "fleet_release",
        description:
          "Kill a fleet agent's process tree and mark it released. Uses taskkill on Windows and process-group SIGKILL on POSIX.",
        inputSchema: {
          type: "object" as const,
          properties: {
            agentId: { type: "string" },
          },
          required: ["agentId"],
        },
        annotations: {
          title: "Release Fleet Agent",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "fleet_status",
        description:
          "Return the status and liveness of a single fleet agent (when agentId is provided) or of every registered agent.",
        inputSchema: {
          type: "object" as const,
          properties: {
            agentId: {
              type: "string",
              description: "If omitted, return all entries",
            },
          },
          required: [],
        },
        annotations: {
          title: "Fleet Status",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      } as Tool,
    ];
  }

  isFleetTool(name: string): boolean {
    return (
      name === "fleet_spawn" ||
      name === "fleet_claim" ||
      name === "fleet_release" ||
      name === "fleet_status"
    );
  }

  async handleTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    try {
      if (toolName === "fleet_spawn") return await this.handleSpawn(args);
      if (toolName === "fleet_claim") return this.handleClaim(args);
      if (toolName === "fleet_release") return this.handleRelease(args);
      if (toolName === "fleet_status") return this.handleStatus(args);
      return errorResult(`Unknown fleet tool: ${toolName}`);
    } catch (err: any) {
      return errorResult(err?.message || String(err));
    }
  }

  private async handleSpawn(args: Record<string, unknown>): Promise<ToolResult> {
    const command = args?.command;
    if (typeof command !== "string" || command.length === 0) {
      return errorResult("Missing required argument: command");
    }
    const rawArgs = args?.args;
    const childArgs = Array.isArray(rawArgs)
      ? rawArgs.filter((a) => typeof a === "string").map(String)
      : [];
    const resourceRaw = args?.resource;
    const resource =
      typeof resourceRaw === "string" && resourceRaw.length > 0
        ? resourceRaw
        : undefined;

    // Wave 0d-f — acquire the spawn slot before spinning up a child.
    // This bounds the in-flight panel to `EVOKORE_PANEL_MAX_CONCURRENCY`
    // (default 5) and queues additional spawns FIFO.
    await this.acquireSpawnSlot();

    let pid: number;
    let pgid: number | undefined;
    try {
      const result = this.spawnChild(command, childArgs);
      pid = result.pid;
      pgid = result.pgid;
    } catch (err) {
      // Spawn failed before the child existed — release the slot
      // immediately so we do not leak a token.
      this.releaseSpawnSlot();
      throw err;
    }

    const agentId = this.nextAgentId();
    const entry: FleetEntry = {
      pid,
      pgid,
      resource,
      status: resource ? "claimed" : "running",
      spawnedAt: Date.now(),
    };
    this.agents.set(agentId, entry);
    // Track the slot holder so fleet_release / stop() can release
    // exactly once per spawn even across error paths.
    this.slotHolders.add(agentId);

    return jsonResult({
      agentId,
      pid,
      status: entry.status,
      resource: entry.resource ?? null,
    });
  }

  private handleClaim(args: Record<string, unknown>): ToolResult {
    const agentId = args?.agentId;
    const resource = args?.resource;
    if (typeof agentId !== "string" || agentId.length === 0) {
      return errorResult("Missing required argument: agentId");
    }
    if (typeof resource !== "string" || resource.length === 0) {
      return errorResult("Missing required argument: resource");
    }
    const entry = this.agents.get(agentId);
    if (!entry) {
      return errorResult(`Unknown agentId: ${agentId}`);
    }
    if (entry.status === "released") {
      return errorResult(`Cannot claim released agent: ${agentId}`);
    }
    entry.resource = resource;
    entry.status = "claimed";
    return jsonResult({ agentId, resource, status: "claimed" });
  }

  private handleRelease(args: Record<string, unknown>): ToolResult {
    const agentId = args?.agentId;
    if (typeof agentId !== "string" || agentId.length === 0) {
      return errorResult("Missing required argument: agentId");
    }
    const entry = this.agents.get(agentId);
    if (!entry) {
      return errorResult(`Unknown agentId: ${agentId}`);
    }
    killTree(entry.pid, entry.pgid);
    entry.status = "released";
    const releasedResource = entry.resource;
    entry.resource = undefined;
    // Wave 0d-f — release the spawn slot exactly once. Tracking via
    // `slotHolders` guards against double-release on repeated
    // fleet_release calls for the same agentId.
    if (this.slotHolders.has(agentId)) {
      this.slotHolders.delete(agentId);
      this.releaseSpawnSlot();
    }
    return jsonResult({
      agentId,
      status: "released",
      resource: releasedResource ?? null,
    });
  }

  private handleStatus(args: Record<string, unknown>): ToolResult {
    const agentIdRaw = args?.agentId;
    if (typeof agentIdRaw === "string" && agentIdRaw.length > 0) {
      const entry = this.agents.get(agentIdRaw);
      if (!entry) {
        return errorResult(`Unknown agentId: ${agentIdRaw}`);
      }
      return jsonResult(this.snapshot(agentIdRaw, entry));
    }
    const list: FleetEntryWithId[] = [];
    for (const [id, entry] of this.agents) {
      list.push(this.snapshot(id, entry));
    }
    return jsonResult({ count: list.length, agents: list });
  }

  private snapshot(agentId: string, entry: FleetEntry): FleetEntryWithId {
    return {
      agentId,
      pid: entry.pid,
      pgid: entry.pgid,
      resource: entry.resource,
      status: entry.status,
      spawnedAt: entry.spawnedAt,
      alive: entry.status === "released" ? false : isAlive(entry.pid),
    };
  }
}
// @AI:NAV[END:class]

function jsonResult(payload: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function errorResult(message: string): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
