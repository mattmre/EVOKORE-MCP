---
name: panel-repo-ingestion
description: Expert panel for evaluating external repositories, reviewing ingested content, and assessing integration quality
aliases: [repo-review-panel, ingestion-panel, repo-experts, content-review-panel]
category: orchestration
tags: [repo-ingestion, due-diligence, integration, content-review, adoption]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - reviewing an external repo for adoption
  - evaluating ingested content quality
  - assessing integration plans from repo analysis
  - content accuracy review after repo research
---

# Repo Ingestion & Content Review Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Dr. Sarah Kim** | Technical Due Diligence Lead | Repo health, community signals, maturity |
| **Victor Petrov** | Integration Architect | Compatibility, conflicts, migration paths |
| **Dr. Amara Obi** | Developer Advocate | Documentation, usability, onboarding |
| **Henrik Larsson** | Supply Chain Security Auditor | Dependencies, licenses, vulnerability exposure |
| **Kenji Tanaka** | Content Quality Analyst | Accuracy, consistency, stale references |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- Evaluating an external repo for adoption or integration
- Reviewing research output from repo analysis agents
- Assessing integration plans generated from repo comparison
- Validating content created from external sources (plans, comparisons, skill imports)
- Post-import quality check on skills/workflows adopted from external repos

## Review Modes

### Mode A: Pre-Ingestion Assessment
Evaluate a repo BEFORE adopting any of its content.

### Mode B: Post-Ingestion Content Review
Review content that was ALREADY generated from repo analysis (plans, comparisons, imported skills).

### Mode C: Integration Plan Validation
Review a proposed integration plan created from repo comparison research.

---

## Review Protocol

### Step 1: CONVENE — Select Mode and Experts

| Mode | Active Experts |
|---|---|
| Pre-Ingestion Assessment | All 5 |
| Post-Ingestion Content Review | Kenji, Amara, Victor |
| Integration Plan Validation | Victor, Sarah, Henrik |

### Step 2: BRIEF — Present the Artifact

**For Pre-Ingestion (Mode A):**
```
## Repo Under Evaluation
- **Repository:** [URL]
- **Stars/Forks/Contributors:** [metrics]
- **Purpose:** [what the repo does]
- **Our Intent:** [what we want to extract/adopt]
- **Initial Assessment:** [any preliminary findings from research agents]
```

**For Post-Ingestion Content Review (Mode B):**
```
## Content Under Review
- **Source:** [what repo/research generated this content]
- **Content Type:** [plan, comparison, skill imports, documentation]
- **Created By:** [research agents / manual analysis / hybrid]
- **Documents:** [list of files to review]
- **Claims Made:** [key assertions that need verification]
```

**For Integration Plan Validation (Mode C):**
```
## Plan Under Review
- **Plan Document:** [file path]
- **Source Analysis:** [what research produced the plan]
- **Phases:** [number of phases, timeline]
- **Scope:** [what the plan covers]
- **Key Assumptions:** [what the plan assumes about both codebases]
```

### Step 3: SOLO — Independent Expert Reviews

**Dr. Sarah Kim (Due Diligence) reviews:**
- Repo activity health — last commit, PR merge rate, issue response time
- Contributor concentration risk (bus factor)
- Star inflation signals (bought stars, viral README with shallow content)
- Maintenance trajectory — improving, stable, or declining?
- Test coverage and CI health
- Release cadence and versioning discipline
- Community engagement quality (issues, discussions, PRs from non-maintainers)
- "Is this a living project I'd bet my team's roadmap on, or a time bomb?"

**Victor Petrov (Integration Architecture) reviews:**
- Namespace collisions with existing codebase
- Dependency version conflicts
- Architecture compatibility (does their pattern match ours?)
- Data format alignment (config schemas, file formats, API shapes)
- Migration path complexity (what needs to change to make this work?)
- Import scope — what's genuinely portable vs what's tightly coupled to their system?
- "What's the integration tax? What invisible dependencies am I inheriting?"

**Dr. Amara Obi (Developer Advocacy) reviews:**
- Documentation accuracy vs actual implementation
- Getting-started friction for adopted components
- Example quality and completeness
- Error message helpfulness in imported code
- Terminology alignment with our conventions
- "If our team adopts this, how long before they're productive? What's missing from the docs?"

**Henrik Larsson (Supply Chain Security) reviews:**
- Dependency tree depth and health
- Known CVEs in direct and transitive dependencies
- License compatibility with our project
- Build script safety (install scripts, postinstall hooks)
- Maintainer trust signals (verified, known, pseudonymous)
- Code provenance — is the code original or copied from unknown sources?
- "If this repo is compromised tomorrow, what's our blast radius?"

**Kenji Tanaka (Content Quality) reviews:**
- Cross-reference claims against actual code ("does the README match reality?")
- Stale content (docs describing features that no longer exist)
- Aspirational documentation (features described but not implemented)
- Internal consistency (do different docs contradict each other?)
- Version-specific accuracy (do docs reference correct API versions?)
- For post-ingestion content: does OUR generated content accurately represent THEIR repo?
- "Every factual claim in this document — is it verifiable? Is it current?"

### Step 4: CHALLENGE — Cross-Expert Debate

Key challenges for this panel:

1. **Sarah vs Victor:** "The repo looks healthy, but can we actually integrate it without a 3-month migration?"
2. **Henrik vs Amara:** "The docs are great but the dependencies are a security nightmare — is this worth the risk?"
3. **Kenji vs Sarah:** "The content says X is a feature, but is that aspirational or implemented?"
4. **Victor vs Henrik:** "The integration path requires adding these 5 dependencies — are any of them a supply chain risk?"
5. **Amara vs Kenji:** "The documentation is well-written but is it accurate? Pretty lies vs ugly truths."

### Step 5: CONVERGE — Synthesize Findings

```markdown
## Repo Ingestion Panel Report

### Verdict: [ADOPT / ADOPT WITH MODIFICATIONS / DEFER / REJECT]

### Critical Findings (Block Adoption)
1. [Finding] — flagged by [experts]

### Required Modifications (Adopt Only If Fixed)
1. [Finding] — proposed fix: [approach]

### Integration Risks (Accept and Monitor)
1. [Risk] — mitigation: [approach]

### Content Accuracy Issues
1. [Claim that is incorrect or stale] — correction: [accurate statement]

### Adoption Recommendations
1. [What to adopt] — rationale: [why]
2. [What NOT to adopt] — rationale: [why]

### Dissenting Opinions
1. [Expert] argued [position] — [rationale]
```

### Step 6: FEASIBILITY → DELIVER

Top recommendations go to [Feasibility Panel](feasibility-research.md) for approach validation.

## Example Invocations

### Pre-Ingestion
```
Run a Repo Ingestion Panel pre-assessment on https://github.com/affaan-m/everything-claude-code.

Our intent: Extract skills, commands, agent patterns, and workflow systems
for integration into EVOKORE-MCP v3.1.

We've already run 20 research agents that produced findings. The panel
should validate those findings and identify what the agents may have missed.
```

### Post-Ingestion Content Review
```
Run a Repo Ingestion Panel content review on docs/ECC-INTEGRATION-PLAN.md.

This plan was generated from 20 parallel research agents analyzing the
everything-claude-code repo and comparing it to our EVOKORE-MCP codebase.

Review for: accuracy of claims, completeness of coverage, quality of
integration recommendations, missed opportunities, and stale/wrong assertions.
```
