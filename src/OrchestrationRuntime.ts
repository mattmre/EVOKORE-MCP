// @AI:NAV[SEC:imports] imports and types
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FleetManager } from "./FleetManager";
import { ClaimsManager } from "./ClaimsManager";
// @AI:NAV[END:imports]

// @AI:NAV[SEC:types] AgentSpec, RunRecord types
export interface AgentSpec {
  command: string;
  args?: string[];
  resource?: string;
  agentLabel?: string;
  ttlMs?: number;
}

export type RunStatus =
  | "starting"
  | "running"
  | "degraded"
  | "stopping"
  | "stopped"
  | "error";

export interface RunAgentRecord {
  agentId: string;
  spec: AgentSpec;
  pid: number;
  claimedResource: string | null;
  lastAliveAt: number;
  loopSuspectSince: number | null;
  liveness: "alive" | "dead" | "unknown";
}

export interface RunRecord {
  runId: string;
  name: string;
  status: RunStatus;
  startedAt: number;
  stoppedAt: number | null;
  agents: RunAgentRecord[];
  degradedReasons: string[];
}

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

interface OrchestrationOptions {
  loopThresholdMs?: number;
  probeIntervalMs?: number;
  autoProbe?: boolean;
}
// @AI:NAV[END:types]

// @AI:NAV[SEC:class] OrchestrationRuntime class
/**
 * OrchestrationRuntime coordinates multi-agent runs backed by FleetManager
 * (process lifecycle) and ClaimsManager (resource locking). It exposes
 * `orchestration_start`, `orchestration_stop`, and `orchestration_status`
 * MCP tools, and implements AGT-013 loop detection: when a fleet agent
 * stops reporting liveness for longer than `loopThresholdMs`, the
 * containing run is flagged `degraded` with a reason string.
 *
 * Run identifiers are monotonically increasing `ORCH-NNN` strings.
 */
export class OrchestrationRuntime {
  private runs: Map<string, RunRecord> = new Map();
  private nextRunSeq = 1;
  private readonly loopThresholdMs: number;

  constructor(
    private readonly fleetManager: FleetManager,
    private readonly claimsManager: ClaimsManager,
    options?: OrchestrationOptions
  ) {
    this.loopThresholdMs =
      typeof options?.loopThresholdMs === "number" && options.loopThresholdMs > 0
        ? options.loopThresholdMs
        : 60_000;
    // probeIntervalMs / autoProbe are currently reserved for future use.
    void options?.probeIntervalMs;
    void options?.autoProbe;
  }

  /** Test / introspection helper: snapshot of the internal run map. */
  getRuns(): Map<string, RunRecord> {
    return this.runs;
  }

  private nextRunId(): string {
    const id = `ORCH-${String(this.nextRunSeq).padStart(3, "0")}`;
    this.nextRunSeq += 1;
    return id;
  }

  private parseJsonTextOrThrow(result: ToolResult, context: string): any {
    const text = result?.content?.[0]?.text;
    if (typeof text !== "string") {
      throw new Error(`${context}: missing text content in tool result`);
    }
    try {
      return JSON.parse(text);
    } catch (err: any) {
      throw new Error(`${context}: result not JSON-parseable: ${err?.message || err}`);
    }
  }

  /**
   * Start a new orchestrated run.
   *
   * Spawns each spec sequentially; if any spawn or resource claim fails,
   * the partial run is rolled back via `stopRun(runId)` and the error is
   * re-thrown to the caller.
   */
  async startRun(name: string, agentSpecs: AgentSpec[]): Promise<RunRecord> {
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("startRun: 'name' must be a non-empty string");
    }
    if (!Array.isArray(agentSpecs) || agentSpecs.length === 0) {
      throw new Error("startRun: 'agentSpecs' must be a non-empty array");
    }

    const runId = this.nextRunId();
    const record: RunRecord = {
      runId,
      name,
      status: "starting",
      startedAt: Date.now(),
      stoppedAt: null,
      agents: [],
      degradedReasons: [],
    };
    this.runs.set(runId, record);

