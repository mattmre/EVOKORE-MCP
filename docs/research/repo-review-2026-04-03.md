# EVOKORE-MCP Comprehensive Panel Code Review
**Date:** 2026-04-03  
**Method:** 8 parallel expert panels (Security, Architecture, Code Quality, Performance, Testing/DevOps, Observability, Developer Experience, External Research)  
**Scope:** All 18 TypeScript source files, 5 hook scripts, 4 CI/CD workflows, test suite, docs, dependencies  
**Total Findings:** 68 items (31 BUG, 19 IMPROVEMENT, 18 RESEARCH)

---

## Severity Legend
- **CRITICAL** — Active security vulnerability or data-loss bug; fix before next release
- **HIGH** — Behavioral bug or significant quality gap; fix in current sprint
- **MEDIUM** — Quality, performance, or reliability issue; fix in next sprint
- **LOW** — Polish, documentation, API ergonomics

---

## Part 1: BUGS (Critical / High Priority)

### BUG-01 — SecurityManager: denyToken matches on 8-char prefix only (no timing-safe comparison)
**Severity:** CRITICAL  
**Component:** `src/SecurityManager.ts:281-283, 327`  
**Panel:** Security Audit — Dr. Natasha Volkov (Pen Tester)

`denyToken()` and `checkDeniedTokens()` match approval tokens using `token.startsWith(tokenPrefix)` where `tokenPrefix` is the first 8 hex characters. The 8-char prefix is also displayed in the approvals dashboard, allowing any observer to construct a denial for a token they do not own — or to guess and deny another user's pending approval. The `startsWith()` comparison also short-circuits on the first mismatched byte, creating a timing oracle against the prefix.

**Fix:** Require the full 32-character token for deny operations. Replace `startsWith()` with `crypto.timingSafeEqual` on the complete token bytes.  
**Effort:** LOW

---

### BUG-02 — OAuthProvider: length-oracle timing attack on static token comparison
**Severity:** CRITICAL  
**Component:** `src/auth/OAuthProvider.ts:122-127`  
**Panel:** Security Audit — Omar Hassan (Crypto)

In static token mode, the code returns `false` immediately when `tokenBuffer.length !== expectedBuffer.length` — before reaching the `crypto.timingSafeEqual` call. An attacker can determine the exact byte-length of the expected token by measuring response time differences between differently-sized probes.

**Fix:** Pad both buffers to a fixed constant length (e.g. 64 bytes) before calling `timingSafeEqual`, or HMAC both sides with a fixed key and compare the fixed-length digest — the canonical pattern used by Rack and Stripe.  
**Effort:** LOW

---

### BUG-03 — SecurityManager: setActiveRole() has no access control
**Severity:** CRITICAL  
**Component:** `src/SecurityManager.ts:130-140`  
**Panel:** Security Audit — Dr. Lisa Park (Threat Modeler)

`setActiveRole()` is a public method with no authentication check. Any plugin, tool handler, or code path holding a reference to the `SecurityManager` singleton can silently downgrade the active role (e.g. from `admin` to `readonly`) or disable RBAC entirely by passing `null`. No audit event is emitted.

**Fix:** Require an admin credential parameter, or make the method internal-only and not invocable through any tool interface. Every invocation must emit a `config_change` audit event.  
**Effort:** LOW

---

### BUG-04 — HttpServer: WebSocket approval token passed in URL query string
**Severity:** CRITICAL  
**Component:** `src/HttpServer.ts:289`  
**Panel:** Security Audit — Dr. Natasha Volkov (Pen Tester)

The WebSocket `/ws/approvals` endpoint authenticates via `?token=...` in the URL. Credentials in query strings appear in server access logs, proxy logs, browser history, and Referer headers. The MCP Security Specification explicitly warns against credentials in URLs.

**Fix:** Read the token from the `Authorization` header on the HTTP `101 Upgrade` request. Add `EVOKORE_WS_ALLOW_QUERY_TOKEN=true` as a deprecated opt-in fallback only.  
**Effort:** LOW

---

### BUG-05 — index.ts: TOCTOU race in Redis SessionIsolation swap (early sessions permanently lost)
**Severity:** HIGH  
**Component:** `src/index.ts:107-134`  
**Panel:** Architecture — Dr. Wei Zhang (Principal Engineer)

The constructor boots with a `MemorySessionStore`-backed `SessionIsolation`, then asynchronously replaces `this.sessionIsolation` with a new Redis-backed instance once Redis connects. Any session created in the window between constructor completion and Redis readiness (including the default stdio session and the first HTTP request) is attached to the abandoned `MemorySessionStore` and permanently lost to the new instance.

**Fix:** Accept a `Promise<SessionStore>` in `SessionIsolation` so the same instance upgrades its backing store, OR defer `run()`/`runHttp()` until after Redis initialization. Do not swap the instance reference.  
**Effort:** MEDIUM

---

### BUG-06 — index.ts: Signal handlers added on every run() call without removal (MaxListeners leak)
**Severity:** HIGH  
**Component:** `src/index.ts:759-808`  
**Panel:** Architecture — Yusuf Al-Rashid (Risk Analyst)

Every call to `run()` or `runHttp()` registers new `SIGTERM`/`SIGINT` handlers with `process.on()` without removing the previous ones. In tests or any scenario where the server is instantiated multiple times in the same process, this causes duplicate shutdown invocations and emits `MaxListenersExceededWarning`, which some CI harnesses treat as test failures.

**Fix:** Use `process.once()` instead of `process.on()`, or store handler references and call `process.off()` inside the shutdown handler. Expose a `teardown()` method for test hygiene.  
**Effort:** LOW

---

### BUG-07 — ProxyManager: toolCooldowns is an unbounded Map (memory leak)
**Severity:** HIGH  
**Component:** `src/ProxyManager.ts:91, 630, 636`  
**Panel:** Architecture — Dr. Wei Zhang (Principal Engineer)

`toolCooldowns` is a `Map<string, number>` that only grows. Every unique `(toolName, args)` combination that triggers a cooldown creates a permanent entry. Long-running sessions with dynamic args (timestamps, UUIDs, file paths) will slowly consume unbounded memory with no eviction path.

**Fix:** Delete expired entries after the expiry check: `this.toolCooldowns.delete(cooldownKey)`. Cap the Map at 1000 entries and evict the oldest on overflow.  
**Effort:** LOW

---

### BUG-08 — HttpServer: session reattachment causes double transports.set (zombie transport on connect failure)
**Severity:** HIGH  
**Component:** `src/HttpServer.ts:476-493`  
**Panel:** Architecture — Yusuf Al-Rashid (Risk Analyst)

During session reattachment, `onsessioninitialized` sets the transport in `this.transports`, and then line 493 sets it again unconditionally — a guaranteed double-write. If `mcpServer.connect()` fails asynchronously after the map is set, the zombie transport entry is never cleaned up, leaking an open resource.

**Fix:** Remove the redundant line 493 set; rely solely on `onsessioninitialized`. Wrap `await mcpServer.connect()` in a try/catch that calls `close()` and deletes the entry on failure.  
**Effort:** LOW

---

### BUG-09 — SkillManager: extractCodeBlocks regex is ReDoS-vulnerable on unclosed fences
**Severity:** HIGH  
**Component:** `src/SkillManager.ts:683-699`  
**Panel:** Code Quality — Dr. James Okafor (SRE)

The regex `` /```(\w*)\n([\s\S]*?)```/g `` with a lazy `[\s\S]*?` and no line-count ceiling causes O(n²) backtracking when a skill file contains an unclosed triple-backtick. With 336 skills and any adversarially crafted (or simply malformed) skill, this blocks the Node.js event loop during `execute_skill` calls.

**Fix:** Add a content size pre-check (`if content.length > 512_000, throw`), or rewrite as a stateful line-by-line fence parser (O(n), no backtracking).  
**Effort:** MEDIUM

---

### BUG-10 — SkillManager/RegistryManager: httpGet duplicated with behavioral drift
**Severity:** HIGH  
**Component:** `src/SkillManager.ts:1552`, `src/RegistryManager.ts:260`  
**Panel:** Code Quality — Sofia Andersson (Backend Engineer)

`httpGet` is duplicated in full between `SkillManager` and `RegistryManager`. The `SkillManager` copy uses a raw string protocol check (`url.startsWith("https")`) instead of the parsed `parsedUrl.protocol` check in `RegistryManager`. The hardcoded timeout error string `"Request timed out after 30s"` in `SkillManager` has already drifted from `RegistryManager`'s computed `FETCH_TIMEOUT_MS / 1000` value.

