const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

const distEntry = path.resolve(__dirname, "dist", "index.js");
const mockServerPath = path.resolve(__dirname, "tests", "helpers", "mock-tool-discovery-server.js");
const tempConfigPath = path.join(os.tmpdir(), `evokore-proxy-status-${process.pid}.json`);

function writeTestConfig() {
  fs.writeFileSync(tempConfigPath, JSON.stringify({
    servers: {
      goodsvc: {
        command: process.execPath,
        args: [mockServerPath]
      },
      badsvc: {
        command: process.execPath,
        args: ["-e", "process.exit(1)"]
      }
    }
  }, null, 2));
}

async function connectClient() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [distEntry],
    stderr: "inherit",
    env: {
      ...process.env,
      EVOKORE_MCP_CONFIG_PATH: tempConfigPath,
      EVOKORE_TOOL_DISCOVERY_MODE: "legacy"
    }
  });

  const client = new Client(
    { name: "proxy-server-status-validator", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
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

async function run() {
  console.log("Running proxy server status validation...");
  writeTestConfig();

  const connection = await connectClient();

  try {
    const listedTools = await connection.client.listTools();
    assert(
      listedTools.tools.some((tool) => tool.name === "proxy_server_status"),
      "proxy_server_status should be advertised in the native tool list."
    );

    const response = await connection.client.callTool({
      name: "proxy_server_status",
      arguments: {}
    });

    assert(!response.isError, "proxy_server_status should succeed when the registry exists.");
    const payload = JSON.parse(response.content[0].text);

    assert.strictEqual(payload.totalServers, 2, "Expected both configured child servers to appear in the aggregation snapshot.");

    const goodServer = payload.servers.find((server) => server.id === "goodsvc");
    const badServer = payload.servers.find((server) => server.id === "badsvc");

    assert(goodServer, "Expected connected child server to be reported.");
    assert(badServer, "Expected failed child server to be reported.");

    assert.strictEqual(goodServer.status, "connected", "Connected child server should report connected status.");
    assert.strictEqual(goodServer.registeredToolCount, 4, "Connected child server should expose its registered tool count.");
    assert.strictEqual(goodServer.connectionType, "stdio", "Current proxy transport should report stdio.");
    assert(goodServer.lastPing > 0, "Connected child server should expose lastPing metadata.");

    assert.strictEqual(badServer.status, "error", "Failed child server should report error status.");
    assert.strictEqual(badServer.registeredToolCount, 0, "Failed child server should not report registered tools.");
    assert(badServer.errorCount >= 1, "Failed child server should increment error count.");

    const filtered = await connection.client.callTool({
      name: "proxy_server_status",
      arguments: {
        server_id: "goodsvc"
      }
    });

    const filteredPayload = JSON.parse(filtered.content[0].text);
    assert.strictEqual(filteredPayload.totalServers, 1, "Filtering by server_id should narrow the snapshot.");
    assert.strictEqual(filteredPayload.servers[0].id, "goodsvc", "Filtered snapshot should return the requested child server.");
  } finally {
    await closeClient(connection);
    if (fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
  }

  console.log("Proxy server status validation passed.");
}

run().catch((error) => {
  console.error("Proxy server status validation failed:", error);
  process.exit(1);
});
