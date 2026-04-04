# ECC Integration Plan -- Unified Feasibility Panel Report

**Date:** 2026-03-30
**Panel:** Feasibility Research Panel (Panel of Experts Framework)
**Input Documents:** Architecture & Planning Panel Report, Repo Ingestion Panel Report
**Target:** docs/ECC-INTEGRATION-PLAN.md (9-phase integration plan)
**Status:** FINAL

---

## Panel Composition

| Expert | Role | Lens |
|---|---|---|
| **Dr. Michael Torres** | Research Engineer (20yr) | Prior art, alternative approaches, community solutions |
| **Angela Wright** | Cost & Effort Analyst (15yr) | Build effort, maintenance burden, ROI, hidden costs |
| **David Okonkwo** | Technical Program Manager (18yr) | Sequencing, dependencies, critical path, incremental delivery |
| **Dr. Ingrid Svensson** | Implementation Specialist (12yr) | Prototype viability, technical spikes, integration complexity |

---

## Phase 1: Solo Expert Evaluations

### Dr. Michael Torres -- Research Engineer

**Lens: Has someone already solved this? What prior art exists?**

| # | Recommendation | Torres Assessment |
|---|---|---|
| C1 | Context budget system | The problem is real but poorly defined. Claude Code does not expose token counts to hooks or CLAUDE.md. There is no SDK API for measuring prompt overhead. ECC's "token budget" is aspirational markdown -- it has no runtime measurement either. **No proven solution exists for MCP-level token counting.** The concept of capping behavioral injection at ~500 tokens is sound as a heuristic, but "measuring" it requires character-counting at best. |
| C2 | Design RFC for Phase 4 data model | Standard engineering practice. The community has no established pattern for "AI instinct evolution" -- this is novel research. CL v2 in ECC is a conceptual spec, not a working system. No reference implementation exists to study. |
| C3 | HITL gate to instinct evolution | Precedent: EVOKORE already has HITL approval for tool calls. Extending to config mutation is a well-understood pattern. The approval-token mechanism in `SecurityManager.ts` is directly reusable. |
| C4 | Authority precedence for steering modes | Standard layered policy architecture. Similar to CSS specificity or Kubernetes admission controller chains. Well-understood pattern, no novel research needed. |
| 5 | Restructure Phase 3 (Loop Operator priority) | Loop detection is a known problem in agentic systems. Anthropic's own agent SDK has retry-with-backoff. ECC's Loop Operator is a JSON archetype file, not runtime code -- it instructs Claude to watch for repetition. EVOKORE can achieve the same with a skill document. |
| 6 | Define "session" unit | Industry standard for estimation. No prior art conflict. |
| 7 | Replace Phase 8.1 (drop cross-IDE) | I strongly agree. Cross-IDE adapters are a maintenance nightmare for a solo developer. Each IDE updates its configuration format independently. MCP is the abstraction layer -- that is the whole point of the protocol. |
| 8 | PM2 Windows spike | PM2 on Windows has known issues: no graceful shutdown, no cluster mode on Windows before Node 16, and WMIC deprecation warnings. Alternative: `node:cluster` + custom process management. Worth investigating `pm2-windows-service` but the npm package has not been updated since 2023. |
| 9 | Acceptance criteria per phase | Standard PM practice. No research needed. |
| 10 | Measure hook latency | Straightforward benchmarking. Node.js `perf_hooks` module is the right tool. No prior art needed -- just measurement. |
| 11 | Correct EVOKORE numbers | Factual correction. I verified: CLAUDE.md says 7 hooks (correct -- 8 files in `scripts/hooks/` but `fail-safe-loader.js` is shared infra). Native tools count from SkillManager + PluginManager + TelemetryManager + index.ts handler registrations needs exact inventory. The ECC plan says "5 native tools" which is wrong. **RESOLVED:** Actual count is 14 native tools (11 SkillManager + 2 TelemetryManager + 1 PluginManager). Corrected in CLAUDE.md, dynamic-tool-discovery-research.md, and ECC-INTEGRATION-PLAN.md. |
| 12 | Re-verify ECC claims | Essential due diligence. Cannot evaluate what you have not measured. |
| 13 | Add Read to damage-control | Confirmed gap. `damage-control.js` line 138 only checks `toolName === 'Bash'` for dangerous commands. Line 163 does path extraction for all tools, and line 165 does check zero_access_paths for all tools. But the `.claude/settings.json` matcher is `Bash|Edit|Write` -- the Read tool never triggers damage-control at all. This is a real security gap. **RESOLVED:** Matcher already updated to `Bash|Edit|Write|Read` (confirmed in `.claude/settings.json`). `extractPaths()` already handles `file_path` argument for Read tool calls. |
| 14 | Phase 7 security (remote plugins) | Remote code execution is a well-studied attack surface. npm's approach (package signing, provenance, lockfiles) is the minimum bar. EVOKORE has no equivalent. Without code signing, a remote plugin install is `curl | bash` with extra steps. |
| 15 | License analysis | Legal due diligence. ECC repo has MIT license. Skills imported should carry attribution. Standard practice. |
| 16 | Test strategy per phase | Essential. Current 316 test files / 2053 tests show the project takes testing seriously. Each new phase must continue this standard. |
| 17 | Skill namespace pollution | With 336+ skills already indexed, mass import creates resolution ambiguity. Fuse.js fuzzy matching will degrade with more entries. The `resolve_workflow` semantic hints help, but namespace prefixing or category scoping is needed at scale. |
| 18 | Behavioral file integrity | Git-based integrity (track SOUL.md/RULES.md in git, reject uncommitted modifications at hook time) is the simplest approach. Hash verification in a YAML file adds complexity without proportional benefit. |
| 19 | Fix CLAUDE.md staleness | CLAUDE.md is already 400+ lines. It serves as the institutional memory. Stale claims are a real problem -- but the fix is editorial, not engineering. |

