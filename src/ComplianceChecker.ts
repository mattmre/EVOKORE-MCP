import fs from "fs";
import path from "path";
import crypto from "crypto";

const DEFAULT_STEERING_MODES_PATH = path.resolve(__dirname, "../scripts/steering-modes.json");
const DEFAULT_RULES_PATH = path.resolve(__dirname, "../RULES.md");

export interface ComplianceResult {
  allowed: boolean;
  reason?: string;
  steeringMode: string;
}

export interface PolicyBundle {
  rulesSections: string[];
  fingerprint: string;
  zeroAccessPaths: string[];
  denyToolNames: string[];
  denyCommandPatterns: string[];
  requireApprovalTools: string[];
}

export interface SteeringMode {
  name: string;
  tools: string[];
  allow_writes: boolean;
  damage_control_level: string;
  focus: string;
}

export class ComplianceChecker {
  private steeringModes: Record<string, SteeringMode>;
  readonly policyBundle: PolicyBundle;
  private readonly steeringModesPath: string;
  private readonly rulesPath: string;

  constructor(opts?: { steeringModesPath?: string; rulesPath?: string }) {
    this.steeringModesPath = opts?.steeringModesPath ?? DEFAULT_STEERING_MODES_PATH;
    this.rulesPath = opts?.rulesPath ?? DEFAULT_RULES_PATH;
    this.steeringModes = this.loadSteeringModes();
    this.policyBundle = this.loadPolicyBundle();
  }

  loadSteeringModes(): Record<string, SteeringMode> {
    try {
      const raw = fs.readFileSync(this.steeringModesPath, "utf-8");
      const parsed = JSON.parse(raw);
      // steering-modes.json in this repo wraps modes under a "modes" key.
      // Accept either shape: either the file is a plain map of modes, or
      // a wrapper object with a `modes` field.
      if (parsed && typeof parsed === "object" && parsed.modes && typeof parsed.modes === "object") {
        return parsed.modes as Record<string, SteeringMode>;
      }
      return parsed as Record<string, SteeringMode>;
    } catch {
      return {};
    }
  }

