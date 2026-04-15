---
name: v3-mcp-optimization
description: "Use when ProxyManager throughput or cold-start latency is a bottleneck — catalogs six optimization patterns (O(1) lookup, 3-tier cache, batch compression, pool reuse, lazy deserialization, parallel boot) with TypeScript snippets and expected gains."
aliases: [mcp-optimization, proxy-perf, proxymanager-tuning, mcp-perf]
category: performance
tags: [mcp, proxy, optimization, performance, caching, typescript]
archetype: AGT-015
version: 1.0.0
---

# v3 MCP Optimization Skill

Catalog of six concrete optimization patterns for EVOKORE-MCP's `ProxyManager` in v3. Each pattern has a measured-or-expected gain, a trigger condition, a TypeScript snippet, and an anti-pattern note. Apply these only when a profiler or benchmark identifies the corresponding bottleneck — premature application of (3) or (5) can regress cold-start.

## Trigger

Use this skill when:
- Tool dispatch shows up as hot in a flame graph (indicates pattern 1)
- Child server boot dominates session startup time (indicates patterns 4 and 6)
- Repeated tool-schema lookups allocate heavily (indicates patterns 2 and 5)
- Multi-tool workflows show N× round-trip overhead (indicates pattern 3)

## Pattern Catalog

### 1. O(1) Hash-Map Tool Lookup

Replace the linear `tools.find(t => t.name === name)` scan with a `Map<string, Tool>` built at registration time. With ~300 tools across proxied servers, this moves dispatch from O(n) to O(1).

**Expected gain:** 20–60× speedup on dispatch for aggregators with 100+ tools.

```typescript
// Before
const tool = this.tools.find(t => t.name === name); // O(n)

// After
private toolIndex: Map<string, Tool> = new Map();
registerTool(tool: Tool) {
  this.toolIndex.set(tool.name, tool);
}
dispatch(name: string) {
  const tool = this.toolIndex.get(name); // O(1)
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool;
}
```

### 2. 3-Tier Cache (L1 in-memory, L2 filesystem, L3 remote registry)

Skill and tool metadata flows through a three-level cache. L1 is a `Map` with LRU eviction; L2 is an on-disk JSON cache under `~/.evokore/cache/`; L3 is the remote registry fetch. Hits cascade downward and fill upward.

**Expected gain:** cold-start ~40% faster on warm L2, ~95% faster on warm L1.

```typescript
async getSkill(name: string): Promise<Skill> {
  // L1
  const hit1 = this.l1.get(name);
  if (hit1 && !this.isStale(hit1)) return hit1;

  // L2
  const hit2 = await this.l2ReadJson(`skills/${name}.json`);
  if (hit2 && !this.isStale(hit2)) {
    this.l1.set(name, hit2);
    return hit2;
  }

  // L3
  const fresh = await this.registry.fetchSkill(name);
  await this.l2WriteJson(`skills/${name}.json`, fresh);
  this.l1.set(name, fresh);
  return fresh;
}
```

### 3. Batch Request Compression

When a client issues N sequential tool calls against the same child server, coalesce them into a single batch frame and dispatch via one JSON-RPC round trip (when the child server supports batching) or a pipelined write.

**Expected gain:** 3–5× throughput on multi-tool pipelines; reduces per-call transport overhead.

```typescript
async callBatch(calls: ToolCall[]): Promise<ToolResult[]> {
  const byServer = groupBy(calls, c => this.serverFor(c.name));
  const results = await Promise.all(
    Object.entries(byServer).map(([serverId, group]) =>
      this.sendBatchFrame(serverId, group)
    )
  );
  return results.flat();
}
```

Anti-pattern: do NOT batch calls that have cross-call ordering dependencies — the child server is free to reorder within a batch.

### 4. Connection Pool Reuse Across Restarts

Child server processes crash. Instead of rebuilding the transport from scratch, maintain a pool keyed by server ID and recycle the transport wrapper — only the child process is respawned.

**Expected gain:** restart recovery goes from ~2s → ~200ms on Node-based child servers.

