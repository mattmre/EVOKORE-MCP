const assert = require("assert");
const { SessionIsolation } = require("./dist/SessionIsolation.js");

/**
 * Tests that SessionIsolation enforces per-session tool activation isolation,
 * TTL-based expiry, and LRU eviction at capacity.
 *
 * Previously this test directly accessed EvokoreMCPServer.activatedToolSessionsBySession.
 * After the wiring refactor, session state is managed entirely via SessionIsolation,
 * so these tests exercise that module directly.
 */

function testSessionIsolation() {
  const iso = new SessionIsolation({ ttlMs: 60000 });

  // Session A activates a tool
  const sessionA = iso.createSession("session-a");
  sessionA.activatedTools.add("mocksvc_search_docs");

  // Session B should not see session A's tools
  const sessionB = iso.createSession("session-b");

  assert(sessionA.activatedTools.has("mocksvc_search_docs"), "Session A should see its activated proxied tool.");
  assert(!sessionB.activatedTools.has("mocksvc_search_docs"), "Session B should remain isolated from session A activations.");
  assert.strictEqual(sessionB.activatedTools.size, 0, "Session B should have no activated tools.");
}

function testStaleSessionResetAndPrune() {
  // Use a short TTL so we can test expiry
  const iso = new SessionIsolation({ ttlMs: 100, maxSessions: 100 });

  // Create a session and immediately back-date it to simulate expiry
  const expired = iso.createSession("expired-session");
  expired.activatedTools.add("mocksvc_search_docs");
  expired.lastAccessedAt = 0; // epoch = long expired

  // Accessing the expired session should return null (TTL exceeded)
  const retrieved = iso.getSession("expired-session");
  assert.strictEqual(retrieved, null, "Expired session state should be cleaned up on access.");

  // Re-creating the same session ID should yield a fresh empty set
  const fresh = iso.createSession("expired-session");
  assert.strictEqual(fresh.activatedTools.size, 0, "Recreated session should have an empty activation set.");

  // Fill to capacity to test LRU eviction
  const isoFull = new SessionIsolation({ ttlMs: 60000, maxSessions: 100 });
  for (let index = 0; index < 100; index += 1) {
    const session = isoFull.createSession(`session-${index}`);
    session.activatedTools.add(`tool-${index}`);
    session.lastAccessedAt = index + 1; // ascending access times
  }

  // At capacity (100/100). Creating one more should evict session-0 (oldest lastAccessedAt = 1)
  isoFull.createSession("fresh-session");

  assert.strictEqual(isoFull.getSession("session-0"), null, "The oldest non-stale session should be evicted when at capacity.");
  assert.notStrictEqual(isoFull.getSession("fresh-session"), null, "The current session should be retained after eviction.");
  assert(isoFull.listSessions().length <= 100, "Session count should stay bounded at maxSessions.");
}

test('tool discovery session hardening validation', async () => {
  console.log("Starting tool discovery session hardening validation...");
  testSessionIsolation();
  testStaleSessionResetAndPrune();
});
