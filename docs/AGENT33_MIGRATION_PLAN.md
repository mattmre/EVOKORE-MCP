# Agent33 → EVOKORE-MCP Migration Plan

## Executive Summary

Agent33 is a full-stack agentic engineering platform (Python/FastAPI) with a rich **spec-first orchestration framework** (`core/`), structured agent/workflow/tool definitions, policy governance, and CI/CD pipelines. EVOKORE-MCP is a TypeScript MCP aggregator with 189+ skills, HITL security, and dynamic tool discovery.

This plan brings Agent33's **orchestration intelligence** into EVOKORE-MCP as portable skills, workflow templates, and governance specs — without importing Agent33's Python runtime. The goal: make EVOKORE-MCP the single source of truth for all reusable workflows, commands, policies, and agent patterns.

---

## Deduplication Summary

| Agent33 Asset | EVOKORE-MCP Equivalent | Action |
|---|---|---|
| TDD workflow skill | hive-test (broader) | **Merge** — add evidence-capture discipline |
| Security review skill | WSHOBSON security (scattered) | **Import** — consolidate as primary security skill |
| Backend patterns skill | WSHOBSON backend-development (broader) | **Merge** — add Agent33's checklist format |
| Coding standards skill | WSHOBSON developer-essentials (broader) | **Merge** — add Agent33's review checklist |
| /docs command | docs-architect (more comprehensive) | **Skip** — EVOKORE already superior |
| /plan command | planning-with-files (different focus) | **Import** — governance-focused complement |
| /review command | pr-manager (more comprehensive) | **Merge** — add risk-routing logic |
| /refactor command | No equivalent | **Import** as new skill |
| /build-fix command | No equivalent | **Import** as new skill |
| /e2e command | webapp-testing (different approach) | **Import** as complement |
| /status command | No equivalent | **Import** as new skill |
| /tasks command | tilldone hook (simpler) | **Import** — richer task management |
| /verify command | No equivalent | **Import** as new skill |
| /handoff command | session-wrap (partial overlap) | **Merge** — add evidence protocol |
| /tdd command | No equivalent | **Import** as new skill |
| Policy Pack v1 | No equivalent | **Import** entire pack |
| Handoff Protocol (15 docs) | No equivalent | **Import** entire protocol |
| Orchestration Index | No equivalent | **Import** and adapt |
| JSON Schemas (3) | No equivalent | **Import** for validation |
| Agent Definitions (6) | No equivalent | **Import** as reference specs |
| Workflow Definitions (8) | No equivalent | **Import** as templates |
| Tool Definitions (6 YAML) | Proxied tools (different) | **Import** as governance specs |
| CI/CD Workflows (3) | No CI/CD | **Import** and adapt |
| AEP Framework (5 docs) | No equivalent | **Import** entire framework |
| Modular Rules (7 files) | damage-control (partial) | **Import** — extends governance |
| Hook examples (4) | 4 hooks (different) | **Merge** — add evidence/scope hooks |
| Workflow templates (bug/PR) | No equivalent | **Import** as templates |

---

## Phase 1: Core Orchestration Framework (Foundation)

**Priority: CRITICAL — everything else builds on this**

### 1A. Handoff Protocol
Copy Agent33's `core/orchestrator/handoff/` (15 files) into EVOKORE-MCP as a new skill category.

**Target:** `SKILLS/ORCHESTRATION FRAMEWORK/handoff-protocol/`

Files to import:
- `STATUS.md` — Runtime state and blocker surfacing
- `PLAN.md` — Task decomposition with approval gates
- `TASKS.md` — Atomic work items with priorities (adapt as template, not history)
- `DECISIONS.md` — Architecture decision records
- `PRIORITIES.md` — Rolling 2-4 week horizon planning
- `SPEC_FIRST_CHECKLIST.md` — Problem/goals/non-goals/assumptions/risks/acceptance
- `AUTONOMY_BUDGET.md` — Scope, allowed actions, time/compute limits, stop conditions
- `HARNESS_INITIALIZER.md` — Clean-state initialization protocol
- `PROGRESS_LOG_FORMAT.md` — Structured log format with rotation
- `EVIDENCE_CAPTURE.md` — Commands, outputs, diffs, test results
- `REVIEW_CAPTURE.md` — Risk assessment, L1/L2 review checklists, signoff
- `REVIEW_CHECKLIST.md` — Quick-reference gate criteria
- `SESSION_WRAP.md` — Handoff narrative template
- `DEFINITION_OF_DONE.md` — Required and optional completion criteria
- `ESCALATION_PATHS.md` — Director/Orchestrator/Reviewer/Stakeholder triggers

