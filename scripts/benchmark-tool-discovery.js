const { performance } = require("perf_hooks");
const fs = require("fs");
const path = require("path");
const { ToolCatalogIndex } = require("../dist/ToolCatalogIndex.js");
const {
  resolveActiveProfile,
  loadDiscoveryConfig,
  MANDATORY_INJECTION_SKILLS,
} = require("../dist/ProfileResolver.js");

const DEFAULT_ITERATIONS = 250;

/**
 * js-tiktoken (pure JS port of OpenAI tiktoken). The package is loaded
 * lazily because some sandboxed CI environments may not have it
 * installed; the benchmark falls back to a char/4 estimate with an
 * explicit "approximate" label so budgets remain comparable.
 */
function loadTokenizer() {
  try {
    // js-tiktoken exports `getEncoding` plus a per-model registry.
    const mod = require("js-tiktoken");
    const enc = mod.getEncoding("cl100k_base");
    return {
      kind: "tiktoken",
      encoding: "cl100k_base",
      countTokens: (text) => enc.encode(text).length,
    };
  } catch (err) {
    return {
      kind: "approximate",
      encoding: "char/4 (js-tiktoken unavailable: " + (err && err.message ? err.message : err) + ")",
      countTokens: (text) => Math.ceil(Buffer.byteLength(text, "utf8") / 4),
    };
  }
}

function createTool(name, description) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  };
}

/**
 * Synthetic catalog mirrors the real EVOKORE tool surface (~33 native
 * tools + ~78 proxy tools across github / fs / elevenlabs / supabase /
 * stitch). Names match the proxy-prefixing format `<serverId>_<original>`
 * so profile allowlists hit them deterministically.
 */
function buildSyntheticCatalog() {
  const nativeTools = [
    createTool("docs_architect", "Documentation architecture helper for synthesizing skill graphs."),
    createTool("skill_creator", "Skill scaffolding helper that builds new SKILL.md files."),
    createTool("resolve_workflow", "Resolve the best workflow for a given task description."),
    createTool("search_skills", "Search the skills library for relevant entries."),
    createTool("get_skill_help", "Read the help for a specific skill."),
    createTool("discover_tools", "Search the merged EVOKORE tool catalog."),
    createTool("proxy_server_status", "Show the status of every child MCP server."),
    createTool("refresh_skills", "Hot-reload the SKILLS directory."),
    createTool("fetch_skill", "Download a remote skill from a registry URL."),
    createTool("list_registry", "List entries in the configured skill registries."),
    createTool("execute_skill", "Run a skill in the sandboxed execution environment."),
    createTool("get_telemetry", "Inspect runtime telemetry counters."),
    createTool("reset_telemetry", "Reset runtime telemetry counters."),
    createTool("reload_plugins", "Hot-reload native plugin tools."),
    createTool("nav_get_map", "Read the AI navigation anchor map for a file."),
    createTool("nav_read_anchor", "Read N lines centered on a named navigation anchor."),
    createTool("session_context_health", "Report context size and compaction recommendation."),
    createTool("session_analyze_replay", "Analyze the session replay log for retry signals."),
    createTool("session_work_ratio", "Score evidence-to-replay density."),
    createTool("session_trust_report", "Read the per-session trust ledger summary."),
    createTool("claim_acquire", "Acquire a session-scoped claim on a resource."),
    createTool("claim_release", "Release a previously acquired claim."),
    createTool("claim_list", "List active claims."),
    createTool("claim_sweep", "Sweep stale claims from the registry."),
    createTool("memory_store", "Store a memory entry for later retrieval."),
    createTool("memory_search", "Search the memory store by content or tag."),
    createTool("memory_list", "List entries in the memory store."),
    createTool("fleet_spawn", "Spawn a new agent in the fleet."),
    createTool("fleet_claim", "Claim an open fleet task."),
    createTool("fleet_release", "Release a fleet task."),
    createTool("fleet_status", "Report status of every fleet agent."),
    createTool("orchestration_start", "Start an orchestration runtime instance."),
    createTool("orchestration_stop", "Stop the orchestration runtime."),
    createTool("orchestration_status", "Report the orchestration runtime status."),
    createTool("worker_dispatch", "Dispatch work to a registered worker."),
    createTool("worker_context", "Inspect the active worker context."),
  ];

  // GitHub MCP — 26 representative tools.
  const githubTools = [
    "create_or_update_file",
    "search_repositories",
    "create_repository",
    "get_file_contents",
    "push_files",
    "create_issue",
    "get_issue",
    "list_issues",
    "update_issue",
    "add_issue_comment",
    "create_pull_request",
    "get_pull_request",
    "list_pull_requests",
    "merge_pull_request",
    "get_pull_request_files",
    "create_branch",
    "list_branches",
    "list_commits",
    "search_code",
    "search_issues",
    "search_users",
    "fork_repository",
    "create_or_update_secret",
    "list_workflow_runs",
    "get_workflow_run",
    "rerun_workflow",
  ].map((n) => createTool(`github_${n}`, `GitHub MCP: ${n.replace(/_/g, " ")} operation.`));

  // Filesystem MCP — 14 tools.
  const fsTools = [
    "read_file",
    "read_multiple_files",
    "write_file",
    "edit_file",
    "create_directory",
    "list_directory",
    "directory_tree",
    "move_file",
    "search_files",
    "get_file_info",
    "list_allowed_directories",
    "head",
    "tail",
    "delete",
  ].map((n) => createTool(`fs_${n}`, `Filesystem MCP: ${n.replace(/_/g, " ")} operation.`));

  // ElevenLabs MCP — 24 tools.
  const elevenlabsTools = [
    "text_to_speech",
    "speech_to_text",
    "text_to_voice",
    "voice_clone",
    "get_voice",
    "search_voices",
    "search_voice_library",
    "isolate_audio",
    "play_audio",
    "make_outbound_call",
    "create_agent",
    "get_agent",
    "list_agents",
    "update_agent",
    "delete_agent",
    "get_conversation",
    "list_conversations",
    "list_phone_numbers",
    "get_phone_number",
    "create_phone_number",
    "list_knowledge_base",
    "create_knowledge_base_document",
    "get_knowledge_base_document",
    "delete_knowledge_base_document",
  ].map((n) => createTool(`elevenlabs_${n}`, `ElevenLabs MCP: ${n.replace(/_/g, " ")} operation.`));

  // Supabase MCP — 17 tools.
  const supabaseTools = [
    "list_projects",
    "get_project",
    "list_organizations",
    "get_organization",
    "list_tables",
    "list_extensions",
    "list_migrations",
    "apply_migration",
    "execute_sql",
    "get_logs",
    "get_advisors",
    "get_project_url",
    "get_anon_key",
    "generate_typescript_types",
    "list_edge_functions",
    "deploy_edge_function",
    "create_branch",
  ].map((n) => createTool(`supabase_${n}`, `Supabase MCP: ${n.replace(/_/g, " ")} operation.`));

  return {
    nativeTools,
    proxiedTools: [...githubTools, ...fsTools, ...elevenlabsTools, ...supabaseTools],
  };
}