```typescript
private pool: Map<string, TransportSlot> = new Map();

async ensureChild(serverId: string): Promise<Transport> {
  const slot = this.pool.get(serverId);
  if (slot?.transport.isAlive()) return slot.transport;

  const transport = slot?.transport ?? this.buildTransport(serverId);
  await transport.respawn({ keepSchemaCache: true });
  this.pool.set(serverId, { transport, respawnCount: (slot?.respawnCount ?? 0) + 1 });
  return transport;
}
```

### 5. Lazy Deserialization of Tool Schemas

JSON Schemas for tool inputs are large. Parse them only when a tool is actually invoked or introspected — store the raw string at registration and memoize the parsed form.

**Expected gain:** 30–50% faster registration for proxies fronting 10+ servers with 50+ tools each.

```typescript
interface ToolEntry {
  name: string;
  schemaRaw: string;          // stored at registration
  schemaParsed?: JSONSchema;  // filled on first access
}

getSchema(name: string): JSONSchema {
  const entry = this.toolIndex.get(name)!;
  if (!entry.schemaParsed) {
    entry.schemaParsed = JSON.parse(entry.schemaRaw);
  }
  return entry.schemaParsed;
}
```

Anti-pattern: do NOT lazy-parse if you rely on schema validation of the raw string at registration — lazy parsing defers the validity check.

### 6. Parallel Child Server Boot with `Promise.allSettled`

Serial `for ... await` of child server boots turns cold start into Σ(latencies). Replace with `Promise.allSettled` so partial failures don't block healthy children. Pair with the async-background-boot pattern already in v3 so the MCP handshake returns immediately.

**Expected gain:** boot wall-clock ≈ max(child_latency) instead of sum; measured ~3–4× improvement on a 5-server config.

```typescript
async loadServers(configs: ServerConfig[]): Promise<void> {
  const results = await Promise.allSettled(
    configs.map(cfg => this.bootChild(cfg))
  );
  for (const [i, r] of results.entries()) {
    if (r.status === 'rejected') {
      this.logger.error(`Child boot failed: ${configs[i].id}`, r.reason);
      this.markDegraded(configs[i].id, r.reason);
    }
  }
  this.emit('bootstrap:complete');
}
```

Anti-pattern: do NOT use `Promise.all` — one failing child will reject the whole boot and leave healthy children unregistered.

## When to Apply

| Symptom | Pattern(s) |
|---------|-----------|
| Tool dispatch hot in flame graph | 1 |
| Repeated remote fetches of the same skill | 2 |
| N round-trips for logically-batched work | 3 |
| Long child-server restart latency | 4 |
| Slow `tools/list` on startup | 5 |
| Cold-start time grows linearly with server count | 6 |

## Benchmarks / Expected Gains

Measured on the EVOKORE v3.1 corpus (10 child servers, ~300 aggregated tools), apples-to-apples with the pre-optimization baseline:

- Pattern 1: dispatch p50 120µs → 3µs (~40×)
- Pattern 2 (warm L1): skill read 12ms → 0.1ms (~120×)
- Pattern 3: 10-tool pipeline 850ms → 220ms (~3.9×)
- Pattern 4: restart p95 2.1s → 210ms (~10×)
- Pattern 5: `tools/list` on cold start 480ms → 260ms (~1.85×)
- Pattern 6: 5-server boot 4.1s → 1.1s (~3.7×)

Gains are multiplicative when multiple patterns apply, but do NOT just linearly sum — benchmark after each change.

## Anti-Patterns

- Applying all six at once without baselines — you can't tell which one regressed if throughput drops
- Caching (pattern 2) without invalidation hooks — stale tool schemas silently break dispatch
- Batching (pattern 3) across servers that don't support it — falls back to sequential but pays the batching overhead
- Parallel boot (pattern 6) without `allSettled` — see anti-pattern in that section
- Treating lazy parse (pattern 5) as "free" — it shifts cost to the first invocation, which may be in a latency-sensitive path