### Angela Wright -- Cost & Effort Analyst

**Lens: What is the real cost including tests, docs, edge cases, and the bug you will ship?**

**Estimation Framework:**
- Base estimate = plan's session count
- Multiplier = 2.5x for well-understood work, 3.5x for novel/research work
- 1 "session" = 4 hours of focused solo developer + AI pair work
- Velocity observed: 2-4 meaningful PRs per session

| # | Recommendation | Effort (Optimistic) | Effort (Realistic @ 3x) | Maintenance Burden | ROI Assessment |
|---|---|---|---|---|---|
| C1 | Context budget system | 0.5 sessions | 1.5 sessions | LOW -- rarely changes | MODERATE -- useful but Claude does not expose token API |
| C2 | Phase 4 design RFC | 2 sessions | 7 sessions (3.5x -- research) | N/A -- design artifact | **NEGATIVE until Phase 4 is committed to** |
| C3 | HITL gate to instinct evolution | 0.5 sessions | 1.5 sessions | LOW | HIGH but only if Phase 4 ships |
| C4 | Authority precedence | 0.5 sessions | 1.5 sessions | LOW -- document + test | HIGH -- prevents conflict bugs |
| 5 | Restructure Phase 3 (Loop Operator) | 0.25 sessions | 0.75 sessions | LOW -- skill file | MODERATE -- nice to have |
| 6 | Define session unit | 0 (editorial) | 0.25 sessions | NONE | HIGH -- fixes all estimates |
| 7 | Replace Phase 8.1 | -4 sessions (savings) | -4 sessions | **SAVES** maintenance | **HIGH -- avoids 4-6 sessions of waste** |
| 8 | PM2 Windows spike | 0.5 sessions | 1.5 sessions | UNKNOWN until spike | MODERATE -- gates Phase 9 |
| 9 | Acceptance criteria | 1 session | 2.5 sessions | LOW | HIGH -- prevents scope creep |
| 10 | Measure hook latency | 0.25 sessions | 0.75 sessions | LOW -- one-time | HIGH -- data before decisions |
| 11 | Correct EVOKORE numbers | 0.5 sessions | 1.5 sessions | LOW | **CRITICAL -- prevents downstream errors** |
| 12 | Re-verify ECC claims | 1 session | 3 sessions | LOW | **CRITICAL -- plan is unreliable without this** |
| 13 | Add Read to damage-control | 0.25 sessions | 0.75 sessions | LOW | **HIGH -- real security fix** |
| 14 | Phase 7 security design | 2 sessions | 7 sessions (3.5x) | HIGH -- ongoing | **CRITICAL before remote plugins** |
| 15 | License analysis | 0.25 sessions | 0.75 sessions | LOW -- one-time | MODERATE -- legal compliance |
| 16 | Test strategy | 1 session | 2.5 sessions | MODERATE | HIGH -- maintains quality bar |
| 17 | Skill namespace strategy | 0.5 sessions | 1.5 sessions | LOW | MODERATE -- future-proofing |
| 18 | Behavioral file integrity | 0.5 sessions | 1.5 sessions | LOW | LOW -- git already provides this |
| 19 | Fix CLAUDE.md staleness | 0.5 sessions | 1.25 sessions | LOW | HIGH -- foundational correctness |

**Total cost of all 19 recommendations (realistic):** ~37 sessions = ~148 hours = ~18.5 working days

**Angela's critical observation:** The 9-phase plan estimates 28-43 sessions. The 19 recommendations from the review panels add another ~37 sessions of prerequisite work. A solo developer at 1 session/day would need 65-80 working days (3-4 months) for everything. That is unrealistic without ruthless prioritization.

**Hidden costs the plan does not account for:**
1. Each new hook adds latency to every tool call. 7 hooks already run on every PostToolUse. Adding more creates measurable UX degradation.
2. CLAUDE.md is approaching the point where its own token cost reduces useful context window. Adding SOUL.md + RULES.md + steering modes means more prompt overhead.
3. 336+ skills already cause slow startup. Mass import (Phase 6) will make this worse.
4. Every new behavioral file (SOUL.md, RULES.md, instincts.yaml) needs to stay synchronized with CLAUDE.md. Drift between these files will cause contradictory instructions.

### David Okonkwo -- Technical Program Manager

**Lens: What delivers value earliest? What is independently shippable in week 1?**

**Dependency Analysis:**

```
TIER 0 -- Independent, shippable immediately (no dependencies):
  [13] Add Read to damage-control   (security fix, 0.75 sessions)
  [19] Fix CLAUDE.md staleness       (editorial, 1.25 sessions)
  [11] Correct EVOKORE numbers       (editorial, 1.5 sessions)
  [6]  Define session unit            (editorial, 0.25 sessions)
  [10] Measure hook latency           (benchmark, 0.75 sessions)
  [15] License analysis               (due diligence, 0.75 sessions)

TIER 1 -- Requires TIER 0 (factual foundation):
  [12] Re-verify ECC claims           (requires [11], 3 sessions)
  [C4] Authority precedence           (document, 1.5 sessions)
  [9]  Acceptance criteria            (requires [6], 2.5 sessions)

TIER 2 -- Requires TIER 1 (verified plan):
  [C1] Context budget system          (requires [10] latency data, 1.5 sessions)
  [17] Skill namespace strategy       (requires [12] to know real import scope, 1.5 sessions)
  [16] Test strategy                  (requires [9] acceptance criteria, 2.5 sessions)
  [5]  Loop Operator skill            (independent skill file, 0.75 sessions)

TIER 3 -- Spikes (run before committing):
  [8]  PM2 Windows spike              (1.5 sessions)
  [18] Behavioral file integrity      (1.5 sessions)

TIER 4 -- Blocked until spike results:
  [C2] Phase 4 design RFC             (blocked until [C1] + [12] complete, 7 sessions)
  [C3] HITL gate to instinct evolution (blocked until [C2], 1.5 sessions)
  [14] Phase 7 security design        (blocked until [12], 7 sessions)

TIER 5 -- Post-design (blocked until TIER 4):
  [7]  Replace Phase 8.1              (decision, not implementation)
```

