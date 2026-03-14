const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { waitForProxyBoot } = require("./tests/helpers/wait-for-proxy-boot");

const distEntry = path.resolve(__dirname, "dist", "index.js");
const mockServerPath = path.resolve(__dirname, "tests", "helpers", "mock-tool-discovery-server.js");
const tempConfigPath = path.join(os.tmpdir(), `evokore-tool-discovery-${process.pid}.json`);

function writeTestConfig() {
  fs.writeFileSync(tempConfigPath, JSON.stringify({
    servers: {
      mocksvc: {
        command: process.execPath,
        args: [mockServerPath]
      }
    }
  }, null, 2));
}

async function connectClient(mode) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [distEntry],
    stderr: "pipe",
    env: {
      ...process.env,
      EVOKORE_MCP_CONFIG_PATH: tempConfigPath,
      EVOKORE_TOOL_DISCOVERY_MODE: mode
    }
  });

  const client = new Client(
    { name: `tool-discovery-${mode}-validator`, version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  await waitForProxyBoot(transport);
  return { client, transport };
}

async function closeClient({ client, transport }) {
  try {
    if (typeof client.close === "function") {
      await client.close();
    }
  } finally {
    if (typeof transport.close === "function") {
      await transport.close();
    }
  }
}

async function testLegacyMode() {
  const connection = await connectClient("legacy");

  try {
    const response = await connection.client.listTools();
    const toolNames = response.tools.map((tool) => tool.name);

    assert(toolNames.includes("discover_tools"), "discover_tools must be listed in legacy mode.");
    assert(toolNames.includes("mocksvc_search_docs"), "Legacy mode must still expose proxied tools.");
    assert(toolNames.includes("mocksvc_hidden_exact"), "Legacy mode must still expose all proxied tools.");
    return response.tools.length;
  } finally {
    await closeClient(connection);
  }
}

async function testDynamicMode(legacyToolCount) {
  const connection = await connectClient("dynamic");

  try {
    const initial = await connection.client.listTools();
    const initialToolNames = initial.tools.map((tool) => tool.name);

    assert(initialToolNames.includes("discover_tools"), "discover_tools must be visible in dynamic mode.");
    assert(!initialToolNames.includes("mocksvc_search_docs"), "Dynamic mode must start with a slim list.");
    assert(!initialToolNames.includes("mocksvc_hidden_exact"), "Hidden proxied tools should not be listed before discovery.");
    assert(initial.tools.length < legacyToolCount, "Dynamic mode must expose a smaller initial list than legacy mode.");

    const discovery = await connection.client.callTool({
      name: "discover_tools",
      arguments: {
        query: "search documentation markdown"
      }
    });

    assert(!discovery.isError, "discover_tools should succeed in dynamic mode.");
    const discoveryText = discovery.content[0].text;
    assert.match(discoveryText, /mocksvc_search_docs/);
    assert.match(discoveryText, /Activated 1 proxied tool\(s\)/);

    const relisted = await connection.client.listTools();
    const relistedToolNames = relisted.tools.map((tool) => tool.name);

    assert(relistedToolNames.includes("mocksvc_search_docs"), "Relisting after discovery must expose activated tools.");
    assert(!relistedToolNames.includes("mocksvc_hidden_exact"), "Non-activated proxied tools should remain hidden.");

    const hiddenExactCall = await connection.client.callTool({
      name: "mocksvc_hidden_exact",
      arguments: {
        value: "compatibility-check"
      }
    });

    assert(!hiddenExactCall.isError, "Hidden proxied tools must remain callable by exact name.");
    assert.strictEqual(hiddenExactCall.content[0].text, "hidden_exact:compatibility-check");
  } finally {
    await closeClient(connection);
  }
}

test('dynamic tool discovery validation', async () => {
  console.log("Starting dynamic tool discovery validation...");
  writeTestConfig();

  try {
    const legacyToolCount = await testLegacyMode();
    await testDynamicMode(legacyToolCount);
    console.log(`Validated legacy list size (${legacyToolCount}) versus dynamic discovery flow.`);
  } finally {
    if (fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
  }
});