function loadProfilesConfig() {
  // Use the loader so the env-overrideable EVOKORE_MCP_CONFIG_PATH is
  // honored by the benchmark too.
  const discovery = loadDiscoveryConfig();
  const profiles = discovery.profiles ? { ...discovery.profiles } : {};
  // Synthesize the built-in default so --all covers it without forcing
  // operators to hand-mirror it in every config.
  if (!profiles.default) {
    profiles.default = {
      alwaysVisible: "all-native",
      description: "Built-in default profile (legacy-equivalent: native always visible, proxy dynamic).",
    };
  }
  return profiles;
}

function projectToolsForProfile(catalog, profile) {
  // The profile drives the catalog's alwaysVisible bookkeeping. With no
  // activated proxy tools, getProjectedTools() returns exactly what the
  // first `tools/list` response would emit before the client ever calls
  // discover_tools.
  return catalog.getProjectedTools([]);
}

function measureProfile(profile, profileName, native, proxied, tokenizer) {
  const catalog = new ToolCatalogIndex(native, proxied, profile);
  const visible = projectToolsForProfile(catalog, profile);
  const payload = JSON.stringify({ tools: visible });
  const bytes = Buffer.byteLength(payload, "utf8");
  const tokens = tokenizer.countTokens(payload);
  const allTools = catalog.getAllTools();
  return {
    profile: profileName,
    description: profile.description || null,
    alwaysVisibleSpec: Array.isArray(profile.alwaysVisible)
      ? `allowlist[${profile.alwaysVisible.length}]`
      : profile.alwaysVisible,
    visibleToolCount: visible.length,
    catalogToolCount: allTools.length,
    payloadBytes: bytes,
    tokens,
    mandatoryInjectionSkills: profile.mandatoryInjectionSkills || null,
  };
}

function measure(fn, iterations = DEFAULT_ITERATIONS) {
  const durations = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    durations.push(performance.now() - start);
  }

  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const sorted = [...durations].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);

  return {
    iterations,
    avgMs: Number((total / iterations).toFixed(4)),
    medianMs: Number(sorted[midpoint].toFixed(4)),
    p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(4)),
  };
}