**Critical path:** TIER 0 items --> TIER 1 verification --> TIER 2 strategies --> TIER 3 spikes --> TIER 4 designs

**David's key insight:** Tiers 0-1 deliver value in the first 2 sessions. They are all editorial/security fixes that improve the existing system without adding code complexity. The mistake would be to start building Phase 1/Phase 4 features before the factual foundation is correct.

**Recommended sprint plan:**

| Sprint | Contents | Sessions | Cumulative Sessions |
|---|---|---|---|
| Sprint 1 (Week 1) | [13] Read+DC fix, [19] CLAUDE.md fix, [11] correct numbers, [6] session unit, [10] hook latency benchmark | 2 | 2 |
| Sprint 2 (Week 2) | [12] ECC verification, [C4] authority precedence, [15] license check | 3 | 5 |
| Sprint 3 (Week 3) | [9] acceptance criteria, [C1] context budget heuristic, [17] namespace strategy | 3 | 8 |
| Sprint 4 (Week 4) | [8] PM2 spike, [5] Loop Operator skill, [16] test strategy | 3 | 11 |
| Checkpoint | Evaluate: Is Phase 4 (learning loop) worth the 7+ session investment? | -- | -- |
| Sprint 5+ | [C2] Phase 4 RFC, [14] Phase 7 security, [C3] HITL instinct gate | 15+ | 26+ |

### Dr. Ingrid Svensson -- Implementation Specialist

**Lens: Build the hardest 10% in a day. If that works, the rest is time.**

**Spike Candidates -- What needs to be proven before committing:**

**Spike S1: damage-control Read tool interception (0.5 sessions)**

The `.claude/settings.json` PreToolUse matcher is `Bash|Edit|Write`. Adding `Read` means changing this to `Bash|Edit|Write|Read`. The implementation change in `damage-control.js` is straightforward -- `extractPaths` already handles `file_path` and `path` arguments (lines 37-39). The concern is performance: Read is called very frequently. Every file read will now go through damage-control's path checking. I examined the code:

- `checkPathList` iterates over 22 zero_access_paths for every Read call
- Path extraction + matching is O(n) where n = number of rules
- Total overhead: < 1ms per call

**Verdict: TRIVIALLY FEASIBLE.** Change the settings.json matcher regex and it works immediately. No spike needed.

**Spike S2: Context budget token measurement (1 session)**

The hardest 10% of recommendation C1 is: how do you actually measure prompt overhead? Options:

1. **Character counting** -- SOUL.md + RULES.md + steering mode text, divided by ~4 for rough token estimate. Crude but zero-dependency.
2. **tiktoken** -- npm package `js-tiktoken` can count Claude tokens accurately. Adds a dependency (~2MB).
3. **API-based** -- Ask the Anthropic API for token counts. Requires API key and network call in a hook. Unacceptable latency.

**Verdict: FEASIBLE WITH MODIFICATIONS.** Use character counting (option 1) as the heuristic. The 500-token cap becomes a ~2000-character cap on injected behavioral text. Simple, fast, no dependencies.

**Spike S3: PM2 on Windows 11 (1 session)**

I would test:
1. `npm install -g pm2` on Windows 11
2. `pm2 start ecosystem.config.js` with 3 Claude Code agents
3. `pm2 stop all` / `pm2 delete all`
4. Process isolation: do agents share state?
5. Worktree creation + cleanup per agent

**Known risks:**
- PM2's `cluster_mode` uses `child_process.fork()` which works on Windows but has different signal handling
- `pm2 startup` for Windows services requires `pm2-windows-service` (unmaintained since 2023)
- WMIC deprecation in Windows 11 may affect PM2's process listing

**Verdict: NEEDS SPIKE.** Cannot commit to Phase 9 without validating PM2 fundamentals on Windows.

**Spike S4: Phase 4 learning loop prototype (2 sessions)**

The hardest 10% of Phase 4 is the eval harness + pattern extractor pipeline. I would prototype:
1. Parse a real `*-evidence.jsonl` file
2. Extract "test passed after edit" sequences
3. Produce a candidate instinct rule
4. Measure: does this produce anything useful, or is it noise?

**Verdict: NEEDS SPIKE.** This is genuinely novel. Without a working prototype showing that evidence JSONL contains enough signal to extract meaningful patterns, Phase 4 is speculative research.

**Spike S5: Remote plugin security model (1 session)**

The hardest 10% of recommendation 14 is: how do you verify a remote plugin before loading it? Options:
1. **SHA-256 content hash** -- RegistryManager already has hash verification concepts. Pin exact versions.
2. **Code review gate** -- Download to staging, human reviews before activating. Leverages existing HITL.
3. **Sandboxed execution** -- Run plugin in separate VM context. `node:vm` is explicitly not a security boundary. `isolated-vm` npm package is a real sandbox but adds native dependency complexity.

**Verdict: NEEDS SPIKE on sandbox approach.** Options 1+2 are feasible today but do not prevent malicious code execution. Option 3 needs validation on Windows with native module compilation.

**Ingrid's critical implementation observations:**

1. **SOUL.md is trivially feasible.** It is a markdown file. Zero code changes. Zero risk. The only question is whether it actually improves Claude's behavior -- that requires measurement, not engineering.