**Fix:** Extract `httpGet`, `MAX_FETCH_SIZE`, `MAX_REDIRECT_DEPTH`, and `FETCH_TIMEOUT_MS` into a shared `src/httpUtils.ts` module. Both managers import from it.  
**Effort:** LOW

---

### BUG-11 — SkillManager: refreshSkills destroys cache before new scan completes
**Severity:** HIGH  
**Component:** `src/SkillManager.ts:172-215`  
**Panel:** Code Quality — Sofia Andersson (Backend Engineer)

`loadSkills()` calls `this.skillsCache.clear()` as its first action. If the directory walk subsequently throws (e.g., `EPERM`, network drive unavailability), the cache is left empty. All downstream tools (`search_skills`, `resolve_workflow`, `execute_skill`, `get_skill_help`) return zero results until the next successful refresh.

**Fix:** Build into a temporary `Map<string, SkillMetadata>`, then atomically replace `this.skillsCache` only on success.  
**Effort:** LOW

---

### BUG-12 — PluginManager: hot-reload does not invalidate transitive require() dependencies
**Severity:** HIGH  
**Component:** `src/PluginManager.ts:166-171`  
**Panel:** Code Quality — Dr. James Okafor (SRE)

Plugin hot-reload uses `delete require.cache[resolvedPath]` then `require(filePath)`. This invalidates only the entry file, not transitive local imports. A plugin importing `./helpers.js` will hot-reload its entry point but continue using the stale helper module. There is also no mutex against concurrent `loadPlugins()` calls racing through the same cache busting.

**Fix:** Before `require()`, recursively collect and delete all cache entries whose `filename` starts with `path.dirname(filePath)`. Add a boolean `isReloading` guard to serialize concurrent reloads.  
**Effort:** MEDIUM

---

### BUG-13 — TelemetryManager: synchronous I/O on Node.js event loop (flushToDisk / loadFromDisk)
**Severity:** HIGH  
**Component:** `src/TelemetryManager.ts:261-293`  
**Panel:** Performance — Dr. Raj Patel

`flushToDisk()` uses `fs.existsSync`, `fs.mkdirSync`, and `fs.writeFileSync` — all blocking. Called on a 5-minute timer and from `resetMetrics()` (which is tool-call-triggered), any I/O stall (network drive, AV scan, disk pressure on Windows) blocks all in-flight MCP requests. `loadFromDisk()` uses `fs.readFileSync` on startup, also blocking.

**Fix:** Replace with `fs.promises.mkdir / writeFile / readFile`. Rename to `flushToDiskAsync()`. Await the startup load before accepting connections.  
**Effort:** LOW

---

### BUG-14 — TelemetryManager: latency accumulator loses precision across restarts
**Severity:** HIGH  
**Component:** `src/TelemetryManager.ts:290-293`  
**Panel:** Performance — Dr. Raj Patel

The latency accumulator is reconstructed from disk by computing `avgLatencyMs * toolCallCount`, but `avgLatencyMs` was already rounded to the nearest integer before being written. For 100,000 calls at 45.7 ms average, this reconstructs 4,500,000 ms instead of 4,570,000 ms — a permanent 1.5% drift per restart that compounds.

**Fix:** Persist both `latencyTotalMs` and `latencyCount` as separate fields in the JSON alongside `avgLatencyMs`. Restore the raw accumulator directly on load. Bump `telemetryVersion` to 3.  
**Effort:** LOW

---

### BUG-15 — security-scan.yml: Trivy DB cache key guarantees cache miss on every run
**Severity:** HIGH  
**Component:** `.github/workflows/security-scan.yml:22-23, 47-48, 71-72, 98-99`  
**Panel:** Testing/DevOps — Stefan Mueller (CI/CD Architect)

The Trivy DB cache key is `trivy-db-${{ github.run_id }}` — unique per run, so the cache is never restored. This triggers a fresh ~200 MB Trivy DB download on every run, across all 4 jobs. The `restore-keys: trivy-db-` fallback can never match a useful entry.

**Fix:** Change key to `trivy-db-${{ steps.date.outputs.week }}` (add a `date +%Y-%V` step) or a stable date-based key.  
**Effort:** LOW

---

### BUG-16 — release.yml: uses actions/checkout@v3 (EOL) with overly broad permissions
**Severity:** HIGH  
**Component:** `.github/workflows/release.yml:24, 19`  
**Panel:** Testing/DevOps — Nina Volkov (Release Engineering)

The release workflow uses `actions/checkout@v3` while all other workflows use `@v4`. `@v3` has reached EOL for security patches and has known Git credential handling issues in recent Node versions. Additionally, `contents: write` is declared at the job level (not just the release step), giving the npm publish step unnecessary write access to repository contents.

**Fix:** Pin to `actions/checkout@v4`. Scope `contents: write` to only the "Create GitHub Release" step.  
**Effort:** LOW

---

### BUG-17 — tests/global-setup.ts: parallel TS compilation races across CI shards
**Severity:** HIGH  
**Component:** `tests/global-setup.ts:1-6`, `.github/workflows/ci.yml`  
**Panel:** Testing/DevOps — Jun Watanabe (Test Automation)

`global-setup.ts` calls `execSync('npx tsc')` synchronously. In a 3-shard matrix this triggers 3 concurrent full TypeScript compilations to `dist/`, racing on filesystem writes and potentially corrupting intermediate output. The `build` job runs in parallel with the `test` matrix rather than as a prerequisite, so `dist/` is always stale when shards start.

**Fix:** Build `dist/` once in a dedicated `build` job, upload as a workflow artifact, and have `test` shards download before running. Remove `execSync('npx tsc')` from `global-setup.ts`.  
**Effort:** MEDIUM

---

### BUG-18 — session-replay.js: hook never logs tool_response (replay records inputs only)
**Severity:** HIGH  
**Component:** `scripts/hooks/session-replay.js:40-48`  
**Panel:** Observability — Dr. Aisha Mbeki (Human Factors/Incident)

The PostToolUse `session-replay.js` hook logs tool inputs but never reads `payload.tool_response`. Replays contain no record of tool outcomes: whether a Bash command succeeded, what a Read returned, or what error a tool threw. A replay without outputs is a call log, not a replay.

**Fix:** Extend the replay entry with `outcome: payload.tool_response?.is_error ? 'error' : 'ok'` and a truncated `output` field (e.g. `(payload.tool_response?.content?.[0]?.text || '').slice(0, 300)`).  
**Effort:** LOW

---

### BUG-19 — evidence-capture.js: never records test pass/fail (all test evidence is ambiguous)
**Severity:** HIGH  
**Component:** `scripts/hooks/evidence-capture.js:67-143`  
**Panel:** Observability — Dr. Aisha Mbeki (Human Factors/Incident)

`classifyBashCommand` records that a test ran but never records whether it passed or failed. `payload.tool_response` (which contains exit code and stdout/stderr) is never read. An evidence log that cannot distinguish a passing test from a failing one actively misleads incident responders.

**Fix:** Add `exit_code: payload.tool_response?.metadata?.exit_code ?? null` and `passed: payload.tool_response?.is_error !== true` to each evidence entry.  
**Effort:** LOW

---

### BUG-20 — damage-control.js: DC-26 rule gap + DC-01 path regex too narrow
**Severity:** HIGH  
**Component:** `damage-control-rules.yaml`, `scripts/hooks/damage-control.js`  
**Panel:** Observability — Ingrid Larsson (Alert Design)

