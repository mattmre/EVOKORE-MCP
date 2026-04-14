# EVOKORE-MCP RuFlo Deep-Dive — Skills, Agents, Memory, Workflow, Tools
**Date:** 2026-04-14  
**Source:** [ruvnet/ruflo](https://github.com/ruvnet/ruflo) v3.5 (31.8k stars)  
**Method:** 5-expert parallel panel — Dr. Yuki Tanaka (Skills), Dr. Marcus Webb (Agent Infrastructure),  
Dr. Elena Sorokina (Cognitive Architecture), Dr. Carlos Mendez (Workflow & Narrative),  
Dr. Priya Anand (MCP Tool Architecture)  
**Prerequisite:** `docs/research/ruflo-assimilation-final-2026-04-14.md` (first 4-round panel — D1–D10 decisions)  
**Status:** Authoritative. Supplements, does not supersede, the first panel.

---

## What This Panel Added

The first panel resolved infrastructure decisions (SessionManifest JSONL, ClaimsManager, FleetManager,  
RL-lite reranker, tenant scoping). This panel went wider and deeper on five dimensions the first panel  
did not fully reach: skill catalog, agent archetypes, cognitive/learning architecture, workflow narrative,  
and MCP tool structure.

---

## Marketing Corrections (Cut These From Your Mental Model)

| Claim | Reality |
|-------|---------|
| "313 MCP tools" | ~58-73 genuine v3 executable tools; ~215 with all optional servers. ~98 are markdown CLI command files counted as tools. |
| "137+ skills" | 38 genuine SKILL.md files in 15 groups. Command markdown files and agent definitions are counted separately. |
| "100+ specialized agents" | 13 canonical AgentType values in source. The "100+" includes a 51-agent QE subsystem, plugin agents, background workers, and production hierarchy slots. Canonical types: `coordinator | researcher | coder | analyst | architect | tester | reviewer | optimizer | documenter | monitor | specialist | queen | worker` |
| "SONA sub-0.05ms neural adaptation" | k-nearest-neighbor pattern store with a lightweight low-rank query projection. Fast because it does almost nothing: `mean(qualityScores) - 0.5`. |
| "EWC++ prevents catastrophic forgetting" | LRU cache with academic branding. No gradient access, no weight updates. Retention policy: keep patterns used ≥5 times in 30 days. |
| "9 RL algorithms" | 9 TypeScript classes running RL math on isolated Float32Arrays with no connection to Claude model weights. Ignore entirely. |
| "Flash Attention 2.49x–7.47x speedup" | Appears in README marketing. Not found in any v3 source file. |
| "DAG JSON workflow templates" | Workflows are step arrays with dependency lists in MCP tool calls. EVOKORE's existing workflow-templates DAG JSON is more sophisticated. |

---

## Genuine Engineering Value Confirmed

### ReasoningBank — The One Learning Pattern Worth Adopting

The RETRIEVE-JUDGE-DISTILL-CONSOLIDATE pipeline structure is correctly implemented and worth porting:

**RETRIEVE** uses Maximal Marginal Relevance (MMR): `score = 0.7 × relevance + 0.3 × diversityScore`  
where `diversityScore = 1 - maxSimilarityToAlreadySelected`. Domain-filtered before scoring. k=3 default.

**JUDGE** is a rule-based formula (not learned):
```
success = (qualityScore >= 0.6) AND (positiveRatio > 0.6)
confidence = (stepFactor × 0.3) + (positiveRatio × 0.4) + (outcomeFactor × 0.3)
```
`positiveRatio` = fraction of steps with reward > 0.5. No learned weights — the reward signal must come from external sources.

**DISTILL** triggers when `verdict.success = true` AND `qualityScore >= 0.6`. Embedding = recency-weighted centroid of step states (not learned aggregation). Produces a `DistilledMemory` with `{ strategy, keyLearnings[], quality, usageCount }`.

**CONSOLIDATE** triggers after 100 new patterns. Dedup at 0.95 cosine threshold, prune age>30d AND usage<5, log contradictions.

**For EVOKORE ECC Phase 4:**  
Don't port the embedding dependency (requires a vector model not available in hook context). Replace cosine similarity with TF-IDF trigger matching on `triggerSignature` string. For 15 patterns, linear string matching + precision gate is sufficient and sub-millisecond. Store in `~/.evokore/patterns/patterns.jsonl`.

**Pattern lifecycle state machine (adopt this):**
```
candidate → [hitCount≥5 AND successRate≥0.70] → validated
validated → [not activated 30d] → stale
stale    → [not activated 90d] → retired
validated|active → [JUDGE pass] → usageCount++, successRate update
```

**JUDGE signal wiring for EVOKORE** (concrete, grounded in existing evidence-capture.js):
```javascript
function judgeSession(sessionId) {
  const evidence = readEvidenceLog(sessionId);
  const testPassed   = evidence.some(e => e.type === 'test_run' && e.outcome === 'pass');
  const noErrorLoops = !detectErrorLoop(evidence);        // AGT-013 loop detector
  const editVerified = evidence.some(e => e.type === 'file_edit' && e.verified);
  const quality = (testPassed ? 0.4 : 0) + (noErrorLoops ? 0.3 : 0) + (editVerified ? 0.3 : 0);
  return { success: quality >= 0.6, qualityScore: quality };
}
```

**Cross-session persistence** (adopt the two-layer model, skip RVF binary encoding):
- Layer 1: `~/.evokore/patterns/patterns.jsonl` — one pattern per line, no embeddings
- Layer 2: `~/.evokore/patterns/index.json` — `{ patternCount, lastUpdated, activeIds[], staleIds[] }`
- For human-readable injection into Claude Code: write high-confidence patterns to `~/.claude/projects/.../memory/patterns.md` (Claude Code auto-loads this into system prompt)

---

## New Tool Categories EVOKORE Needs

### Priority 1: Typed Session Memory (`src/MemoryManager.ts`, ~300 LOC)

**The gap:** EVOKORE writes to append-only JSONL. There is no tool an agent can call to store a finding and retrieve it later in the same session. The agent must re-read giant log files to reconstruct context — or carry it in the context window, inflating token usage.

**3 tools:**
```
memory_store(content, type, key?, tags?, importance?, ttl_ms?)
  → { memory_id, stored_at }
  type: 'episodic'|'semantic'|'procedural'|'working'

memory_search(query, type?, min_relevance?, limit?, search_type?)
  → { memories: [{ id, content, type, relevance, created_at }] }
  search_type: 'keyword'|'hybrid'  (no embedding needed for keyword)

memory_list(type?, tags?, sort_by?, limit?, offset?)
  → { memories: [...], total }
```

**Backend:** SQLite at `~/.evokore/memory/{sessionId}.db`. Three tables: `entries`, `tags`, `access_log`.  
**8 memory types with explicit TTLs** (from RuFlo's hive-mind-advanced):

| Type | TTL | Use |
|------|-----|-----|
| `knowledge` | persistent | Durable facts |
| `context` | session | Current session state |
| `task` | task-scoped | Per-task intermediate state |
| `result` | 24h | Completed task outputs |
| `error` | 7d | Post-mortem records |
| `metric` | 30d | Performance measurements |
| `decision` | session | Key choices made |
| `working` | 1h | Active scratchpad |

**Pattern:** Follows `NavigationAnchorManager` exactly — new class, new manager, registered in `src/index.ts`.  
**Branch:** `feat/memory-manager`

---

### Priority 2: Async Worker Dispatch (`src/WorkerManager.ts` extension)

**The gap:** All EVOKORE tool calls are synchronous. There is no pattern for "run a test suite and come back to me." Agents currently either block on slow operations or skip them.

**2 tools:**
```
worker_dispatch(trigger, session_id, priority?, timeout_ms?)
  → { worker_id, estimated_completion_ms }
  trigger: 'test_run'|'repo_analysis'|'security_scan'|'dependency_check'|'benchmark'

worker_context(session_id, worker_id?)
  → { context_block: string, workers_complete: number, workers_pending: number }
```

**Implementation:** `child_process.fork()` on worker scripts in `scripts/workers/`. Worker writes output to `~/.evokore/workers/{sessionId}/{workerId}.json`.  
**Auto-injection:** `purpose-gate.js` calls `worker_context` before each prompt and prepends completed results to `additionalContext`. Workers dispatch asynchronously; results land in the next prompt naturally.

**Auto-dispatch triggers** (from purpose-gate intent analysis):
- "performance" → dispatch `benchmark` + `optimize` workers
- "test" → dispatch `test_run` worker
- "security" → dispatch `security_scan` worker (critical priority)
- "docs" → dispatch `document` worker

---

### Priority 3: Task Dependency Graph (extend `tilldone.js`)

**The gap:** TillDone tracks a flat task list. No dependency ordering. Agents complete dependent tasks before prerequisites.

**Schema extension:**
```javascript
{ id, text, done, depends_on?: string[], blocked_by?: string[], domain?: string }
```

**Behavior:** When `task/complete` fires, automatically transition tasks whose `depends_on` are all now completed from `blocked → pending`. Surface newly-unblocked tasks via `additionalContext` in purpose-gate.

**No new MCP tool needed** — this is a TillDone schema + hook logic change.

---

## New Agent Archetypes (AGT-014 through AGT-021)

EVOKORE currently has 13 archetypes (AGT-001 to AGT-013). The following 8 are the highest-value additions, ordered by urgency.

### AGT-018: Governance Gate ⚡ HIGHEST PRIORITY

**Why it's #1:** EVOKORE's damage-control is pattern-matching shell command strings. There is no mechanism to self-throttle a drifting agent, enforce budget invariants, or chain evidence cryptographically. Long autonomous sessions are fragile because of this single gap.

**What it does:**
- Compiles `RULES.md` + `CLAUDE.md` into a typed `PolicyBundle` at session start (not re-parsed per call)
- `DeterministicToolGateway` — idempotency + schema + budget metering on tool calls
- `ContinueGate` — step-level loop control via budget slope and rework ratio
- `TrustSystem` — per-agent score (0.0–1.0): success=+0.01, failure=-0.05, gate violation=-0.10
- 4 trust tiers → throughput multipliers: Trusted(≥0.8)=2x, Standard(≥0.5)=1x, Probation(≥0.3)=0.5x, Untrusted(<0.3)=0.1x + require approval per call
- `IrreversibilityClassifier` — elevate proof requirement for destructive/external actions

**EVOKORE wiring:**
1. Compile `PolicyBundle` in `purpose-gate.js` at first prompt, cache in session manifest
2. Add `TrustLedger.ts` (~100 LOC) backed by `~/.evokore/sessions/{sessionId}-trust.json`
3. Wire trust tiers into existing HITL approval-token flow: untrusted agents hit approval gate automatically
4. Add SHA-256 proof chaining to `evidence-capture.js` (one-line change to serializer)
5. Add `IrreversibilityClassifier` to `damage-control.js`: classify `destructive` (git reset, file delete) and `external` (npm publish, webhook send) actions, require existing `_evokore_approval_token`

**File:** `SKILLS/ORCHESTRATION FRAMEWORK/agent-archetypes/AGT-018-governance-gate.json`

---

### AGT-014: Security Sentinel

**Gap:** EVOKORE's damage-control blocks dangerous shell commands. It does not detect prompt injection inside agent message payloads, jailbreak attempts, or PII exfiltration.

**Key capabilities:**
- 50+ prompt injection pattern library (from `aidefence.yaml`) with <10ms detection
- LTL policy verification on agent action sequences
- Behavioral anomaly detection (Lyapunov exponent temporal analysis)
- CVE scanning on code changes
- PII detection before any external API call

**EVOKORE wiring:** Extend `damage-control.js` with a `PostToolUse` branch that scans tool output for injection markers. Import `aidefence.yaml` patterns into `damage-control-rules.yaml` under a new `output_patterns` section. (This was already in the Phase B security hardening plan — this is the exact content for those patterns.)

**File:** `SKILLS/ORCHESTRATION FRAMEWORK/agent-archetypes/AGT-014-security-sentinel.json`

---

### AGT-019: Claims Coordinator

**Gap:** Multiple concurrent agents have no ownership system. This causes the exact merge-conflict scenario documented in EVOKORE CLAUDE.md: "Committing shared ephemeral tracking logs on feature branches causes unresolvable git merge conflicts."

**Key capabilities:**
- 9-state claim lifecycle: `unclaimed → active → paused → blocked → handoff-pending → stealable → completed`
- Work-stealing: eligibility when stale (no progress 30 min), blocked (60 min), overloaded (5+ concurrent)
- Work-stealing protections: 10-min grace for new claims; >75% complete = protected
- Handoff pipeline: `architect → coder → tester → reviewer` with ownership transfer and context preservation
- Load balancing: rebalance when any agent exceeds 1.5x average utilization

**EVOKORE wiring:** This is the extended `ClaimsManager.ts` from Phase 1-A. The agent archetype definition governs the coordination logic; the MCP tools (`claims_acquire`, `claims_release`, `claims_heartbeat`, `claims_request_handoff`, `claims_steal`) are the implementation.

**File:** `SKILLS/ORCHESTRATION FRAMEWORK/agent-archetypes/AGT-019-claims-coordinator.json`

---

### AGT-016: Memory Steward

**Gap:** No agent owns session knowledge health. Contradictory facts accumulate. Evidence ages without pruning. Cross-session knowledge is never consolidated.

**Key capabilities:**
- `transferKnowledge()` between agents (filtering by min-confidence and category)
- Session-end consolidation: Jaccard similarity >0.3 for graph edges, PageRank (damping=0.85, 30 iterations) for ranking
- Confidence maintenance: +0.03 on access, -0.005/hour decay
- Contradiction detection before writes: quarantine contradictions, resolve via TruthAnchorStore
- TTL enforcement: `validFrom/validUntil` windows on memory entries

**EVOKORE wiring:** This agent operates on the `MemoryManager` SQLite store (Priority 1 above). It runs as a background worker (already in WorkerManager framework) at session-end and during compaction.

**File:** `SKILLS/ORCHESTRATION FRAMEWORK/agent-archetypes/AGT-016-memory-steward.json`

---

### AGT-015: Performance Engineer

**Gap:** EVOKORE's Refactorer modifies structure but does not benchmark, profile, or enforce performance budgets.

**Key capabilities:** Benchmarking with regression diffing, CPU/memory hotspot detection, performance budget enforcement (reject regressions beyond threshold), serialized execution (parallel_allowed: false for benchmark consistency).

**File:** `SKILLS/ORCHESTRATION FRAMEWORK/agent-archetypes/AGT-015-performance-engineer.json`

---

### AGT-017: Quality Engineer

**Gap:** EVOKORE's QA archetype (AGT-004) runs existing tests. QE generates tests that don't yet exist and predicts defects.

**Key capabilities:** Multi-paradigm test generation (unit, integration, BDD, mutation, fuzzing, contract, property-based, accessibility), ML-based defect prediction, TDD sub-agent orchestration, O(log n) coverage gap detection.

**File:** `SKILLS/ORCHESTRATION FRAMEWORK/agent-archetypes/AGT-017-quality-engineer.json`

---

### AGT-020: Neural Optimizer

**Gap:** EVOKORE has no session-to-session learning feedback loop. This is the ECC Phase 4 runtime agent.

**Key capabilities:** Pattern trajectory recording, MMR-based retrieval, session-end consolidation with PageRank ranking, MEMORY.md injection into Claude Code system prompt.

**Note:** This archetype is implemented by ECC Phase 4 (`scripts/eval-harness.js` + `scripts/pattern-extractor.js`). The archetype JSON formalizes the agent's coordination role.

**File:** `SKILLS/ORCHESTRATION FRAMEWORK/agent-archetypes/AGT-020-neural-optimizer.json`

---

### AGT-021: Release Engineer

**Gap:** EVOKORE's v3.1.0 npm publish was skipped because of NPM_TOKEN. A release agent would own the gate sequence and fail explicitly at the right step instead of silently.

**Key capabilities:** Sequential gate enforcement (`preflight → tag → github-release → npm-publish`); rollback plan generation; dry-run before publish; `governance.approval_required: ["publish-npm", "create-git-tag"]`.

**File:** `SKILLS/ORCHESTRATION FRAMEWORK/agent-archetypes/AGT-021-release-engineer.json`

---

## 5-Rung Escalation Ladder

EVOKORE currently has 2 rungs (agent → orchestrator → human). The 5-rung design closes the gap:

| Rung | Trigger | Action | EVOKORE Status |
|------|---------|--------|----------------|
| 1 — Self-Correction | Single tool failure, retry < max | Agent retries silently | ✅ Exists implicitly |
| 2 — Approach Change | Repeated-error pattern (same error >3×) | AGT-013 Loop Operator fires change-approach | ✅ AGT-013 complete |
| 3 — Work Reassignment | Stalled pattern + no completion in 10 min | AGT-019 Claims Coordinator steals work; no human | ❌ Missing — work just dies today |
| 4 — Human Escalation | No eligible replacement OR irreversible action OR trust <0.3 | HITL token + TillDone block + manifest escalation | ⚠️ Mechanism exists; auto-detection missing |
| 5 — Termination | Byzantine fault OR human instruction | AGT-013 terminate + human approval + proof-chain seal | ⚠️ Terminate path exists; Byzantine detection missing |

**Rung 3 requires:** AGT-019 + `claims_steal` tool + `stalled` signal from AGT-013  
**Rung 4 auto-detection requires:** TrustLedger (AGT-018) + IrreversibilityClassifier  
**Rung 5 Byzantine detection requires:** AGT-018 `CollusionDetector` — lowest-priority; manual termination covers this for now

---

## Coordination Patterns

### Domain-Partitioned Routing

As EVOKORE's archetypes grow from 13 to 21+, flat routing from orchestrator to workers by name becomes O(agents). Domain partitioning limits routing decisions to O(domains).

**Implementation:**
1. Add `"domain"` field to every archetype JSON: `security | core | quality | performance | deployment | meta`
2. Add `domainQueues` to session manifest
3. New `route_to_domain` tool from a `DomainRouter` class using 5-factor scoring:
   - Capability alignment (30%)
   - Load distribution (20%)
   - Historical success rate (25%)
   - Agent health (15%)
   - Availability (10%)
4. `SessionAnalyticsManager` surfaces rebalance recommendations when domain >1.5x average

**Swarm topology auto-selection:**
- 1–2 agents: flat parallel DAG template
- 3–5 agents: hierarchical DAG template  
- 6+ agents: hierarchical-mesh with domain partitioning
- Keywords "security" or "refactor": always add security-sentinel domain

---

## Skill Library Additions

### Top 10 Skills to Import/Create

| # | Skill | Source | EVOKORE Action |
|---|-------|--------|---------------|
| 1 | `verification-quality` | `skills/verification-quality/SKILL.md` | Import and adapt: truth-score (0.0-1.0), environment thresholds, machine-readable JSON output for CI gates |
| 2 | `ai-defence` | `skills/aidefence.yaml` + `aidefence-scan.md` | Import patterns into `damage-control-rules.yaml` output_patterns section; create new skill |
| 3 | `sparc-methodology` | `skills/sparc-methodology/SKILL.md` | Import the 17-mode framework as a single skill; enables `/sparc-pipeline` command |
| 4 | `github-release-management` | `skills/github-release-management/SKILL.md` | Import: progressive deployment table (canary 5%→25%→50%→100%), auto-rollback triggers |
| 5 | `hooks-automation` | `skills/hooks-automation/SKILL.md` | Import: 3-phase memory sync (STATUS→PROGRESS→COMPLETE), JSON flow-control response grammar |
| 6 | `verification-quality` | See #1 | Machine-readable truth score enabling `/verify-quality` command |
| 7 | `agentic-jujutsu` | `skills/agentic-jujutsu/SKILL.md` | Import: multi-agent VCS guidance, success scoring per trajectory, concurrent non-locking patterns |
| 8 | `v3-mcp-optimization` | `skills/v3-mcp-optimization/SKILL.md` | Import: 6 optimization patterns for EVOKORE's ProxyManager (O(1) hash-map lookup, 3-tier cache, batch/compress) |
| 9 | `browser` | `skills/browser/SKILL.md` | Create new skill: AI-optimized browser with abbreviated refs (93% context reduction), multi-session isolation |
| 10 | `skill-builder` (meta-skill) | `skills/skill-builder/SKILL.md` | Update EVOKORE skill authoring guidance in CLAUDE.md: progressive disclosure constraint, trigger-explicit descriptions |

**Canonical SKILL.md raw base path:**
`https://raw.githubusercontent.com/ruvnet/ruflo/main/v3/%40claude-flow/cli/.claude/skills/{name}/SKILL.md`

### 5 Skill Design Patterns to Adopt Across EVOKORE's Library

**1. Progressive Disclosure (gate deeper loading behind activation)**  
Only `name` and `description` are consumed at index time. Everything else loads on activation. For EVOKORE's 336 skills: audit which frontmatter fields are consumed at match-time (name, description, tags, aliases) vs. only needed post-activation (category, requires, conflicts). Move the latter to the skill body.

**2. Trigger-explicit descriptions ("when to invoke" not just "what it does")**  
Add "Use when..." or "Invoke for..." to every description. This improves `resolve_workflow` precision immediately — the semantic match triggers on the right context, not just the subject domain.

**3. Skill-to-archetype affinity field**  
Add `archetype: "AGT-014"` to skill frontmatter. When `resolve_workflow` returns a skill, it also returns the recommended agent type to execute it. Security skills → AGT-014. Quality skills → AGT-017.

**4. Truth-score as first-class evidence field**  
Add `quality_score: number` (0.0-1.0) to evidence JSONL entries. This makes evidence composable with quality gates and the JUDGE step in ECC Phase 4.

**5. Dual-invocation path (MCP + CLI fallback)**  
Each skill should declare its MCP tool call signature and CLI fallback. Skills are currently documentation-only. The `execute_skill` tool partially covers this — wire it explicitly.

---

## Workflow and Narrative Additions

### 3 Narrative Mechanisms to Wire

**1. Phase files as durable intent (survives /clear)**  
At each major work unit completion, write `session-phase-<n>-<slug>.md` to the project root or `docs/`. TillDone should reference the phase file as a required artifact before blocking Stop. Any agent in any future session can Read it cold and know exactly where the project stands.

**2. Memory namespace isolation per mode**  
Extend session manifest `namespaces` block: `{ "sparc:auth:spec": "phase_1_auth.md", "sparc:auth:architecture": "docs/arch-auth.md" }`. On session resume, purpose-gate injects namespace summaries into `additionalContext` so agents don't re-read large files.

**3. Auto-generated session summary (replace manual next-session.md authoring)**  
Extend the Stop hook (`tilldone.js` or a new `session-end.js`) to write `session-summary-{sessionId}.md` with:
- Tasks completed (from TillDone)
- Files produced (from evidence-capture `file_write` entries)
- Key decisions (from session manifest `decisions` block)
- Next action (from current next-session.md pending item)
- Metrics: commands run, files touched, estimated tokens used

This becomes the auto-populated `next-session.md` content; operator annotates rather than authors from scratch.

### 5 Commands to Add (beyond already-planned /agent-spawn, /workflow-run, /pattern-learn)

| Command | Purpose | Implementation |
|---------|---------|---------------|
| `/sparc-spec` | Run SPARC Specification phase; produces `phase_1_<slug>.md` with Gherkin acceptance criteria and FR/NFR blocks | New skill file + calls `docs_architect` + writes phase file |
| `/sparc-pipeline` | Execute full 5-phase SPARC sequence with done-criteria gates | New skill file + `TodoWrite` batch per phase + phase file gate |
| `/session-checkpoint` | Mid-session snapshot: reads tilldone + evidence, writes `session-checkpoint-<ts>.md`, updates session manifest | New `session-checkpoint.js` hook script |
| `/verify-quality` | Run AEP golden tasks, produce M-01 through M-05 metrics, write `docs/session-logs/eval-<date>.md` | New skill mapping to existing AEP evaluation harness |
| `/scope-lock "docs only"` | Freeze scope in session manifest; inject scope constraint into purpose-gate; optionally add temporary damage-control rule blocking out-of-scope file types | Extend `purpose-gate.js` + `damage-control.js` |

### SPARC Phase Map (for `/sparc-pipeline` implementation)

| Phase | Agent Mode | Key Artifacts | Done Gate |
|-------|-----------|---------------|-----------|
| Specification | `specification` | `phase_1_<slug>.md` (FR/NFR/Gherkin) | All requirements testable; edge cases documented |
| Pseudocode | `spec-pseudocode` | `phase_2_<slug>.md` (ALGORITHM blocks, Big-O) | All FRs have algorithms; no language-specific syntax |
| Architecture | `architect` | Mermaid diagram, component YAML, OpenAPI stub | All component interfaces documented |
| Refinement | `tdd` | Tests + implementation (Red→Green→Refactor) | 80%+ coverage; cyclomatic complexity ≤2 |
| Completion | `workflow-manager` + `documenter` | Docs, ADR, monitoring config, session summary | Integration test passing; knowledge captured |

---

## Session Lifecycle Improvements

### Session Start (current vs. target)

| Dimension | EVOKORE Today | Target (with new additions) |
|-----------|--------------|----------------------------|
| Intent capture | purpose-gate asks for purpose, injects SOUL values | ✅ Keep |
| Memory loading | None | Load matching namespace context + relevant memory entries |
| Complexity estimation | None | `swarm_complexity_score` (0–1): keyword + file-count analysis |
| Task scaffolding | Manual tilldone | Pre-populate tilldone batch with phase-appropriate tasks based on intent |
| Worker dispatch | None | Auto-dispatch background workers matching intent keywords |

### Swarm Trigger Conditions (add to purpose-gate)

Auto-recommend agent spawn when:
- ≥3 files named in prompt → domain-partitioned spawn
- Keywords: "new feature", "refactor", "API change", "security" → hierarchical swarm + security-sentinel
- Keywords: "fix", "typo", "update config", single file → single agent, skip swarm

Expressed as `swarm_complexity_score` in `session_context_health`:
- <0.3: single agent
- 0.3–0.6: 2-3 agents
- 0.6–0.8: full domain swarm

---

## Updated Phase Sequence

These are **additions** to the existing Phase 0–9 roadmap from the first panel. Insert at appropriate points:

### New Phase 2.5 — Memory & Worker Layer (after Phase 2, before Phase 3)

| PR | Files | Effort |
|----|-------|--------|
| 2.5-A | `src/MemoryManager.ts` (SQLite, 8 types, 3 tools: memory_store/search/list) | 1.5d |
| 2.5-B | `scripts/workers/` + `worker_dispatch/worker_context` tools + `purpose-gate.js` auto-injection | 1d |
| 2.5-C | TillDone task dependency graph (depends_on schema + auto-unblocking) | 0.5d |

### New Phase 3.5 — Governance & Trust Layer (after Phase 3)

| PR | Files | Effort |
|----|-------|--------|
| 3.5-A | `src/TrustLedger.ts` + SHA-256 proof chaining in `evidence-capture.js` + `IrreversibilityClassifier` in `damage-control.js` | 1.5d |
| 3.5-B | AGT-018 Governance Gate archetype JSON + `PolicyBundle` compilation in `purpose-gate.js` | 1d |

### New Agent Archetypes Phase (after Phase 3.5)

| PR | Files | Effort |
|----|-------|--------|
| AGT-PR-1 | AGT-014 Security Sentinel + AGT-019 Claims Coordinator + `aidefence.yaml` patterns in `damage-control-rules.yaml` | 1.5d |
| AGT-PR-2 | AGT-015 Performance Engineer + AGT-016 Memory Steward + AGT-017 Quality Engineer | 1d |
| AGT-PR-3 | AGT-020 Neural Optimizer + AGT-021 Release Engineer + domain routing field in all archetype JSONs | 1d |

### New Skills Import Phase (parallelizable with any phase)

| PR | Files | Effort |
|----|-------|--------|
| SKILLS-PR-1 | Import `verification-quality`, `ai-defence`, `sparc-methodology` + update `damage-control-rules.yaml` output_patterns | 1d |
| SKILLS-PR-2 | Import `github-release-management`, `hooks-automation`, `agentic-jujutsu` | 0.5d |
| SKILLS-PR-3 | Import `v3-mcp-optimization`, `browser` + update `skill-builder` guidance in CLAUDE.md | 0.5d |

### New Commands Phase (after Skills Import)

| PR | Files | Effort |
|----|-------|--------|
| CMDS-PR-1 | `/sparc-spec`, `/sparc-pipeline` skill files | 1d |
| CMDS-PR-2 | `/session-checkpoint` script + `/scope-lock` purpose-gate extension | 1d |
| CMDS-PR-3 | `/verify-quality` skill + AEP golden task wiring | 1d |

---

## Effort Summary (New Items Only)

| Phase | Days |
|-------|------|
| 2.5 — Memory & Worker Layer | 3 |
| 3.5 — Governance & Trust Layer | 2.5 |
| Agent Archetypes (8 new) | 3.5 |
| Skills Import (10 skills) | 2 |
| Commands (5 new) | 3 |
| **Total new work** | **~14 days** |

Combined with the existing Phase 0–9 roadmap (~35 days), total EVOKORE-MCP roadmap: **~49 days**.

---

## Start Prompts for New Work

**Memory Manager (Phase 2.5-A — highest immediate value):**
> "Implement src/MemoryManager.ts: 3 MCP tools (memory_store, memory_search, memory_list), SQLite backend at ~/.evokore/memory/{sessionId}.db, 8 memory types (knowledge/context/task/result/error/metric/decision/working) with TTL enforcement. Follow NavigationAnchorManager pattern. No new npm deps beyond better-sqlite3 (already in devDeps check first). Branch: feat/memory-manager."

**AI Defence Extension (Phase B prerequisite — security hardening):**
> "Extend damage-control-rules.yaml with an output_patterns section using patterns from https://raw.githubusercontent.com/ruvnet/ruflo/main/v3/%40claude-flow/cli/.claude/skills/aidefence.yaml. Patterns to include: prompt injection markers ('ignore previous', 'new instructions'), role override attempts, PII exfiltration patterns. Wire as a PostToolUse branch in damage-control.js scanning tool output. Branch: feat/ai-defence-patterns."

**Trust Ledger (Phase 3.5-A):**
> "Implement src/TrustLedger.ts: per-agent score map (0.0-1.0, initial 0.5) persisted at ~/.evokore/sessions/{sessionId}-trust.json. Score rules: success +0.01, failure -0.05, gate violation -0.10, idle decay -0.005/hr. 4 tiers (Trusted/Standard/Probation/Untrusted) with throughput multipliers. Add SHA-256 proof chaining to evidence-capture.js (hash over {agentId, toolName, toolInput, toolOutput, previousHash}). Expose session_trust_report tool from SessionAnalyticsManager. Branch: feat/trust-ledger."

**Skill Import Batch:**
> "Import 3 skills from ruvnet/ruflo into SKILLS/EVOKORE EXTENSIONS/: (1) verification-quality from https://raw.githubusercontent.com/ruvnet/ruflo/main/v3/%40claude-flow/cli/.claude/skills/verification-quality/SKILL.md, (2) sparc-methodology from .../sparc-methodology/SKILL.md, (3) hooks-automation from .../hooks-automation/SKILL.md. Adapt frontmatter to EVOKORE schema (add aliases, category, tags). Branch: feat/skills-import-wave1."