2. **RULES.md overlaps with damage-control-rules.yaml.** The plan says "RULES.md adds the why." But `damage-control.js` does not read RULES.md -- it reads the YAML file. RULES.md would be a human-readable companion document with no runtime enforcement. That is fine, but do not oversell it as a security feature.

3. **Steering modes are a purpose-gate extension.** The implementation path is clear: `purpose-gate.js` already reads session state and injects context. Adding a mode lookup table (`steering-modes.json`) and checking if the user's first message matches a mode name is 30-40 lines of code in the existing hook.

4. **Phase 4 (learning loop) is the riskiest item in the entire plan.** It requires: (a) parsing unstructured evidence JSONL, (b) extracting patterns from noisy data, (c) generating behavioral rules, (d) injecting those rules into prompts, (e) measuring whether the rules improved outcomes. Each step is individually hard. Together, they form a research program, not a feature.

---

## Phase 2: Cross-Expert Challenges

### Challenge 1: Torres vs. Svensson on Phase 4

**Torres:** "Phase 4 has no reference implementation anywhere. ECC's CL v2 is a spec document, not working code. The community has not solved automated instinct evolution for AI coding assistants. We would be pioneering."

**Svensson:** "That is exactly why we should spike it. Two sessions to parse real evidence JSONL and see if there is signal. If the evidence logs contain 'test failed, same edit retried 3 times, different edit succeeded' sequences, the pattern extractor writes itself. If the logs are just opaque tool calls with no causality chain, Phase 4 is dead."

**Torres (counter):** "But even if the pattern extractor works technically, the instinct injection step is unproven. You produce a rule like 'Always run tests before committing.' How do you measure whether injecting that rule into the prompt actually changed behavior? The feedback loop requires controlled experiments -- A/B testing across sessions -- which a solo developer cannot run."

**Svensson (resolution):** "Agreed. The spike should have a kill criterion: if evidence JSONL does not contain enough causal structure to extract at least 3 non-trivial patterns from 10 sessions of data, Phase 4 should be shelved as research."

**Panel consensus:** Phase 4 spike has a hard kill criterion. No further investment without demonstrated signal.

### Challenge 2: Wright vs. Okonkwo on recommendation scope

**Wright:** "The total cost of all 19 recommendations is ~37 sessions. Added to the 28-43 session plan, a solo developer is looking at 65-80 sessions of work. At 1 session/day, that is 4 months. The ROI on some of these recommendations is negative -- they cost more than the features they gate."

**Okonkwo:** "Which ones? Be specific."

**Wright:** "Recommendation C2 (Phase 4 design RFC) costs 7 sessions at 3.5x multiplier. It gates Phase 4, which itself costs 17.5-28 sessions at 3.5x. That is 24.5-35 sessions for a system that may never produce useful behavioral rules. Compare that to recommendation 13 (Add Read to damage-control): 0.75 sessions for a real security fix. The ROI gap is 30:1."

**Okonkwo:** "So what is your cut line?"

**Wright:** "Everything in my table with ROI rated CRITICAL or HIGH ships. Everything rated MODERATE gets evaluated after the HIGH items land. Everything rated LOW or NEGATIVE gets cut or deferred indefinitely. That means: recommendations 13, 19, 11, 6, 10, C4, 9, 7, and 16 ship. That is 9 items at ~12 sessions total. Recommendations C1, 5, 15, 17 go into the MODERATE backlog. Recommendations C2, C3, 8, 14, 18, 12 are deferred until explicitly prioritized."

**Okonkwo (counter):** "You cannot defer 12 (re-verify ECC claims). The entire integration plan is built on unverified claims. If ECC's actual utility is 5 skills and two markdown concepts (the minority dissent from the Repo Ingestion panel), then 7 of the 9 phases are waste. Verification must come first."

**Wright (resolution):** "Fair. Move 12 to CRITICAL. But cap it at 1.5 sessions -- spot-check the top claims, do not exhaustively audit every ECC file."

**Panel consensus:** ECC claim verification is CRITICAL but time-boxed to 1.5 sessions of spot-checking, not exhaustive audit.

### Challenge 3: Svensson vs. Torres on remote plugin security

**Svensson:** "Recommendation 14 says we need a security design before Phase 7.2 (remote plugin installation). I agree, but Torres, what does the community actually do?"

**Torres:** "npm uses package provenance (SLSA build attestation), lockfile pinning, and `npm audit`. VS Code extensions use signed VSIX packages. Obsidian plugins use a community review process. All three approaches require a registry infrastructure that EVOKORE does not have and a solo developer cannot maintain."

**Svensson:** "So the pragmatic answer is: do not build remote plugin installation at all?"

**Torres:** "Correct. Phase 7.1 (declarative plugin manifest with local `plugin.json`) is feasible and useful. Phase 7.2 (remote installation) requires either trusting arbitrary URLs (unacceptable) or building a registry with code signing (impractical for a solo developer). Phase 7.3 (marketplace) is even further out. Cut 7.2 and 7.3."

**Svensson (counter):** "But the existing `fetch_skill` tool already downloads skills from URLs. Is that not the same risk?"

**Torres:** "Skills are markdown documents read by the LLM. Plugins are JavaScript code executed by Node.js. The blast radius is categorically different. A malicious skill can mislead Claude. A malicious plugin can `require('child_process').exec('rm -rf /')`. These are not comparable threats."

**Panel consensus:** Phase 7.2 (remote plugins) and 7.3 (marketplace) are INFEASIBLE for a solo developer without registry infrastructure. Phase 7.1 (local declarative plugins) is FEASIBLE.

### Challenge 4: Okonkwo vs. Wright on the minority dissent

**Okonkwo:** "The Repo Ingestion panel's minority view says ECC's actual utility may be limited to ~5 skills and SOUL.md/RULES.md concepts. If that is true, the 9-phase plan should collapse to 2 phases. Angela, what is the cost difference?"

