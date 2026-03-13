const assert = require("assert");
const fs = require("fs");
const path = require("path");

const proxyTsPath = path.resolve(__dirname, "src", "ProxyManager.ts");
const proxyJsPath = path.resolve(__dirname, "dist", "ProxyManager.js");

test("rate limiting: source-level structural validation", () => {
  const proxyTs = fs.readFileSync(proxyTsPath, "utf8");

  // RateLimitConfig interface exists with expected fields
  assert.match(proxyTs, /interface RateLimitConfig/, "RateLimitConfig interface must exist");
  assert.match(proxyTs, /requestsPerMinute\??: number/, "requestsPerMinute field must exist");
  assert.match(proxyTs, /toolLimits\??: Record<string, number>/, "toolLimits field must exist");

  // ServerConfig includes rateLimit field
  assert.match(proxyTs, /rateLimit\??: RateLimitConfig/, "ServerConfig must have rateLimit field");

  // TokenBucket class with key methods
  assert.match(proxyTs, /class TokenBucket/, "TokenBucket class must exist");
  assert.match(proxyTs, /tryConsume\(\): boolean/, "tryConsume method must exist");
  assert.match(proxyTs, /getRetryAfterMs\(\): number/, "getRetryAfterMs method must exist");
  assert.match(proxyTs, /private refill\(\): void/, "private refill method must exist");

  // Rate limit integration in callProxiedTool
  assert.match(proxyTs, /Rate limit exceeded/, "Rate limit exceeded error message must exist");
  assert.match(proxyTs, /Retry after/, "Retry after hint must be in the error message");
  assert.match(proxyTs, /checkRateLimit/, "checkRateLimit method must exist");
  assert.match(proxyTs, /rateLimitBuckets/, "rateLimitBuckets map must exist");
  assert.match(proxyTs, /initRateLimitBuckets/, "initRateLimitBuckets method must exist");

  // Existing cooldown mechanism is still present (not replaced)
  assert.match(proxyTs, /toolCooldowns/, "Existing toolCooldowns must still exist");
  assert.match(proxyTs, /COOLDOWN/, "Existing COOLDOWN message must still exist");
});

test("rate limiting: TokenBucket class is exported and functional", () => {
  const { TokenBucket } = require(proxyJsPath);

  assert(TokenBucket, "TokenBucket must be exported from the compiled module");

  // Bucket with 2 requests per minute
  const bucket = new TokenBucket(2);

  // First two should succeed
  assert.strictEqual(bucket.tryConsume(), true, "First consume should succeed");
  assert.strictEqual(bucket.tryConsume(), true, "Second consume should succeed");

  // Third should fail (bucket exhausted)
  assert.strictEqual(bucket.tryConsume(), false, "Third consume should fail (bucket empty)");

  // getRetryAfterMs should return a positive value when exhausted
  const retryMs = bucket.getRetryAfterMs();
  assert(retryMs > 0, `Retry after should be positive when bucket is empty, got ${retryMs}`);
  assert(retryMs <= 60000, `Retry after should be within 60 seconds, got ${retryMs}`);
});

test("rate limiting: TokenBucket refills over time", () => {
  const { TokenBucket } = require(proxyJsPath);

  const bucket = new TokenBucket(60); // 1 per second

  // Exhaust all tokens
  for (let i = 0; i < 60; i++) {
    bucket.tryConsume();
  }
  assert.strictEqual(bucket.tryConsume(), false, "Bucket should be empty after exhausting all tokens");

  // getRetryAfterMs should return a small positive value
  const retryMs = bucket.getRetryAfterMs();
  assert(retryMs > 0 && retryMs <= 1100, `Expected short retry (~1s) for 60rpm bucket, got ${retryMs}ms`);
});

