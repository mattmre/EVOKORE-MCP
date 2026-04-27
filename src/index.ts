// @AI:NAV[SEC:imports] Import declarations
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
// @AI:NAV[END:imports]
  CallToolRequestSchema,
  CallToolResult,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  GetPromptRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
  Resource,
  Tool,
  ToolSchema
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import path from "path";
import { randomUUID } from "crypto";

// Load Vault Secrets before any proxy spawns
dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

import { SkillManager, SkillExecutionContext } from "./SkillManager";
import { ProxyManager } from "./ProxyManager";
import { SecurityManager } from "./SecurityManager";
import { ToolCatalogIndex } from "./ToolCatalogIndex";
import { PluginManager } from "./PluginManager";
import { HttpServer } from "./HttpServer";
import { WebhookManager } from "./WebhookManager";
import { SessionIsolation } from "./SessionIsolation";
import { FileSessionStore } from "./stores/FileSessionStore";
import { loadAuthConfig } from "./auth/OAuthProvider";
import { TelemetryManager } from "./TelemetryManager";
import { TelemetryExporter } from "./TelemetryExporter";
import { NavigationAnchorManager } from "./NavigationAnchorManager";
import { SessionAnalyticsManager } from "./SessionAnalyticsManager";
import { WorkerManager } from "./WorkerManager";
import { ClaimsManager } from "./ClaimsManager";
import { WorkerScheduler } from "./WorkerScheduler";
import { TrustLedger } from "./TrustLedger";
import { MemoryManager } from "./MemoryManager";
import { FleetManager } from "./FleetManager";
import { OrchestrationRuntime } from "./OrchestrationRuntime";
import { RegistryManager } from "./RegistryManager";
import { AuditLog } from "./AuditLog";
import { AuditExporter } from "./AuditExporter";
import { warmContainerSandboxImages } from "./ContainerSandbox";
import { ComplianceChecker } from "./ComplianceChecker";
import {
  loadDiscoveryConfig,
  resolveActiveProfile,
  type DiscoveryProfile,
  type ResolvedProfile,
} from "./ProfileResolver";
import { paginateTools } from "./ToolCatalogPagination";

type ToolDiscoveryMode = "legacy" | "dynamic";
type RequestExtra = { sessionId?: string };

const SERVER_VERSION = "3.1.0";

// Wave 0d-f — destructive auto-activation targets. When the truth-score
// gate is on (default), nextSteps[] auto-activation defers any of these
// tool names until a passing `verification-quality` evidence row appears
// in the active session's evidence log. The set covers both kebab-case
// skill identifiers (as they appear in skill-graph.json) and the
// snake_case fallback that `applyExecuteSkillNextSteps` resolves into.
const DESTRUCTIVE_AUTO_ACTIVATION_TARGETS = new Set<string>([
  "tdd",
  "pr-manager",
  "pr_manager",
  "orch-refactor",
  "orch_refactor",
  "to-issues",
  "to_issues",
  "release-readiness",
  "release_readiness"
]);

// @AI:NAV[SEC:interface-evokoremcpserveroptions] interface EvokoreMCPServerOptions
export interface EvokoreMCPServerOptions {
  /** When true, SessionIsolation uses FileSessionStore for persistence. */
  httpMode?: boolean;
}
// @AI:NAV[END:interface-evokoremcpserveroptions]

// @AI:NAV[SEC:class-evokoremcpserver] class EvokoreMCPServer
export class EvokoreMCPServer {
  private server: Server;
  private skillManager: SkillManager;
  private securityManager: SecurityManager;
  private proxyManager: ProxyManager;
  private pluginManager: PluginManager;
  private toolCatalog: ToolCatalogIndex;
  private webhookManager: WebhookManager;
  private telemetryManager: TelemetryManager;
  private telemetryExporter: TelemetryExporter;
  private navAnchorManager: NavigationAnchorManager;
  private sessionAnalyticsManager: SessionAnalyticsManager;
  private workerManager: WorkerManager;
  private claimsManager: ClaimsManager;
  private workerScheduler: WorkerScheduler;
  private trustLedger!: TrustLedger;
  private memoryManager: MemoryManager;
  private fleetManager: FleetManager;
  private orchestrationRuntime: OrchestrationRuntime;
  private registryManager: RegistryManager;
  private auditLog: AuditLog;
  private auditExporter: AuditExporter;
  private complianceChecker: ComplianceChecker;
  private discoveryMode: ToolDiscoveryMode;
  // Sprint 1.2 — incremented on every `tools/list_changed` notification.
  // `tools/list` cursors carry this epoch so stale cursors decode to a
  // graceful reset (first page) instead of indexing into a different
  // tool array.
  private toolListEpoch: number = 0;
  // Wave 0d-f — `tools/list_changed` debounce. When multiple
  // notifications would fire within `toolsListChangedDebounceMs`, only
  // one is sent at the end of the window. The pending flag tracks
  // whether at least one trigger happened during the window. The timer
  // is `unref()`'d so it does not block process exit.
  private toolsListChangedDebounceMs: number = 250;
  private toolsListChangedTimer: NodeJS.Timeout | null = null;
  private toolsListChangedPending: boolean = false;
  // Wave 0d-f — soft per-session token-budget tracking for nextSteps[]
  // auto-activations. Indexed by session id; the active discovery
  // profile's tokenBudget is the cap.
  private nextStepsTokenSpend: Map<string, number> = new Map();
  // Wave 0d-f — when true (default), block nextSteps[] auto-activation
  // of destructive skills (tdd, pr-manager, orch-refactor, to-issues,
  // release-readiness) until the active session has a passing
  // `verification-quality` evidence row.
  private requireTruthScoreForAutoActivation: boolean = true;
  private sessionIsolation: SessionIsolation;
  private sessionTtlMs: number | undefined;
  private httpMode: boolean;
  private readonly defaultSessionId: string;
  private readonly resolvedProfile: ResolvedProfile;
  private readonly discoveryProfile: DiscoveryProfile;
  // Sprint 3.x — schema-deferral state. `schemaMode` is captured once at
  // construction; runtime fallback (compat-probe miss or per-tool Zod
  // validation rejection) flips `schemaModeEffective` to "full" without
  // mutating the operator's configured value.
  private schemaMode: "full" | "deferred";
  private schemaModeEffective: "full" | "deferred";
  private schemaFallbackMs: number;
  private describeToolInvoked: boolean = false;
  private schemaCompatProbeTimer: NodeJS.Timeout | null = null;
  private schemaCompatProbeArmed: boolean = false;
  // One-time per-tool Zod-fallback warnings keyed by tool name. We log
  // once per offending tool to avoid stderr flooding when a server has
  // multiple non-conforming tools.
  private schemaZodWarnedTools: Set<string> = new Set();