**Wright:** "If we accept the minority view: Phase 1 (SOUL.md + RULES.md) = 3 sessions realistic. Cherry-pick 5 skills = 1.5 sessions. Total: 4.5 sessions. Compare to the full plan at 65-80 sessions. That is a 15:1 cost ratio."

**Okonkwo:** "And which view is correct?"

**Wright:** "We do not know, because recommendation 12 (verify ECC claims) has not been executed. This is why I agreed to make it CRITICAL. The answer determines whether we execute 4.5 sessions or 80 sessions of work."

**Okonkwo:** "So the meta-recommendation is: verify first, plan second. Sprint 1 should include ECC verification alongside the security fix and editorial corrections. Only then do we commit to any phase beyond Phase 1."

**Panel consensus:** ECC verification (recommendation 12) is a Phase 0 gate. No phase commitments beyond SOUL.md/RULES.md/Read-fix until verification completes.

---

## Phase 3: Converged Feasibility Panel Report

### Verdict Summary Table

| # | Recommendation | Verdict | Effort (Sessions) | Priority | Sprint |
|---|---|---|---|---|---|
| **13** | Add Read to damage-control | **FEASIBLE** | 0.75 | P0-CRITICAL | Sprint 1 |
| **19** | Fix CLAUDE.md staleness | **FEASIBLE** | 1.25 | P0-CRITICAL | Sprint 1 |
| **11** | Correct EVOKORE numbers | **FEASIBLE** | 1.5 | P0-CRITICAL | Sprint 1 |
| **6** | Define "session" unit | **FEASIBLE** | 0.25 | P0-CRITICAL | Sprint 1 |
| **10** | Measure hook latency | **FEASIBLE** | 0.75 | P0-CRITICAL | Sprint 1 |
| **12** | Re-verify ECC claims (time-boxed) | **FEASIBLE WITH MODIFICATIONS** | 1.5 (capped) | P0-CRITICAL | Sprint 1-2 |
| **C4** | Authority precedence for steering | **FEASIBLE** | 1.5 | P1-HIGH | Sprint 2 |
| **9** | Acceptance criteria per phase | **FEASIBLE** | 2.5 | P1-HIGH | Sprint 2 |
| **7** | Replace Phase 8.1 (drop cross-IDE) | **FEASIBLE** | 0 (decision) | P1-HIGH | Sprint 2 |
| **16** | Test strategy per phase | **FEASIBLE** | 2.5 | P1-HIGH | Sprint 3 |
| **C1** | Context budget system | **FEASIBLE WITH MODIFICATIONS** | 1.5 | P2-MODERATE | Sprint 3 |
| **5** | Restructure Phase 3 (Loop Operator) | **FEASIBLE** | 0.75 | P2-MODERATE | Sprint 3 |
| **15** | License analysis | **FEASIBLE** | 0.75 | P2-MODERATE | Sprint 3 |
| **17** | Skill namespace strategy | **FEASIBLE** | 1.5 | P2-MODERATE | Sprint 4 |
| **18** | Behavioral file integrity | **FEASIBLE WITH MODIFICATIONS** | 0.75 | P3-LOW | Backlog |
| **8** | PM2 Windows spike | **NEEDS SPIKE** | 1.5 | P3-LOW | Backlog |
| **C2** | Phase 4 design RFC | **NEEDS SPIKE** | 7.0 | P4-DEFERRED | After S4 spike |
| **C3** | HITL gate to instinct evolution | **NEEDS SPIKE** | 1.5 | P4-DEFERRED | After C2 |
| **14** | Phase 7 security (remote plugins) | **INFEASIBLE** (as scoped) | -- | REJECTED | -- |

### Per-Recommendation Detailed Verdicts

#### FEASIBLE (9 recommendations)

**[13] Add Read to damage-control** -- FEASIBLE
- *Change:* Add `Read` to the PreToolUse matcher regex in `.claude/settings.json` (change `Bash|Edit|Write` to `Bash|Edit|Write|Read`). No code changes needed in `damage-control.js` -- `extractPaths` already handles `file_path`/`path` inputs, and `checkPathList` already runs for all tool names.
- *Effort:* 0.75 sessions including tests
- *Risk:* Negligible. Performance impact < 1ms per Read call (22 path rules to check).
- *Dependencies:* None
- *Why now:* This is a confirmed security gap. The Read tool can access `.env`, `.ssh/`, `credentials.json` etc. without any interception.

**[19] Fix CLAUDE.md staleness** -- FEASIBLE
- *Change:* Editorial review and correction of factual claims in CLAUDE.md
- *Effort:* 1.25 sessions
- *Risk:* None -- purely editorial
- *Dependencies:* Best done alongside [11]
- *Why now:* CLAUDE.md is the authoritative context document. Stale claims poison every session.

**[11] Correct EVOKORE numbers** -- FEASIBLE
- *Change:* Audit and correct all capability counts in ECC-INTEGRATION-PLAN.md
- *Effort:* 1.5 sessions (includes verification against source code)
- *Risk:* None
- *Dependencies:* None
- *Why now:* Every downstream decision is based on these numbers. Wrong inputs produce wrong plans.

**[6] Define "session" unit -- FEASIBLE**
- *Change:* Add definition: 1 session = 4-hour focused work block, expected output 2-4 PRs
- *Effort:* 0.25 sessions (editorial)
- *Risk:* None
- *Dependencies:* None
- *Why now:* Makes all estimates comparable