Rules jump from DC-25 to DC-27 with no explanation — a silent gap in a security ruleset is a red flag during audits. DC-01 (`rm` force-delete) requires a trailing `/` or `\` in the path, so `rm -f myfile.txt` (no directory separator) passes through entirely unblocked. Rule IDs are also not emitted in violation log entries, making post-hoc audit impossible.

**Fix:** (a) Add a tombstone comment for DC-26. (b) Widen DC-01 to match `rm -f <filename>` without a trailing slash. (c) Emit `rule_id` in every `logViolation` call.  
**Effort:** LOW

---

### BUG-21 — damage-control.js: scope boundary check triggers alert storm on every in-repo file access
**Severity:** HIGH  
**Component:** `scripts/hooks/damage-control.js:204-245`  
**Panel:** Observability — Fatima Al-Zahra (Observability Architect)

For a session purpose like "fix authentication bug", the scope boundary check fires an `ask` event for every file whose path doesn't contain "authentication", "fix", etc. — `src/index.ts`, `package.json`, `tsconfig.json` all trigger interrupts. This creates alert-storm conditions that make the purpose gate unusable in practice.

**Fix:** Apply scope boundary checks only to paths in *different project root directories*. Require a minimum keyword length of 5 and at least 2 keyword matches. Add a per-session rate limit (max 3 `scope_boundary` asks per session).  
**Effort:** MEDIUM

---

### BUG-22 — discover_tools: readOnlyHint: false is semantically incorrect in legacy mode
**Severity:** HIGH  
**Component:** `src/index.ts:878`  
**Panel:** Developer Experience — Dr. Lars Bergstrom (API Design)

`discover_tools` is annotated `readOnlyHint: false`, but in `legacy` mode (the default) it never mutates state and is completely read-only. Clients that auto-approve read-only tools will never auto-approve this; the tool falls into an ambiguous state worse than no annotation.

**Fix:** Set `readOnlyHint: false, destructiveHint: false, idempotentHint: false`. Document in the tool description that the tool is observational in `legacy` mode and activates tools in `dynamic` mode.  
**Effort:** LOW

---

### BUG-23 — ContainerSandbox: missing --cap-drop=ALL (default Linux capabilities retained)
**Severity:** HIGH  
**Component:** `src/ContainerSandbox.ts:163-177`  
**Panel:** Security Audit — Dr. Lisa Park (Threat Modeler)

`buildSecurityArgs()` does not include `--cap-drop=ALL`. Even with `--no-new-privileges` and `--read-only`, containers retain default Linux capabilities (`CAP_NET_RAW`, `CAP_CHOWN`, `CAP_SYS_CHROOT`, etc.). CVE-2025-53372 (Docker sandbox escape in node-code-sandbox-mcp, August 2025) exploited retained capabilities in an otherwise-hardened container.

**Fix:** Add `"--cap-drop=ALL"` as the first flag in `buildSecurityArgs()`. Add `"--security-opt", "seccomp=default"`. Re-add specific capabilities with `--cap-add` only if the runtime images require them.  
**Effort:** LOW

---

### BUG-24 — SkillManager walkDirectory: uses fs.stat() (follows symlinks, enables path traversal)
**Severity:** HIGH  
**Component:** `src/SkillManager.ts:274-321`  
**Panel:** Code Quality — Dr. James Okafor (SRE)

`walkDirectory` calls `fs.stat()` (which follows symlinks) on every entry. A symlink within `SKILLS_DIR` pointing to `/etc/passwd` or any file outside the boundary would be read by `parseSkillMarkdown`. This is directly analogous to CVE-2025-53109 (Anthropic Filesystem MCP symlink escape). The `SKILLS_DIR.startsWith()` guard only protects `fetchRemoteSkill`, not the scanner.

**Fix:** Replace `fs.stat()` with `fs.lstat()`. If the result is `isSymbolicLink()`, resolve via `fs.realpath()` and verify the result is still under `path.resolve(SKILLS_DIR)`.  
**Effort:** LOW

---

### BUG-25 — ContainerSandbox / SkillManager: null byte in env value causes silent data loss
**Severity:** HIGH  
**Component:** `src/ContainerSandbox.ts:260-265`, `src/SkillManager.ts`  
**Panel:** Code Quality — Dr. James Okafor (SRE)

Environment variable values passed to containers via `-e KEY=VALUE` are unchecked for null bytes. A null byte `\x00` in a value will silently truncate the env variable at the Docker/Podman level, producing incorrect runtime behavior with no error. The `BLOCKED_ENV_OVERRIDES` check validates keys only.

**Fix:** Validate both keys (`/^[A-Za-z_][A-Za-z0-9_]*$/`) and values (`!value.includes('\x00')`) before the env merge.  
**Effort:** LOW

---

## Part 2: BUGS (Medium Priority)

### BUG-26 — WebhookManager: maxAgeMs naming vs. internal unit conversion is a silent API trap
**Severity:** MEDIUM  
**Component:** `src/WebhookManager.ts:209-215`  
**Panel:** Security Audit — Omar Hassan (Crypto)

`verifySignature(maxAgeMs)` receives milliseconds but divides by 1000 internally to compare against Unix seconds. A caller passing seconds instead of milliseconds would silently accept an 83-hour replay window instead of 5 minutes. No validation guards against implausible values.

**Fix:** Add JSDoc clearly labeling the unit. Add a `console.warn` or throw if `maxAgeMs < 1000` or `maxAgeMs > 3_600_000`.  
**Effort:** LOW

---

### BUG-27 — TelemetryExporter: getMetrics() called twice (TOCTOU + double allocation)
**Severity:** MEDIUM  
**Component:** `src/TelemetryExporter.ts:163-164`  
**Panel:** Performance — Dr. Raj Patel

`buildPayload()` calls `this.telemetryManager.getMetrics()` twice: once for `telemetryVersion` and once for `metrics`. A reset between the two calls produces a payload where version and metrics describe different snapshots. Also doubles the allocation cost.

**Fix:** `const metrics = this.telemetryManager.getMetrics()` once, then use `metrics.telemetryVersion` and `metrics`.  
**Effort:** LOW

---

### BUG-28 — Integration tests: source-text scraping instead of runtime behavioral testing
**Severity:** MEDIUM  
**Component:** `tests/integration/websocket-hitl-validation.test.ts` (85/130 assertions), `session-reattachment-http.test.ts` (44 assertions)  
**Panel:** Testing/DevOps — Dr. Patricia Okonkwo (QA Architect)

The majority of assertions in several integration test files use `fs.readFileSync` on TypeScript source files and assert that specific string literals appear in the raw source. These tests verify that certain strings exist in code, not that any behavior executes correctly. They produce false confidence and survive refactors that change variable names while preserving behavior.

**Fix:** Replace source-scraping assertions with actual HTTP calls, WebSocket connections, and behavioral assertions against running server instances.  
**Effort:** HIGH

---

### BUG-29 — WebhookManager: full webhook URL (including credentials) logged on retry failure
**Severity:** MEDIUM  
**Component:** `src/WebhookManager.ts:313`  
**Panel:** Security Audit — Thomas Eriksen (Compliance)

`webhook.url` is logged on retry failure. URLs can contain embedded credentials (`https://user:password@host`) or API keys in query strings. `isValidWebhookConfig` validates scheme and parseability but does not strip or warn about embedded credentials.

**Fix:** Log only `webhook.url` with credentials stripped via `new URL(url).hostname` for identification, never the raw URL. Add a validation warning if the URL contains a `userinfo` component or query params matching common key patterns.  
**Effort:** LOW

---

### BUG-30 — ProxyManager: loadServers clears live registry during reload (concurrent callers get MethodNotFound)
**Severity:** MEDIUM  
**Component:** `src/ProxyManager.ts:454-460`  
**Panel:** Architecture — Dr. Wei Zhang (Principal Engineer)

`loadServers()` calls `this.clients.clear()` and `this.toolRegistry.clear()` before booting child servers. Concurrent tool calls arriving during the reload window (which can be up to `N × childServerBootTimeoutMs`) receive `MethodNotFound` for previously working tools.

**Fix:** Build shadow registries (`newClients`, `newToolRegistry`, etc.) locally in `loadServers()`, then swap all atomically in a single synchronous block after `Promise.allSettled` returns.  
**Effort:** MEDIUM

---

### BUG-31 — HttpServer: cleanup deletes transport before close() resolves (zombie TCP socket on failure)
**Severity:** MEDIUM  
**Component:** `src/HttpServer.ts:104-130`  
**Panel:** Architecture — Yusuf Al-Rashid (Risk Analyst)

The session cleanup interval deletes expired transports from the map before `transport.close()` resolves. If `close()` rejects, the entry is already gone from the map but the underlying TCP socket may remain open.

**Fix:** Await `transport.close()` before deleting from the map, or add `socket.destroy()` in the catch block to guarantee connection termination.  
**Effort:** LOW

---

### BUG-32 — FileSessionStore: writeChains Map not pruned on session delete (resolved Promises accumulate)
**Severity:** MEDIUM  
**Component:** `src/stores/FileSessionStore.ts:85-111`  
**Panel:** Architecture — Dr. Wei Zhang (Principal Engineer)

`writeChains` entries are self-cleaned only when the same path is written again. The `delete()` method unlinks the file but never touches `writeChains`. For long-lived servers with many short-lived sessions, every past session path key accumulates a resolved Promise entry.

**Fix:** In the `delete()` method, call `this.writeChains.delete(filePath)` after unlinking.  
**Effort:** LOW

---

### BUG-33 — OAuthProvider: JWKS cache is a module-level singleton (race on config hot-reload)
**Severity:** MEDIUM  
**Component:** `src/auth/OAuthProvider.ts:140-148`  
**Panel:** Security Audit — Omar Hassan (Crypto)