    for (const spec of agentSpecs) {
      if (!spec || typeof spec.command !== "string" || spec.command.length === 0) {
        await this.stopRun(runId).catch(() => { /* best effort rollback */ });
        throw new Error("startRun: each agent spec must include a non-empty 'command'");
      }
      const spawnArgs: Record<string, unknown> = {
        command: spec.command,
        args: Array.isArray(spec.args) ? spec.args : [],
      };
      if (spec.resource) {
        spawnArgs.resource = spec.resource;
      }

      const spawnResult = await this.fleetManager.handleTool("fleet_spawn", spawnArgs);
      if (spawnResult.isError) {
        const msg = spawnResult.content?.[0]?.text || "fleet_spawn failed";
        await this.stopRun(runId).catch(() => { /* best effort */ });
        throw new Error(`startRun: fleet_spawn failed: ${msg}`);
      }

      const spawnPayload = this.parseJsonTextOrThrow(spawnResult, "fleet_spawn");
      const agentId = spawnPayload?.agentId;
      const pid = spawnPayload?.pid;
      if (typeof agentId !== "string" || typeof pid !== "number") {
        await this.stopRun(runId).catch(() => { /* best effort */ });
        throw new Error("startRun: fleet_spawn did not return agentId/pid");
      }

      let claimedResource: string | null = null;
      if (spec.resource) {
        try {
          await this.claimsManager.acquire(
            spec.resource,
            agentId,
            typeof spec.ttlMs === "number" ? spec.ttlMs : 30_000
          );
          claimedResource = spec.resource;
        } catch (err: any) {
          // Release the already-spawned fleet entry that failed to claim.
          await this.fleetManager
            .handleTool("fleet_release", { agentId })
            .catch(() => { /* best effort */ });
          await this.stopRun(runId).catch(() => { /* best effort */ });
          throw new Error(
            `startRun: claim acquire failed for '${spec.resource}': ${err?.message || err}`
          );
        }
      }

      record.agents.push({
        agentId,
        spec,
        pid,
        claimedResource,
        lastAliveAt: Date.now(),
        loopSuspectSince: null,
        liveness: "alive",
      });
    }

