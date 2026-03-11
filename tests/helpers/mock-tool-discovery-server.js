const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} = require("@modelcontextprotocol/sdk/types.js");

const tools = [
  {
    name: "search_docs",
    description: "Search repository documentation and markdown knowledge sources.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"]
    }
  },
  {
    name: "deploy_release",
    description: "Deploy release artifacts to a target environment.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string" }
      },
      required: ["target"]
    }
  },
  {
    name: "hidden_exact",
    description: "Compatibility probe tool used to validate exact-name proxy routing.",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" }
      },
      required: ["value"]
    }
  },
  {
    name: "ops_ping",
    description: "Tool with an object schema but no declared properties.",
    inputSchema: {
      type: "object"
    }
  }
];

async function run() {
  const server = new Server(
    { name: "mock-tool-discovery-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments || {};

    switch (request.params.name) {
      case "search_docs":
        return {
          content: [{ type: "text", text: `search_docs:${args.query}` }]
        };
      case "deploy_release":
        return {
          content: [{ type: "text", text: `deploy_release:${args.target}` }]
        };
      case "hidden_exact":
        return {
          content: [{ type: "text", text: `hidden_exact:${args.value}` }]
        };
      case "ops_ping":
        return {
          content: [{ type: "text", text: "ops_ping:ok" }]
        };
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown mock tool: ${request.params.name}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((error) => {
  console.error("[mock-tool-discovery-server] fatal error", error);
  process.exit(1);
});