`cachedJWKS` and `cachedJWKSUri` are module-level variables. If the JWKS URI changes during a config hot-reload, concurrent requests can validate tokens from the old issuer against the new JWKS URI.

**Fix:** Use a `Map<string, RemoteJWKSet>` keyed by JWKS URI (one `createRemoteJWKSet` instance per unique URI), or scope the cache inside the `AuthConfig` object.  
**Effort:** LOW

---

## Part 3: IMPROVEMENTS (High Priority)

### IMP-01 — No correlation ID linking hook events to server-side telemetry (impossible incident reconstruction)
**Severity:** HIGH  
**Component:** `scripts/hooks/`, `src/AuditLog.ts`, `src/TelemetryManager.ts`  
**Panel:** Observability — Fatima Al-Zahra (Observability Architect)

When a tool call fires, `TelemetryManager.recordToolCall()`, `AuditLog.log('tool_call')`, and `session-replay.js` all write separate records with no shared invocation ID. During an incident it is impossible to correlate "which audit log entry corresponds to which replay entry."

**Fix:** Generate a short `invocation_id` (`crypto.randomBytes(6).toString('hex')`) at the PreToolUse entry point (damage-control hook). Thread it through hook events and into the `AuditLog.log()` call from the MCP request context.  
**Effort:** MEDIUM

---

### IMP-02 — SkillManager: sequential skill I/O on startup (blocks handshake under slow filesystems)
**Severity:** HIGH  
**Component:** `src/SkillManager.ts:278-309`  
**Panel:** Performance — Maya Williams (Capacity Planning)

`walkDirectory` awaits each `fs.stat()` and `fs.readFile()` call serially in a `for` loop. Across 336+ skills on a network mount or Windows Defender scan, sequential I/O creates a startup bottleneck that delays the Fuse index becoming available. The existing benchmark only measures in-memory lookup, not the disk scan phase.

**Fix:** Fan out I/O using `Promise.all` or a concurrency-limited pool (e.g. `p-limit` with concurrency 8–16). Add a dedicated `loadSkills()` wall-clock benchmark in CI to catch regressions.  
**Effort:** MEDIUM

---

### IMP-03 — search_skills: query parameter has no description or documented behavior
**Severity:** HIGH  
**Component:** `src/SkillManager.ts:833`  
**Panel:** Developer Experience — Dr. Lars Bergstrom (API Design)

`search_skills` exposes `{ query: { type: "string" } }` with no `description`. Compare to `discover_tools` which provides full guidance. Callers have no indication whether natural language is supported, what the result limit is (hidden 15-result cap), or what fields are searched.

**Fix:** Add `description: "Keyword or natural-language query to search the skill library. Matches against name, description, tags, category, and aliases. Returns up to 15 results by relevance."` Expose a `limit` parameter. Document the 15-result cap.  
**Effort:** LOW

---

### IMP-04 — fetch_skill: generic error messages lose structured context at tool boundary
**Severity:** HIGH  
**Component:** `src/SkillManager.ts:1184-1188`  
**Panel:** Developer Experience — Aisha Johnson (DX Engineer)

The catch block emits `"Failed to fetch skill: " + error.message`. The inner errors (checksum mismatch, invalid frontmatter, path traversal, file exists) are specific and actionable, but the outer surface is generic. An AI caller receiving this error cannot determine whether to retry, try a different URL, or ask for a different checksum.

**Fix:** Prefix errors with structured categories: `"[fetch_skill:checksum_mismatch]"`, `"[fetch_skill:file_exists] — pass overwrite: true to replace"`, etc. The file-exists case especially should include the remediation hint.  
**Effort:** LOW

---

### IMP-05 — SETUP.md: 10+ active env variables are undocumented
**Severity:** HIGH  
**Component:** `docs/SETUP.md`  
**Panel:** Developer Experience — Rachel Torres (CLI/Tooling)

SETUP.md documents 10 env variables but the codebase uses at least 18+ (`EVOKORE_TELEMETRY_EXPORT_URL`, `EVOKORE_WEBHOOKS_ENABLED`, `EVOKORE_PLUGINS_DIR`, `EVOKORE_SESSION_STORE`, `EVOKORE_REDIS_URL`, `EVOKORE_REDIS_KEY_PREFIX`, `EVOKORE_SESSION_TTL_MS`, `EVOKORE_TELEMETRY_EXPORT_SECRET`, etc.). An operator enabling webhooks or telemetry export must grep source code to find required config keys — a production deployment blocker.

**Fix:** Run `test-env-sync-validation.js` and add every missing variable to SETUP.md under subsection headings (Telemetry, Webhooks, Plugins, Session Storage).  
**Effort:** MEDIUM

---

### IMP-06 — SkillManager: getStats() calls JSON.stringify on full Fuse index (blocking MB-scale operation)
**Severity:** HIGH  
**Component:** `src/SkillManager.ts:155-158`  
**Panel:** Performance — Dr. Raj Patel

`getStats()` calls `JSON.stringify(this.fuseIndex)` to estimate the index size. For 336 skill objects each containing `content`, `searchableText`, `metadataText`, and `resolutionHints`, this is likely several MB of synchronous serialization. If called from a monitoring endpoint under load, it stalls the event loop for tens of milliseconds.

**Fix:** Compute and cache `fuseIndexSizeKb` once immediately after the Fuse index is built in `loadSkills()`. Store as a private member. `getStats()` reads the cached value. Invalidate on `refreshSkills()`.  
**Effort:** LOW

---

## Part 4: IMPROVEMENTS (Medium Priority)

### IMP-07 — No observability hook for log rotation events (silent data loss on rotation failure)
**Severity:** MEDIUM  
**Component:** `scripts/log-rotation.js`  
**Panel:** Observability — Ingrid Larsson (Alert Design)

Log rotation failures (disk full, permission error) are caught and logged to stderr, but no structured event is emitted and no metric is incremented. An operator cannot alert on rotation failures without scraping stderr.

**Fix:** Emit a structured `log_rotation_error` webhook event from the rotation module when rotation fails. Track `rotationErrors` in `TelemetryManager`.  
**Effort:** LOW

---

### IMP-08 — SessionIsolation: O(n) LRU eviction scan on every create-at-capacity
**Severity:** MEDIUM  
**Component:** `src/SessionIsolation.ts:117-143`  
**Panel:** Performance — Dr. Raj Patel

`evictIfAtCapacity()` runs `cleanExpired()` (O(n)) then a full LRU scan (O(n)) on every session create at capacity. Under connection bursts with high `maxSessions`, this is measurable synchronous overhead on the hot-path.

**Fix:** Maintain a min-heap or doubly-linked LRU list alongside the Map. Document the O(n) characteristic in the option JSDoc and add a runtime warning for `maxSessions > 500`.  
**Effort:** MEDIUM

---

### IMP-09 — TelemetryExporter: new HTTP socket per export (no connection keep-alive)
**Severity:** MEDIUM  
**Component:** `src/TelemetryExporter.ts:264-336`  
**Panel:** Performance — Maya Williams (Capacity Planning)

Every telemetry export creates a fresh HTTP/HTTPS connection from scratch. TCP handshake + TLS overhead is significant for a periodic export to the same endpoint. There is no agent or keep-alive mechanism.

**Fix:** Create a shared `http.Agent` / `https.Agent` with `keepAlive: true` per unique host and reuse it across exports. The `jose` JWKS client already sets this pattern as an example in the same codebase.  
**Effort:** LOW

---

### IMP-10 — proxy_server_status: returns raw JSON dump instead of readable format
**Severity:** MEDIUM  
**Component:** `src/SkillManager.ts:1150-1155`  
**Panel:** Developer Experience — Aisha Johnson (DX Engineer)

`proxy_server_status` returns `JSON.stringify({ totalServers, servers }, null, 2)` — the only native tool that returns raw JSON. All other tools return human-readable markdown. An AI assistant gets a JSON dump to parse; a human reads unformatted objects in session transcripts.

**Fix:** Format as a summary table (server ID, status, tool count, connection type, error count, last-seen). Optionally append the raw JSON for machine consumers.  
**Effort:** LOW

---

### IMP-11 — get_skill_help: returns dead-end "not found" with no "did you mean" suggestions
**Severity:** MEDIUM  
**Component:** `src/SkillManager.ts:1101-1107`  
**Panel:** Developer Experience — Aisha Johnson (DX Engineer)

When a skill is not found, the Fuse search has already run (line 1101) and produced close matches — but `matches` is discarded if the top match score is below threshold. The caller gets `"Could not find a skill named 'X'."` with no next step.