  loadPolicyBundle(): PolicyBundle {
    try {
      const raw = fs.readFileSync(this.rulesPath, "utf-8");
      const headings = [...raw.matchAll(/^#{1,3}\s+(.+)$/gm)].map(m => m[1]);
      const fingerprint = crypto.createHash("sha256").update(raw.slice(0, 2000)).digest("hex").slice(0, 16);

      // Extract zero-access paths from a "Zero-Access" section
      const zeroAccessPaths = this.extractSectionTokens(raw, "Zero-Access");
      // Extract deny tools — only bare tool names (no shell chars like spaces)
      const denyItems = this.extractSectionTokens(raw, "Deny");
      const denyToolNames = denyItems.filter(t => !/[\s|&;]/.test(t));
      const denyCommandPatterns = denyItems.filter(t => /[\s|&;]/.test(t));
      const requireApprovalTools = this.extractSectionTokens(raw, "Require.Approval");

      return { rulesSections: headings, fingerprint, zeroAccessPaths, denyToolNames, denyCommandPatterns, requireApprovalTools };
    } catch {
      return { rulesSections: [], fingerprint: "unknown", zeroAccessPaths: [], denyToolNames: [], denyCommandPatterns: [], requireApprovalTools: [] };
    }
  }

  private extractSectionTokens(raw: string, headingPattern: string): string[] {
    const re = new RegExp(`###\\s+${headingPattern}[\\s\\S]*?(?=###|---|$)`, "i");
    const section = raw.match(re)?.[0] ?? "";
    return [...section.matchAll(/`([^`]+)`/g)].map(m => m[1]);
  }

  // WRITE-CLASS tools — these are denied when allow_writes === false
  private static readonly WRITE_TOOLS = new Set([
    "Write", "Edit", "Bash", "MultiEdit",
    "replace_in_file", "write_file", "delete_file",
    "create_directory", "move_file"
  ]);

  // Mode family → tool name prefixes (conservative, explicit mapping)
  private static readonly MODE_TOOL_FAMILIES: Record<string, string[]> = {
    read: ["Read", "Glob", "Grep", "WebFetch", "WebSearch"],
    bash: ["Bash"],
    write: ["Write", "Edit"],
    skill_resolution: ["resolve_workflow", "search_skills", "get_skill_help", "execute_skill", "fetch_skill", "list_registry", "docs_architect", "skill_creator", "refresh_skills", "discover_tools"],
    nav_anchors: ["nav_get_map", "nav_read_anchor"],
    session_analytics: ["session_context_health", "session_analyze_replay", "session_work_ratio", "session_trust_report"],
    get_telemetry: ["get_telemetry", "reset_telemetry"],
    memory: ["memory_store", "memory_search", "memory_list"],
    claims: ["claim_acquire", "claim_release", "claim_list", "claim_sweep"],
    fleet: ["fleet_spawn", "fleet_claim", "fleet_release", "fleet_status"],
    worker: ["worker_dispatch", "worker_context"],
    hello: ["hello_world"],
  };

  private static familyKnown(toolName: string): boolean {
    for (const tools of Object.values(ComplianceChecker.MODE_TOOL_FAMILIES)) {
      if (tools.includes(toolName)) return true;
    }
    return false;
  }

  check(toolName: string, args: Record<string, unknown>, mode: string = "dev"): ComplianceResult {
    const steeringMode = mode || "dev";
    const modeConfig = this.steeringModes[steeringMode];

    // Unknown mode — fail-open (don't block on misconfiguration)
    if (!modeConfig) {
      return { allowed: true, steeringMode };
    }

    // 1. Write gate
    if (!modeConfig.allow_writes && ComplianceChecker.WRITE_TOOLS.has(toolName)) {
      return { allowed: false, reason: `steering-mode '${steeringMode}' disallows write operations`, steeringMode };
    }

    // 2. Tool-family gate (only if mode lists specific tool families)
    if (modeConfig.tools && modeConfig.tools.length > 0) {
      const allowed = modeConfig.tools.some(family => {
        const familyTools = ComplianceChecker.MODE_TOOL_FAMILIES[family] ?? [];
        return familyTools.some(t => toolName === t || toolName.startsWith(t + "_") || toolName.endsWith("_" + t));
      });
      // Proxied tools (have double underscores or custom prefixes) — always pass the family gate
      const isProxied = toolName.includes("__") || toolName.includes("-") || !ComplianceChecker.familyKnown(toolName);
      if (!allowed && !isProxied) {
        return { allowed: false, reason: `tool '${toolName}' not permitted in steering-mode '${steeringMode}'`, steeringMode };
      }
    }

    // 3. RULES.md deny list (exact tool name match)
    if (this.policyBundle.denyToolNames.includes(toolName)) {
      return { allowed: false, reason: `tool '${toolName}' denied by RULES.md policy`, steeringMode };
    }

    // 4. Bash command pattern check
    if (toolName === "Bash" || toolName === "bash") {
      const cmd = typeof args.command === "string" ? args.command : "";
      for (const pattern of this.policyBundle.denyCommandPatterns) {
        if (cmd.includes(pattern)) {
          return { allowed: false, reason: `command matches RULES.md deny pattern: '${pattern}'`, steeringMode };
        }
      }
    }

    // 5. Sensitive path check — check any string arg value
    const sensitivePatterns = [...this.policyBundle.zeroAccessPaths, ".env", "id_rsa", "credentials", ".pem", ".key"];
    for (const val of Object.values(args)) {
      if (typeof val === "string") {
        if (sensitivePatterns.some(p => val.includes(p))) {
          return { allowed: false, reason: `argument contains sensitive path pattern`, steeringMode };
        }
      }
    }

    return { allowed: true, steeringMode };
  }
}