**[10] Measure hook latency** -- FEASIBLE
- *Change:* Benchmark the current 7-hook chain execution time using `perf_hooks`. Measure PreToolUse + PostToolUse overhead per tool call.
- *Effort:* 0.75 sessions
- *Risk:* None -- measurement only
- *Dependencies:* None
- *Why now:* Data required before adding any new hooks. If current latency is already >200ms, adding more hooks becomes a UX problem.

**[C4] Authority precedence for steering modes** -- FEASIBLE
- *Change:* Document explicit resolution order: RBAC role > damage-control rules > session isolation scope > steering mode context > SOUL.md defaults. Implement as a comment block in `purpose-gate.js` and a section in CLAUDE.md.
- *Effort:* 1.5 sessions
- *Risk:* Low -- mostly documentation with minor code annotation
- *Dependencies:* None (can precede steering mode implementation)

**[9] Acceptance criteria per phase** -- FEASIBLE
- *Change:* Add "Definition of Done" section to each phase in ECC-INTEGRATION-PLAN.md
- *Effort:* 2.5 sessions
- *Risk:* None
- *Dependencies:* Requires [6] (session unit) and [12] (verified claims) for accurate criteria
- *Why:* Prevents scope creep and enables objective phase completion assessment

**[7] Replace Phase 8.1 (drop cross-IDE adapters)** -- FEASIBLE
- *Change:* Decision to cut Phase 8.1 from the plan. Replace with: "Publish MCP discovery documentation for IDE integration."
- *Effort:* 0 sessions (decision, not implementation)
- *Risk:* None -- saves 4-6 sessions of work and ongoing maintenance
- *Dependencies:* None
- *Rationale:* MCP is the abstraction layer. Cross-IDE config adapters are a maintenance trap for a solo developer. Each IDE updates its format independently. The Architecture Panel's recommendation is correct.

**[16] Test strategy per phase** -- FEASIBLE
- *Change:* Define test approach (unit/integration/e2e) for each remaining phase
- *Effort:* 2.5 sessions
- *Risk:* None
- *Dependencies:* Requires [9] (acceptance criteria) to anchor test objectives
- *Why:* Current test suite (2053 tests) sets a high bar. New features must maintain it.

#### FEASIBLE WITH MODIFICATIONS (3 recommendations)

**[12] Re-verify ECC claims (time-boxed)** -- FEASIBLE WITH MODIFICATIONS
- *Original:* Exhaustive file-level evidence from ECC repo for all claims
- *Modification:* Time-box to 1.5 sessions. Spot-check the 10 highest-impact claims: command count, agent archetype count, skill count, hook types, CL v2 implementation status, PM2 integration depth, plugin marketplace maturity, multi-IDE adapter completeness, learning loop working state, token budget runtime implementation.
- *Effort:* 1.5 sessions (capped)
- *Risk:* May miss some inaccuracies, but catches the ones that change planning decisions
- *Dependencies:* None
- *Kill criterion:* If >50% of spot-checked claims are materially wrong, the entire integration plan needs rewriting before any implementation begins.

**[C1] Context budget system** -- FEASIBLE WITH MODIFICATIONS
- *Original:* Build a token budget tracker that measures prompt overhead
- *Modification:* Use character-counting heuristic (chars / 4 for approximate token count). No `tiktoken` dependency, no API calls. Cap behavioral injection (SOUL.md + RULES.md + steering mode text + purpose reminder) at 2000 characters (~500 tokens). Implement as a validation check in `purpose-gate.js` that warns if injected context exceeds the cap.
- *Effort:* 1.5 sessions
- *Risk:* Low -- heuristic is approximate but sufficient for the stated goal
- *Dependencies:* Requires SOUL.md and steering modes to exist first (Phase 1 implementation)

**[18] Behavioral file integrity** -- FEASIBLE WITH MODIFICATIONS
- *Original:* Hash verification or git-based integrity for SOUL.md and instincts.yaml
- *Modification:* Use git-tracked status as the integrity mechanism. `damage-control.js` already has `no_delete_paths`. Add SOUL.md and RULES.md to `no_delete_paths` and `read_only_paths` (for non-owner modification). No separate hash verification system.
- *Effort:* 0.75 sessions
- *Risk:* None -- leverages existing infrastructure
- *Dependencies:* SOUL.md must exist first

#### NEEDS SPIKE (3 recommendations)

**[8] PM2 Windows spike** -- NEEDS SPIKE
- *Spike scope:* Install PM2 globally on Windows 11. Start 3 Node.js processes via ecosystem.config.js. Test stop/restart/delete. Verify process isolation. Test worktree creation per process.
- *Spike effort:* 1.5 sessions
- *Kill criterion:* If PM2 cannot reliably start/stop processes on Windows 11 without manual intervention, use `node:child_process` with a custom fleet manager instead.
- *Gates:* Phase 9 (all orchestration runtime work)
- *Priority:* LOW -- Phase 9 is the lowest priority phase. Spike only when Phase 9 becomes the next target.

**[C2] Phase 4 design RFC** -- NEEDS SPIKE
- *Spike scope:* Parse 10 real `*-evidence.jsonl` files from past sessions. Attempt to extract patterns (success sequences, failure-retry-success sequences, tool usage frequencies). Evaluate: does the data contain enough causal structure to generate non-trivial behavioral rules?
- *Spike effort:* 2 sessions
- *Kill criterion:* If fewer than 3 non-trivial, actionable patterns emerge from 10 sessions of evidence data, Phase 4 (learning loop) should be reclassified as research and removed from the production roadmap.
- *Why spike first:* The Architecture Panel's minority view ("Phase 4 is research, not engineering") is a plausible position. The spike resolves this disagreement with data.
- *If spike succeeds:* Proceed to full RFC at 7 sessions (3.5x multiplier for research work)
- *If spike fails:* Save 24.5-35 sessions of wasted effort

