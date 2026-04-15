// @AI:NAV[SEC:imports] Import declarations
import path from "path";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
// @AI:NAV[END:imports]

const ALLOWED_WORKER_TYPES = ["test_run", "repo_analysis", "security_scan", "benchmark"] as const;
type WorkerType = (typeof ALLOWED_WORKER_TYPES)[number];

// @AI:NAV[SEC:interface-workerstate] interface WorkerState
export interface WorkerState {
  workerId: string;
  workerScript: string;
  status: "pending" | "running" | "complete" | "error";
  startedAt: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
  options?: Record<string, unknown>;
}
// @AI:NAV[END:interface-workerstate]

/**
 * WorkerManager exposes two MCP tools that wrap the Node-side
 * `scripts/workers/worker-dispatcher.js` so background work (test runs,
 * repo analysis, security scans, benchmarks) can be kicked off from any
 * MCP client without blocking the request.
 *
 * - `worker_dispatch`: forks a worker, returns `{ workerId }` immediately.
 * - `worker_context`:  returns the latest persisted state for a workerId.
 *
 * State persists at `~/.evokore/workers/{sessionId}/{workerId}.json` and is
 * also surfaced into purpose-gate's `additionalContext` so the model sees
 * completed background results on subsequent prompts.
 */
// @AI:NAV[SEC:class-workermanager] class WorkerManager
export class WorkerManager {
  private dispatcherPath: string;

  constructor(dispatcherPath?: string) {
    // Resolve to scripts/workers/worker-dispatcher.js relative to repo root.
    // dist/ runs from `dist/`, so default needs `..` to climb out.
    this.dispatcherPath =
      dispatcherPath ?? path.resolve(__dirname, "..", "scripts", "workers", "worker-dispatcher.js");
  }

  getTools(): Tool[] {
    return [
      {
        name: "worker_dispatch",
        description:
          "Dispatch a background worker task (test_run, repo_analysis, security_scan, benchmark). Non-blocking -- returns immediately with { workerId }. Poll with worker_context to retrieve results.",
        inputSchema: {
          type: "object" as const,
          properties: {
            session_id: {
              type: "string",
              description: "Session identifier to scope the worker output to.",
            },
            worker_type: {
              type: "string",
              enum: [...ALLOWED_WORKER_TYPES],
              description:
                "Which worker script to run. test_run = vitest, repo_analysis = git status/log, security_scan = src/ pattern grep, benchmark = startup/CPU probe.",
            },
            options: {
              type: "object",
              description: "Optional worker-specific options forwarded via WORKER_OPTIONS env.",
              additionalProperties: true,
            },
          },
          required: ["session_id", "worker_type"],
        },
        annotations: {
          title: "Dispatch Background Worker",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "worker_context",
        description:
          "Get the current status and results of a dispatched worker. Returns the persisted state JSON: { workerId, workerScript, status: pending|running|complete|error, startedAt, completedAt?, result?, error? }.",
        inputSchema: {
          type: "object" as const,
          properties: {
            session_id: {
              type: "string",
              description: "Session identifier the worker was dispatched under.",
            },
            worker_id: {
              type: "string",
              description: "The workerId returned by worker_dispatch.",
            },
          },
          required: ["session_id", "worker_id"],
        },
        annotations: {
          title: "Get Worker Context",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
    ];
  }

  isWorkerTool(name: string): boolean {
    return name === "worker_dispatch" || name === "worker_context";
  }

  async handleToolCall(toolName: string, args: any): Promise<any> {
    try {
      if (toolName === "worker_dispatch") {
        return this.handleDispatch(args);
      }
      if (toolName === "worker_context") {
        return this.handleContext(args);
      }
      return null;
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: err?.message || String(err) }],
      };
    }
  }

  private loadDispatcher(): {
    dispatchWorker: (sessionId: string, workerType: string, options?: Record<string, unknown>) => { workerId: string };
    readWorkerState: (sessionId: string, workerId: string) => WorkerState | null;
  } {
    // Lazy require so unit tests can swap dispatcherPath before first call.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dispatcher = require(this.dispatcherPath);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const store = require(path.join(path.dirname(this.dispatcherPath), "worker-store.js"));
    return {
      dispatchWorker: dispatcher.dispatchWorker,
      readWorkerState: store.readWorkerState,
    };
  }

  private handleDispatch(args: any): any {
    const sessionId: string | undefined = args?.session_id;
    const workerType: WorkerType | string | undefined = args?.worker_type;
    const options: Record<string, unknown> | undefined = args?.options;

    if (!sessionId || typeof sessionId !== "string") {
      return { isError: true, content: [{ type: "text", text: "Missing required argument: session_id" }] };
    }
    if (!workerType || typeof workerType !== "string") {
      return { isError: true, content: [{ type: "text", text: "Missing required argument: worker_type" }] };
    }
    if (!ALLOWED_WORKER_TYPES.includes(workerType as WorkerType)) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Unknown worker_type '${workerType}'. Allowed: ${ALLOWED_WORKER_TYPES.join(", ")}.`,
          },
        ],
      };
    }

    const { dispatchWorker } = this.loadDispatcher();
    const { workerId } = dispatchWorker(sessionId, workerType, options || {});

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              workerId,
              workerType,
              sessionId,
              status: "pending",
              hint: "Poll worker_context with this workerId to read the result.",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private handleContext(args: any): any {
    const sessionId: string | undefined = args?.session_id;
    const workerId: string | undefined = args?.worker_id;

    if (!sessionId || typeof sessionId !== "string") {
      return { isError: true, content: [{ type: "text", text: "Missing required argument: session_id" }] };
    }
    if (!workerId || typeof workerId !== "string") {
      return { isError: true, content: [{ type: "text", text: "Missing required argument: worker_id" }] };
    }

    const { readWorkerState } = this.loadDispatcher();
    const state = readWorkerState(sessionId, workerId);
    if (!state) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Worker ${workerId} not found for session ${sessionId}.`,
          },
        ],
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(state, null, 2) }],
    };
  }
}
// @AI:NAV[END:class-workermanager]
