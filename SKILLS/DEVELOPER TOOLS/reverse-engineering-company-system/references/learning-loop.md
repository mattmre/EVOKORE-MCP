# Reverse Engineering Learning Loop

The learning loop should stay slim. Its job is to preserve high-value reasoning, not every keystroke.

## Minimum Artifacts Per Session

1. **Analysis charter** — what question the session was trying to answer
2. **Hypothesis ledger** — major assumptions and how each was tested
3. **Evidence ledger** — APIs, strings, xrefs, runtime observations, hashes, rules
4. **Naming / type ledger** — durable semantic changes and confidence level
5. **Dynamic validation log** — breakpoints, hooks, snapshots, and what they proved
6. **Improvement backlog** — repeated ambiguity, automation candidates, persona gaps

## Memory Destinations

| Artifact | Best Destination | Why |
|---|---|---|
| Commands and outputs | `evidence-capture` | Session-auditable facts |
| Tool usage pattern | `session-replay` | Reproducible workflow trace |
| Panel performance | `persistent-narratives` | Persona evolution and cross-session memory |
| Repeated workflow friction | `improvement-cycles` | Converts pain into actionable fixes |
| Human-readable handoff | `session-wrap` | Keeps the next session from re-discovering context |

## Trigger Rules

Promote a finding into a more durable artifact when:

- the same ambiguity appears in 3 or more sessions
- a tool-selection mistake repeats
- a capability claim needed special caution to avoid overstatement
- a debugger plan pattern solved a class of problems, not just one sample
- a panel persona repeatedly adds unique value or repeatedly misses an important class of issue

## Typical Outputs

### Skill Candidate
- recurring ambiguity: packed configuration parsing
- new asset: `config-unpacking-campaign`
- evidence: 4 sessions required the same breakpoint + buffer-inspection loop

### Persona Update
- current gap: automation opportunities were spotted late
- change: strengthen Sofia Petrenko's challenge prompt and workflow-refinement mode

### Workflow Update
- current gap: malware triage occurred after deep decompilation, delaying operator reporting
- change: move capability triage earlier whenever suspicion is `suspicious` or `malicious`

## Anti-Bloat Rules

1. Store conclusions and proof, not full internal monologues.
2. Prefer checklists and ledgers over prose dumps.
3. Promote only reusable lessons into persistent narratives.
4. Run the full improvement loop after meaningful milestones, not every trivial function rename.