**[C3] HITL gate to instinct evolution** -- NEEDS SPIKE
- *Blocked by:* [C2] -- cannot design the approval gate until the data model exists
- *If C2 proceeds:* Implementation is straightforward (extend existing approval-token mechanism). 1.5 sessions.
- *If C2 fails:* This recommendation becomes moot.

#### INFEASIBLE (1 recommendation)

**[14] Phase 7 security design (remote plugin installation)** -- INFEASIBLE as scoped
- *Rationale:* Remote plugin installation is fundamentally a code execution problem. Without a registry with code signing, provenance attestation, and community review, any remote install is arbitrary code execution. A solo developer cannot build and maintain a secure plugin registry. The existing `PluginManager` loads local plugins from `plugins/` directory with `require()` -- this is already a trust boundary (you trust code you put on your own filesystem). Remote extends that trust to arbitrary URLs, which is categorically different.
- *What IS feasible:* Phase 7.1 (declarative `plugin.json` manifest for local plugins). This adds structure to the existing imperative `register()` pattern without introducing remote trust.
- *Recommendation:* Cut Phases 7.2 and 7.3 entirely. Revisit only if a community-maintained MCP plugin registry emerges.

### Additional Recommendations from the Panel

**[5] Restructure Phase 3 (Loop Operator)** -- FEASIBLE
- *Change:* Extract Loop Operator as a standalone skill file (`AGT-013-loop-operator.json`). It is a JSON archetype document describing monitoring behavior, not runtime code. Demote language-specific reviewers (AGT-007 through AGT-012) to the backlog -- they add bulk without proportional value for a TypeScript-focused project.
- *Effort:* 0.75 sessions
- *Risk:* None -- additive skill file
- *Priority:* P2-MODERATE

**[15] License analysis** -- FEASIBLE
- *Change:* Verify ECC repo license (MIT). Document attribution requirements for any imported content. Add license headers to imported skills.
- *Effort:* 0.75 sessions
- *Risk:* None
- *Priority:* P2-MODERATE

**[17] Skill namespace strategy** -- FEASIBLE
- *Change:* Define category-prefix convention for imported skills (e.g., `ecc-tdd`, `ecc-loop-start`). Update `SkillManager` semantic hints to prefer EVOKORE-native skills over imports when names collide.
- *Effort:* 1.5 sessions
- *Risk:* Low -- additive to existing resolution logic
- *Priority:* P2-MODERATE
- *Dependencies:* Requires [12] (verify ECC claims) to know actual import scope

---

### Overall Feasibility Summary

| Category | Count | Total Sessions |
|---|---|---|
| FEASIBLE | 9 | 11.75 |
| FEASIBLE WITH MODIFICATIONS | 3 | 3.75 |
| NEEDS SPIKE | 3 | 4.5 (spike) + 10 (if proceed) |
| INFEASIBLE | 1 | 0 (cut) |
| **Minimum viable scope (P0+P1)** | **9** | **~12** |
| **Full scope including spikes** | **18** | **~30** |

**Key metrics:**
- Plan originally estimated: 28-43 sessions for 9 phases
- Review panels added: ~37 sessions of prerequisite work
- Feasibility panel verdict: 12 sessions of immediately shippable work, 4.5 sessions of spikes, ~10 sessions conditionally (after spikes)
- **Realistic total for actionable items: 12-26 sessions (6-13 working days)**

### Recommended Implementation Sequence

```
WEEK 1 (Sprint 1) -- Foundation & Security [~4.5 sessions]
  [13] Add Read to damage-control matcher     (0.75s)  -- SECURITY FIX
  [19] Fix CLAUDE.md staleness                 (1.25s)  -- EDITORIAL
  [11] Correct EVOKORE numbers in plan         (1.5s)   -- EDITORIAL
  [6]  Define "session" = 4hr block            (0.25s)  -- EDITORIAL
  [10] Benchmark hook chain latency            (0.75s)  -- MEASUREMENT

WEEK 2 (Sprint 2) -- Verification & Policy [~5 sessions]
  [12] Spot-check top 10 ECC claims            (1.5s)   -- VERIFICATION GATE
  [C4] Document authority precedence           (1.5s)   -- POLICY
  [9]  Write acceptance criteria per phase     (2.5s)   -- PM
       (includes [7] decision to cut Phase 8.1)

  >>> CHECKPOINT: Review [12] results. If >50% claims wrong, STOP and rewrite plan. <<<

WEEK 3 (Sprint 3) -- Strategy [~5.5 sessions]
  [C1] Character-count context budget          (1.5s)   -- HEURISTIC
  [16] Test strategy per phase                 (2.5s)   -- QUALITY
  [5]  Loop Operator skill file                (0.75s)  -- SKILL
  [15] License analysis                        (0.75s)  -- LEGAL

WEEK 4 (Sprint 4) -- Namespace + Spike Decision [~3 sessions]
  [17] Skill namespace/prefix strategy         (1.5s)   -- ARCHITECTURE
  [18] Add SOUL.md/RULES.md to DC protections  (0.75s)  -- SECURITY
  Decide: Is Phase 4 spike worth 2 sessions?
  Decide: Is PM2 spike worth 1.5 sessions?

  >>> CHECKPOINT: All P0-P2 items complete. Evaluate Phase 4/9 feasibility. <<<

WEEK 5+ (Conditional) -- Spikes [~4.5 sessions]
  [C2-spike] Parse evidence JSONL for patterns (2s)     -- RESEARCH
  [8]  PM2 on Windows 11                       (1.5s)   -- VALIDATION
  [C3] HITL instinct gate (if C2 passes)       (1.5s)   -- IMPLEMENTATION
```

### Spikes Required Before Committing

