const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const path = require("path");
const { waitForProxyBoot } = require("./tests/helpers/wait-for-proxy-boot");

test('HITL approval token flow', async () => {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    stderr: "pipe",
    env: {
      ...process.env,
      EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS: "15000"
    }
  });

  const client = new Client(
    { name: "hitl-validator", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  await waitForProxyBoot(transport);

  const testFile = path.resolve(__dirname, "test-hitl-output.txt");

  const response = await client.callTool({
    name: "fs_write_file",
    arguments: {
      path: testFile,
      content: "Hello HITL!"
    }
  });

  if (response.isError) {
    const errorText = response.content[0].text;

    const match = errorText.match(/_evokore_approval_token' with the value '([^']+)'/);
    if (match && match[1]) {
      const token = match[1];

      const retryResponse = await client.callTool({
        name: "fs_write_file",
        arguments: {
          path: testFile,
          content: "Hello HITL!",
          _evokore_approval_token: token
        }
      });

      if (!retryResponse.isError) {
        const fs = require('fs');
        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
      } else {
        throw new Error("Retry failed with unexpected error: " + JSON.stringify(retryResponse));
      }
    } else {
      throw new Error("Failed to extract token from error message.");
    }
  } else {
    throw new Error("Tool executed without approval! This is a security failure.");
  }
});
