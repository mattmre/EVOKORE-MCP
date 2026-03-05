const { ProxyManager } = require('./dist/ProxyManager.js');
const { SecurityManager } = require('./dist/SecurityManager.js');

async function runTest() {
  console.log("Starting ProxyManager Cooldown Test...");

  const security = new SecurityManager();
  const proxy = new ProxyManager(security);

  // Mock internal state to bypass full server boot
  proxy.toolRegistry.set('mock_tool', { serverId: 'mock_server', originalName: 'tool' });
  
  proxy.serverRegistry.set('mock_server', {
    id: 'mock_server',
    status: 'connected',
    connectionType: 'stdio',
    errorCount: 0,
    lastPing: Date.now()
  });

  // Mock the MCP client
  let callCount = 0;
  const mockClient = {
    callTool: async (args) => {
      callCount++;
      // Return a short string to trigger cooldown
      return {
        content: [{ type: "text", text: "OK" }],
        isError: false
      };
    }
  };
  proxy.clients.set('mock_server', mockClient);

  // Test 1: First call should succeed and trigger a cooldown due to short result
  console.log("Executing first tool call...");
  const result1 = await proxy.callProxiedTool('mock_tool', {});
  if (result1.content[0].text !== "OK") {
    throw new Error("First call failed to return OK");
  }
  
  // Test 2: Immediate second call should be blocked by cooldown
  console.log("Executing second tool call immediately...");
  const result2 = await proxy.callProxiedTool('mock_tool', {});
  if (!result2.isError || !result2.content[0].text.includes("COOLDOWN")) {
    throw new Error("Second call was not blocked by cooldown: " + JSON.stringify(result2));
  }
  
  console.log("Cooldown triggered correctly:", result2.content[0].text);

  // Test 3: Clear cooldown and test error triggers cooldown
  proxy.toolCooldowns.clear();
  mockClient.callTool = async () => {
    return {
      content: [{ type: "text", text: "Some long error message..." }],
      isError: true
    };
  };

  const result3 = await proxy.callProxiedTool('mock_tool', {});
  console.log("Executing third tool call (error response)...");
  
  const result4 = await proxy.callProxiedTool('mock_tool', {});
  if (!result4.isError || !result4.content[0].text.includes("COOLDOWN")) {
    throw new Error("Error response did not trigger cooldown");
  }

  // Test 4: Clear cooldown and test exception triggers cooldown
  proxy.toolCooldowns.clear();
  mockClient.callTool = async () => {
    throw new Error("Simulated transport error");
  };

  console.log("Executing fifth tool call (exception)...");
  try {
    await proxy.callProxiedTool('mock_tool', {});
  } catch (e) {
    console.log("Caught expected exception");
  }

  const result5 = await proxy.callProxiedTool('mock_tool', {});
  if (!result5.isError || !result5.content[0].text.includes("COOLDOWN")) {
    throw new Error("Exception did not trigger cooldown");
  }

  console.log("All cooldown tests passed successfully.");
}

runTest().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