test("rate limiting: ProxyManager enforces rate limits on proxied calls", async () => {
  const { ProxyManager } = require(proxyJsPath);
  const { SecurityManager } = require(path.resolve(__dirname, "dist", "SecurityManager.js"));
  const { TokenBucket } = require(proxyJsPath);

  const security = new SecurityManager();
  const proxy = new ProxyManager(security);

  // Set up mock server/tool like the cooldown test pattern
  proxy.toolRegistry.set("mock_tool", { serverId: "mock_server", originalName: "tool" });
  proxy.serverRegistry.set("mock_server", {
    id: "mock_server",
    status: "connected",
    connectionType: "stdio",
    errorCount: 0,
    lastPing: Date.now(),
    registeredToolCount: 1
  });

  let callCount = 0;
  proxy.clients.set("mock_server", {
    callTool: async () => {
      callCount++;
      return {
        content: [{ type: "text", text: "Success result from mock server" }],
        isError: false
      };
    }
  });

  // Install a rate limit bucket with 1 request per minute for the server
  proxy.rateLimitBuckets.set("mock_server", new TokenBucket(1));

  // First call should succeed
  const first = await proxy.callProxiedTool("mock_tool", { query: "test" });
  assert(!first.isError, "First call should succeed");
  assert.strictEqual(callCount, 1, "First call should reach upstream");

  // Second call should be rate limited (throws McpError)
  let rateLimited = false;
  try {
    await proxy.callProxiedTool("mock_tool", { query: "test2" });
  } catch (err) {
    rateLimited = true;
    assert(err.message.includes("Rate limit exceeded"), `Expected rate limit message, got: ${err.message}`);
    assert(err.message.includes("Retry after"), `Expected retry-after hint, got: ${err.message}`);
  }
  assert(rateLimited, "Second call should throw a rate limit error");
  assert.strictEqual(callCount, 1, "Rate-limited call should not reach upstream");
});

test("rate limiting: tool-level overrides work independently of server-level", async () => {
  const { ProxyManager } = require(proxyJsPath);
  const { SecurityManager } = require(path.resolve(__dirname, "dist", "SecurityManager.js"));
  const { TokenBucket } = require(proxyJsPath);

  const security = new SecurityManager();
  const proxy = new ProxyManager(security);

  proxy.toolRegistry.set("svc_toolA", { serverId: "svc", originalName: "toolA" });
  proxy.toolRegistry.set("svc_toolB", { serverId: "svc", originalName: "toolB" });
  proxy.serverRegistry.set("svc", {
    id: "svc",
    status: "connected",
    connectionType: "stdio",
    errorCount: 0,
    lastPing: Date.now(),
    registeredToolCount: 2
  });

  let callLog = [];
  proxy.clients.set("svc", {
    callTool: async ({ name }) => {
      callLog.push(name);
      return {
        content: [{ type: "text", text: "Success from " + name }],
        isError: false
      };
    }
  });

  // Tool-level limit: toolA has 1 rpm, toolB has no limit
  proxy.rateLimitBuckets.set("svc/toolA", new TokenBucket(1));
  // No server-level bucket, no toolB bucket

  // toolA first call succeeds
  const a1 = await proxy.callProxiedTool("svc_toolA", {});
  assert(!a1.isError, "toolA first call should succeed");

  // toolA second call is rate-limited
  let toolARateLimited = false;
  try {
    await proxy.callProxiedTool("svc_toolA", {});
  } catch (err) {
    toolARateLimited = true;
    assert(err.message.includes("Rate limit exceeded"), "toolA should be rate limited");
    assert(err.message.includes("svc/toolA"), "Error should mention the specific tool");
  }
  assert(toolARateLimited, "toolA second call must be rate limited");

  // toolB should still work fine (no rate limit configured)
  const b1 = await proxy.callProxiedTool("svc_toolB", {});
  assert(!b1.isError, "toolB should not be rate limited");

  const b2 = await proxy.callProxiedTool("svc_toolB", {});
  assert(!b2.isError, "toolB second call should still succeed");

  assert.deepStrictEqual(callLog, ["toolA", "toolB", "toolB"],
    "Only toolA first call and both toolB calls should reach upstream");
});

test("rate limiting: coexists with existing cooldown mechanism", async () => {
  const { ProxyManager } = require(proxyJsPath);
  const { SecurityManager } = require(path.resolve(__dirname, "dist", "SecurityManager.js"));

  const security = new SecurityManager();
  const proxy = new ProxyManager(security);

  proxy.toolRegistry.set("mock_tool", { serverId: "mock_server", originalName: "tool" });
  proxy.serverRegistry.set("mock_server", {
    id: "mock_server",
    status: "connected",
    connectionType: "stdio",
    errorCount: 0,
    lastPing: Date.now(),
    registeredToolCount: 1
  });

  proxy.clients.set("mock_server", {
    callTool: async () => ({
      content: [{ type: "text", text: "OK" }],
      isError: false
    })
  });

  // No rate limit configured - should trigger cooldown (short response < 15 chars)
  const first = await proxy.callProxiedTool("mock_tool", { a: 1 });
  assert(!first.isError, "First call should succeed even with short response");

  // Same args should hit cooldown (reactive mechanism)
  const second = await proxy.callProxiedTool("mock_tool", { a: 1 });
  assert(second.isError, "Second same-args call should hit cooldown");
  assert(second.content[0].text.includes("COOLDOWN"), "Should be a cooldown response, not rate limit");
});
