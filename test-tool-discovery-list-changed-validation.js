const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

const distEntry = path.resolve(__dirname, "dist", "index.js");
const mockServerPath = path.resolve(__dirname, "tests", "helpers", "mock-tool-discovery-server.js");
const tempConfigPath = path.join(os.tmpdir(), `evokore-tool-discovery-notify-${process.pid}.json`);

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

async function connectClient(onChanged) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [distEntry],
    stderr: "inherit",
    env: {
      ...process.env,
      EVOKORE_MCP_CONFIG_PATH: tempConfigPath,
      EVOKORE_TOOL_DISCOVERY_MODE: "dynamic"
    }
  });

  const client = new Client(
    { name: "tool-discovery-list-changed-validator", version: "1.0.0" },
    {
      capabilities: {},
      listChanged: {
        tools: {
          onChanged
        }
      }
    }
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
  console.log("Starting tool discovery list-changed validation...");
  writeTestConfig();

  let resolveChanged;
  let rejectChanged;
  const changed = new Promise((resolve, reject) => {
    resolveChanged = resolve;
    rejectChanged = reject;
  });

  const timeout = setTimeout(() => {
    rejectChanged(new Error("Timed out waiting for tools/list_changed refresh."));
  }, 5000);

  const connection = await connectClient((error, tools) => {
    if (error) {
      rejectChanged(error);
      return;
    }

    const toolNames = (tools || []).map((tool) => tool.name);
    if (toolNames.includes("mocksvc_search_docs")) {
      resolveChanged(toolNames);
    }
  });

  try {
    const initial = await connection.client.listTools();
    const initialToolNames = initial.tools.map((tool) => tool.name);
    assert(!initialToolNames.includes("mocksvc_search_docs"), "Dynamic mode must start before activation.");

    const discovery = await connection.client.callTool({
      name: "discover_tools",
      arguments: {
        query: "search documentation markdown"
      }
    });

    assert(!discovery.isError, "discover_tools should succeed before list_changed notification.");

    const changedToolNames = await changed;
    assert(changedToolNames.includes("mocksvc_search_docs"), "tools/list_changed refresh should include the activated proxied tool.");
  } finally {
    clearTimeout(timeout);
    await closeClient(connection);
    if (fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
  }

  console.log("Tool discovery list-changed validation passed.");
}

run().catch((error) => {
  console.error("Tool discovery list-changed validation failed:", error);
  process.exit(1);
});
