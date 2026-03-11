const assert = require("assert");
const { EvokoreMCPServer } = require("./dist/index.js");
const { ToolCatalogIndex } = require("./dist/ToolCatalogIndex.js");

function createTool(name, description) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      }
    }
  };
}

async function testSessionIsolation() {
  const server = new EvokoreMCPServer();
  server.discoveryMode = "dynamic";
  server.toolCatalog = new ToolCatalogIndex(
    server.skillManager.getTools(),
    [createTool("mocksvc_search_docs", "Search repository documentation and markdown knowledge sources.")]
  );

  const discovery = await server.handleDiscoverTools(
    { query: "search repository docs", limit: 5 },
    { sessionId: "session-a" }
  );

  assert(!discovery.isError, "discover_tools should succeed for session A.");

  const visibleForA = server.toolCatalog
    .getProjectedTools(server.getActivatedTools({ sessionId: "session-a" }))
    .map((tool) => tool.name);
  const visibleForB = server.toolCatalog
    .getProjectedTools(server.getActivatedTools({ sessionId: "session-b" }))
    .map((tool) => tool.name);

  assert(visibleForA.includes("mocksvc_search_docs"), "Session A should see its activated proxied tool.");
  assert(!visibleForB.includes("mocksvc_search_docs"), "Session B should remain isolated from session A activations.");
}

function testStaleSessionResetAndPrune() {
  const server = new EvokoreMCPServer();
  const staleState = {
    tools: new Set(["mocksvc_search_docs"]),
    lastTouchedAt: 0
  };

  server.activatedToolSessionsBySession.set("expired-session", staleState);
  const resetTools = server.getActivatedTools({ sessionId: "expired-session" });
  assert.strictEqual(resetTools.size, 0, "Expired session state should reset to an empty activation set.");

  for (let index = 0; index < 100; index += 1) {
    server.activatedToolSessionsBySession.set(`session-${index}`, {
      tools: new Set([`tool-${index}`]),
      lastTouchedAt: index + 1
    });
  }

  server.activatedToolSessionsBySession.set("stale-session", {
    tools: new Set(["stale-tool"]),
    lastTouchedAt: 0
  });

  server.getActivatedTools({ sessionId: "fresh-session" });

  assert(!server.activatedToolSessionsBySession.has("stale-session"), "Stale sessions should be pruned opportunistically.");
  assert(!server.activatedToolSessionsBySession.has("session-0"), "The oldest non-stale session should be evicted when the activation map exceeds capacity.");
  assert(server.activatedToolSessionsBySession.has("fresh-session"), "The current session should be retained after pruning.");
  assert(server.activatedToolSessionsBySession.size <= 100, "Activated tool session state should stay bounded.");
}

async function run() {
  console.log("Starting tool discovery session hardening validation...");
  await testSessionIsolation();
  testStaleSessionResetAndPrune();
  console.log("Tool discovery session hardening validation passed.");
}

run().catch((error) => {
  console.error("Tool discovery session hardening validation failed:", error);
  process.exit(1);
});