**SKILL.md wrapper** to create: Meta-skill that describes the handoff protocol system and links to all sub-documents.

### 1B. Policy Pack v1
Copy Agent33's `core/packs/policy-pack-v1/` (14 files) as governance reference.

**Target:** `SKILLS/ORCHESTRATION FRAMEWORK/policy-pack-v1/`

Files to import:
- `AGENTS.md` — Core principles (evidence-first, minimal diffs, spec-first, safe-by-default)
- `ORCHESTRATION.md` — Handoff protocol rules
- `EVIDENCE.md` — Minimum evidence requirements
- `ACCEPTANCE_CHECKS.md` — Default checks per change type
- `RISK_TRIGGERS.md` — Security/auth/schema/API/CI/CD triggers
- `PROMOTION_GUIDE.md` — Rules for promoting reusable assets
- Modular rules: `security.md`, `testing.md`, `git-workflow.md`, `coding-style.md`, `agents.md`, `patterns.md`, `performance.md`
- `README.md` — Pack overview

### 1C. Orchestration Index
Adapt Agent33's `core/ORCHESTRATION_INDEX.md` as the master reference.

**Target:** `SKILLS/ORCHESTRATION FRAMEWORK/SKILL.md` (the meta-skill with index)

### 1D. JSON Schemas
Import validation schemas for agent/workflow/orchestrator definitions.

**Target:** `SKILLS/ORCHESTRATION FRAMEWORK/schemas/`
- `agent.schema.json`
- `workflow.schema.json`
- `orchestrator.schema.json`

---

## Phase 2: Command Skills (11 New Skills)

Import Agent33's command templates as executable skills. These are model-agnostic workflow instructions.

**Target:** `SKILLS/ORCHESTRATION FRAMEWORK/commands/`

Each command becomes a subdirectory with a `SKILL.md`:

| Command | New Skill Name | Description |
|---|---|---|
| `/status` | `orch-status` | Surface runtime state, blockers, and constraints from handoff docs |
| `/tasks` | `orch-tasks` | List and manage open tasks with priorities and dependencies |
| `/verify` | `orch-verify` | Capture verification evidence (commands, outputs, diffs, test results) |
| `/handoff` | `orch-handoff` | Generate session wrap summaries (merge with existing session-wrap) |
| `/plan` | `orch-plan` | Create approval-gated implementation plans with risk triggers |
| `/review` | `orch-review` | Trigger code review with risk routing and L1/L2 checklist |
| `/tdd` | `orch-tdd` | RED/GREEN/REFACTOR workflow entry point with evidence |
| `/build-fix` | `orch-build-fix` | Diagnose and fix build/test failures with minimal changes |
| `/refactor` | `orch-refactor` | Dead code cleanup and refactoring with safety checks |
| `/docs` | `orch-docs` | Documentation synchronization and link verification |
| `/e2e` | `orch-e2e` | Generate and run end-to-end test suites |

**Note:** `/handoff` should reference and extend the existing `session-wrap` skill rather than duplicating it.

---

## Phase 3: Workflow Templates (8 Templates)

Import Agent33's DAG-based workflow definitions as reusable templates.

**Target:** `SKILLS/ORCHESTRATION FRAMEWORK/workflow-templates/`

### Production Templates (from `engine/workflow-definitions/`)
- `incident-triage.json` — Multi-stage incident response (logs → status → classify → remediate)
- `release-readiness.json` — Release gate workflow (evidence → smoke → risk → approval)
- `example-pipeline.json` — Code review pipeline with parallel analysis

### Additional Templates (from `engine/workflow-definitions/templates/`)
- `content-generation.json` — Content creation workflow
- `deep-research.json` — Multi-source research aggregation
- `monitor-alert.json` — Monitoring and alerting pipeline
- `rag-chatbot.json` — RAG-powered conversational workflow
- `web-scrape-extract.json` — Web scraping and data extraction

**SKILL.md wrapper** describing the template system, DAG execution model, and how to customize templates.

---

## Phase 4: Agent Archetypes (6 Reference Specs)

Import Agent33's agent definitions as reference architectures.

**Target:** `SKILLS/ORCHESTRATION FRAMEWORK/agent-archetypes/`