**Fix:** Surface the top 2-3 Fuse candidates even below the score threshold: `"Could not find 'orch-handof'. Did you mean: orch-handoff, orch-handoff-protocol?"`. The `matches` array is already computed.  
**Effort:** LOW

---

### IMP-12 — SkillManager.handleToolCall: 357-line method with 11 if-blocks (violates SRP)
**Severity:** MEDIUM  
**Component:** `src/SkillManager.ts:986-1343`  
**Panel:** Code Quality — Margaret Chen (Principal Engineer)

`handleToolCall` handles routing, input coercion, lazy-loading, output formatting, and error wrapping in a single 357-line method with 11 `if (name === "...")` branches. There is no compile-time guarantee that a tool registered in `getTools()` has a corresponding handler branch.

**Fix:** Extract each branch into a private `handle<ToolName>()` method. Build a `Map<string, Handler>` dispatch table. Add a registry-consistency check in `loadSkills()` that throws if any registered tool name has no handler.  
**Effort:** MEDIUM

---

### IMP-13 — TelemetryExporter creates new HTTP socket on every export (no keep-alive)
**Severity:** MEDIUM (duplicate detail captured above in IMP-09)

---

### IMP-14 — Missing benchmark for loadSkills() wall-clock time (regressions undetected)
**Severity:** MEDIUM  
**Component:** `npm run benchmark:tool-discovery`  
**Panel:** Performance — Maya Williams (Capacity Planning)

The existing benchmark measures in-memory catalog lookup only. The actual disk scan phase (which compounds across slow filesystems) has no coverage. A PR that adds 50 skills and slows indexing by 300ms would never be caught.

**Fix:** Add a dedicated `benchmark:skill-indexing` script that cold-starts `SkillManager`, times `loadSkills()`, and fails CI if wall-clock exceeds a threshold (e.g. 5s on a cold local SSD).  
**Effort:** LOW

---

## Part 5: RESEARCH (External Findings / Upgrade Opportunities)

### RES-01 — MCP SDK v1.29.0 available (pinned at ^1.27.1); new OAuth 2.1 PKCE + RFC 9728 compliance required
**Severity:** HIGH  
**Component:** `package.json`, `src/auth/OAuthProvider.ts`  
**Panel:** External Research

The `@modelcontextprotocol/sdk` is now at v1.29.0 (EVOKORE pins `^1.27.1`). The MCP spec 2025-11-25 added: mandatory OAuth 2.1 PKCE with RFC 9728 Protected Resource Metadata discovery (`/.well-known/oauth-protected-resource`), MCP Tasks (durable async primitive), URL-mode Elicitation, tool icon metadata, and enhanced JSON Schema support. Legacy SSE transport is deprecated.

**Action:** Upgrade to `^1.29.0`. Audit `OAuthProvider` against RFC 9728 endpoint requirements and PKCE S256 enforcement. Begin Tasks integration planning.  
**Effort:** MEDIUM

---

### RES-02 — Native MCP Elicitation should replace _evokore_approval_token workaround
**Severity:** HIGH  
**Component:** `src/SecurityManager.ts`, `src/HttpServer.ts` (/approvals)  
**Panel:** External Research

MCP Elicitation (spec 2025-06-18, enhanced 2025-11-25) is the spec-standard replacement for the `_evokore_approval_token` workaround. It lets servers pause tool execution mid-call, request structured JSON-Schema-validated user input, and resume — exactly what the current approval token pattern implements ad hoc. URL-mode Elicitation enables redirecting users to the existing `/approvals` page as a native flow.

**Action:** After upgrading to SDK v1.29.0, wire native Elicitation for compliant clients. Keep the token fallback for non-compliant clients. URL-mode is particularly suited to Supabase/GitHub restricted-tool flows.  
**Effort:** HIGH

---

### RES-03 — MCP Tasks primitive enables proper async long-running operation tracking
**Severity:** HIGH  
**Component:** `src/ProxyManager.ts`, `src/SkillManager.ts` (execute_skill)  
**Panel:** External Research

MCP Tasks (2025-11-25 spec, experimental) introduces a call-now/fetch-later pattern: a tool returns a task handle immediately; clients poll `tasks/get` or subscribe for updates. EVOKORE currently has no mechanism for proxied tools that exceed the JSON-RPC timeout, and `execute_skill` uses a hard 30s synchronous limit.

**Action:** Track Tasks SDK stabilization. Implement a `TaskManager` that wraps `execute_skill`, Supabase migrations, and GitHub PR creation as trackable tasks. `WebhookManager` can emit `task_started`/`task_completed` events at no additional wiring cost.  
**Effort:** HIGH

---

### RES-04 — CVE-2025-53372: sandbox escape pattern via shell injection directly applicable to execute_skill
**Severity:** HIGH  
**Component:** `src/ContainerSandbox.ts`, `src/SkillManager.ts` (execute_skill)  
**Panel:** External Research

CVE-2025-53372 (node-code-sandbox-mcp ≤ 1.2.0, August 2025) exploited `container_id` and `command` parameters concatenated directly into `execSync` shell strings, enabling shell metacharacter injection that breaks out of the Docker sandbox. EVOKORE's `execute_skill` extracts and runs code blocks from skill files. CVE-2025-53109/53110 (EscapeRoute) also affected Anthropic's own filesystem MCP server via path traversal.

**Action:** (1) Audit `execute_skill` for any `execSync` calls with user-controlled input in shell strings — replace with `execFileSync` + argument arrays. (2) Add container parameter validation with allowlist regex. (3) Add `--cap-drop=ALL` (see BUG-23). (4) Add a vitest test that attempts `container_id` injection with `; id` and verifies rejection.  
**Effort:** MEDIUM

---

### RES-05 — OWASP MCP Tool Poisoning (MCP03:2025): child server tool definitions forwarded verbatim
**Severity:** HIGH  
**Component:** `src/ProxyManager.ts` (listTools)  
**Panel:** External Research

MCP Tool Poisoning is an active attack vector where malicious instructions in tool descriptions manipulate the AI agent into exfiltrating data or running unauthorized commands. In mid-2025 this was exploited to steal GitHub private repo contents via compromised MCP servers in the wild. EVOKORE forwards tool definitions from child servers verbatim — a compromised child server's `description` or `inputSchema` could contain poison payloads the client receives directly.

**Action:** Add a tool description sanitization layer in `ProxyManager.listTools()` that strips hidden Unicode, long base64-like payloads, and known injection patterns before forwarding. Pin child server versions in `mcp.config.json` with checksums where possible. Add a `tool_definition_anomaly` webhook event for descriptions exceeding entropy or length thresholds. Enable via `EVOKORE_TOOL_DESCRIPTION_SANITIZE=true`.  
**Effort:** MEDIUM

---

### RES-06 — Zod v4 breaking changes audit needed (EVOKORE already on ^4.3.6)
**Severity:** MEDIUM  
**Component:** All `src/*.ts` files using Zod schemas  
**Panel:** External Research

EVOKORE's `package.json` already declares `zod ^4.3.6`, which is correct. However, Zod v4 introduces breaking changes: `error.errors` → `error.issues`, `z.string().email()` → `z.email()`, `.merge()` deprecated, `z.string().uuid()` now enforces strict RFC 4122. The MCP SDK also bundles Zod internally — version alignment matters.

**Action:** Run `npx @zod/codemod --transform v3-to-v4 --dry-run ./src` to surface any remaining v3 patterns. Audit `error.errors` usages across the test suite.  
**Effort:** LOW

---

### RES-07 — SSE transport formally deprecated in MCP spec (2025-03-26); Streamable HTTP is the sole normative transport
**Severity:** MEDIUM  
**Component:** `src/HttpServer.ts`  
**Panel:** External Research

The MCP spec formally deprecated legacy SSE transport in March 2025. Streamable HTTP (single `POST /mcp` endpoint with optional SSE upgrade) is now the normative HTTP transport. Migrating fully enables stateless load balancing and removes persistent connection management overhead.

**Action:** Audit `HttpServer.ts` to confirm `POST /mcp` Streamable HTTP is the primary path. Add `EVOKORE_DISABLE_SSE_LEGACY=true` flag for production deployments. Plan migration of any remaining legacy SSE-only flows.  
**Effort:** MEDIUM

---

### RES-08 — Node.js 22 LTS is current; EVOKORE targets Node 18 (missing crypto/perf improvements)
**Severity:** MEDIUM  
**Component:** `package.json` (`engines` field), `.github/workflows/ci.yml`  
**Panel:** External Research