    record.status = "running";
    return record;
  }

  /**
   * Stop a run: release claims + kill fleet entries in parallel.
   * Returns the updated RunRecord, or a ToolResult-shaped error object
   * if the runId is unknown.
   */
  async stopRun(runId: string): Promise<RunRecord | ToolResult> {
    const run = this.runs.get(runId);
    if (!run) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown runId: ${runId}` }],
      };
    }
    if (run.status === "stopped") {
      return run;
    }
    run.status = "stopping";

    const tasks: Promise<unknown>[] = [];
    for (const agent of run.agents) {
      if (agent.claimedResource) {
        const resource = agent.claimedResource;
        const agentId = agent.agentId;
        tasks.push(
          this.claimsManager.release(resource, agentId).catch(() => false)
        );
      }
      const agentId = agent.agentId;
      tasks.push(
        this.fleetManager
          .handleTool("fleet_release", { agentId })
          .catch(() => ({ isError: true, content: [] }))
      );
    }
    await Promise.allSettled(tasks);

    run.status = "stopped";
    run.stoppedAt = Date.now();
    for (const agent of run.agents) {
      agent.liveness = "dead";
      agent.claimedResource = null;
    }
    return run;
  }

  /**
   * Return run status. If `runId` is provided, that run is probed and
   * returned; otherwise all runs are probed and returned as an array.
   */
  async statusRun(runId?: string): Promise<RunRecord | ToolResult | { runs: RunRecord[] }> {
    if (typeof runId === "string" && runId.length > 0) {
      const run = this.runs.get(runId);
      if (!run) {
        return {
          isError: true,
          content: [{ type: "text", text: `Unknown runId: ${runId}` }],
        };
      }
      await this.probeRun(run);
      return run;
    }
    await this.probeAll();
    return { runs: Array.from(this.runs.values()) };
  }

  /** AGT-013 loop detection: probe liveness of every agent in one run. */
  async probeRun(run: RunRecord): Promise<void> {
    if (run.status === "stopped" || run.status === "stopping") return;

    for (const agent of run.agents) {
      let statusResult: ToolResult;
      try {
        statusResult = await this.fleetManager.handleTool("fleet_status", {
          agentId: agent.agentId,
        });
      } catch {
        // Fail-open: treat probe errors as unknown liveness so we do not
        // spuriously mark the run degraded.
        agent.liveness = "unknown";
        continue;
      }

      if (statusResult?.isError) {
        agent.liveness = "unknown";
        continue;
      }

      let payload: any;
      try {
        payload = this.parseJsonTextOrThrow(statusResult, "fleet_status");
      } catch {
        agent.liveness = "unknown";
        continue;
      }

      const alive = payload?.alive === true;
      const fleetStatus = typeof payload?.status === "string" ? payload.status : undefined;

      if (alive) {
        agent.lastAliveAt = Date.now();
        agent.loopSuspectSince = null;
        agent.liveness = "alive";
        continue;
      }

      if (fleetStatus === "released") {
        agent.liveness = "dead";
        continue;
      }

      // alive === false and not released — candidate for loop detection.
      const delta = Date.now() - agent.lastAliveAt;
      if (delta > this.loopThresholdMs && agent.loopSuspectSince === null) {
        agent.loopSuspectSince = Date.now();
        run.degradedReasons.push(
          `${agent.agentId}: loop suspected (no liveness for ${delta}ms)`
        );
        if (run.status === "running") {
          run.status = "degraded";
        }
      }
      agent.liveness = "dead";
    }
  }

  /** Probe every run in the registry (sequentially). */
  async probeAll(): Promise<void> {
    for (const run of this.runs.values()) {
      await this.probeRun(run);
    }
  }

  // ---- MCP tool surface ----

  getTools(): Tool[] {
    return [
      {
        name: "orchestration_start",
        description:
          "Start a multi-agent orchestrated run. Spawns each agent spec via FleetManager and locks declared resources via ClaimsManager. Sequentially rolls back on any failure.",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: {
              type: "string",
              description: "Human-readable run name",
            },
            agents: {
              type: "array",
              description: "Array of AgentSpec objects (command, args?, resource?, agentLabel?, ttlMs?)",
              items: {
                type: "object",
                properties: {
                  command: { type: "string" },
                  args: { type: "array", items: { type: "string" } },
                  resource: { type: "string" },
                  agentLabel: { type: "string" },
                  ttlMs: { type: "number" },
                },
                required: ["command"],
              },
            },
          },
          required: ["name", "agents"],
        },
        annotations: {
          title: "Start Orchestrated Run",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "orchestration_stop",
        description:
          "Stop an orchestrated run. Releases every fleet agent's process tree and every held resource claim.",
        inputSchema: {
          type: "object" as const,
          properties: {
            runId: {
              type: "string",
              description: "Run identifier (ORCH-NNN)",
            },
          },
          required: ["runId"],
        },
        annotations: {
          title: "Stop Orchestrated Run",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "orchestration_status",
        description:
          "Return status for one run (when runId is provided) or all runs. Triggers a liveness probe which may flip a stalled run to 'degraded' per AGT-013.",
        inputSchema: {
          type: "object" as const,
          properties: {
            runId: {
              type: "string",
              description: "If omitted, return all runs",
            },
          },
          required: [],
        },
        annotations: {
          title: "Orchestration Status",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
    ];
  }

  isOrchestrationTool(name: string): boolean {
    return (
      name === "orchestration_start" ||
      name === "orchestration_stop" ||
      name === "orchestration_status"
    );
  }

  async handleTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    try {
      if (toolName === "orchestration_start") {
        const name = args?.name;
        const agents = args?.agents;
        if (typeof name !== "string" || name.length === 0) {
          return errorResult("Missing required argument: name");
        }
        if (!Array.isArray(agents) || agents.length === 0) {
          return errorResult("Missing required argument: agents (non-empty array)");
        }
        const record = await this.startRun(name, agents as AgentSpec[]);
        return jsonResult(record);
      }

      if (toolName === "orchestration_stop") {
        const runId = args?.runId;
        if (typeof runId !== "string" || runId.length === 0) {
          return errorResult("Missing required argument: runId");
        }
        const result = await this.stopRun(runId);
        if (isToolErrorResult(result)) return result;
        return jsonResult(result);
      }

      if (toolName === "orchestration_status") {
        const runIdRaw = args?.runId;
        const runId =
          typeof runIdRaw === "string" && runIdRaw.length > 0 ? runIdRaw : undefined;
        const result = await this.statusRun(runId);
        if (isToolErrorResult(result)) return result;
        return jsonResult(result);
      }

      return errorResult(`Unknown orchestration tool: ${toolName}`);
    } catch (err: any) {
      return errorResult(err?.message || String(err));
    }
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

function isToolErrorResult(value: unknown): value is ToolResult {
  return (
    !!value &&
    typeof value === "object" &&
    (value as ToolResult).isError === true &&
    Array.isArray((value as ToolResult).content)
  );
}