  constructor(options?: EvokoreMCPServerOptions) {
    this.discoveryMode = this.parseToolDiscoveryMode(process.env.EVOKORE_TOOL_DISCOVERY_MODE);
    // Per-instance default session key. Replaces the previous shared
    // "__stdio_default_session__" literal so distinct server instances
    // never share an activation Map even when running in the same process.
    // Use a hyphen separator instead of a colon so the session id is safe
    // to use as a filename component on Windows (FileSessionStore writes
    // `~/.evokore/sessions/<sessionId>.json`).
    this.defaultSessionId = `stdio-${randomUUID()}`;
    // Discovery profile is resolved once at construction and frozen for
    // this server instance. Hot-reload of profiles is intentionally out
    // of scope for Sprint 1.1.
    this.resolvedProfile = resolveActiveProfile({ config: loadDiscoveryConfig() });
    this.discoveryProfile = this.resolvedProfile.profile;

    // Sprint 3.x — schema-deferred tools/list (opt-in, default off).
    // See docs/research/tools-list-deferred-schema-compat-2026-04-26.md
    // for the compatibility matrix; deferral is risky against any
    // SDK-bound client and should only be enabled by operators on
    // confirmed-permissive clients.
    this.schemaMode = this.parseSchemaMode(process.env.EVOKORE_TOOL_SCHEMA_MODE);
    this.schemaModeEffective = this.schemaMode;
    const fallbackRaw = parseInt(process.env.EVOKORE_TOOL_SCHEMA_FALLBACK_MS || "", 10);
    this.schemaFallbackMs =
      Number.isFinite(fallbackRaw) && fallbackRaw > 0 ? fallbackRaw : 60000;

    // Wave 0d-f — `tools/list_changed` coalescing window. Default 250 ms,
    // operator-tunable via EVOKORE_TOOLS_LIST_CHANGED_DEBOUNCE_MS, clamped
    // to [0, 5000] ms. 0 disables debounce (every trigger fires
    // immediately, preserving pre-Wave-0 behavior bit-for-bit).
    const debounceRaw = parseInt(
      process.env.EVOKORE_TOOLS_LIST_CHANGED_DEBOUNCE_MS || "",
      10
    );
    if (Number.isFinite(debounceRaw)) {
      this.toolsListChangedDebounceMs = Math.max(0, Math.min(5000, debounceRaw));
    } else {
      this.toolsListChangedDebounceMs = 250;
    }

    // Wave 0d-f — truth-score gate for nextSteps[] auto-activation.
    // Default on. Operators can disable via
    // EVOKORE_AUTO_ACTIVATION_REQUIRE_TRUTH_SCORE=0|false|off|no.
    const truthScoreRaw = String(
      process.env.EVOKORE_AUTO_ACTIVATION_REQUIRE_TRUTH_SCORE ?? ""
    )
      .trim()
      .toLowerCase();
    if (
      truthScoreRaw === "0" ||
      truthScoreRaw === "false" ||
      truthScoreRaw === "off" ||
      truthScoreRaw === "no"
    ) {
      this.requireTruthScoreForAutoActivation = false;
    } else {
      this.requireTruthScoreForAutoActivation = true;
    }
    this.server = new Server(
      {
        name: "evokore-mcp",
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: {
            listChanged: true
          },
        },
        instructions: "EVOKORE-MCP is a multi-server MCP aggregator. Use discover_tools to find available tools, resolve_workflow for skill-based workflows, and proxy_server_status to check child server health.",
      }
    );

    this.securityManager = new SecurityManager();
    this.webhookManager = new WebhookManager();
    this.proxyManager = new ProxyManager(this.securityManager, this.webhookManager);
    this.pluginManager = new PluginManager(this.webhookManager);
    this.telemetryManager = new TelemetryManager();
    this.navAnchorManager = new NavigationAnchorManager();
    this.sessionAnalyticsManager = new SessionAnalyticsManager();
    this.workerManager = new WorkerManager();
    this.claimsManager = new ClaimsManager();
    this.workerScheduler = new WorkerScheduler(this.claimsManager);
    this.trustLedger = new TrustLedger(process.env.EVOKORE_SESSION_ID || 'default');
    this.memoryManager = new MemoryManager();
    this.fleetManager = new FleetManager();
    this.orchestrationRuntime = new OrchestrationRuntime(this.fleetManager, this.claimsManager);
    this.telemetryExporter = new TelemetryExporter(this.telemetryManager, {
      exportUrl: process.env.EVOKORE_TELEMETRY_EXPORT_URL,
      intervalMs: parseInt(process.env.EVOKORE_TELEMETRY_EXPORT_INTERVAL_MS || "", 10) || 60000,
      secret: process.env.EVOKORE_TELEMETRY_EXPORT_SECRET,
    });
    this.registryManager = new RegistryManager();
    this.auditLog = AuditLog.getInstance();
    this.auditExporter = new AuditExporter(this.auditLog, {
      exportUrl: process.env.EVOKORE_AUDIT_EXPORT_URL,
      intervalMs: parseInt(process.env.EVOKORE_AUDIT_EXPORT_INTERVAL_MS || "", 10) || 60000,
      secret: process.env.EVOKORE_AUDIT_EXPORT_SECRET,
      batchSize: parseInt(process.env.EVOKORE_AUDIT_EXPORT_BATCH_SIZE || "", 10) || 100,
    });
    this.skillManager = new SkillManager(this.proxyManager, this.registryManager);
    this.complianceChecker = new ComplianceChecker();
    this.toolCatalog = new ToolCatalogIndex(this.skillManager.getTools(), [], this.discoveryProfile);

    // Sprint 3.x — let describe_tool resolve full schemas from the
    // unified catalog (native, plugin, proxied). The catalog is
    // rebuilt on proxy boot / plugin reload, so we read from
    // `this.toolCatalog` lazily at call time.
    this.skillManager.setToolSchemaResolver((name: string) => {
      return this.toolCatalog.getEntry(name)?.tool;
    });

    // Session TTL parsed once, used both here and in loadSubsystems() for Redis init
    const ttlMs = parseInt(process.env.EVOKORE_SESSION_TTL_MS || "3600000", 10);
    this.sessionTtlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : undefined;
    this.httpMode = options?.httpMode ?? false;

    // In HTTP mode, use FileSessionStore for persistence unless explicitly overridden.
    // Redis store initialization is deferred to loadSubsystems() (async, pre-request).
    const storeOverride = process.env.EVOKORE_SESSION_STORE;
    if (this.httpMode && storeOverride !== "memory" && storeOverride !== "redis") {
      this.sessionIsolation = new SessionIsolation({
        store: new FileSessionStore(),
        ttlMs: this.sessionTtlMs,
      });
    } else {
      // Default (memory) or redis — start with memory; redis is replaced in loadSubsystems()
      this.sessionIsolation = new SessionIsolation({ ttlMs: this.sessionTtlMs });
    }

