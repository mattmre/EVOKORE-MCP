---
name: narrative-quality-scorer
description: Scores a phase spec, session prompt, or CLAUDE.md narrative against session efficiency patterns and returns a quality score with specific diff-style improvement suggestions
aliases: [narrative-scorer, prompt-scorer, narrative-quality, prompt-quality]
category: Orchestration Framework
tags: [narrative-quality, prompt-improvement, efficiency, phase-spec, scoring, continuous-improvement]
version: 1.0.0
resolutionHints:
  - score this prompt or phase spec for quality
  - improve this narrative or prompt
  - why is this phase spec unclear
  - score a CLAUDE.md section
  - generate a better version of this prompt
  - how could this phase description be improved
---

# Narrative Quality Scorer

## Purpose

Given a prompt text or file path, score it against the structural efficiency patterns identified by `session-retrospective-miner`. Returns a quality score (0–100) and specific diff-style improvement suggestions with token-efficiency justification for each.

This is the **per-prompt complement** to session-retrospective-miner's cross-session aggregate view.

---

## Input

Provide one of:

**Option A — inline text:**
```
Score this narrative:
"Implement Phase 312: Analytics Export Module.
 Read phase spec from 04-planning/phases/phase-312-analytics-export.md.
 Create branch phase-312-analytics-export from main.
 Implement: migration, entities, DTOs, service, controller, module."

Context: claudius-maximus-phase-implementation
```

**Option B — file path:**
```
Score the narrative at: 04-planning/phases/phase-312-analytics-export.md
Context: claudius-maximus-phase-implementation
```

**Option C — batch:**
```
Score all phase specs in: 04-planning/phases/
Context: claudius-maximus-phase-implementation
Output: summary table + worst-3 individual reports
```

---

## Scoring Rubric

Each element is worth points because it correlates with measured session efficiency improvements. Scores are additive; maximum base score is 80, with up to +20 bonus points for a total of 100.

| Element | Points | Efficiency Basis |
|---------|--------|-----------------|
| Explicit insertion points (e.g., @AI:NAV anchors) | +15 | −8 turns avg per session when present |
| Acceptance criteria ("Done when X") | +12 | −8 turns avg per session when present |
| Explicit file paths to create/edit | +10 | −5 turns first-productive-turn |
| DB/convention reminders (PK type, column types) | +8 | Eliminates schema clarification loops (~23% of CM sessions) |
| Test commands specified | +8 | Reduces test-command clarification turns |
| Stop conditions for Agent spawns | +10 | −40% sub-agent turns when explicit |
| Anti-patterns explicitly excluded | +7 | Prevents known wrong paths |
| Branch naming convention | +5 | Baseline clarity |
| Module/feature type specified | +5 | Baseline clarity |
| **Total possible** | **80** | _(+20 bonus for exceptional clarity)_ |

Bonus points (up to +20):
- +5 for including pre-read extraction checklist ("extract these specific things before implementing")
- +5 for specifying which tests to run AND which ones are expected to be affected
- +5 for linking to relevant @AI:NAV sections by name
- +5 for stating the expected turn count or time budget

---

## Evaluation Steps

### Step 1: Parse the narrative for structural elements

Check each rubric element:

**Insertion points:** Does the narrative mention `@AI:NAV`, nav anchor IDs, or specific line numbers for insertion?
```
PRESENT: "Add AnalyticsExportEntity at @AI:NAV[INS:new-typeorm-entity]"
ABSENT: "Register in app.module.ts"
```

**Acceptance criteria:** Does the narrative include a "Done when" or equivalent?
```
PRESENT: "Done when: npm run build, typecheck, test all pass with no new failures."
ABSENT: [no done condition]
```

**Explicit file paths:** Are exact file paths given, not just module names?
```
PRESENT: "Create src/analytics-export/analytics-export.entity.ts"
ABSENT: "Create the entity"
```

**DB/convention reminders:** Does the narrative name key DB decisions?
```
PRESENT: "Use BIGSERIAL PKs, VARCHAR(45) for IPs, no INET columns"
ABSENT: [no DB conventions mentioned]
```

**Test commands:** Are exact test commands given?
```
PRESENT: "Run: npm run build && npm run typecheck && npx vitest run --reporter=verbose"
ABSENT: "make sure tests pass"
```

**Agent stop conditions:** For any Agent spawn, are scope boundaries explicit?
```
PRESENT: "Stop after producing the migration file. Do not run the migration."
ABSENT: "use an agent to help implement..."
```

