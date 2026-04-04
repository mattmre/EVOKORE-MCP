# Panel of Experts: Expansion Architecture Plan
**Date:** 2026-04-03  
**Status:** Active — Implementation in progress  
**Branch:** `fix/ecc-cascade-feedback`

---

## Executive Summary

This plan expands the EVOKORE Panel of Experts framework from **13 panels / 55+ experts** to **27 panels / 115+ experts** covering the full software development lifecycle, content production, and domain-specific workflows. It also introduces five framework-level improvements derived from analysis of external multi-agent systems (AutoGen, CrewAI, LangGraph, SocialAGI, Constitutional AI research).

---

## Current State

| Metric | Value |
|---|---|
| Domain panels | 10 |
| Gate/meta panels | 3 |
| Named expert personas | 55+ |
| Workflows | 5 |
| Mandatory injection points | 7 |
| High-value optional injection points | ~20 |

**Coverage gaps identified:** Post-deploy operations (entire lifecycle uncovered), data engineering/ML, database design, infrastructure/IaC, incident management, API versioning, dependency supply chain, observability design, developer onboarding, deployment pipelines, product requirements, and all non-engineering domains (news/media, legal technology, business strategy, SEO/marketing).

---

## External Landscape Analysis

### Key Repos Reviewed

| Repo | Stars | What's novel vs. EVOKORE |
|---|---|---|
| microsoft/autogen | ~35K | Dynamic speaker selection — orchestrator selects next expert based on conversation state, not fixed sequence |
| crewAI-Inc/crewAI | ~20K | Per-agent tool access — experts can actually run SAST scanners, benchmarks, etc., not just analyze |
| langchain-ai/langgraph | ~8K | Conditional workflow edges — panels can loop back to SOLO if CHALLENGE reveals fundamental disagreement |
| opensouls/SocialAGI | ~1.5K | TypeScript-native persona evolution with cognitive state machines — closest to EVOKORE's approach |
| letta-ai/letta | ~12K | Tiered expert memory (core/archival/recall) — experts remember specific modules they've reviewed before |

### Academic Research
- **MIT Multi-Agent Debate (Du et al., 2023):** Multi-round debate (3-5 rounds) significantly improves reasoning quality over single-round challenge. Agents should be able to formally revise findings — EVOKORE's CHALLENGE currently captures disagreements but does not allow position updates.
- **Constitutional AI (Bai et al., 2022):** Expert review lenses as scored principle checklists produces more systematic convergence than prose-only lenses.

### What EVOKORE Does That Nobody Else Does
1. **Persistent persona evolution** with append-only audit trail — no other system tracks expert change over time with rollback
2. **Cross-panel cascades with feasibility gating** — no other repo has this multi-panel architecture
3. **Meta-improvement cycle** — self-evaluating the panel's effectiveness is unique
4. **Known biases per expert** — explicitly declaring blind spots is absent from all other frameworks
5. **Dissent capture** — formally recording minority opinions as an anti-groupthink mechanism
6. **Domain-specific panels** at this breadth (now 27 with this expansion)

---

## Expansion: New Panels

### Engineering Panels (10 new)

| # | Panel | Domain | Key Gap It Fills |
|---|---|---|---|
| 14 | Data Engineering & ML Pipeline | ETL, streaming, ML lifecycle, data quality | Entire data workload is unreviewed |
| 15 | Database Design & Migration | Schema design, migration safety, query performance | Schema changes have no structured review |
| 16 | Infrastructure & Cloud Architecture | IaC, cloud topology, networking, cost | Terraform/CDK/Pulumi unreviewed |
| 17 | Incident Response & Post-Mortem | RCA, incident management, runbooks | Entire post-deploy ops lifecycle missing |
| 18 | API Versioning & Breaking Changes | API lifecycle, backward compat, schema evolution | Breaking changes not systematically caught |
| 19 | Dependency & Supply Chain | Dependency health, license, supply chain security | Dependency selection has no review |
| 20 | Observability & Monitoring Design | Logs, metrics, tracing, SLOs, alerting | Monitoring design unreviewed |
| 21 | Onboarding & Knowledge Transfer | Developer onboarding, tribal knowledge, setup UX | Onboarding quality never evaluated |
| 22 | DevOps & Deployment Pipeline | CI/CD, deployment strategies, feature flags | Deployment strategy and release pipelines |
| 23 | Product Requirements & Specification | PRD quality, user stories, acceptance criteria | Pre-engineering requirements quality |

### Content & Domain Panels (4 new)

| # | Panel | Domain | Key Gap It Fills |
|---|---|---|---|
| 24 | News & Media Content | Editorial quality, fact-checking, SEO, ethics | No coverage for news/media workflows |
| 25 | Legal Technology Content | Legal accuracy, CLE compliance, practitioner UX | No coverage for legal ed content |
| 26 | Business & Product Strategy | Market analysis, unit economics, GTM | No business validation coverage |
| 27 | SEO & Content Marketing | Technical SEO, content strategy, brand voice | No marketing workflow coverage |

