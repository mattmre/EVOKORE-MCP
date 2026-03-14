const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const path = require("path");
const fs = require("fs");
const { waitForProxyBoot } = require("./tests/helpers/wait-for-proxy-boot");

test('SkillManager integration', async () => {
  console.log("Starting SkillManager Integration Client...");
  
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    stderr: "pipe",
    env: {
      ...process.env,
      EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS: "5000"
    }
  });

  const client = new Client(
    { name: "skillmanager-validator", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  await waitForProxyBoot(transport);
  console.log("Connected to EVOKORE-MCP Server!");

  const toolsResponse = await client.listTools();
  if (!toolsResponse.tools.some((tool) => tool.name === "discover_tools")) {
    console.error("discover_tools was not exposed in the server tool list.");
    throw new Error("Test failed");
}
  
  // Test docs_architect
  console.log("Testing docs_architect...");
  const docsResponse = await client.callTool({
    name: "docs_architect",
    arguments: {
      target_dir: __dirname
    }
  });

  if (!docsResponse.isError && docsResponse.content[0].text.includes("You are the Documentation Architect")) {
    console.log("docs_architect test passed!");
  } else {
    console.error("docs_architect test failed:", docsResponse);
    throw new Error("Test failed");
}

  // Test skill_creator
  console.log("Testing skill_creator...");
  const testSkillName = "test-skill-xyz";
  const testTargetDir = __dirname;
  const testSkillPath = path.join(testTargetDir, testSkillName);
  const testSkillMdPath = path.join(testSkillPath, "SKILL.md");

  // Create skill_creator
  const creatorResponse = await client.callTool({
    name: "skill_creator",
    arguments: {
      skill_name: testSkillName,
      target_dir: testTargetDir,
      description: "A test skill."
    }
  });

  if (creatorResponse.isError) {
      console.log("skill_creator correctly returned an error (likely HITL interception):", creatorResponse.content[0].text);
      
      const errorText = creatorResponse.content[0].text;
      const match = errorText.match(/_evokore_approval_token' with the value '([^']+)'/);
      
      if (match && match[1]) {
          const token = match[1];
          console.log(`Extracted token: ${token}`);
          console.log("Retrying tool call with the token...");
          
          const retryResponse = await client.callTool({
            name: "skill_creator",
            arguments: {
              skill_name: testSkillName,
              target_dir: testTargetDir,
              description: "A test skill.",
              _evokore_approval_token: token
            }
          });
          
          if (!retryResponse.isError) {
              console.log("skill_creator test passed on retry!");
              if (fs.existsSync(testSkillMdPath)) {
                  fs.rmSync(testSkillPath, { recursive: true, force: true });
              }
          } else {
              console.error("skill_creator retry failed:", retryResponse);
    throw new Error("Test failed");
}
      } else {
          console.error("Failed to extract token or unexpected error:", errorText);
    throw new Error("Test failed");
}
  } else {
      console.log("skill_creator test passed without HITL (perhaps it's not intercepted)! Response:", creatorResponse.content[0].text);
      if (fs.existsSync(testSkillMdPath)) {
          fs.rmSync(testSkillPath, { recursive: true, force: true });
      }
  }

  console.log("SkillManager Validation Passed!");
});
