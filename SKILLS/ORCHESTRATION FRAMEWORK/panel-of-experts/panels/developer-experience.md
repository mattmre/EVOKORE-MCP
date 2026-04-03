---
name: panel-developer-experience
description: Expert panel for developer experience, API design, and tooling ergonomics
aliases: [dx-panel, dx-experts, api-design-panel, ux-panel]
category: orchestration
tags: [developer-experience, api-design, cli, tooling, ergonomics, usability]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - developer experience review
  - API design critique
  - CLI or tooling usability
  - SDK design review
  - onboarding friction analysis
---

# Developer Experience Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Aisha Johnson** | Developer Experience Engineer | Onboarding, error messages, progressive disclosure |
| **Dr. Lars Bergstrom** | API Design Specialist | Consistency, versioning, discoverability, contracts |
| **Rachel Torres** | Tooling & CLI Specialist | CLI usability, shell integration, scriptability |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- New tool or command design
- API surface changes
- CLI interface review
- SDK or plugin authoring interface
- Developer-facing documentation review
- Onboarding flow optimization
- Error message audit

## Review Protocol

### Step 1: CONVENE

| Artifact Type | Active Experts |
|---|---|
| API design | Lars, Aisha |
| CLI/commands | Rachel, Aisha |
| SDK/plugin interface | All 3 |
| Error messages | Aisha, Rachel |
| Documentation | Aisha, Lars |

### Step 2: BRIEF
```
## DX Review Target
- **Surface:** [API / CLI / SDK / Plugin interface / Documentation]
- **Target User:** [who uses this? skill level? context?]
- **Current State:** [existing interface, if any]
- **Proposed Change:** [what's new or different]
- **Success Criteria:** [time to first success, error recovery, discoverability]
```

### Step 3: SOLO — Independent Expert Reviews

**Aisha Johnson (DX Engineer) reviews:**
- Time to hello world — how quickly can a new user get a working result?
- Error message quality — do errors explain what went wrong AND how to fix it?
- Progressive disclosure — simple cases are simple, complex cases are possible?
- Default behavior — do defaults "just work" for the common case?
- Documentation-code alignment — do docs match what the code actually does?
- Cognitive load — how many concepts must a user hold in mind simultaneously?
- "Hand this to an intern. Watch them. Count the sighs."

**Dr. Lars Bergstrom (API Design) reviews:**
- Naming consistency — do similar operations use similar names?
- Parameter design — required vs optional, sensible defaults, no footguns
- Error response design — structured errors, error codes, actionable messages
- Versioning strategy — how will this API evolve without breaking consumers?
- Idempotency — can safe operations be safely retried?
- Discoverability — can you explore the API surface without reading all the docs?
- "Use this API with only autocomplete and error messages. No docs. Can you?"

**Rachel Torres (CLI/Tooling) reviews:**
- Command structure — intuitive verb-noun patterns, consistent flags
- Output formatting — human-readable by default, machine-parseable with --json
- Shell integration — piping, exit codes, signal handling, stdin support
- Configuration hierarchy — flags > env vars > config file > defaults
- Help text quality — examples, not just flag descriptions
- Scriptability — can this command be used in a shell script without surprises?
- "Pipe this into jq. Does it work? Now pipe it into grep. Still work?"

### Step 4: CHALLENGE

1. **Aisha vs Lars:** "Simplicity" vs "Completeness" — is the API too simple to be useful or too complete to be approachable?
2. **Rachel vs Aisha:** "Scriptability" vs "Human friendliness" — colored output is nice for humans, terrible for parsing
3. **Lars vs Rachel:** "RESTful purity" vs "Pragmatic CLI conventions" — not every API maps cleanly to commands

### Step 5: CONVERGE

```markdown
## Developer Experience Panel Report

### DX Verdict: [EXCELLENT / GOOD / NEEDS IMPROVEMENT / POOR]

### First Impressions (0-5 Minutes)
- Time to first success: [measured/estimated]
- First error encountered: [what and how helpful]
- Discoverability score: [high/medium/low]

### Ergonomic Issues
1. [Issue] — impact: [user frustration point], fix: [approach]

### API/CLI Design Recommendations
1. [Recommendation] — rationale: [consistency/usability/convention]

### Error Message Improvements
| Current Message | Problem | Recommended Message |
|---|---|---|
| [current] | [why it's bad] | [better version] |

### Documentation Gaps
1. [Missing/incorrect doc] — priority: [H/M/L]
```

## EVOKORE-Specific DX Checklist

- [ ] `discover_tools` returns useful results for natural language queries
- [ ] `resolve_workflow` provides helpful "Why matched" explanations
- [ ] Tool errors include actionable next steps
- [ ] Plugin authoring requires minimal boilerplate
- [ ] HITL approval prompts clearly explain what's being approved and why
- [ ] CLI status output is scannable in under 5 seconds
- [ ] Skill frontmatter is intuitive to write without consulting docs