Node.js 22 LTS (April 2025) includes native WebSocket support, improved `crypto` performance (timing-safe operations 3× faster), built-in `--watch` mode, and `require(esm)` support. Node.js 18 reaches EOL in April 2025. The security panel's HMAC timing-safe fixes would benefit from the improved `crypto` performance in Node 22.

**Action:** Upgrade CI matrix to test on Node 20 LTS and Node 22 LTS. Update `engines.node` in `package.json`. Remove any `--experimental-vm-modules` flags that are no longer needed in Node 22.  
**Effort:** LOW

---

### RES-09 — TypeScript 5.7 strict mode features applicable (satisfies operator, const type parameters)
**Severity:** LOW  
**Component:** `tsconfig.json`, `src/`  
**Panel:** External Research

TypeScript 5.7 (November 2024) adds `--noUncheckedSideEffectImports`, improved narrowing through control flow, and performance improvements for large projects. The `satisfies` operator (TS 4.9) is underused in the codebase — it would catch several type mismatches in `mcp.config.json` schema construction without losing inference.

**Action:** Enable `"noUncheckedSideEffectImports": true` in `tsconfig.json`. Use `satisfies` for `ToolDefinition` and `ServerConfig` objects to catch schema drift at compile time.  
**Effort:** LOW

---

### RES-10 — Vitest 4.x available with improved UI, browser mode, and inline coverage thresholds
**Severity:** LOW  
**Component:** `package.json`, `vitest.config.ts`  
**Panel:** External Research

Vitest 4 (early 2026) introduces global `coverageThreshold` in `vitest.config.ts` (no separate NYC config), improved parallel shard coordination, and a redesigned `--reporter=verbose` output. The EVOKORE test suite at 2053 tests across 121 files would benefit from inline threshold enforcement to prevent coverage regressions silently merging.

**Action:** Upgrade to Vitest 4 and add `coverage.thresholds` to `vitest.config.ts` with minimum branch/statement/line targets derived from the current baseline.  
**Effort:** LOW

---

## Summary Matrix

| ID | Type | Severity | Component | Effort |
|----|------|----------|-----------|--------|
| BUG-01 | BUG | CRITICAL | SecurityManager denyToken | LOW |
| BUG-02 | BUG | CRITICAL | OAuthProvider timing attack | LOW |
| BUG-03 | BUG | CRITICAL | SecurityManager setActiveRole | LOW |
| BUG-04 | BUG | CRITICAL | HttpServer WS token in URL | LOW |
| BUG-05 | BUG | HIGH | index.ts Redis session swap race | MED |
| BUG-06 | BUG | HIGH | index.ts signal handler leak | LOW |
| BUG-07 | BUG | HIGH | ProxyManager cooldowns unbounded | LOW |
| BUG-08 | BUG | HIGH | HttpServer reattachment race | LOW |
| BUG-09 | BUG | HIGH | SkillManager ReDoS code fence | MED |
| BUG-10 | BUG | HIGH | httpGet duplication drift | LOW |
| BUG-11 | BUG | HIGH | refreshSkills cache destroy | LOW |
| BUG-12 | BUG | HIGH | PluginManager hot-reload partial cache | MED |
| BUG-13 | BUG | HIGH | TelemetryManager sync I/O | LOW |
| BUG-14 | BUG | HIGH | TelemetryManager latency precision | LOW |
| BUG-15 | BUG | HIGH | Trivy cache key never hits | LOW |
| BUG-16 | BUG | HIGH | release.yml checkout@v3 + permissions | LOW |
| BUG-17 | BUG | HIGH | global-setup TS compilation race | MED |
| BUG-18 | BUG | HIGH | session-replay no tool_response | LOW |
| BUG-19 | BUG | HIGH | evidence-capture no pass/fail | LOW |
| BUG-20 | BUG | HIGH | DC-26 gap + DC-01 narrow regex | LOW |
| BUG-21 | BUG | HIGH | scope boundary alert storm | MED |
| BUG-22 | BUG | HIGH | discover_tools readOnlyHint wrong | LOW |
| BUG-23 | BUG | HIGH | ContainerSandbox no --cap-drop=ALL | LOW |
| BUG-24 | BUG | HIGH | walkDirectory symlink path traversal | LOW |
| BUG-25 | BUG | HIGH | Container env null byte injection | LOW |
| BUG-26 | BUG | MED | WebhookManager maxAgeMs unit trap | LOW |
| BUG-27 | BUG | MED | TelemetryExporter double getMetrics | LOW |
| BUG-28 | BUG | MED | Integration test source scraping | HIGH |
| BUG-29 | BUG | MED | Webhook URL credentials in logs | LOW |
| BUG-30 | BUG | MED | ProxyManager reload clears live registry | MED |
| BUG-31 | BUG | MED | HttpServer cleanup before close() | LOW |
| BUG-32 | BUG | MED | FileSessionStore writeChains leak | LOW |
| BUG-33 | BUG | MED | OAuthProvider JWKS singleton race | LOW |
| IMP-01 | IMP | HIGH | No invocation correlation ID | MED |
| IMP-02 | IMP | HIGH | Sequential skill indexing | MED |
| IMP-03 | IMP | HIGH | search_skills no param description | LOW |
| IMP-04 | IMP | HIGH | fetch_skill generic errors | LOW |
| IMP-05 | IMP | HIGH | SETUP.md 10+ undocumented vars | MED |
| IMP-06 | IMP | HIGH | getStats JSON.stringify blocking | LOW |
| IMP-07 | IMP | MED | No log rotation observability | LOW |
| IMP-08 | IMP | MED | SessionIsolation O(n) LRU eviction | MED |
| IMP-09 | IMP | MED | TelemetryExporter no keep-alive | LOW |
| IMP-10 | IMP | MED | proxy_server_status raw JSON | LOW |
| IMP-11 | IMP | MED | get_skill_help no suggestions | LOW |
| IMP-12 | IMP | MED | handleToolCall 357-line method | MED |
| IMP-14 | IMP | MED | No loadSkills() benchmark | LOW |
| RES-01 | RES | HIGH | MCP SDK v1.29.0 + OAuth 2.1 PKCE | MED |
| RES-02 | RES | HIGH | Native MCP Elicitation for HITL | HIGH |
| RES-03 | RES | HIGH | MCP Tasks for async operations | HIGH |
| RES-04 | RES | HIGH | CVE-2025-53372 sandbox escape | MED |
| RES-05 | RES | HIGH | OWASP MCP Tool Poisoning | MED |
| RES-06 | RES | MED | Zod v4 breaking changes audit | LOW |
| RES-07 | RES | MED | SSE transport deprecation | MED |
| RES-08 | RES | MED | Node.js 22 LTS upgrade | LOW |
| RES-09 | RES | LOW | TypeScript 5.7 strict mode | LOW |
| RES-10 | RES | LOW | Vitest 4.x coverage thresholds | LOW |

---

## Part 6: ADDITIONAL FINDINGS (From Full Agent Outputs)

### BUG-34 — SecurityManager: default permission is "allow" for unknown tools (violates least privilege)
**Severity:** CRITICAL  
**Component:** `src/SecurityManager.ts:109`  
**Panel:** Security Audit — Dr. Lisa Park (Threat Modeler)

When no rule matches a tool name and no RBAC role is active, `checkPermission()` returns `"allow"`. For an MCP aggregator proxying external child servers, this means any new tool introduced by a child server upgrade is automatically `allow` until an operator explicitly adds a `deny` rule. A comment on line 109 acknowledges this: `"Default permissive if not explicitly ruled."`

**Fix:** Change the default to `"deny"`. Alternatively, emit a startup warning listing all tool names served under the permissive default so operators can audit the surface area.  
**Effort:** MEDIUM

---

### BUG-35 — WebhookManager: SSRF via RFC-1918 private addresses in webhook targets
**Severity:** HIGH  
**Component:** `src/WebhookManager.ts:282-292`  
**Panel:** Security Audit — Dr. Lisa Park (Threat Modeler)

`isValidWebhookConfig` validates scheme and parseability but does not block RFC-1918 private addresses (`10.x`, `172.16-31.x`, `192.168.x`, `127.x`) or link-local addresses (`169.254.x`) in webhook target URLs. A poisoned `mcp.config.json` could force the server to make HTTP requests to internal services — metadata APIs, admin endpoints, Redis, internal Supabase.

**Fix:** Add SSRF guard: reject webhook URLs where hostname resolves to RFC-1918 or loopback ranges. Use a blocklist regex at config load, or resolve hostname and check against known private CIDRs.  
**Effort:** MEDIUM

---

