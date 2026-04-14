---
name: orch-panel
description: Invoke a Panel of Experts review on any artifact — code, architecture, plans, repos, or documentation
aliases: [panel, expert-review, panel-review, experts]
category: Orchestration Framework
tags: [panel, experts, review, multi-perspective, quality, refinement]
version: 1.0.0
requires: [panel-of-experts]
metadata:
  source: "evokore"
  original_command: "orch-panel"
resolutionHints:
  - run an expert panel
  - get expert review
  - panel of experts
  - multi-perspective analysis
  - critical review with experts
---

# orch-panel — Panel of Experts Review

## Purpose

Invoke a Panel of Experts review on any artifact. Assembles virtual expert personas with defined backgrounds, biases, and domain expertise to provide multi-perspective critical analysis that generic review misses.

## Usage

```
orch-panel <panel-type> <artifact> [options]
```

### Panel Types

| Panel | Use For |
|---|---|
| `code` | Code quality, patterns, bugs, refactoring |
| `repo` | External repo evaluation, content review, integration plans |
| `re` | Reverse engineering, binary triage, semantic recovery, debugger planning |
| `arch` | Architecture decisions, phase plans, strategic direction |
| `security` | Security review, threat modeling, compliance |
| `perf` | Performance analysis, scaling, operational readiness |
| `dx` | Developer experience, API design, tooling ergonomics |
| `test` | Test strategy, coverage quality, resilience |
| `docs` | Documentation accuracy, completeness, usability |

### Options

| Option | Description | Default |
|---|---|---|
| `--quick` | Skip challenge phase (solo + converge only) | false |
| `--no-feasibility` | Skip feasibility gate | false |
| `--cascade <panels>` | Run multiple panels sequentially | — |
| `--mode <mode>` | Panel-specific mode (e.g., pre-ingestion, phase-plan) | auto |

## Examples

### Single Panel Review
```
orch-panel code src/SessionIsolation.ts

Context: Multi-tenant session isolation layer. In the hot path for every
tool call. Concerned about TTL check performance and LRU eviction correctness.
```

### Quick Review (No Challenge Phase)
```
orch-panel security --quick src/auth/OAuthProvider.ts

Context: OAuth JWT validation for HTTP transport.
```

### Cascading Multi-Panel Review
```
orch-panel --cascade arch,code,security docs/ECC-INTEGRATION-PLAN.md

Context: 9-phase integration plan. Want architecture review first,
then code feasibility, then security assessment. Unified feasibility at end.
```

### Repo Ingestion Review
```
orch-panel repo --mode post-ingestion docs/ECC-INTEGRATION-PLAN.md

Context: This plan was generated from 20 research agents analyzing
github.com/affaan-m/everything-claude-code against our EVOKORE-MCP codebase.
Review for accuracy, completeness, and integration quality.
```

### Reverse Engineering Review
```
orch-panel re --mode unknown-binary-onboarding samples\payload.dll

Context: Need a binary map, initial hypotheses, and a debugger plan.
Target may be packed and the first session must stay evidence-first.
```

### Architecture Decision Review
```
orch-panel arch --mode decision

Decision: Replace imperative PluginManager.register() with declarative
plugin.json manifest loading.

Options considered:
1. Keep imperative (current)
2. Add declarative alongside imperative (hybrid)
3. Full migration to declarative only

Constraints: Must maintain backward compatibility with existing plugins.
```

## Workflow

When invoked, orch-panel:

1. **Selects** the appropriate panel skill from `panel-of-experts/panels/`
2. **Loads** expert personas from `panel-of-experts/expert-roster.md`
3. **Executes** the panel review cycle:
   - CONVENE — select active experts for this artifact type
   - BRIEF — prepare structured briefing from artifact
   - SOLO — each expert reviews independently through their lens
   - CHALLENGE — experts debate and challenge each other's findings (unless `--quick`)
   - CONVERGE — synthesize into prioritized findings with dissent capture
   - FEASIBILITY — feasibility panel evaluates top recommendations (unless `--no-feasibility`)
   - DELIVER — final report with actionable remediation plan
4. **Outputs** the panel report

For `--cascade` mode, executes multiple panels sequentially, with each panel receiving prior panels' findings as context, followed by a unified feasibility assessment.

## Inputs

| Input | Type | Required | Description |
|---|---|---|---|
| panel_type | string | yes | Which panel to convene |
| artifact | string | yes | What to review (file path, description, or inline) |
| context | string | no | Additional context, constraints, concerns |
| mode | string | no | Panel-specific mode override |

## Outputs

| Output | Type | Description |
|---|---|---|
| Panel Report | markdown | Full review with solo reviews, challenges, convergence, feasibility |
| Remediation Plan | list | Prioritized, actionable fix list |
| Risk Register | table | Identified risks with severity and mitigation |
| Dissent Log | list | Minority expert opinions that went against consensus |

## Integration

- **resolve_workflow:** Discoverable via aliases `panel`, `expert-review`, `experts`
- **evidence-capture:** Panel findings automatically logged as session evidence
- **orch-review:** Can invoke `orch-panel code` as part of standard code review
- **orch-plan:** Can invoke `orch-panel arch` as part of planning workflow
- **tilldone:** Panel review registers as a task until delivered

## Related Skills

- [Panel of Experts Framework](../../panel-of-experts/SKILL.md)
- [Expert Roster](../../panel-of-experts/expert-roster.md)
- [Reverse Engineering Panel](../../panel-of-experts/panels/reverse-engineering.md)
- [Generic Panel Workflow](../../panel-of-experts/workflows/panel-review-generic.json)
- [Cascading Multi-Panel Workflow](../../panel-of-experts/workflows/cascading-multi-panel.json)
- [Repo Ingestion Review Workflow](../../panel-of-experts/workflows/repo-ingestion-review.json)