    this.setupHandlers();
    this.server.onerror = (error) => console.error("[MCP Error]", error);
  }

  private parseToolDiscoveryMode(value?: string): ToolDiscoveryMode {
    // Sprint 1.5: an unset/empty EVOKORE_TOOL_DISCOVERY_MODE now resolves to
    // "dynamic" so an unconfigured operator gets the lean tools/list payload
    // (~1.5-2.5K tokens) instead of the legacy 12-31K-token full proxied list.
    // Native tools stay always-visible via the built-in default profile
    // (`alwaysVisible: "all-native"` in ProfileResolver); only proxied tools
    // become activation-gated through `discover_tools`.
    //
    // Operators who depend on the pre-v3.1 behavior set the explicit safety
    // pin `EVOKORE_TOOL_DISCOVERY_MODE=legacy`. ProfileResolver also honors
    // that exact value as a hard pin to the built-in default profile, so
    // flipping the unset default here does not affect the safety-pin path.
    if (!value || value === "dynamic") {
      return "dynamic";
    }

    if (value === "legacy") {
      return "legacy";
    }

    console.error(`[EVOKORE] Unknown EVOKORE_TOOL_DISCOVERY_MODE '${value}'. Falling back to dynamic mode.`);
    return "dynamic";
  }

  /**
   * Sprint 3.x — parse EVOKORE_TOOL_SCHEMA_MODE. Default `full` preserves
   * the pre-3.x contract (every tool ships with its full inputSchema).
   * `deferred` opts into schema-deferred tools/list payloads. Unknown
   * values are warned and fall back to `full`.
   */
  private parseSchemaMode(value?: string): "full" | "deferred" {
    if (!value || value === "full") {
      return "full";
    }
    if (value === "deferred") {
      return "deferred";
    }
    console.error(
      `[EVOKORE] Unknown EVOKORE_TOOL_SCHEMA_MODE '${value}'. Falling back to full mode.`
    );
    return "full";
  }

  /**
   * Sprint 3.x — return a tools/list-shaped projection of `tools` with
   * inputSchema stripped and `_meta.schema_deferred = true` set. Tools
   * whose original inputSchema fails the SDK's Zod ToolSchema validation
   * fall back to their full schema individually (with a one-time stderr
   * warning per offending tool). The returned array is safe to surface
   * over the wire.
   */
  private projectDeferredTools(tools: Tool[]): Tool[] {
    return tools.map((tool) => {
      // Per-tool SDK Zod sanity check on the *full* tool: if the
      // upstream definition is itself invalid, deferring it would mask
      // the bug and is unsafe. Fall back to the original (full) tool
      // for that entry only and warn once per offending name.
      const validationError = this.validateFullToolSchema(tool);
      if (validationError) {
        if (!this.schemaZodWarnedTools.has(tool.name)) {
          this.schemaZodWarnedTools.add(tool.name);
          console.error(
            `[EVOKORE] Schema-deferral per-tool fallback: '${tool.name}' failed SDK Zod validation (${validationError}); returning full schema for this tool.`
          );
        }
        return tool;
      }

      // describe_tool itself must always ship with its full schema — it
      // is the bootstrap path operators use to fetch deferred schemas,
      // and a deferred describe_tool would create a chicken-and-egg
      // problem.
      if (tool.name === "describe_tool") {
        return tool;
      }

      const meta: Record<string, unknown> = {
        ...((tool as any)._meta ?? {}),
        schema_deferred: true,
      };
      const projected: Tool = {
        name: tool.name,
        description: tool.description,
        // Per the SDK Zod schema (panel-B finding) inputSchema is a
        // required field. Even in deferred mode we therefore ship a
        // minimal placeholder rather than omitting the key entirely.
        // The placeholder advertises the deferral via _meta and an
        // empty properties bag so SDK-bound clients don't drop the
        // tool. Operators wanting strict omission must take the
        // bootstrap-via-describe_tool path off-band.
        inputSchema: {
          type: "object",
          properties: {},
          // Marker on the schema itself so introspection tools that
          // don't read top-level _meta still see the deferral signal.
          "x-evokore-schema-deferred": true,
        } as any,
        annotations: tool.annotations,
        title: (tool as any).title,
        _meta: meta,
      };
      // Strip undefined fields to keep the wire payload tight.
      if (projected.annotations === undefined) delete (projected as any).annotations;
      if ((projected as any).title === undefined) delete (projected as any).title;
      return projected;
    });
  }

  /**
   * Sprint 3.x — run the SDK's Zod ToolSchema validator against a full
   * tool definition. Returns null on success, or a short error string on
   * failure. Used so the deferred-mode projection can detect
   * upstream-malformed tools per-tool and fall back to their full
   * schema rather than masking the bug behind a placeholder.
   */
  private validateFullToolSchema(tool: Tool): string | null {
    try {
      const result = (ToolSchema as any).safeParse(tool);
      if (!result?.success) {
        const issues = result?.error?.issues;
        const summary = Array.isArray(issues) && issues.length > 0
          ? issues.map((i: any) => i.message).slice(0, 2).join("; ")
          : "Zod validation failed";
        return summary;
      }
      return null;
    } catch (err: any) {
      return err?.message || "Zod validation threw";
    }
  }

  /**
   * Sprint 3.x — arm the compat probe timer. Fires once per process
   * lifetime when schema-deferred mode is active. If no describe_tool
   * call is observed within `schemaFallbackMs`, the runtime flips
   * effective mode to `full` for the remainder of the process and emits
   * a tools/list_changed notification so well-behaved clients re-fetch.
   */
  private armSchemaCompatProbeIfNeeded(): void {
    if (this.schemaCompatProbeArmed) return;
    if (this.schemaModeEffective !== "deferred") return;
    this.schemaCompatProbeArmed = true;

    this.schemaCompatProbeTimer = setTimeout(() => {
      if (this.describeToolInvoked) return;
      this.schemaModeEffective = "full";
      const windowLabel =
        this.schemaFallbackMs >= 1000
          ? `${Math.round(this.schemaFallbackMs / 1000)}s`
          : `${this.schemaFallbackMs}ms`;
      console.error(
        `[EVOKORE] Schema-deferral fallback: client did not call describe_tool within ${windowLabel}; reverting to full mode (offending client likely doesn't support deferred schemas).`
      );
      // Bump epoch and notify listeners so the next tools/list returns
      // full schemas. Best-effort — failures are logged but do not
      // crash the process.
      this.toolListEpoch++;
      this.server
        .sendToolListChanged()
        .catch((err: any) => {
          console.error(
            `[EVOKORE] sendToolListChanged() failed after schema-deferral fallback: ${err?.message || err}`
          );
        });
    }, this.schemaFallbackMs);
    // Don't keep the Node process alive solely for this timer.
    if (typeof this.schemaCompatProbeTimer.unref === "function") {
      this.schemaCompatProbeTimer.unref();
    }
  }

  /**
   * Sprint 3.x — record that a client invoked describe_tool. Cancels the
   * compat probe timer so the runtime stays in deferred mode.
   */
  private markDescribeToolInvoked(): void {
    this.describeToolInvoked = true;
    if (this.schemaCompatProbeTimer) {
      clearTimeout(this.schemaCompatProbeTimer);
      this.schemaCompatProbeTimer = null;
    }
  }

  private rebuildToolCatalog() {
    const nativeTools = [
      ...this.skillManager.getTools(),
      ...this.pluginManager.getTools(),
      ...this.telemetryManager.getTools(),
      ...this.navAnchorManager.getTools(),
      ...this.sessionAnalyticsManager.getTools(),
      ...this.workerManager.getTools(),
      ...this.claimsManager.getTools(),
      ...this.memoryManager.getTools(),
      ...this.fleetManager.getTools(),
      ...this.orchestrationRuntime.getTools(),
    ];
    this.toolCatalog = new ToolCatalogIndex(nativeTools, this.proxyManager.getProxiedTools(), this.discoveryProfile);
  }

  private getSessionId(extra?: RequestExtra): string {
    return extra?.sessionId ?? this.defaultSessionId;
  }

  /**
   * Returns the activated tools set for the given session.
   * If the session does not exist yet (e.g. first access in stdio mode),
   * it is created on-demand via SessionIsolation.
   */
  private getActivatedTools(extra?: RequestExtra): Set<string> {
    const sessionId = this.getSessionId(extra);
    let session = this.sessionIsolation.getSession(sessionId);
    if (!session) {
      session = this.sessionIsolation.createSession(sessionId);
    }
    return session.activatedTools;
  }

  private async notifyToolListChangedIfNeeded(changed: boolean) {
    if (!changed || this.discoveryMode !== "dynamic") {
      return;
    }

    this.scheduleToolListChanged("notifyToolListChangedIfNeeded");
  }

  /**
   * Wave 0d-f — coalesce a `tools/list_changed` trigger into the active
   * debounce window. When `toolsListChangedDebounceMs <= 0`, the
   * notification fires synchronously (current pre-Wave-0 behavior). For
   * positive windows, the first trigger arms a one-shot timer; any
   * additional triggers within the window only set the pending flag and
   * the timer flush emits a single notification on expiry.
   *
   * The epoch is bumped on every emit (not on every coalesced trigger)
   * so cursor invalidation matches the actual notification cadence.
   */
  private scheduleToolListChanged(_reasonHint?: string): void {
    if (this.toolsListChangedDebounceMs <= 0) {
      this.toolListEpoch++;
      void this.server.sendToolListChanged().catch((error: any) => {
        console.error(
          `[EVOKORE] sendToolListChanged() failed in best-effort mode: ${error?.message || error}`
        );
      });
      return;
    }

    if (this.toolsListChangedTimer) {
      // Window already armed — just record that another trigger arrived.
      this.toolsListChangedPending = true;
      return;
    }

    this.toolsListChangedPending = true;
    this.toolsListChangedTimer = setTimeout(() => {
      const shouldEmit = this.toolsListChangedPending;
      this.toolsListChangedTimer = null;
      this.toolsListChangedPending = false;
      if (!shouldEmit) return;
      this.toolListEpoch++;
      void this.server.sendToolListChanged().catch((error: any) => {
        console.error(
          `[EVOKORE] sendToolListChanged() failed in best-effort mode: ${error?.message || error}`
        );
      });
    }, this.toolsListChangedDebounceMs);
    if (typeof (this.toolsListChangedTimer as any)?.unref === "function") {
      (this.toolsListChangedTimer as any).unref();
    }
  }

  /**
   * Wave 0d-f — test-only helper. Fires any pending coalesced
   * `tools/list_changed` immediately and clears the timer. Production
   * code never calls this; tests use it to assert that exactly one
   * notification is emitted per debounce window without waiting on
   * real wall-clock time.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async flushToolsListChangedForTests(): Promise<void> {
    if (this.toolsListChangedTimer) {
      clearTimeout(this.toolsListChangedTimer);
      this.toolsListChangedTimer = null;
    }
    if (!this.toolsListChangedPending) return;
    this.toolsListChangedPending = false;
    this.toolListEpoch++;
    try {
      await this.server.sendToolListChanged();
    } catch (error: any) {
      console.error(
        `[EVOKORE] sendToolListChanged() failed in best-effort mode: ${error?.message || error}`
      );
    }
  }

  /**
   * Sprint 1.2 — test-only helper to bump the tool-list epoch without
   * relying on the MCP transport. Production code paths bump the epoch
   * directly before calling `sendToolListChanged()`. Tests use this
   * method to assert cursor invalidation independently of transport.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private bumpToolListEpochForTests(): number {
    this.toolListEpoch++;
    return this.toolListEpoch;
  }

  private getListedToolNames(extra?: RequestExtra): string[] {
    const tools = this.discoveryMode === "dynamic"
      ? this.toolCatalog.getProjectedTools(this.getActivatedTools(extra))
      : this.toolCatalog.getAllTools();

    return tools.map((tool) => tool.name).sort();
  }

  private didListedToolSetChange(previous: string[], next: string[]): boolean {
    if (previous.length !== next.length) {
      return true;
    }

    return previous.some((name, index) => name !== next[index]);
  }

  private async bootProxyServersInBackground(): Promise<void> {
    const listedToolsBeforeBoot = this.getListedToolNames();

    try {
      await this.proxyManager.loadServers();
      this.rebuildToolCatalog();

      const listedToolsAfterBoot = this.getListedToolNames();
      const listedToolsChanged = this.didListedToolSetChange(listedToolsBeforeBoot, listedToolsAfterBoot);
      const proxiedToolCount = this.proxyManager.getProxiedTools().length;

      console.error(`[EVOKORE] Proxy bootstrap complete: ${proxiedToolCount} proxied tool(s) registered.`);

      if (listedToolsChanged) {
        this.toolListEpoch++;
        try {
          await this.server.sendToolListChanged();
        } catch (error: any) {
          console.error(`[EVOKORE] sendToolListChanged() failed after proxy bootstrap: ${error?.message || error}`);
        }
      }
    } catch (error: any) {
      console.error(`[EVOKORE] Background proxy bootstrap failed: ${error?.message || error}`);
    }
  }

  private async handleDiscoverTools(args: any, extra?: RequestExtra): Promise<any> {
    const query = String(args?.query ?? "").trim();
    const limitValue = typeof args?.limit === "number" ? args.limit : Number(args?.limit);
    const limit = Number.isFinite(limitValue) ? limitValue : 8;

    if (!query) {
      return {
        content: [{ type: "text", text: "Please provide a non-empty discovery query." }],
        isError: true
      };
    }

    const activatedTools = this.getActivatedTools(extra);
    const matches = this.toolCatalog.discover(query, activatedTools, limit);

    if (matches.length === 0) {
      return {
        content: [{
          type: "text",
          text: `[EVOKORE TOOL DISCOVERY] No tools matched '${query}'. Hidden proxied tools remain callable by exact name even when they are not listed.`
        }]
      };
    }

    let activatedCount = 0;
    if (this.discoveryMode === "dynamic") {
      for (const match of matches) {
        if (match.entry.source === "proxy" && !activatedTools.has(match.entry.name)) {
          activatedTools.add(match.entry.name);
          activatedCount++;
        }
      }
    }

    const lines = [
      `[EVOKORE TOOL DISCOVERY] mode=${this.discoveryMode}`,
      `Query: ${query}`,
      `Matched ${matches.length} tool(s).`
    ];

    if (this.discoveryMode === "dynamic") {
      lines.push(
        activatedCount > 0
          ? `Activated ${activatedCount} proxied tool(s) for this session.`
          : "No new proxied tools needed activation for this session."
      );
    } else {
      lines.push("Legacy mode already exposes the full tool list, so discovery does not change tool visibility.");
    }

    lines.push("");
    for (const match of matches) {
      const statusParts: string[] = [match.entry.source];
      const isVisible = this.discoveryMode === "legacy" || match.entry.alwaysVisible || activatedTools.has(match.entry.name);
      if (match.entry.serverId) {
        statusParts.push(`server=${match.entry.serverId}`);
      }
      statusParts.push(
        isVisible ? "visible" : "callable-by-exact-name"
      );
      lines.push(`- ${match.entry.name} [${statusParts.join(", ")}]: ${match.entry.description}`);
    }

    if (this.discoveryMode === "dynamic") {
      lines.push("", "Re-run tools/list to fetch the updated tool projection.");
    }

    await this.notifyToolListChangedIfNeeded(activatedCount > 0);

    // Persist session state if tool activation changed
    if (activatedCount > 0) {
      const sessionId = this.getSessionId(extra);
      this.sessionIsolation.persistSession(sessionId).catch(() => {
        // Best-effort persistence; errors are non-fatal
      });
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }]
    };
  }

  /**
   * Sprint 2.x — apply nextSteps[] auto-activation from execute_skill.
   *
   * Reads the `nextSteps` field that SkillManager attaches to its
   * execute_skill responses, projects each `skill` name through the
   * tool catalog, and adds matching proxy/native tool names to the
   * session's activation set. Emits exactly one
   * `sendToolListChanged()` if and only if the activation set grew.
   */
  private async applyExecuteSkillNextSteps(
    result: CallToolResult,
    extra?: RequestExtra
  ): Promise<void> {
    if (this.discoveryMode !== "dynamic") return;
    const nextSteps = (result as any)?.nextSteps;
    if (!Array.isArray(nextSteps) || nextSteps.length === 0) return;

    const sessionId = this.getSessionId(extra);
    const activatedTools = this.getActivatedTools(extra);

    // Wave 0d-f — soft per-session token-budget cap from the active
    // discovery profile. 0 / undefined means no cap.
    const tokenBudget = this.getActiveProfileTokenBudget();
    const currentSpend = this.nextStepsTokenSpend.get(sessionId) ?? 0;
    let spend = currentSpend;

    // Wave 0d-f — truth-score gate. Only computed once per call, and
    // only when the gate is on AND a destructive target appears in the
    // nextSteps list (cheap-path optimization).
    let truthScoreOk: boolean | null = null;
    const gateOn = this.requireTruthScoreForAutoActivation;

    let added = 0;
    let deferredTruthScore = 0;
    let deferredBudget = 0;
    for (const step of nextSteps) {
      const skillName = typeof step?.skill === "string" ? step.skill : "";
      if (!skillName) continue;
      // Activate the catalog entry whose tool name matches the
      // referenced skill name. Skills that do not surface as a tool
      // (most of them) silently no-op, which is the desired behavior.
      // The skill graph uses kebab-case identifiers (matches the
      // SKILL.md naming convention), but several native tools use
      // snake_case (e.g. `docs_architect`). Try the kebab form first,
      // then a snake_case-normalized fallback so the auto-activation
      // resolves both worlds.
      let entry = this.toolCatalog.getEntry(skillName);
      if (!entry && skillName.includes("-")) {
        entry = this.toolCatalog.getEntry(skillName.replace(/-/g, "_"));
      }
      if (!entry) continue;
      if (entry.alwaysVisible) continue;
      if (activatedTools.has(entry.name)) continue;

      // Wave 0d-f — destructive-target truth-score gate. Block
      // auto-activation of dangerous tools until the active session has
      // a passing `verification-quality` evidence row.
      const isDestructive =
        DESTRUCTIVE_AUTO_ACTIVATION_TARGETS.has(skillName.toLowerCase()) ||
        DESTRUCTIVE_AUTO_ACTIVATION_TARGETS.has(entry.name.toLowerCase());
      if (gateOn && isDestructive) {
        if (truthScoreOk === null) {
          truthScoreOk =
            await this.hasRecentVerificationQualityEvidence(sessionId);
        }
        if (!truthScoreOk) {
          step.hint = "deferred_truth_score";
          deferredTruthScore++;
          continue;
        }
      }

      // Wave 0d-f — soft token-budget gate.
      const cost =
        typeof step?.tokenCostEstimate === "number" &&
        Number.isFinite(step.tokenCostEstimate)
          ? Math.max(0, step.tokenCostEstimate)
          : 0;
      if (tokenBudget > 0 && spend + cost > tokenBudget) {
        step.hint = "deferred_budget";
        deferredBudget++;
        continue;
      }
      spend += cost;

      activatedTools.add(entry.name);
      added++;
    }

    this.nextStepsTokenSpend.set(sessionId, spend);

    if (deferredTruthScore > 0 || deferredBudget > 0) {
      // Operator-facing diagnostic so deferred activations are visible
      // in stderr without flooding logs (one line per call).
      console.error(
        `[EVOKORE] applyExecuteSkillNextSteps deferred=${deferredTruthScore + deferredBudget} (truth_score=${deferredTruthScore} budget=${deferredBudget}) activated=${added} session=${sessionId}`
      );
    }

    if (added > 0) {
      this.scheduleToolListChanged("applyExecuteSkillNextSteps");
      this.sessionIsolation.persistSession(sessionId).catch(() => {
        // Best-effort persistence; errors are non-fatal.
      });
    }
  }

  /**
   * Wave 0d-f — read the active discovery profile's token budget. The
   * profile shape varies across legacy/dynamic configs, so we accept
   * any of `tokenBudget`, `token_budget`, `budget`, or `maxTokens`.
   * Returns 0 when no budget is set (no cap).
   */
  private getActiveProfileTokenBudget(): number {
    const profile: any = this.discoveryProfile;
    if (!profile || typeof profile !== "object") return 0;
    const candidates = [
      profile.tokenBudget,
      profile.token_budget,
      profile.budget,
      profile.maxTokens
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
        return candidate;
      }
    }
    return 0;
  }

  /**
   * Wave 0d-f — truth-score gate. Reads the session's evidence JSONL
   * looking for a recent `verification-quality` row. A row counts as
   * "passing" when `passed === true`, OR when a numeric `score` field
   * meets the configured threshold (default 0.7).
   *
   * Bounded by EVOKORE_TRUTH_SCORE_EVIDENCE_WINDOW (default 50, max
   * 1000) to keep the scan cheap on long sessions. Reads are best-
   * effort: if the file is missing or unreadable, the gate fails closed
   * (returns false) so destructive auto-activation defers rather than
   * spuriously firing.
   */
  private async hasRecentVerificationQualityEvidence(
    sessionId: string
  ): Promise<boolean> {
    try {
      const fs = await import("fs/promises");
      const os = await import("os");
      const pathMod = await import("path");
      const evidencePath = pathMod.join(
        os.homedir(),
        ".evokore",
        "sessions",
        `${sessionId}-evidence.jsonl`
      );
      let raw: string;
      try {
        raw = await fs.readFile(evidencePath, "utf-8");
      } catch {
        return false;
      }
      const windowRaw = parseInt(
        process.env.EVOKORE_TRUTH_SCORE_EVIDENCE_WINDOW || "",
        10
      );
      const windowSize = Number.isFinite(windowRaw) && windowRaw > 0
        ? Math.min(windowRaw, 1000)
        : 50;
      const thresholdRaw = parseFloat(
        process.env.EVOKORE_TRUTH_SCORE_THRESHOLD || ""
      );
      const threshold = Number.isFinite(thresholdRaw) ? thresholdRaw : 0.7;

      const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
      const tail = lines.slice(Math.max(0, lines.length - windowSize));
      for (const line of tail) {
        let row: any;
        try {
          row = JSON.parse(line);
        } catch {
          continue;
        }
        if (!row || typeof row !== "object") continue;
        const t = row.type ?? row.kind ?? row.evidenceType;
        if (t !== "verification-quality" && t !== "verification_quality") continue;
        if (row.passed === true) return true;
        const score =
          typeof row.score === "number"
            ? row.score
            : typeof row.truthScore === "number"
              ? row.truthScore
              : null;
        if (score !== null && Number.isFinite(score) && score >= threshold) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  private async handleRefreshSkills(): Promise<any> {
    const result = await this.skillManager.refreshSkills();
    this.rebuildToolCatalog();

    this.toolListEpoch++;
    try {
      await this.server.sendToolListChanged();
    } catch (error: any) {
      console.error(`[EVOKORE] sendToolListChanged() failed after skill refresh: ${error?.message || error}`);
    }

    return {
      content: [{
        type: "text",
        text: `Skills refreshed in ${result.refreshTimeMs}ms: ${result.added} added, ${result.removed} removed, ${result.updated} unchanged/updated, ${result.total} total skills indexed.`
      }]
    };
  }

  private async handleReloadPlugins(): Promise<any> {
    const result = await this.pluginManager.loadPlugins();
    this.rebuildToolCatalog();

    this.toolListEpoch++;
    try {
      await this.server.sendToolListChanged();
    } catch (error: any) {
      console.error(`[EVOKORE] sendToolListChanged() failed after plugin reload: ${error?.message || error}`);
    }

    const lines = [
      `Plugins reloaded in ${result.loadTimeMs}ms: ${result.loaded} loaded, ${result.failed} failed, ${result.totalTools} tools, ${result.totalResources} resources.`
    ];

    if (result.errors.length > 0) {
      lines.push("");
      lines.push("Errors:");
      for (const err of result.errors) {
        lines.push(`  - ${err.file}: ${err.error}`);
      }
    }

    const loadedPlugins = this.pluginManager.getLoadedPlugins();
    if (loadedPlugins.length > 0) {
      lines.push("");
      lines.push("Loaded plugins:");
      for (const p of loadedPlugins) {
        lines.push(`  - ${p.name} v${p.version} (${p.toolCount} tools, ${p.resourceCount} resources)`);
      }
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }]
    };
  }

  private async handleFetchSkill(args: any): Promise<any> {
    // Delegate to SkillManager for the fetch, then auto-refresh the index
    const result = await this.skillManager.handleToolCall("fetch_skill", args);

    // If the fetch succeeded (no isError), auto-refresh the skill index
    if (!result.isError) {
      try {
        await this.skillManager.refreshSkills();
        this.rebuildToolCatalog();
        this.toolListEpoch++;
        await this.server.sendToolListChanged();

        // Append a refresh note to the response
        const originalText = result.content?.[0]?.text || "";
        result.content = [{
          type: "text",
          text: originalText + " Index auto-refreshed."
        }];
      } catch (error: any) {
        console.error(`[EVOKORE] Auto-refresh after fetch_skill failed: ${error?.message || error}`);
      }
    }

    return result;
  }

  private getServerResources(): Resource[] {
    return [
      {
        uri: "evokore://server/status",
        name: "Server Status",
        mimeType: "application/json",
        description: "Live EVOKORE-MCP server status including version, discovery mode, child server states, and tool counts."
      },
      {
        uri: "evokore://server/config",
        name: "Server Config (Sanitized)",
        mimeType: "application/json",
        description: "EVOKORE-MCP server configuration from mcp.config.json with environment values redacted."
      },
      {
        uri: "evokore://skills/categories",
        name: "Skill Categories",
        mimeType: "application/json",
        description: "Summary of all skill categories with skill counts per category."
      }
    ];
  }

  private async readServerResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
    if (uri === "evokore://server/status") {
      const serverStates = this.proxyManager.getServerStatusSnapshot();
      const status = {
        version: SERVER_VERSION,
        discoveryMode: this.discoveryMode,
        toolCount: this.toolCatalog.getAllTools().length,
        skillCount: this.skillManager.getSkillCount(),
        childServers: serverStates.map(s => ({
          id: s.id,
          status: s.status,
          connectionType: s.connectionType,
          registeredToolCount: s.registeredToolCount,
          errorCount: s.errorCount
        }))
      };
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(status, null, 2) }]
      };
    }

    if (uri === "evokore://server/config") {
      const sanitizedConfig = await this.proxyManager.getSanitizedConfig();
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(sanitizedConfig, null, 2) }]
      };
    }

    if (uri === "evokore://skills/categories") {
      const categorySummary = this.skillManager.getCategorySummary();
      const result = {
        totalSkills: this.skillManager.getSkillCount(),
        categories: Object.entries(categorySummary)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, count]) => ({ name, count }))
      };
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(result, null, 2) }]
      };
    }

    throw new McpError(ErrorCode.InvalidParams, "Unknown evokore resource: " + uri);
  }

  private redactSensitiveArgs(args: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['_evokore_approval_token', 'password', 'secret', 'token', 'key', 'credential', 'api_key', 'apiKey', 'access_token', 'accessToken'];
    const redacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
      redacted[k] = sensitiveKeys.some(sk => k.toLowerCase().includes(sk.toLowerCase())) ? '[REDACTED]' : v;
    }
    return redacted;
  }

  private setupHandlers() {
    // 1. Resources (Skills + Server-level)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const skillResources = this.skillManager.getResources();
      const serverResources = this.getServerResources();
      const pluginResources = this.pluginManager.getResources();
      return { resources: [...serverResources, ...pluginResources, ...skillResources] };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      if (uri.startsWith("evokore://")) {
        return await this.readServerResource(uri);
      }
      // Check if a plugin owns this resource
      if (this.pluginManager.isPluginResource(uri)) {
        const pluginResult = await this.pluginManager.handleResourceRead(uri);
        if (pluginResult) {
          return pluginResult;
        }
      }
      return this.skillManager.readResource(uri);
    });

    // 2. Prompts (Skill-backed prompt templates)
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: "resolve-workflow",
            description: "Find the best matching skill/workflow for a given objective",
            arguments: [
              { name: "objective", description: "What you want to accomplish", required: true }
            ]
          },
          {
            name: "skill-help",
            description: "Get detailed help for a specific skill",
            arguments: [
              { name: "skill_name", description: "Name of the skill", required: true }
            ]
          },
          {
            name: "server-overview",
            description: "Get an overview of this EVOKORE-MCP server instance",
            arguments: []
          }
        ]
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "resolve-workflow": {
          const objective = args?.objective;
          if (!objective) {
            throw new McpError(ErrorCode.InvalidParams, "The 'objective' argument is required for the resolve-workflow prompt.");
          }
          const resultText = this.skillManager.resolveWorkflowText(objective);
          return {
            messages: [
              {
                role: "user" as const,
                content: { type: "text" as const, text: "Find workflows for: " + objective }
              },
              {
                role: "assistant" as const,
                content: { type: "text" as const, text: resultText }
              }
            ]
          };
        }

        case "skill-help": {
          const skillName = args?.skill_name;
          if (!skillName) {
            throw new McpError(ErrorCode.InvalidParams, "The 'skill_name' argument is required for the skill-help prompt.");
          }
          const helpText = this.skillManager.getSkillHelpText(skillName);
          return {
            messages: [
              {
                role: "user" as const,
                content: { type: "text" as const, text: "Help for skill: " + skillName }
              },
              {
                role: "assistant" as const,
                content: { type: "text" as const, text: helpText }
              }
            ]
          };
        }

        case "server-overview": {
          const toolCount = this.toolCatalog.getAllTools().length;
          const skillCount = this.skillManager.getSkillCount();
          const serverStates = this.proxyManager.getServerStatusSnapshot();
          const categorySummary = this.skillManager.getCategorySummary();

          const childServerLines = serverStates.map(s =>
            "  - " + s.id + ": " + s.status + " (" + s.connectionType + ", " + s.registeredToolCount + " tools)"
          );

          const categoryLines = Object.entries(categorySummary)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([cat, count]) => "  - " + cat + ": " + count + " skills");

          const overviewText = [
            "EVOKORE-MCP v" + SERVER_VERSION,
            "Discovery mode: " + this.discoveryMode,
            "Total tools: " + toolCount,
            "Total skills: " + skillCount,
            "",
            "Child servers (" + serverStates.length + "):",
            ...(childServerLines.length > 0 ? childServerLines : ["  (none connected)"]),
            "",
            "Skill categories:",
            ...(categoryLines.length > 0 ? categoryLines : ["  (none loaded)"])
          ].join("\n");

          return {
            messages: [
              {
                role: "assistant" as const,
                content: { type: "text" as const, text: overviewText }
              }
            ]
          };
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, "Unknown prompt: " + name);
      }
    });

    // 3. Tools (Dynamic Injection & Proxied Actions)
    this.server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
      let allTools = this.discoveryMode === "dynamic"
        ? this.toolCatalog.getProjectedTools(this.getActivatedTools(extra))
        : this.toolCatalog.getAllTools();

      // Sprint 3.x — schema-deferred projection. Only applied when the
      // operator opted in AND the runtime hasn't already fallen back to
      // full mode after a compat-probe miss.
      if (this.schemaModeEffective === "deferred") {
        allTools = this.projectDeferredTools(allTools);
        // Arm the compat probe on the first deferred response.
        this.armSchemaCompatProbeIfNeeded();
      }

      const cursor = typeof request.params?.cursor === "string"
        ? request.params.cursor
        : undefined;

      // Pagination is opt-in to preserve backward compatibility:
      //   - If the client sent a cursor it is signalling that it supports
      //     pagination, so honor it.
      //   - Otherwise pagination only kicks in when the operator forces it
      //     on via EVOKORE_TOOL_LIST_PAGINATION=on (useful for capped
      //     clients like Cursor IDE that silently truncate at 40 tools).
      // Legacy clients that don't pass a cursor get the full unpaged list,
      // matching pre-v3.1 behavior.
      const paginationOptIn = process.env.EVOKORE_TOOL_LIST_PAGINATION === "on";
      if (cursor === undefined && !paginationOptIn) {
        return { tools: allTools };
      }

      // Default page size 35 keeps the first page under the Cursor IDE
      // 40-tool cap. Operators may raise the cap up to 1000 per page.
      const rawPageSize = parseInt(process.env.EVOKORE_TOOL_LIST_PAGE_SIZE || "", 10);
      const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0
        ? Math.min(Math.max(Math.floor(rawPageSize), 1), 1000)
        : 35;

      const page = paginateTools(allTools, pageSize, cursor, this.toolListEpoch);
      const response: { tools: typeof page.tools; nextCursor?: string } = {
        tools: page.tools,
      };
      if (page.nextCursor) {
        response.nextCursor = page.nextCursor;
      }
      return response;
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      // Sprint 3.x — mark describe_tool invocations so the schema-defer
      // compat probe knows the connected client supports the bootstrap
      // path. Done before any RBAC / approval / dispatch so even gated
      // calls count as "client tried to fetch a schema".
      if (toolName === "describe_tool") {
        this.markDescribeToolInvoked();
      }

      // Selective audit logging for admin/config/approval tools
      const AUDITED_TOOLS = new Set(["reload_plugins", "reset_telemetry", "refresh_skills", "fetch_skill"]);
      const shouldAudit = AUDITED_TOOLS.has(toolName) || toolName.includes("approval");

      // Determine tool source for webhook metadata
      let source: string;
      if (toolName === "discover_tools" || toolName === "refresh_skills" || toolName === "fetch_skill" || toolName === "reload_plugins") {
        source = "builtin";
      } else if (this.telemetryManager.isTelemetryTool(toolName)) {
        source = "builtin";
      } else if (this.navAnchorManager.isNavTool(toolName)) {
        source = "builtin";
      } else if (this.sessionAnalyticsManager.isSessionAnalyticsTool(toolName)) {
        source = "builtin";
      } else if (this.workerManager.isWorkerTool(toolName)) {
        source = "builtin";
      } else if (this.claimsManager.isClaimTool(toolName)) {
        source = "builtin";
      } else if (this.memoryManager.isMemoryTool(toolName)) {
        source = "builtin";
      } else if (this.fleetManager.isFleetTool(toolName)) {
        source = "builtin";
      } else if (this.orchestrationRuntime.isOrchestrationTool(toolName)) {
        source = "builtin";
      } else if (this.pluginManager.isPluginTool(toolName)) {
        source = "plugin";
      } else if (this.toolCatalog.isNativeTool(toolName)) {
        source = "native";
      } else if (this.proxyManager.canHandle(toolName)) {
        source = "proxied";
      } else {
        source = "unknown";
      }

      try {
        this.webhookManager.emit("tool_call", { tool: toolName, source, arguments: this.redactSensitiveArgs(args as Record<string, unknown>) });

        // ComplianceChecker gate — runs before RBAC
        const activeMode = (process.env.EVOKORE_STEERING_MODE) || "dev";
        const compliance = this.complianceChecker.check(toolName, (args ?? {}) as Record<string, unknown>, activeMode);
        if (!compliance.allowed) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `[EVOKORE ComplianceChecker] ${compliance.reason} (mode: ${compliance.steeringMode})`
          );
        }

        // RBAC permission gate for native / builtin / plugin tools.
        // Proxied tools are gated inside ProxyManager.callProxiedTool to
        // avoid double-enforcement; unknown tools fall through to the
        // MethodNotFound branch below and must not be permission-checked.
        if (source !== "proxied" && source !== "unknown") {
          const gateSessionId = this.getSessionId(extra);
          const gateSession = this.sessionIsolation.getSession(gateSessionId);
          const gateRole = gateSession?.role ?? undefined;
          const permission = this.securityManager.checkPermission(toolName, gateRole);

          if (permission === "deny") {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Execution of '${toolName}' is strictly denied by EVOKORE-MCP security policies.`
            );
          }

          if (permission === "require_approval") {
            const argsObj = args as Record<string, unknown>;
            const providedToken = argsObj._evokore_approval_token as string | undefined;
            // Always strip the token from args before the native handlers
            // see them, regardless of whether it was present.
            delete argsObj._evokore_approval_token;

            if (!providedToken || !this.securityManager.validateToken(toolName, providedToken, argsObj)) {
              const newToken = this.securityManager.generateToken(toolName, argsObj);
              this.webhookManager.emit("approval_requested", {
                tool: toolName,
                source,
                tokenPrefix: newToken.substring(0, 8) + "...",
              });
              return {
                content: [{
                  type: "text",
                  text: `[EVOKORE-MCP SECURITY INTERCEPTOR] ACTION REQUIRES HUMAN APPROVAL.\n\nYou attempted to call '${toolName}'. You must stop right now and ask the user for explicit permission to execute this tool with these arguments. DO NOT proceed until they say YES.\n\nIf they approve, retry this exact same tool call but add the argument '_evokore_approval_token' with the value '${newToken}'.`,
                }],
                isError: true,
              };
            }

            // Valid token: consume it and let the dispatch continue.
            this.securityManager.consumeToken(providedToken);
            this.webhookManager.emit("approval_granted", {
              tool: toolName,
              source,
            });
          }
        }

        const callStartTime = Date.now();
        let result: CallToolResult;

        if (toolName === "discover_tools") {
          result = (await this.handleDiscoverTools(args, extra)) as CallToolResult;
        } else if (toolName === "refresh_skills") {
          result = (await this.handleRefreshSkills()) as CallToolResult;
        } else if (toolName === "fetch_skill") {
          result = (await this.handleFetchSkill(args)) as CallToolResult;
        } else if (toolName === "reload_plugins") {
          result = (await this.handleReloadPlugins()) as CallToolResult;
        } else if (this.telemetryManager.isTelemetryTool(toolName)) {
          result = (await this.telemetryManager.handleToolCall(toolName)) as CallToolResult;
        } else if (this.navAnchorManager.isNavTool(toolName)) {
          result = (await this.navAnchorManager.handleToolCall(toolName, args)) as CallToolResult;
        } else if (this.sessionAnalyticsManager.isSessionAnalyticsTool(toolName)) {
          result = (await this.sessionAnalyticsManager.handleToolCall(toolName, args)) as CallToolResult;
        } else if (this.workerManager.isWorkerTool(toolName)) {
          result = (await this.workerManager.handleToolCall(toolName, args)) as CallToolResult;
        } else if (this.claimsManager.isClaimTool(toolName)) {
          result = (await this.claimsManager.handleToolCall(toolName, args)) as CallToolResult;
        } else if (this.memoryManager.isMemoryTool(toolName)) {
          result = (await this.memoryManager.handleToolCall(toolName, args)) as CallToolResult;
        } else if (this.fleetManager.isFleetTool(toolName)) {
          result = (await this.fleetManager.handleTool(toolName, args as Record<string, unknown>)) as CallToolResult;
        } else if (this.orchestrationRuntime.isOrchestrationTool(toolName)) {
          result = (await this.orchestrationRuntime.handleTool(toolName, args as Record<string, unknown>)) as CallToolResult;
        } else if (source === "plugin") {
          result = (await this.pluginManager.handleToolCall(toolName, args)) as CallToolResult;
        } else if (source === "native") {
          const nativeSessionId = this.getSessionId(extra);
          const nativeSession = this.sessionIsolation.getSession(nativeSessionId);
          const skillContext: SkillExecutionContext = {
            sessionId: nativeSessionId,
            role: nativeSession?.role ?? null,
            metadata: nativeSession?.metadata ?? new Map(),
          };
          result = (await this.skillManager.handleToolCall(toolName, args, skillContext)) as CallToolResult;

          // Sprint 2.x — auto-activate tools referenced by execute_skill
          // through its derived nextSteps[]. We reuse the same
          // activation-set + sendToolListChanged() path as discover_tools,
          // and only fire one notification even if multiple steps were
          // activated. No-op if the activation set did not actually grow.
          if (toolName === "execute_skill") {
            await this.applyExecuteSkillNextSteps(result, extra);
          }
        } else if (source === "proxied") {
          const sessionId = this.getSessionId(extra);
          const session = this.sessionIsolation.getSession(sessionId);
          const sessionRole = session?.role ?? undefined;
          const sessionCounters = session?.rateLimitCounters;
          result = (await this.proxyManager.callProxiedTool(toolName, args, sessionRole, sessionCounters)) as CallToolResult;
        } else {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
        }

        this.telemetryManager.recordToolCall(Date.now() - callStartTime);

        if (shouldAudit) {
          this.auditLog.log("tool_call", "success", {
            sessionId: this.getSessionId(extra),
            resource: toolName,
            metadata: { source, latencyMs: Date.now() - callStartTime },
          });
        }

        return result;
      } catch (error: any) {
        this.telemetryManager.recordToolCall();
        this.telemetryManager.recordToolError();
        this.webhookManager.emit("tool_error", { tool: toolName, arguments: this.redactSensitiveArgs(args as Record<string, unknown>), error: error?.message || String(error) });

        if (shouldAudit) {
          this.auditLog.log("tool_call", "failure", {
            sessionId: this.getSessionId(extra),
            resource: toolName,
            metadata: { source, error: error?.message || String(error) },
          });
        }

        throw error;
      }
    });
  }

  private async loadSubsystems(): Promise<void> {
    // Initialize Redis session store if configured (must happen before any requests)
    const storeOverride = process.env.EVOKORE_SESSION_STORE;
    if (this.httpMode && storeOverride === "redis") {
      try {
        const { RedisSessionStore } = await import("./stores/RedisSessionStore");
        const redisStore = new RedisSessionStore({
          url: process.env.EVOKORE_REDIS_URL,
          keyPrefix: process.env.EVOKORE_REDIS_KEY_PREFIX,
          ttlMs: this.sessionTtlMs,
        });
        this.sessionIsolation = new SessionIsolation({
          store: redisStore,
          ttlMs: this.sessionTtlMs,
        });
        console.error("[EVOKORE] Redis session store initialized");
      } catch (err: any) {
        console.error("[EVOKORE] Failed to load Redis session store, falling back to file store:", err.message);
        this.sessionIsolation = new SessionIsolation({
          store: new FileSessionStore(),
          ttlMs: this.sessionTtlMs,
        });
      }
    }

    await this.securityManager.loadPermissions();
    await this.skillManager.loadSkills();
    const skillStats = this.skillManager.getStats();
    console.error(`[EVOKORE] Skill stats: ${skillStats.totalSkills} skills, ${skillStats.categories.length} categories, loaded in ${skillStats.loadTimeMs}ms, index ~${skillStats.fuseIndexSizeKb}KB`);

    // Load webhook subscriptions
    this.webhookManager.loadWebhooks();

    // Load plugins after skills but before proxy boot
    const pluginResult = await this.pluginManager.loadPlugins();
    if (pluginResult.loaded > 0) {
      console.error(`[EVOKORE] Plugin stats: ${pluginResult.loaded} plugins, ${pluginResult.totalTools} tools, ${pluginResult.totalResources} resources, loaded in ${pluginResult.loadTimeMs}ms`);
    }

    // Initialize telemetry (no-ops if EVOKORE_TELEMETRY is not "true")
    this.telemetryManager.initialize();

    // Initialize telemetry exporter (no-ops unless double opt-in is met)
    this.telemetryExporter.initialize();

    // Initialize audit exporter (no-ops unless audit logging and export are both enabled)
    this.auditExporter.initialize();

    if (process.env.EVOKORE_SANDBOX_PREPULL === "true") {
      try {
        const warmup = await warmContainerSandboxImages();
        if (warmup.skippedReason) {
          console.error(`[EVOKORE] Container sandbox image warmup skipped: ${warmup.skippedReason}.`);
        } else if (warmup.failures.length > 0) {
          console.error(
            `[EVOKORE] Container sandbox image warmup completed with ${warmup.failures.length} failure(s): ${warmup.failures.join("; ")}`
          );
        } else {
          console.error(
            `[EVOKORE] Container sandbox images ready (${warmup.warmedImages.length}/${warmup.candidateImages.length}).`
          );
        }
      } catch (error: any) {
        console.error(`[EVOKORE] Container sandbox image warmup failed: ${error?.message || error}`);
      }
    }

    this.rebuildToolCatalog();

    // Opt-in filesystem watcher for auto-refreshing skills
    if (process.env.EVOKORE_SKILL_WATCHER === "true") {
      this.skillManager.setOnRefreshCallback(() => {
        this.rebuildToolCatalog();
        // Wave 0d-f — coalesce rapid watcher refreshes so a burst of
        // SKILL.md saves within the debounce window emits only one
        // `tools/list_changed` notification.
        this.scheduleToolListChanged("watcher_refresh");
      });
      this.skillManager.enableWatcher();
    }
  }

  async run() {
    // Load all subsystems sequentially
    await this.loadSubsystems();

    // Pre-create the default session for stdio mode using this instance's
    // unique default session key (no shared literal across instances).
    this.sessionIsolation.createSession(this.defaultSessionId);

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`[EVOKORE] v${SERVER_VERSION} Enterprise Router running on stdio (tool discovery mode: ${this.discoveryMode}, profile: ${this.resolvedProfile.profileName} via ${this.resolvedProfile.source})`);
    this.webhookManager.emit("session_start", { transport: "stdio" });
    this.telemetryManager.recordSessionStart();
    this.auditLog.log("session_create", "success", { metadata: { transport: "stdio" } });
    this.workerScheduler.start();
    this.fleetManager.start();
    this.bootProxyServersInBackground().catch((err) =>
      console.error('[EVOKORE] Fatal: background proxy boot threw unexpectedly:', err)
    );

    // Graceful shutdown for stdio mode
    const shutdown = async () => {
      this.webhookManager.emit("session_end", { transport: "stdio", reason: "shutdown" });
      this.workerScheduler.stop();
      this.fleetManager.stop();
      await this.telemetryExporter.shutdown().catch(() => { /* best effort */ });
      await this.auditExporter.shutdown().catch(() => { /* best effort */ });
      await this.telemetryManager.shutdown();
      // Disconnect session store (e.g. close Redis connection)
      const store = this.sessionIsolation.getStore();
      if (store.disconnect) await store.disconnect().catch(() => { /* best effort */ });
      // Grace period to allow fire-and-forget webhook delivery
      setTimeout(() => process.exit(0), 500);
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  }

  async runHttp(): Promise<HttpServer> {
    await this.loadSubsystems();

    const authConfig = loadAuthConfig();
    const httpServer = new HttpServer(this.server, {
      sessionIsolation: this.sessionIsolation,
      securityManager: this.securityManager,
      authConfig,
      webhookManager: this.webhookManager,
      auditLog: this.auditLog,
      telemetryManager: this.telemetryManager,
    });
    await httpServer.start();

    const addr = httpServer.getAddress();
    console.error(`[EVOKORE] v${SERVER_VERSION} Enterprise Router running on HTTP at http://${addr.host}:${addr.port} (tool discovery mode: ${this.discoveryMode}, profile: ${this.resolvedProfile.profileName} via ${this.resolvedProfile.source})`);
    this.webhookManager.emit("session_start", { transport: "http", host: addr.host, port: addr.port });
    this.telemetryManager.recordSessionStart();
    this.auditLog.log("session_create", "success", { metadata: { transport: "http", host: addr.host, port: addr.port } });
    this.workerScheduler.start();
    this.fleetManager.start();

    this.bootProxyServersInBackground().catch((err) =>
      console.error('[EVOKORE] Fatal: background proxy boot threw unexpectedly:', err)
    );

    // Graceful shutdown
    const shutdown = async () => {
      console.error("[EVOKORE] Shutting down HTTP server...");
      this.webhookManager.emit("session_end", { transport: "http", reason: "shutdown" });
      this.workerScheduler.stop();
      this.fleetManager.stop();
      await this.telemetryExporter.shutdown().catch(() => { /* best effort */ });
      await this.auditExporter.shutdown().catch(() => { /* best effort */ });
      await this.telemetryManager.shutdown();
      // Disconnect session store (e.g. close Redis connection)
      const store = this.sessionIsolation.getStore();
      if (store.disconnect) await store.disconnect().catch(() => { /* best effort */ });
      // Grace period to allow fire-and-forget webhook delivery
      await new Promise(resolve => setTimeout(resolve, 500));
      await httpServer.stop();
      process.exit(0);
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);

    return httpServer;
  }
}
// @AI:NAV[END:class-evokoremcpserver]

if (require.main === module) {
  const isHttpMode = process.env.EVOKORE_HTTP_MODE === "true" || process.argv.includes("--http");
  const server = new EvokoreMCPServer({ httpMode: isHttpMode });

  if (isHttpMode) {
    server.runHttp().catch(console.error);
  } else {
    server.run().catch(console.error);
  }
}