### BUG-36 — AuditLog: disabled by default (inverted security default)
**Severity:** HIGH  
**Component:** `src/AuditLog.ts:73`  
**Panel:** Security Audit — Thomas Eriksen (Compliance)

`this.enabled = options?.enabled ?? process.env.EVOKORE_AUDIT_LOG === "true"` — the audit log is opt-in. For a security-sensitive server aggregating tool calls across multiple child servers, the audit log is the primary forensic artifact. Production deployments without explicit operator configuration produce zero audit trail. Also: `getEntries()` reads the entire JSONL file into memory with no size limit, creating OOM risk on large audit files.

**Fix:** Invert the default: enable audit logging by default, require `EVOKORE_AUDIT_LOG=false` to disable. Add streaming tail-read to `getEntries()` with a hard cap (last N lines or `maxBytes`).  
**Effort:** MEDIUM

---

### BUG-37 — HttpServer: /health returns ok during async proxy boot (false readiness signal)
**Severity:** HIGH  
**Component:** `src/HttpServer.ts:417-421`, `src/index.ts:790`  
**Panel:** Architecture — Carmen Vega (Product Strategist)

The `/health` endpoint returns unconditional `{"status":"ok"}` regardless of subsystem state. A load balancer or Kubernetes readiness probe using this endpoint routes traffic to an instance still booting its child servers. `bootProxyServersInBackground()` is called *after* `httpServer.start()`, so the server accepts connections before any proxied tools are registered (up to 75 s for 5 child servers × 15 s each).

**Fix:** Add a `/ready` endpoint that returns 503 until `bootProxyServersInBackground()` resolves. Use `/health` for liveness (process alive?), `/ready` for readiness (child servers up?). Expose `proxyBootComplete: boolean` on `ProxyManager`.  
**Effort:** LOW

---

### BUG-38 — ProxyManager: no reconnect or circuit-breaker for crashed child servers
**Severity:** HIGH  
**Component:** `src/ProxyManager.ts:159-166`  
**Panel:** Architecture — Dr. Robert Nakamura (Enterprise Architect)

`serverState.status` transitions to `'error'` after 5 accumulated errors, but there is no retry or circuit-breaker that attempts to reconnect. The server stays `'error'` permanently until the entire EVOKORE process restarts. A child server (e.g. GitHub MCP) that crashes and restarts on its own is permanently unreachable until the operator manually restarts EVOKORE.

**Fix:** Add a `reconnectServer(serverId)` method with exponential backoff, triggered when the error count threshold is reached. Alternatively, add a lazy-reconnect check in `callProxiedTool` when `serverState.status === 'error'` and sufficient time has passed.  
**Effort:** MEDIUM

---

### BUG-39 — SkillManager: concurrent lazy-load of fuseIndex is a race condition
**Severity:** MEDIUM  
**Component:** `src/SkillManager.ts:1031, 1063, 1087, 1272, 1313`  
**Panel:** Code Quality — Sofia Andersson (Backend Engineer)

Five tool handlers contain `if (!this.fuseIndex) await this.loadSkills()` with no mutex. If two MCP calls arrive simultaneously during boot, both pass the null check, both invoke `loadSkills()`, and both interleave: load A clears the cache, load B clears it again mid-fill. The final `fuseIndex` is constructed from whichever scan finishes last, potentially from a partially-merged cache.

**Fix:** Add `private loadPromise: Promise<void> | null = null`. Guard becomes: `if (!this.fuseIndex) { if (!this.loadPromise) this.loadPromise = this.loadSkills().finally(() => { this.loadPromise = null; }); await this.loadPromise; }`  
**Effort:** LOW

---

### BUG-40 — RedisSessionStore: disconnect() never called on graceful shutdown (event loop hangs)
**Severity:** MEDIUM  
**Component:** `src/stores/RedisSessionStore.ts:252-262`, `src/index.ts:759-808`  
**Panel:** Architecture — Dr. Robert Nakamura (Enterprise Architect)

Neither the stdio nor HTTP shutdown handlers call `disconnect()` on the `RedisSessionStore`. `ioredis` keeps the event loop alive, so the process hangs after all other shutdown work completes and only exits via the force `process.exit(0)` call, which forcefully terminates the socket without draining any in-flight pipeline commands.

**Fix:** In the shutdown sequence, check if the session store is a `RedisSessionStore` and await `disconnect()` before `process.exit`. Add a `dispose()` method to the `SessionStore` interface.  
**Effort:** LOW

---

### BUG-41 — damage-control.js: missing rules for eval/exec and git remote set-url
**Severity:** HIGH  
**Component:** `damage-control-rules.yaml`  
**Panel:** Security Audit — Dr. Natasha Volkov (Pen Tester)

No rule covers `eval()` or `exec()` in Python/JavaScript contexts — standard code injection payloads in skill execution scenarios. No rule blocks `git remote set-url` which can redirect a repo's origin to an attacker-controlled server. These are obvious gaps given EVOKORE runs an arbitrary code execution sandbox (`execute_skill`).

**Fix:** Add a rule for `eval\s*\(` and `exec\s*\(` patterns in shell/Python contexts. Add a rule for `git\s+remote\s+set-url` to prevent silent origin hijacking.  
**Effort:** LOW

---

### BUG-42 — AuditLog: redactForAudit() is shallow (nested objects not redacted)
**Severity:** MEDIUM  
**Component:** `src/AuditLog.ts:285-316`  
**Panel:** Security Audit — Thomas Eriksen (Compliance)

`redactForAudit()` iterates only top-level keys. Nested metadata like `{ request: { headers: { authorization: "Bearer abc123" } } }` passes through unredacted. `SENSITIVE_KEYS` also lacks `refresh_token`, `client_secret`, `webhook_secret`, and `signing_key` — all present in the EVOKORE codebase.

**Fix:** Make `redactForAudit` recursive: when a value is a non-null object, call `redactForAudit` on it. Extend `SENSITIVE_KEYS` with `refresh_token`, `client_secret`, `signing_key`, `webhook_secret`, `session_token`.  
**Effort:** LOW

---

### IMP-15 — vitest.config.ts: zero coverage configuration (no CI gate on coverage drop)
**Severity:** HIGH  
**Component:** `vitest.config.ts`, `package.json`  
**Panel:** Testing/DevOps — Dr. Patricia Okonkwo (QA Architect)

No `coverage` block exists in `vitest.config.ts` and no `--coverage` flag on the `test` script. With 2053 tests across 121 files, there is no automated gate that fails CI when coverage drops. Regressions in untested code paths are invisible to CI.

**Fix:** Add `coverage: { provider: 'v8', reporter: ['text', 'json-summary', 'lcov'], thresholds: { lines: 70, branches: 65, functions: 70 } }` to `vitest.config.ts`. Upload LCOV in CI.  
**Effort:** LOW

---

### IMP-16 — vitest.config.ts: fileParallelism: false forces sequential file execution (no test parallelism)
**Severity:** MEDIUM  
**Component:** `vitest.config.ts:10`  
**Panel:** Testing/DevOps — Jun Watanabe (Test Automation)

`fileParallelism: false` forces all test files to execute sequentially within each fork. Most integration tests use `os.tmpdir()` and random ports — they are parallelism-safe. Expected outcome from enabling parallelism: 30–50% wall-clock time reduction.

