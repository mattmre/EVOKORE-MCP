const { performance } = require("perf_hooks");
const fs = require("fs");
const path = require("path");
const { ToolCatalogIndex } = require("../dist/ToolCatalogIndex.js");
const DEFAULT_ITERATIONS = 250;

function createTool(name, description) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"]
    }
  };
}

function createSyntheticCatalog() {
  const nativeTools = [
    createTool("docs_architect", "Documentation architecture helper."),
    createTool("skill_creator", "Skill scaffolding helper."),
    createTool("resolve_workflow", "Resolve the best workflow."),
    createTool("search_skills", "Search the skills library."),
    createTool("get_skill_help", "Read skill help."),
    createTool("discover_tools", "Search the merged EVOKORE tool catalog.")
  ];

  const proxiedTools = [];
  const serverIds = ["github", "fs", "voice", "docs", "ops"];
  const topics = ["search", "commit", "issue", "release", "markdown", "audio", "config", "deploy", "diff", "report"];

  for (const serverId of serverIds) {
    for (let i = 0; i < topics.length; i++) {
      const topic = topics[i];
      proxiedTools.push(
        createTool(
          `${serverId}_${topic}_${String(i + 1).padStart(2, "0")}`,
          `${serverId} ${topic} helper for deterministic benchmark scenario ${i + 1}.`
        )
      );
    }
  }

  return new ToolCatalogIndex(nativeTools, proxiedTools);
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
    p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(4))
  };
}

function parseArgs(argv) {
  let outputPath = null;
  let includeLiveTimings = false;

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
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { outputPath, includeLiveTimings };
}

function run() {
  const { outputPath, includeLiveTimings } = parseArgs(process.argv.slice(2));
  const catalog = createSyntheticCatalog();
  const activatedTools = new Set(["github_search_01", "docs_markdown_05"]);

  const legacyList = catalog.getAllTools();
  const dynamicList = catalog.getProjectedTools(activatedTools);
  const discoveryQuery = "github_issue_03";
  const discoveryResults = catalog.discover(discoveryQuery, activatedTools, 8);
  const legacyBytes = Buffer.byteLength(JSON.stringify(legacyList), "utf8");
  const dynamicBytes = Buffer.byteLength(JSON.stringify(dynamicList), "utf8");

  const payload = {
    generatedAt: new Date(0).toISOString(),
    toolCounts: {
      legacy: legacyList.length,
      dynamic: dynamicList.length,
      discovered: discoveryResults.length
    },
    payloadBytes: {
      legacy: legacyBytes,
      dynamic: dynamicBytes
    },
    estimatedTokens: {
      legacy: Math.ceil(legacyBytes / 4),
      dynamic: Math.ceil(dynamicBytes / 4)
    },
    benchmarkScenario: {
      iterations: DEFAULT_ITERATIONS,
      deterministicArtifact: !includeLiveTimings,
      liveTimingsIncluded: includeLiveTimings
    },
    topMatches: discoveryResults.map((match) => match.entry.name)
  };

  if (includeLiveTimings) {
    payload.liveTimings = {
      listLegacy: measure(() => catalog.getAllTools()),
      listDynamic: measure(() => catalog.getProjectedTools(activatedTools)),
      discover: measure(() => catalog.discover(discoveryQuery, activatedTools, 8))
    };
  }

  const serializedPayload = JSON.stringify(payload, null, 2);

  if (outputPath) {
    const resolvedOutputPath = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
    fs.writeFileSync(resolvedOutputPath, `${serializedPayload}\n`, "utf8");
  }

  console.log(serializedPayload);
}

try {
  run();
} catch (error) {
  console.error(`benchmark-tool-discovery failed: ${error.message}`);
  process.exit(1);
}