---

## Framework-Level Improvements

### Improvement 1: Multi-Round CHALLENGE (Low effort, high value)

Add `rounds` parameter to the CHALLENGE step. Default 1, max 3. After each round, experts can formally revise or retract findings.

**Implementation:** Update `panel-review-generic.json` workflow schema and add `challenge_rounds: 1` parameter to panel SKILL.md files.

**Source:** MIT multi-agent debate research showing 3-5 round debate significantly improves convergence quality.

### Improvement 2: Scored Principle Rubrics (Low effort, medium value)

Add a `rubric` field to each expert definition in the roster alongside their narrative `review_lens`. Five to ten scorable PASS/FAIL/CONCERN principles per expert.

**Example:**
```yaml
rubric:
  - "Every function name describes what it does without abbreviation [PASS/FAIL]"
  - "No function exceeds 30 lines [PASS/FAIL/ACCEPTABLE]"
  - "All error paths are handled explicitly [PASS/FAIL]"
```

**Implementation:** Add rubric fields to roster entries (can be done incrementally per expert).

**Source:** Constitutional AI principle checklists improve systematic convergence.

### Improvement 3: Conditional Workflow Edges (Medium effort, high value)

Extend the workflow schema to support conditional routing:
- If CHALLENGE produces `BLOCKER` findings → re-run SOLO with refined prompts
- If CHALLENGE produces fundamental expert disagreement (no consensus) → add one more round
- If critical findings exceed threshold → escalate from thin to full review

**Implementation:** Extend `workflow.schema.json` with `conditional_edges` block. Update `panel-review-generic.json` with default conditional rules.

**Source:** LangGraph state graph patterns adapted to EVOKORE's JSON-DAG workflow format.

### Improvement 4: Per-Expert Entity Memory Extension (Medium effort, high value)

Extend `persistent-narratives.md` to include per-expert knowledge bases: a list of modules/systems the expert has reviewed before, with their accumulated observations. When an expert reviews the same module twice, they reference prior findings.

**Example memory entry:**
```json
{
  "expert": "Margaret Chen",
  "module_memory": {
    "src/SessionIsolation.ts": {
      "last_reviewed": "2026-03-15",
      "accumulated_observations": ["TTL check concern flagged twice", "naming drift between public/private methods"],
      "open_concerns": ["TTL check - still unresolved as of last review"]
    }
  }
}
```

**Implementation:** Add `module_memory` to roster snapshot JSON schema. Update `persistent-narratives.md` with the extension spec.

**Source:** SocialAGI cognitive state machines + MemGPT tiered memory architecture.

### Improvement 5: Panel Routing Matrix & Auto-Trigger Rules (Medium effort, high value)

Create `panel-routing-matrix.md` and a machine-readable `workflows/routing-rules.json` that defines:
- Trigger conditions → which panels activate (mandatory vs. conditional)
- Auto-trigger rules based on file patterns (PR touches `src/auth/*` → Security panel mandatory)
- Cascade phase assignments for multi-panel reviews

**Implementation:** New `workflows/routing-rules.json` + `panel-routing-matrix.md`. Optional: wire into `damage-control.js` or a pre-tool-use hook for automatic panel suggestion.

---

## Panel Routing Matrix (Summary)

### Auto-Trigger Rules

| Condition | Trigger | Panel(s) |
|---|---|---|
| Files match `src/auth/*, **/middleware/auth*` | Security surface change | Security Audit (mandatory) |
| Files match `**/migrations/*, *.sql` | Database migration | Database Design & Migration (mandatory) |
| `package.json`, `go.mod`, `requirements.txt` changed with additions | New dependency | Dependency & Supply Chain (thin) |
| `*.tf`, `*.tfvars`, `pulumi/*`, `k8s/*`, `Dockerfile` changed | Infrastructure change | Infrastructure & Cloud (mandatory) |
| OpenAPI spec, GraphQL schema, `src/api/v*` changed | Public API change | API Versioning & Breaking Changes (mandatory) |
| P1/P2 incident declared | Incident | Incident Response & Post-Mortem (mandatory) |
| New service deployed | Service deployment | Observability & Monitoring (mandatory) |
| Content file published | Content publication | News/Media or Legal Technology Content (domain-specific) |

### Cascade Phase Architecture

```
Phase 1 (Foundation):     Architecture & Planning, Product Requirements
Phase 2 (Specialization): DB Design, Data Engineering, Infrastructure, API Versioning
Phase 3 (Cross-cutting):  Security, Performance, Observability, Dependency
Phase 4 (Quality/Ship):   Testing, Documentation, DX, DevOps, Onboarding
```

### Thin vs. Full Review