| Agent | Role | Key Traits |
|---|---|---|
| `orchestrator` | Top-level decomposition | Full-system scope, all commands, 8K tokens |
| `director` | Strategic planning | Project-level, read-only, requires scope-change approval |
| `worker` | Code execution | Assigned workspace, build/test/lint, parallel OK, 16K tokens |
| `qa` | Quality assurance | Verification focus, test execution |
| `researcher` | Information gathering | Search, analysis, synthesis |
| `browser-agent` | Web interaction | Playwright-driven, session management |

Import the capability taxonomy (P-01..P-05, I-01..I-05, V-01..V-05, R-01..R-05, X-01..X-05) as part of the skill documentation.

---

## Phase 5: Tool Governance Specs (8 Files)

Import Agent33's tool governance framework to complement EVOKORE's existing `permissions.yml` and `damage-control-rules.yaml`.

**Target:** `SKILLS/ORCHESTRATION FRAMEWORK/tool-governance/`

Files to import:
- `TOOL_GOVERNANCE.md` — Allowlist policy, provenance checklist, governance checkpoints
- `TOOLS_AS_CODE.md` — Progressive disclosure, minimal schemas, registry structure
- Tool definition specs (as reference, not runtime):
  - `shell.yml` — Command allowlist/denylist patterns
  - `browser.yml` — Browser automation governance
  - `file_ops.yml` — File operation rules
  - `reader.yml` — Document parsing limits
  - `search.yml` — Search indexing rules
  - `web_fetch.yml` — HTTP request governance

**Integration:** Cross-reference with `damage-control-rules.yaml` to identify governance gaps.

---

## Phase 6: AEP Framework (Agile Engineering Process)

Import Agent33's AEP (Align-Execute-Prove) methodology.

**Target:** `SKILLS/ORCHESTRATION FRAMEWORK/aep-framework/`

Files to import:
- `workflow.md` — AEP process definition (Align → Execute → Prove cycle)
- `templates.md` — Phase planning and task templates
- `phase-planning.md` — Multi-phase roadmap generation
- `test-matrix.md` — Test strategy documentation template
- `verification-log.md` — Evidence tracking template
- `evaluation-harness.md` — Golden tasks, golden cases, metrics (M-01..M-05)

---

## Phase 7: Skills Merge & Enhancement

### 7A. New Import: Security Review
Agent33's security review skill is more comprehensive than EVOKORE's scattered WSHOBSON security skills.

**Target:** `SKILLS/GENERAL CODING WORKFLOWS/security-review/SKILL.md`

Content: Input validation, authentication/authorization, secrets management, data protection, vulnerability patterns, OWASP checklist.

### 7B. Merge: TDD Evidence into hive-test
Add Agent33's evidence-capture discipline (verification logs, coverage requirements, regression prevention) to the existing `hive-test` skill.

**Action:** Edit `SKILLS/HIVE FRAMEWORK/hive-test/SKILL.md` to include evidence capture section.

### 7C. Merge: Risk Routing into pr-manager
Add Agent33's risk-trigger routing (security changes → mandatory review, schema changes → DBA review, etc.) to the existing `pr-manager` skill.

**Action:** Edit `SKILLS/GENERAL CODING WORKFLOWS/pr-manager/SKILL.md` to include risk routing section.

### 7D. Merge: Handoff Evidence into session-wrap
Add Agent33's evidence-first handoff protocol to the existing `session-wrap` skill.

**Action:** Edit `SKILLS/GENERAL CODING WORKFLOWS/session-wrap/SKILL.md` to reference handoff protocol docs.

---

## Phase 8: CI/CD Pipelines

Import Agent33's GitHub Actions as reference implementations.

**Target:** Copy to `.github/workflows/` (adapt for TypeScript/Node.js)

| Workflow | Purpose | Adaptation Needed |
|---|---|---|
| `ci.yml` | Lint + test + build + benchmark | Replace ruff/mypy with eslint/tsc; pytest with npm test |
| `post-merge-smoke.yml` | Post-merge regression detection | Adapt smoke suite targets |
| `security-scan.yml` | Trivy scans + optional Claude review | Minimal adaptation needed |

**Note:** Merge sequencing guard (sequence:N labels) is a valuable pattern to adopt for EVOKORE-MCP's PR workflow.

---

## Phase 9: Hook System Enhancement

### 9A. Evidence Capture Hook
Adapt Agent33's `HOOK-003 PostTask` evidence capture pattern into a new EVOKORE hook.

**Target:** `scripts/evidence-capture.js` (PostToolUse hook)

Behavior: After significant tool calls (file writes, test runs), auto-capture evidence entries to session state.

### 9B. Scope Validation Hook
Adapt Agent33's scope-validation hook pattern.

