const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

async function run() {
  console.log("Starting E2E Validation Client...");
  
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    stderr: "inherit"
  });
  
  const client = new Client(
    { name: "e2e-validator", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("Connected to EVOKORE-MCP Server!");
  
  const response = await client.listTools();
  console.log(`
Success! Retrieved ${response.tools.length} tools in total.
`);

  if (!response.tools.some(t => t.name === "discover_tools")) {
    throw new Error("discover_tools was not returned by listTools().");
  }
  
  const proxiedFsTools = response.tools.filter(t => t.name.startsWith("fs_"));
  const proxiedGithubTools = response.tools.filter(t => t.name.startsWith("github_"));
  const nativeTools = response.tools.filter(t => !t.name.startsWith("fs_") && !t.name.startsWith("github_"));
  
  console.log(`Native EVOKORE Tools (${nativeTools.length}):`, nativeTools.map(t => t.name).join(", "));
  console.log(`Proxied FS Tools (${proxiedFsTools.length}):`, proxiedFsTools.map(t => t.name).join(", "));
  console.log(`Proxied GitHub Tools (${proxiedGithubTools.length}):`, proxiedGithubTools.map(t => t.name).join(", "));
  
  process.exit(0);
}

run().catch(err => {
  console.error("E2E Validation Failed:", err);
  process.exit(1);
});