**Fix:** Remove `fileParallelism: false` (or set to `true`) after auditing for `process.env` mutations without cleanup (Finding #7 in Testing Panel — 25 files missing `afterAll`/`afterEach`). Fix env isolation first with `vi.stubEnv()` + `vi.unstubAllEnvs()` in `afterEach`.  
**Effort:** MEDIUM

---

### IMP-17 — ProxyManager: EvokoreMCPServer hard-wires all 10 managers in constructor (untestable, high coupling)
**Severity:** MEDIUM  
**Component:** `src/index.ts:62-134`  
**Panel:** Architecture — Dr. Robert Nakamura (Enterprise Architect)

All ten manager/service objects are instantiated directly in the constructor with no factory, DI container, or interface-based injection. Unit-testing each manager in isolation requires module-level mocking. Every new subsystem requires changes in constructor, `loadSubsystems()`, `run()`, and `runHttp()` — four touch points per addition.

**Fix:** Introduce a `ServerContext` or `EvokoreMCPOptions` bag accepting optional pre-constructed manager instances (for testability), falling back to default construction. This is the minimal step before a full DI refactor.  
**Effort:** MEDIUM

---

### IMP-18 — purpose-gate.js: any short/noise string becomes permanent session purpose (no validation)
**Severity:** MEDIUM  
**Component:** `scripts/hooks/purpose-gate.js:69-83`  
**Panel:** Observability — Ingrid Larsson (Alert Design)

The purpose gate unconditionally treats the user's second message as the session purpose with no minimum length check or validation. If the user replies "hold on, one sec", that becomes the permanent purpose and all subsequent prompts inject `[EVOKORE Purpose Gate] Session purpose: "hold on, one sec"` — nonsensical context that cannot be corrected without manual state file editing.

**Fix:** Add minimum length threshold (20 characters). Add `/purpose` override trigger to re-enter the purpose-setting flow mid-session.  
**Effort:** LOW

---

### IMP-19 — repo-audit-hook: errors silently swallowed, no writeHookEvent in catch block
**Severity:** MEDIUM  
**Component:** `scripts/hooks/repo-audit-hook-runtime.js:76-78`  
**Panel:** Observability — Dr. Aisha Mbeki (Human Factors/Incident)

The repo audit hook has a bare `catch {}` with no logging. If `collectAudit()` throws (missing git binary, repo corruption), the session receives no warning at all and no trace appears in `hooks.jsonl`. The script also doesn't import `writeHookEvent`, so the catch block cannot emit an observable event.

**Fix:** Import `writeHookEvent` and emit a `repo_audit_error` event in the catch block. Structure warnings as a bulleted list (not space-joined) with severity tiers (LOW/MEDIUM/HIGH) so the model can triage.  
**Effort:** LOW

---

### RES-11 — Architecture: proprietary telemetry schema incompatible with OTEL (OpenTelemetry) ecosystem
**Severity:** MEDIUM  
**Component:** `src/TelemetryManager.ts`, `src/TelemetryExporter.ts`  
**Panel:** Performance — Carlos Mendez (SRE)

EVOKORE's custom `TelemetryManager` + `TelemetryExporter` pair produces a proprietary JSON format that cannot be consumed by any standard OTEL collector, Prometheus scrape endpoint, or Grafana dashboard without a custom adapter. As MCP matures toward standardized capability discovery, the absence of OTEL-compatible metric emission will become a gap for enterprise operators.

**Action:** Evaluate adding an optional OTEL SDK export path (OTLP/HTTP or OTLP/gRPC) alongside the existing custom exporter. Capture as a roadmap spike measuring OTEL SDK startup and per-call overhead vs. the current near-zero-overhead counter approach.  
**Effort:** HIGH

---

### RES-12 — Competitive MCP gateway landscape: MetaMCP, MCProxy, MCP Gateway Registry worth benchmarking
**Severity:** LOW  
**Component:** Architecture / ProxyManager  
**Panel:** External Research

The MCP proxy/aggregator space has matured. Notable implementations: **MetaMCP** (metatool-ai/metamcp) — dynamic runtime aggregation, middleware pipeline, MCP OAuth; **MCProxy** (igrigorik/MCProxy) — Rust-based Streamable HTTP; **MCP Gateway Registry** (agentic-community) — enterprise OAuth with Keycloak/Entra, governance/audit layer. EVOKORE's differentiators (skill system, voice, HITL, damage control) remain unique, but the gateway registry's tool attestation/signing model is relevant for tool poisoning mitigation (RES-05).

**Action:** Review MetaMCP's middleware pipeline for EVOKORE's request interceptor chain. Review MCP Gateway Registry's tool attestation model as a formal approach to tool description sanitization.  
**Effort:** LOW

---

### RES-13 — MCP spec structured content blocks + icon metadata applicable to skill UX
**Severity:** LOW  
**Component:** `src/SkillManager.ts` (execute_skill output), `resources/list`  
**Panel:** External Research

MCP spec 2025-11-25 added tool icon metadata (URI-based icon references) and structured content blocks with explicit MIME types enabling correct rendering. EVOKORE's `execute_skill` returns plain text; structured content blocks with explicit MIME types (`text/x-python`, `application/json`) would enable client-side syntax highlighting. Skills could expose icons via the `skill://` resource URI.

**Action:** Add optional `icon` field to skill frontmatter. Update `execute_skill` to return structured content blocks with explicit MIME types.  
**Effort:** LOW

---

### RES-14 — TypeScript 7 native port (10x speed) and Node.js native .ts execution on the horizon
**Severity:** LOW  
**Component:** Build pipeline, hook scripts  
**Panel:** External Research

TypeScript 7 (December 2025 preview) is being ported to Go for a 10x build speed improvement. Node.js 22.18.0 runs `.ts` files natively with `--experimental-strip-types` enabled by default (no flags). Hook scripts (`scripts/hooks/*.js`) could be authored directly as `.ts` without a compilation step, improving type safety in the hook layer.

**Action:** Upgrade TypeScript to 5.9.x. Evaluate `--experimental-strip-types` for hook scripts. Track TypeScript 7 native port for a future build-speed windfall.  
**Effort:** LOW

---

### RES-15 — jose npm package has no open CVEs; ws 8.19.0 satisfies CVE-2024-37890 fix
**Severity:** LOW  
**Component:** Dependencies  
**Panel:** External Research

The panva `jose` npm package (`^6.2.1`) has a strong security track record with no open CVEs as of research date. `ws ^8.19.0` satisfies the CVE-2024-37890 DoS fix (requires `ws 8.17.1+`). No immediate action required on these dependencies. Run `npm audit` in CI as an ongoing gate.  
**Effort:** LOW (ongoing)

---

## Recommended Phase Architecture (Next Development Phase)

### Phase 4A — Security Hardening Sprint (2–3 days)
Addresses all CRITICAL and security-adjacent HIGH bugs:
- BUG-01, BUG-02, BUG-03, BUG-04 (SecurityManager/OAuthProvider/HttpServer security)
- BUG-34 (SecurityManager default "allow" → "deny")
- BUG-35 (WebhookManager SSRF guard)
- BUG-23, BUG-24, BUG-25 (ContainerSandbox hardening)
- BUG-41 (damage-control missing eval/exec/git-remote-set-url rules)
- BUG-42 (AuditLog shallow redaction)
- BUG-36 (AuditLog inverted default)
- RES-04, RES-05 (CVE-2025-53372, Tool Poisoning defense)
- BUG-29 (URL credential logging)

### Phase 4B — Runtime Reliability Sprint (3–4 days)
Addresses data-loss and resource-leak bugs:
- BUG-05, BUG-06, BUG-07, BUG-08 (Architecture: session race, signal handlers, cooldowns, reattachment)
- BUG-38, BUG-39, BUG-40 (ProxyManager reconnect, fuseIndex race, RedisStore disconnect)
- BUG-11, BUG-10, BUG-12 (SkillManager: atomic refresh, httpUtils extraction, plugin hot-reload)
- BUG-13, BUG-14 (TelemetryManager: async I/O, latency precision)
- BUG-30, BUG-31, BUG-32, BUG-33 (ProxyManager shadow registry, HttpServer cleanup, FileSessionStore, JWKS cache)
- BUG-37 (HttpServer /ready endpoint)

### Phase 4C — Observability & CI Sprint (2–3 days)
Addresses monitoring gaps and CI failures:
- BUG-15, BUG-16, BUG-17 (CI/CD: Trivy cache, checkout@v4, shard compilation race)
- BUG-18, BUG-19 (Hook replay/evidence tool_response)
- BUG-20, BUG-21 (damage-control rules and alert storm)
- IMP-01 (Invocation correlation ID)
- IMP-15 (vitest coverage thresholds)
- IMP-18, IMP-19 (purpose-gate validation, repo-audit error visibility)
- BUG-09 (ReDoS — also a reliability fix)

### Phase 4D — DX & Performance Polish (2–3 days)
Addresses developer experience and performance improvements:
- IMP-02, IMP-06 (Parallel skill loading, getStats caching)
- IMP-03, IMP-04, IMP-05 (search_skills docs, fetch_skill errors, SETUP.md)
- IMP-09, IMP-10, IMP-11, IMP-14 (TelemetryExporter keep-alive, status format, get_skill_help suggestions, benchmark)
- IMP-16 (vitest file parallelism after env isolation cleanup)
- BUG-22, BUG-26, BUG-27 (discover_tools annotation, WebhookManager maxAgeMs, TelemetryExporter double call)

### Phase 4E — MCP Spec Alignment (1 week)
Addresses external research findings:
- RES-01 (SDK v1.29.0 upgrade + PKCE audit)
- RES-02 (Native Elicitation for HITL approval)
- RES-03 (MCP Tasks for long-running ops)
- RES-07 (SSE deprecation audit)
- RES-08 (Node.js 22 LTS)
- RES-14 (TypeScript 5.9 + native .ts hooks evaluation)
- RES-11 (OpenTelemetry compatibility spike)