function parseArgs(argv) {
  let outputPath = null;
  let includeLiveTimings = false;
  let profileFilter = null;
  let runAllProfiles = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--output") {
      outputPath = argv[i + 1];
      if (!outputPath) {
        throw new Error("Missing value for --output");
      }
      i += 1;
    } else if (arg === "--live-timings") {
      includeLiveTimings = true;
    } else if (arg === "--profile") {
      profileFilter = argv[i + 1];
      if (!profileFilter) {
        throw new Error("Missing value for --profile");
      }
      i += 1;
    } else if (arg === "--all") {
      runAllProfiles = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/benchmark-tool-discovery.js [options]

Options:
  --output <path>      Write JSON payload to <path> in addition to stdout
  --live-timings       Include hot-path timing measurements (non-deterministic)
  --profile <name>     Measure a single named profile from mcp.config.json
  --all                Measure every profile (built-in default + all in config)
  -h, --help           Show this help

When neither --profile nor --all is given, the legacy + dynamic synthetic
benchmark is run (preserves pre-Sprint-1.4 output shape).`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { outputPath, includeLiveTimings, profileFilter, runAllProfiles };
}

function runProfileBenchmark({ outputPath, profileFilter, runAllProfiles }) {
  const profiles = loadProfilesConfig();
  const profileNames = runAllProfiles
    ? Object.keys(profiles).sort()
    : profileFilter
      ? [profileFilter]
      : [];
  if (profileFilter && !profiles[profileFilter]) {
    throw new Error(
      `Profile '${profileFilter}' is not defined in mcp.config.json (available: ${Object.keys(profiles).sort().join(", ")})`
    );
  }

  const tokenizer = loadTokenizer();
  const { nativeTools, proxiedTools } = buildSyntheticCatalog();

  const results = profileNames.map((name) =>
    measureProfile(profiles[name], name, nativeTools, proxiedTools, tokenizer)
  );

  const payload = {
    generatedAt: new Date(0).toISOString(),
    tokenizer: {
      kind: tokenizer.kind,
      encoding: tokenizer.encoding,
    },
    syntheticCatalog: {
      nativeToolCount: nativeTools.length,
      proxyToolCount: proxiedTools.length,
    },
    mandatoryInjectionSkills: MANDATORY_INJECTION_SKILLS,
    profiles: results,
  };

  const serialized = JSON.stringify(payload, null, 2);
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, `${serialized}\n`, "utf8");
  }
  console.log(serialized);
}

function runLegacyBenchmark({ outputPath, includeLiveTimings }) {
  const { nativeTools, proxiedTools } = buildSyntheticCatalog();
  const catalog = new ToolCatalogIndex(nativeTools, proxiedTools);
  const activatedTools = new Set(["github_search_repositories", "fs_read_file"]);

  const legacyList = catalog.getAllTools();
  const dynamicList = catalog.getProjectedTools(activatedTools);
  const discoveryQuery = "github_create_pull_request";
  const discoveryResults = catalog.discover(discoveryQuery, activatedTools, 8);
  const legacyBytes = Buffer.byteLength(JSON.stringify(legacyList), "utf8");
  const dynamicBytes = Buffer.byteLength(JSON.stringify(dynamicList), "utf8");

  const tokenizer = loadTokenizer();
  const payload = {
    generatedAt: new Date(0).toISOString(),
    tokenizer: { kind: tokenizer.kind, encoding: tokenizer.encoding },
    toolCounts: {
      legacy: legacyList.length,
      dynamic: dynamicList.length,
      discovered: discoveryResults.length,
    },
    payloadBytes: {
      legacy: legacyBytes,
      dynamic: dynamicBytes,
    },
    tokens: {
      legacy: tokenizer.countTokens(JSON.stringify(legacyList)),
      dynamic: tokenizer.countTokens(JSON.stringify(dynamicList)),
    },
    benchmarkScenario: {
      iterations: DEFAULT_ITERATIONS,
      deterministicArtifact: !includeLiveTimings,
      liveTimingsIncluded: includeLiveTimings,
    },
    topMatches: discoveryResults.map((match) => match.entry.name),
  };

  if (includeLiveTimings) {
    payload.liveTimings = {
      listLegacy: measure(() => catalog.getAllTools()),
      listDynamic: measure(() => catalog.getProjectedTools(activatedTools)),
      discover: measure(() => catalog.discover(discoveryQuery, activatedTools, 8)),
    };
  }

  const serialized = JSON.stringify(payload, null, 2);
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, `${serialized}\n`, "utf8");
  }
  console.log(serialized);
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.runAllProfiles || args.profileFilter) {
    runProfileBenchmark(args);
    return;
  }
  runLegacyBenchmark(args);
}

try {
  run();
} catch (error) {
  console.error(`benchmark-tool-discovery failed: ${error.message}`);
  process.exit(1);
}
