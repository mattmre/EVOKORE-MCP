/**
 * ProfileResolver — Discovery profile resolution for EVOKORE-MCP.
 *
 * Sprint 1.1 of the tool-discovery tiering plan
 * (`docs/plans/tool-discovery-tiering-2026-04-26.md` §6).
 *
 * Reads the `discovery` block from `mcp.config.json` (if present) and
 * picks the active profile, applying the safety-pin precedence:
 *
 *   1. `EVOKORE_TOOL_DISCOVERY_MODE=legacy|dynamic` (safety pin) wins
 *      over any profile selection. When `legacy` (or unset) and no
 *      explicit profile is requested, callers should treat the result
 *      as the built-in `default` profile so behavior is bit-identical
 *      to pre-tiering shipping.
 *   2. `EVOKORE_DISCOVERY_PROFILE=<name>` env var, when set, picks a
 *      profile by name from the config.
 *   3. `discovery.activeProfile` field in `mcp.config.json`.
 *   4. Built-in `default` profile.
 *
 * The resolver itself is pure: given a parsed config + an env map, the
 * output is deterministic. File I/O is isolated in
 * `loadDiscoveryConfig()`.
 */

import fs from "fs";
import path from "path";

/**
 * A profile decides which tools are always visible in `tools/list`
 * regardless of dynamic activation. The remaining tools are gated
 * behind discovery / activation.
 *
 * `alwaysVisible` accepts:
 *   - `"all-native"` (default) — every native tool is always visible,
 *     proxied tools are dynamic. This matches the pre-tiering legacy
 *     behavior bit-for-bit.
 *   - `string[]` — explicit list of tool names that are always visible.
 *     Anything else (native or proxy) starts hidden until activated.
 */
export interface DiscoveryProfile {
  alwaysVisible: "all-native" | string[];
  description?: string;
}

export interface DiscoveryConfig {
  activeProfile?: string;
  profiles?: Record<string, DiscoveryProfile>;
}

export type ProfileSource = "builtin-default" | "config" | "env" | "safety-pin-legacy";

export interface ResolvedProfile {
  profileName: string;
  profile: DiscoveryProfile;
  source: ProfileSource;
  /** Free-text reason for the chosen source, useful for startup logs. */
  reason: string;
}

const BUILTIN_DEFAULT_PROFILE: DiscoveryProfile = {
  alwaysVisible: "all-native",
  description: "Built-in default: every native tool is always visible; proxied tools are dynamic.",
};

const BUILTIN_DEFAULT_NAME = "default";

export interface ResolveProfileOptions {
  config?: DiscoveryConfig;
  env?: NodeJS.ProcessEnv;
}

export function resolveActiveProfile(opts: ResolveProfileOptions = {}): ResolvedProfile {
  const env = opts.env ?? process.env;
  const config = opts.config ?? {};
  const profiles = config.profiles ?? {};

  // --- Safety pin: EVOKORE_TOOL_DISCOVERY_MODE=legacy forces default profile ---
  // The binary toggle predates profiles and ships in production today. If an
  // operator has explicitly pinned legacy mode we must not silently override
  // their intent with a config-selected profile.
  const discoveryMode = env.EVOKORE_TOOL_DISCOVERY_MODE;
  const requestedProfile = env.EVOKORE_DISCOVERY_PROFILE;

  if ((discoveryMode === "legacy" || discoveryMode === undefined) && !requestedProfile && !config.activeProfile) {
    return {
      profileName: BUILTIN_DEFAULT_NAME,
      profile: BUILTIN_DEFAULT_PROFILE,
      source: "builtin-default",
      reason: "No discovery profile requested; using built-in default (legacy-equivalent).",
    };
  }

  if (discoveryMode === "legacy" && (requestedProfile || config.activeProfile)) {
    return {
      profileName: BUILTIN_DEFAULT_NAME,
      profile: BUILTIN_DEFAULT_PROFILE,
      source: "safety-pin-legacy",
      reason: `EVOKORE_TOOL_DISCOVERY_MODE=legacy overrides ${requestedProfile ? "EVOKORE_DISCOVERY_PROFILE" : "discovery.activeProfile"}; using built-in default.`,
    };
  }

  // --- Env override wins over config ---
  if (requestedProfile) {
    const found = profiles[requestedProfile];
    if (found) {
      return {
        profileName: requestedProfile,
        profile: found,
        source: "env",
        reason: `EVOKORE_DISCOVERY_PROFILE=${requestedProfile} matched a profile in mcp.config.json.`,
      };
    }
    return {
      profileName: BUILTIN_DEFAULT_NAME,
      profile: BUILTIN_DEFAULT_PROFILE,
      source: "builtin-default",
      reason: `EVOKORE_DISCOVERY_PROFILE=${requestedProfile} was set, but no profile by that name exists in mcp.config.json. Falling back to built-in default.`,
    };
  }

  // --- Config-selected profile ---
  if (config.activeProfile) {
    const found = profiles[config.activeProfile];
    if (found) {
      return {
        profileName: config.activeProfile,
        profile: found,
        source: "config",
        reason: `discovery.activeProfile=${config.activeProfile} from mcp.config.json.`,
      };
    }
    return {
      profileName: BUILTIN_DEFAULT_NAME,
      profile: BUILTIN_DEFAULT_PROFILE,
      source: "builtin-default",
      reason: `discovery.activeProfile=${config.activeProfile} did not match any profile in mcp.config.json. Falling back to built-in default.`,
    };
  }

  return {
    profileName: BUILTIN_DEFAULT_NAME,
    profile: BUILTIN_DEFAULT_PROFILE,
    source: "builtin-default",
    reason: "No discovery profile configured; using built-in default.",
  };
}

/**
 * Read the `discovery` block from `mcp.config.json`. Returns an empty
 * object if the file is absent, unreadable, or has no discovery key —
 * matching the existing soft-fail conventions in ProxyManager and
 * SkillManager.
 *
 * The path resolution mirrors the rest of the codebase: relative to the
 * compiled `dist/` directory at runtime, override-able via
 * `EVOKORE_MCP_CONFIG_PATH` for tests and embedded use.
 */
export function loadDiscoveryConfig(configPath?: string): DiscoveryConfig {
  const resolved =
    configPath ??
    process.env.EVOKORE_MCP_CONFIG_PATH ??
    path.resolve(__dirname, "../mcp.config.json");
  try {
    if (!fs.existsSync(resolved)) {
      return {};
    }
    const raw = fs.readFileSync(resolved, "utf8");
    const parsed = JSON.parse(raw);
    const discovery = parsed?.discovery;
    if (!discovery || typeof discovery !== "object") {
      return {};
    }
    return discovery as DiscoveryConfig;
  } catch (err) {
    // Soft-fail to {} so a malformed config never crashes startup, but
    // surface the reason on stderr so operators can debug a silently-
    // ignored discovery block (e.g. JSON syntax error in mcp.config.json).
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(
      `[evokore-mcp] Failed to load discovery config from ${resolved}: ${message}. Using built-in default profile.`
    );
    return {};
  }
}