**Anti-patterns excluded:** Are known wrong paths explicitly forbidden?
```
PRESENT: "Do not use UUID PKs. Do not add INET columns."
ABSENT: [nothing excluded]
```

### Step 2: Compute score

Sum present elements. For each missing element, record the points lost and the efficiency basis.

### Step 3: Generate improved narrative

For each missing element:
1. State what is missing
2. Give the points lost and efficiency justification
3. Provide copy-pasteable text to add

Then produce a complete "Improved Narrative" that integrates all suggested additions while preserving the original intent.

---

## Output Format

```markdown
## Narrative Quality Score: XX/100

Scored against: claudius-maximus-phase-implementation context
Tool: narrative-quality-scorer v1.0

---

### Missing Elements

❌ [Element name] (−N pts)
   [Efficiency basis: sessions without this average N more turns / N% have clarification loops]
   Add:
   ```
   [Copy-pasteable text to insert into the narrative]
   ```

❌ [Element name] (−N pts)
   ...

⚠️ [Element name — partially present] (−N pts)
   [What's present and what's missing]
   Improve:
   ```
   [Suggested rewrite]
   ```

✅ [Element name — present] (+N pts)
✅ [Element name — present] (+N pts)

---

### Score Breakdown

| Element | Points Available | Points Earned | Notes |
|---------|-----------------|---------------|-------|
| Insertion points | 15 | 0 | Not mentioned |
| Acceptance criteria | 12 | 12 | "Done when" present |
| Explicit file paths | 10 | 5 | Module mentioned but not full paths |
| ... | ... | ... | ... |
| **Total** | **80** | **XX** | |

---

### Improved Narrative

[Full rewrite of the original narrative with all suggested additions integrated]

---

### Estimated Efficiency Improvement

Based on historical session data for [context]:
- Sum the efficiency basis deltas for each missing element (e.g., insertion points → −8 turns, acceptance criteria → −8 turns, explicit file paths → −5 turns).
- Apply deltas against the project's median session length from session-retrospective-miner output.
- If no retrospective data is available, omit numeric estimates entirely.

[Note: These are directional estimates, not guarantees. Include only if session-retrospective-miner has been run and provides a baseline turn count for the project.]
```

---

## Context Keys

The scoring rubric adapts based on `context`. Built-in context keys:

**`claudius-maximus-phase-implementation`**
- Emphasizes: app.module.ts insertion points, TypeORM entity patterns, shared/src/index.ts exports
- Extra rubric item: TypeORM entity pattern (+5 if mentioned: @Entity, @Column, @PrimaryGeneratedColumn)
- DB conventions: BIGSERIAL PKs, VARCHAR(45) for IPs, no INET, @CreateDateColumn/@UpdateDateColumn

**`evokore-mcp-feature`**
- Emphasizes: manager pattern (getTools/isXTool/handleToolCall), CLAUDE.md update, vitest tests
- Extra rubric item: test file specified (+5 if test path given)

**`general-coding`**
- Uses base rubric only, no project-specific bonus items

**`custom`**
- Provide your own rubric override:
  ```yaml
  custom_rubric:
    - element: "Migration file included"
      points: 10
      basis: "Sessions without migration average 5 extra clarification turns"
  ```

---

## Batch Mode Output

When scoring multiple files (Option C), output a summary table first:

```markdown
## Narrative Quality Scores — Batch Run

| File | Score | Top Missing Element | Action |
|------|-------|--------------------|---------| 
| phase-312-*.md | 41/100 | Insertion points (−15) | Score individually |
| phase-313-*.md | 67/100 | Acceptance criteria (−12) | Minor update |
| phase-314-*.md | 82/100 | DB conventions (−8) | Optional |

### Worst 3 — Individual Reports

[Full individual reports for lowest-scoring files]
```

---

## Integration with Other Skills

### session-retrospective-miner

Run `session-retrospective-miner` first to identify which files/projects to score. The retrospective report's Action Items table names specific files where narrative quality is contributing to session inefficiency.

### phase-spec-optimizer (Phase C)

After scoring a batch of phase specs, `phase-spec-optimizer` can apply the structural improvements in bulk to all unstarted specs — using this skill's output as the "what to add" specification.

### AEP Align phase

Include narrative quality scores as an input to the AEP Align scope lock step. Files scoring < 50/100 should be updated before the implementation begins, not after.

---

## Example Invocation

```
Score this phase spec for narrative quality:

"Implement Phase 312: Analytics Export Module.
 Create branch from main. Add migration, entity, DTO, service, controller, module.
 Register in app.module.ts. Run tests."

Context: claudius-maximus-phase-implementation
```