| Type | Experts | Phases | When |
|---|---|---|---|
| Thin | 2-3, single panel | Solo + Converge only | Low-risk, single-domain, time-sensitive |
| Full | 4-5+, multi-panel | All 6 steps + cascade | High-risk, cross-domain, compliance-relevant |
| Escalation trigger | — | — | Any BLOCKER finding in a thin review |

---

## Per-Repo Domain Specialization

Repos/projects can define `.panel-config.json` to customize:
- Which panels are injected into standard orch-* commands
- Default cascade sequences
- Expert substitutions (add domain-specific experts to base panels)
- Additional auto-trigger rules

### Domain Profiles

| Repo Type | Default Cascade Override | Injected Panels |
|---|---|---|
| E-Discovery | Arch → eDiscovery → Security → Legal Tech Content → Testing | eDiscovery, Legal Technology Content |
| News/Media Site | News Content → SEO → Legal (if investigative) | News & Media Content, SEO & Content Marketing |
| Data Platform | Arch → Data Engineering → DB Design → Performance → Security | Data Engineering & ML, Database Design |
| SaaS Product | Product Req → Arch → Code → API Versioning → Testing → DevOps | Product Requirements, API Versioning |
| Infrastructure Team | Infra → Security → Observability → DevOps | Infrastructure & Cloud, Observability |

---

## Implementation Plan

### Phase 1: New Panel Files (This session)
Create all 14 new panel `.md` files under `panels/`:
- `data-engineering-ml.md`, `database-design-migration.md`, `infrastructure-cloud.md`
- `incident-post-mortem.md`, `api-versioning.md`, `dependency-supply-chain.md`
- `observability-monitoring.md`, `onboarding-knowledge-transfer.md`, `devops-deployment.md`
- `product-requirements.md`, `news-media-content.md`, `legal-technology-content.md`
- `business-product-strategy.md`, `seo-content-marketing.md`

### Phase 2: Expert Roster Update (This session)
Add ~61 new named expert personas to `expert-roster.md` with full backgrounds, lenses, biases, and challenge prompts.

### Phase 3: SKILL.md & Routing Matrix (This session)
- Update main `SKILL.md` Available Panels table with all 14 new panels
- Create `workflows/routing-rules.json` with auto-trigger rules
- Create `panel-routing-matrix.md` with full routing table

### Phase 4: Framework Improvements (Next session)
- Multi-round CHALLENGE parameter in workflow schema
- Scored principle rubrics added to expert roster entries
- Per-expert entity memory extension in persistent-narratives.md
- Conditional workflow edges in workflow schema

### Phase 5: Per-Repo Config (Follow-on)
- `.panel-config.json` schema definition
- Domain profile templates for e-discovery, news, data platform repos
- Optional hook integration for auto-panel suggestion on PR creation

---

## Expert Count Summary

| Roster Section | Current | After Expansion |
|---|---|---|
| Code Refinement | 6 | 6 |
| Architecture & Planning | 5 | 5 |
| Security Audit | 4 | 4 |
| Performance & Scale | 3 | 3 |
| Developer Experience | 3 | 3 |
| Testing & Quality | 3 | 3 |
| Documentation | 3 | 3 |
| Wiring & UI | 4 | 4 |
| Repo Ingestion | 5 | 5 |
| Presentation | 5 | 5 |
| eDiscovery | 5 | 5 |
| Feasibility Research | 4 | 4 |
| Meta-Improvement | 3 | 3 |
| **NEW: 14 panels** | 0 | ~61 |
| **Total** | **~58** | **~119** |

---

## Files Created/Modified

| File | Action | Status |
|---|---|---|
| `docs/research/panel-of-experts-expansion-2026-04-03.md` | Create | ✅ This file |
| `panels/data-engineering-ml.md` | Create | 🔄 In progress |
| `panels/database-design-migration.md` | Create | 🔄 In progress |
| `panels/infrastructure-cloud.md` | Create | 🔄 In progress |
| `panels/incident-post-mortem.md` | Create | 🔄 In progress |
| `panels/api-versioning.md` | Create | 🔄 In progress |
| `panels/dependency-supply-chain.md` | Create | 🔄 In progress |
| `panels/observability-monitoring.md` | Create | 🔄 In progress |
| `panels/onboarding-knowledge-transfer.md` | Create | 🔄 In progress |
| `panels/devops-deployment.md` | Create | 🔄 In progress |
| `panels/product-requirements.md` | Create | 🔄 In progress |
| `panels/news-media-content.md` | Create | 🔄 In progress |
| `panels/legal-technology-content.md` | Create | 🔄 In progress |
| `panels/business-product-strategy.md` | Create | 🔄 In progress |
| `panels/seo-content-marketing.md` | Create | 🔄 In progress |
| `expert-roster.md` | Update (add ~61 experts) | 🔄 In progress |
| `SKILL.md` | Update (add 14 panels to table) | 🔄 In progress |
| `workflows/routing-rules.json` | Create | 📋 Phase 3 |
| `panel-routing-matrix.md` | Create | 📋 Phase 3 |
