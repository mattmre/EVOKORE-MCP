---
name: panel-documentation-quality
description: Expert panel for documentation accuracy, completeness, and knowledge architecture review
aliases: [docs-panel, documentation-panel, docs-experts, knowledge-panel]
category: orchestration
tags: [documentation, knowledge-management, accuracy, technical-writing, information-architecture]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - documentation review
  - docs quality check
  - knowledge architecture assessment
  - technical writing review
---

# Documentation & Knowledge Panel

## Purpose

Documentation is a product. Stale, inaccurate, or poorly organized docs are worse than no docs — they create false confidence. This panel reviews documentation for accuracy, completeness, organization, and alignment with the actual codebase.

Particularly critical for EVOKORE-MCP, which has 35+ docs, 336+ skills, and a CLAUDE.md that serves as the operational source of truth.

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Dr. Amara Obi** | Developer Advocate | Usability, onboarding, getting-started friction |
| **Kenji Tanaka** | Content Quality Analyst | Accuracy, consistency, stale references |
| **Dr. Lars Bergstrom** | API Design Specialist | API docs, reference accuracy, contract clarity |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- After major feature additions or architectural changes
- Before releases (docs accuracy gate)
- When onboarding friction is reported
- After skill library imports or updates
- CLAUDE.md review after accumulating learnings
- Documentation restructuring initiatives

## Review Protocol

### Step 1: CONVENE

| Artifact Type | Active Experts |
|---|---|
| CLAUDE.md / operational docs | All 3 |
| API reference docs | Lars, Kenji |
| Getting-started / setup guides | Amara, Kenji |
| Skill documentation | Amara, Kenji |
| Architecture docs | Lars, Kenji |

### Step 2: BRIEF
```
## Documentation Review Target
- **Documents:** [list of files]
- **Scope:** [full review vs specific sections]
- **Last Updated:** [when these docs were last touched]
- **Known Issues:** [reported problems with current docs]
- **Recent Changes:** [code changes that may have made docs stale]
```

### Step 3: SOLO — Independent Expert Reviews

**Dr. Amara Obi reviews:**
- Getting-started experience — can a new user follow the docs cold?
- Example quality — are examples copy-pasteable and working?
- Progressive disclosure — basic usage → advanced usage → reference
- Terminology consistency — same concept, same word, everywhere
- Missing context — docs that assume knowledge they don't provide
- "Follow every instruction literally on a clean machine. Where do you fail first?"

**Kenji Tanaka reviews:**
- Cross-reference accuracy — do file paths, function names, and config keys match the code?
- Stale content — docs describing removed or renamed features
- Aspirational documentation — features described but not implemented
- Internal consistency — do different docs contradict each other?
- Dead links — internal and external link validation
- Version alignment — do docs reference the correct version's behavior?
- "Every factual claim, every path, every config key — verify against the codebase."

**Dr. Lars Bergstrom reviews:**
- API documentation completeness — are all endpoints/tools/parameters documented?
- Error documentation — are error codes and their meanings documented?
- Contract clarity — can a consumer implement against these docs without guessing?
- Example coverage — is every non-obvious parameter demonstrated?
- Changelog currency — does the changelog reflect actual recent changes?
- "Implement a client using only these docs. Where do you have to read source code instead?"

### Step 4: CHALLENGE

1. **Amara vs Kenji:** "This section should be simplified" vs "Simplifying it would make it inaccurate"
2. **Lars vs Amara:** "The API reference must be complete" vs "Nobody reads the full reference — optimize for discovery"
3. **Kenji vs Lars:** "This doc is internally consistent" vs "It's consistently wrong — it matches the old API"

### Step 5: CONVERGE

```markdown
## Documentation & Knowledge Panel Report

### Docs Verdict: [ACCURATE / NEEDS UPDATES / SIGNIFICANTLY STALE]

### Accuracy Issues (Doc Says X, Code Does Y)
| Document | Claim | Reality | Line/Section |
|---|---|---|---|
| [doc] | [what it says] | [what the code does] | [location] |

### Stale Content
1. [Document:Section] — describes [removed/changed feature], current state: [actual]

### Missing Documentation
1. [Feature/tool/config] — undocumented, priority: [H/M/L]

### Usability Issues
1. [Issue] — impact on new users: [description], fix: [approach]

### Structural Recommendations
1. [Reorganization suggestion] — rationale: [why current structure fails]

### Link Health
- Internal links verified: [N total, N broken]
- External links verified: [N total, N broken, N redirected]
```

## EVOKORE-Specific Documentation Checklist

- [ ] CLAUDE.md learnings match current codebase behavior
- [ ] All 18 src/*.ts files have corresponding documentation
- [ ] mcp.config.json schema is documented with all supported keys
- [ ] Hook scripts have usage documentation matching actual behavior
- [ ] Skill frontmatter fields are documented with valid examples
- [ ] Environment variables in .env.example match src/ usage
- [ ] docs/README.md index matches actual file structure
- [ ] ALL_SKILLS_CRIB_SHEET.md reflects current SKILLS/ contents