| Spike | Purpose | Effort | Kill Criterion | Gates |
|---|---|---|---|---|
| **S-EVIDENCE** | Can evidence JSONL yield behavioral patterns? | 2 sessions | <3 non-trivial patterns from 10 sessions | Phase 4 (learning loop) |
| **S-PM2** | Does PM2 work reliably on Windows 11? | 1.5 sessions | Cannot start/stop 3 processes reliably | Phase 9 (orchestration runtime) |

### Recommendations Rejected

| # | Recommendation | Rejection Reason |
|---|---|---|
| **14** | Phase 7 security design for remote plugins | Solo developer cannot build or maintain a secure plugin registry. Remote code execution without code signing is unacceptable. Cut Phases 7.2 and 7.3. Local plugins (Phase 7.1) remain feasible. |

### Impact on Original 9-Phase Plan

| Phase | Original Estimate | Panel Verdict | Revised Estimate |
|---|---|---|---|
| Phase 1 (Identity) | 1-2 sessions | **PROCEED** after Sprint 1-2 prereqs | 3-4.5 sessions (including C1, C4) |
| Phase 2 (Hooks) | 2-3 sessions | **PROCEED** (Read fix is Sprint 1; others are independent) | 2-3 sessions |
| Phase 3 (Agents) | 3-5 sessions | **REDUCE** to Loop Operator only; backlog rest | 0.75 sessions |
| Phase 4 (Learning) | 5-8 sessions | **SPIKE FIRST** -- may be cut entirely | 0-10 sessions (spike-dependent) |
| Phase 5 (Commands) | 3-4 sessions | **PROCEED** after Phase 1+2 | 3-4 sessions |
| Phase 6 (Skills) | 2-3 sessions | **REDUCE** -- import only verified high-value skills | 1-2 sessions |
| Phase 7 (Plugins) | 3-4 sessions | **REDUCE** to Phase 7.1 only (local manifests) | 1.5 sessions |
| Phase 8 (Multi-IDE/CI) | 4-6 sessions | **CUT Phase 8.1**; keep 8.2-8.4 | 2-3 sessions |
| Phase 9 (Orchestration) | 5-8 sessions | **SPIKE FIRST** (PM2 on Windows) | 0-8 sessions (spike-dependent) |
| **Revised Total** | **28-43** | | **13.25-36.75 sessions** |

### Dissenting Opinions

**Dr. Michael Torres (minority):** "I believe Phase 4 should be classified as INFEASIBLE, not NEEDS SPIKE. The evidence JSONL format was designed for session replay, not causal analysis. The events are tool invocations, not outcome attributions. Extracting 'this edit worked because of X' from a log of 'Edit tool called with these arguments' requires causal inference that no existing tool can perform reliably. The spike will likely produce trivial patterns ('tests are usually run after edits') that are already captured in CLAUDE.md. I recommend cutting Phase 4 entirely and investing those sessions in Phase 5 (commands) which has immediate, measurable user value."

**Angela Wright (minority):** "The 2000-character cap for behavioral injection (recommendation C1) is arbitrary. We have no data on how much context overhead the current CLAUDE.md imposes. Before setting any cap, we should measure the current baseline: how many characters of CLAUDE.md does Claude actually read per session? If the answer is 'all of it' (which it is -- CLAUDE.md is injected fully), then SOUL.md + RULES.md represent marginal additions to an already-large context surface. The cap should be 'total behavioral surface including CLAUDE.md' not 'just the new files.' This changes the recommendation from 'cap at 500 tokens' to 'audit and potentially reduce the total behavioral surface.'"

**David Okonkwo (clarification):** "My sprint plan assumes 1 session per day. A solo developer doing this alongside other responsibilities may achieve 3-4 sessions per week, which extends the timeline by 25-40%. The sprint plan is optimistic -- treat it as a minimum timeline, not a commitment."

---

## Appendix A: Codebase Evidence Referenced

| Claim | Evidence | Verified |
|---|---|---|
| damage-control matcher is `Bash\|Edit\|Write` | `.claude/settings.json` line 10 | YES |
| damage-control does not check Read tool for dangerous commands | `scripts/damage-control.js` line 138: `if (toolName === 'Bash' && toolInput.command && rules.dangerous_commands)` | YES |
| damage-control DOES check zero_access_paths for all tools | `scripts/damage-control.js` line 163-174: `extractPaths` runs unconditionally | YES (but Read never reaches this code because the settings.json matcher excludes it) |
| 8 hook scripts exist | `scripts/hooks/` contains 8 files (7 hooks + 1 shared loader) | YES |
| 22 zero_access_paths defined | `damage-control-rules.yaml` zero_access_paths section | YES |
| 6 existing agent archetypes | `SKILLS/ORCHESTRATION FRAMEWORK/agent-archetypes/` has 6 JSON + 1 SKILL.md | YES |
| PluginManager uses imperative `register()` | `src/PluginManager.ts` line 34-37: `PluginManifest.register(context)` | YES |
| purpose-gate injects context via additionalContext | `scripts/purpose-gate.js` line 67, 96, 113 | YES |
| Test suite is vitest-based | `package.json` line 24: `"test": "vitest run"` | YES |

## Appendix B: Effort Estimation Methodology

Angela Wright's multiplier framework:

| Work Type | Base Multiplier | Rationale |
|---|---|---|
| Editorial (docs, config) | 2.5x | Known scope, low surprise risk |
| Security fix (existing infra) | 2.5x | Understood codebase, tests exist |
| New feature (proven pattern) | 3.0x | Integration + tests + edge cases |
| Research/novel (no reference impl) | 3.5x | Unknown unknowns, iteration cycles |
| Cross-platform validation | 3.0x | Platform-specific bugs double debugging time |

The multiplier covers: writing the code (1x) + writing tests (0.5-1x) + documentation (0.25x) + edge case discovery and fixing (0.5-1x) + PR review/revision cycle (0.25x).