**Target:** Extend `scripts/damage-control.js` with scope boundary enforcement from Agent33's `HOOK-001 PreTask` validation.

### 9C. Improvement Cycle Templates
Import Agent33's improvement cycle documents.

**Target:** `SKILLS/ORCHESTRATION FRAMEWORK/improvement-cycles/`
- `metrics-review.md` — Metrics review workflow
- `retrospective.md` — Retrospective template

---

## Phase 10: Templates & Reference Docs

### 10A. PR and Bug Report Templates
**Target:** `.github/PULL_REQUEST_TEMPLATE.md` and `.github/ISSUE_TEMPLATE/bug-report.md`

Import Agent33's structured templates with evidence sections, risk assessment, and acceptance criteria.

### 10B. Promotion Criteria
**Target:** `SKILLS/ORCHESTRATION FRAMEWORK/promotion-criteria.md`

Import rules for when a workflow/skill is mature enough to be canonicalized.

---

## Implementation Order

```
Phase 1  ─── Core Orchestration Framework ───── Week 1
  ├─ 1A: Handoff Protocol (15 files)
  ├─ 1B: Policy Pack v1 (14 files)
  ├─ 1C: Orchestration Index
  └─ 1D: JSON Schemas (3 files)

Phase 2  ─── Command Skills ───────────────── Week 1-2
  └─ 11 new skills in commands/

Phase 3  ─── Workflow Templates ───────────── Week 2
  └─ 8 JSON workflow definitions

Phase 4  ─── Agent Archetypes ─────────────── Week 2
  └─ 6 reference agent specs

Phase 5  ─── Tool Governance ──────────────── Week 2
  └─ 8 governance spec files

Phase 6  ─── AEP Framework ───────────────── Week 3
  └─ 6 methodology documents

Phase 7  ─── Skills Merge & Enhancement ──── Week 3
  ├─ 7A: Security review (new)
  ├─ 7B: TDD evidence → hive-test
  ├─ 7C: Risk routing → pr-manager
  └─ 7D: Handoff evidence → session-wrap

Phase 8  ─── CI/CD Pipelines ─────────────── Week 3
  └─ 3 GitHub Actions workflows

Phase 9  ─── Hook Enhancement ────────────── Week 4
  ├─ 9A: Evidence capture hook
  ├─ 9B: Scope validation hook
  └─ 9C: Improvement cycle templates

Phase 10 ─── Templates & Docs ────────────── Week 4
  ├─ 10A: PR/Bug report templates
  └─ 10B: Promotion criteria
```

---

## File Count Summary

| Phase | New Files | Modified Files | Total |
|---|---|---|---|
| 1: Orchestration Framework | ~35 | 0 | 35 |
| 2: Command Skills | ~22 | 0 | 22 |
| 3: Workflow Templates | ~9 | 0 | 9 |
| 4: Agent Archetypes | ~7 | 0 | 7 |
| 5: Tool Governance | ~9 | 0 | 9 |
| 6: AEP Framework | ~7 | 0 | 7 |
| 7: Skills Merge | ~1 | 3 | 4 |
| 8: CI/CD | ~3 | 0 | 3 |
| 9: Hooks | ~3 | 1 | 4 |
| 10: Templates | ~4 | 0 | 4 |
| **Total** | **~100** | **4** | **~104** |

---

## Risk Mitigation

1. **Skill Index Bloat**: 189 → ~290 skills. Monitor Fuse.js indexing performance. Consider lazy-loading or category-scoped search if needed.
2. **Naming Collisions**: All imported skills use `orch-` prefix for command skills to avoid conflicts.
3. **Context Rot**: Imported docs reference Agent33-specific paths. All `core/` references must be updated to `SKILLS/ORCHESTRATION FRAMEWORK/` paths.
4. **Runtime vs. Reference**: Agent33's Python runtime code (FastAPI, SQLAlchemy, etc.) is NOT imported. Only portable specs, templates, and governance docs come over.
5. **Submodule Impact**: None — imports go into `SKILLS/` directly, not into submodule directories.

---

## Validation Checklist

After migration:
- [ ] `npm test` passes (existing validations)
- [ ] `resolve_workflow` finds new orchestration skills
- [ ] `search_skills` returns results for "handoff", "policy", "TDD", "incident triage"
- [ ] Fuse.js index builds without timeout (< 5s for ~290 skills)
- [ ] All imported SKILL.md files have valid YAML frontmatter
- [ ] No broken cross-references in imported docs
- [ ] CI/CD workflows run successfully on push
- [ ] Modified skills (hive-test, pr-manager, session-wrap) retain existing functionality
