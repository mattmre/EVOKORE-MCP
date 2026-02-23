const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const path = require("path");

async function run() {
  console.log("Starting HITL Validation Client...");
  
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    stderr: "inherit"
  });
  
  const client = new Client(
    { name: "hitl-validator", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("Connected to EVOKORE-MCP Server!");
  
  const testFile = path.resolve(__dirname, "test-hitl-output.txt");

  console.log("Attempting to call restricted tool 'fs_write_file' without a token...");
  try {
    const response = await client.callTool({
      name: "fs_write_file",
      arguments: {
        path: testFile,
        content: "Hello HITL!"
      }
    });
    
    if (response.isError) {
      console.log("Received expected error from server requiring approval.");
      const errorText = response.content[0].text;
      console.log("Error message:", errorText);
      
      const match = errorText.match(/_evokore_approval_token' with the value '([^']+)'/);
      if (match && match[1]) {
        const token = match[1];
        console.log(`Extracted token: ${token}`);
        
        console.log("Simulating user approval... User said YES.");
        console.log("Retrying tool call with the token...");
        
        const retryResponse = await client.callTool({
          name: "fs_write_file",
          arguments: {
            path: testFile,
            content: "Hello HITL!",
            _evokore_approval_token: token
          }
        });
        
        if (!retryResponse.isError) {
          console.log("HITL Validation Passed! Tool executed successfully.");
          const fs = require('fs');
          if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
        } else {
          console.error("Retry failed with unexpected error:", retryResponse);
          process.exit(1);
        }
      } else {
        console.error("Failed to extract token from error message.");
        process.exit(1);
      }
    } else {
      console.error("Tool executed without approval! This is a security failure.");
      process.exit(1);
    }
  } catch (err) {
    console.error("Test failed with exception:", err);
    process.exit(1);
  }
  
  process.exit(0);
}

run();
