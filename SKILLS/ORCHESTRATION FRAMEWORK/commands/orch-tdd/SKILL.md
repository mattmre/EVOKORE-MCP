---
name: orch-tdd
description: Use when implementing a feature via test-driven development - write a failing test first, get to green with the smallest correct change, then refactor. Enforces vertical slice shape and red-commit-hash evidence.
category: Orchestration Framework
metadata:
  version: "1.1"
  source: "Agent33"
  original_command: "/tdd"
  tags: ["orchestration", "command", "tdd", "testing", "red-green-refactor", "vertical-slice"]
---

# Orchestration TDD

## Purpose

Direct entry point for Test-Driven Development workflow. Guides implementation through the RED/GREEN/REFACTOR cycle with evidence capture at each stage.

## Invocation

```
orch-tdd <feature-description>
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| feature-description | Yes | Clear description of feature to implement |
| target-path | No | Directory or file to target |
| test-framework | No | Override default test framework |

## Workflow

### 1. Parse Requirements

- Parse feature description into testable requirements
- Identify target files and test framework

### 2. RED Phase

- Write failing test(s) for the feature
- Verify test fails for the right reason
- Capture: test file path, failure output

### 3. GREEN Phase

- Write minimal implementation to pass test
- Run test suite to verify pass
- Capture: implementation file path, pass output

### 4. REFACTOR Phase

- Identify code smells or duplication
- Refactor while keeping tests green
- Capture: refactored files, final test output

## Stage Tracking

Track current stage in project status:

```markdown
## TDD Progress
- [x] RED: test written, fails correctly
- [x] GREEN: implementation passes
- [ ] REFACTOR: cleanup complete
```

## Outputs

| Output | Description |
|--------|-------------|
| Test files | New or updated test file(s) |
| Implementation | Minimal code to pass tests |
| Evidence | RED/GREEN/REFACTOR stage captures |
| Task update | Progress logged in task tracking |

## Evidence Capture

Minimum evidence per stage:
- **RED**: Test code + failure message
- **GREEN**: Implementation code + pass confirmation
- **REFACTOR**: Diff summary + all tests still pass

## Example Usage

```
orch-tdd "Add user authentication with JWT tokens"
```

Expected flow:
1. Write test for authentication endpoint
2. Verify test fails (no auth implemented)
3. Implement minimal JWT auth
4. Verify test passes
5. Refactor for clarity and security
6. Capture evidence at each stage

## Anti-pattern: horizontal slicing produces crap tests

**Horizontal slicing** = treating the test layer as the slice. RED becomes
"write all the tests" and GREEN becomes "write all the code." The slice is
defined by the *layer* (DB layer, service layer, controller layer), not by
the user-observable behavior.

**Vertical slicing** = end-to-end behavior is the slice. One test asserts
one user-visible outcome (input -> observable output) through the public
interface. RED -> GREEN -> next slice. The slice is defined by *what the
caller can see*, not by where the code happens to live.

### Concrete failure mode

Horizontal slices produce tests that mock at the layer boundary. The mock
returns whatever the test author imagined, the test passes, and the real
integration breaks the moment the layers are wired together. The tests:

- Assert on shapes (function signatures, data structures) instead of
  behavior — see [refs/tests.md](refs/tests.md).
- Mock internal collaborators that the implementer fully controls — see
  [refs/mocking.md](refs/mocking.md).
- Cannot survive a refactor that moves logic between layers, even when the
  user-visible behavior is unchanged.
- Were written in bulk before the implementation existed, so they are
  testing *imagined* behavior rather than *actual* behavior.

### Correct approach

Tracer-bullet vertical slices: ONE test -> ONE implementation -> repeat.
Each slice is a single end-to-end assertion expressed without naming a
layer. The shape of the assertion is the contract; the layers are
implementation detail. Pair this with deep modules
([refs/deep-modules.md](refs/deep-modules.md)) and dependency-injected
interfaces ([refs/interface-design.md](refs/interface-design.md)) so the
tracer bullet stays anchored to the public interface across refactors.

```
WRONG (horizontal):
  RED:   test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

RIGHT (vertical):
  RED -> GREEN: test1 -> impl1
  RED -> GREEN: test2 -> impl2
  RED -> GREEN: test3 -> impl3
  ...
```

## Slice-shape panel gate

Before invoking tdd skill, run slice-shape panel via panel-of-experts skill.
Operationally: invoke panel-of-experts skill to convene the slice-shape
panel, then invoke orch-tdd skill once every slice is graded vertical.

The slice-shape panel is a hard gate between `to-issues` (or any other
slice-emitting upstream skill) and `orch-tdd`. The panel asserts that
each slice's acceptance criteria can be expressed as a **single
end-to-end assertion** (input -> observable output) WITHOUT naming a
layer. The panel rejects slices framed as "DB layer" / "API layer" /
"UI layer".

### Input contract

The panel takes the slice spec — typically the issue body produced by
`to-issues`, or any equivalent slice description — and emits one record
per slice:

```json
{
  "slice_id": "<stable id>",
  "vertical": true | false,
  "blockers": ["<short rationale per failure>"]
}
```

### Rejection behavior

- If `vertical: false` for any slice, halt the chain. Do **not**
  auto-activate `orch-tdd` on a horizontal slice.
- The orchestrator surfaces the `blockers` list back to the operator and
  requests a re-shape. Common re-shapes: pull the slice up to the public
  API surface, deepen the underlying module, or split the slice into
  vertically independent units.
- A slice that passes (`vertical: true`) becomes the input to the next
  RED -> GREEN tracer bullet.

### Heuristics the panel uses

- Does the slice description name a *layer*? If yes -> horizontal.
- Does the assertion run through the public interface? If no ->
  horizontal.
- Would the test survive moving the implementation between layers? If
  no -> horizontal.
- Is there exactly one observable outcome under test? If no -> split
  the slice further before accepting.

See [refs/tests.md](refs/tests.md) for examples of well-shaped vs.
mis-shaped slices.

## Red-commit-hash evidence rule

Every GREEN commit MUST reference the SHA of the prior RED commit where
the test was failing. This is the auditable proof that the test was
written first, ran red, and only then was the implementation introduced.

### Practical wiring

1. **Commit message footer.** The implementing agent records the red
   SHA in the GREEN commit message footer:

   ```
   <green commit message>

   Test-Red: <40-hex-SHA>
   ```

2. **Evidence row.** `orch-tdd` emits a `tdd-red-green` record to
   `~/.evokore/sessions/<sessionId>-evidence.jsonl`:

   ```json
   {
     "type": "tdd-red-green",
     "slice_id": "<id>",
     "red_sha": "<40-hex>",
     "green_sha": "<40-hex>",
     "test_path": "<repo-relative test file>",
     "ts": "<ISO-8601>"
   }
   ```

3. **Damage-control advisory.** `damage-control-rules.yaml` rule
   **DC-44** matches commit messages that touch a test file but lack a
   `Test-Red: <40-hex-SHA>` footer and surfaces a WARN (not block — too
   noisy to block today).

4. **Evidence validator.** `scripts/validate-tdd-evidence.js` scans the
   session evidence JSONL for `tdd-red-green` rows and asserts each
   GREEN commit has a matching RED row. If gaps are found, it emits a
   WARN. The validator is advisory and is wired into `tilldone` by
   reference; it does not block session stop.

### Why this matters

Without an auditable red SHA, "I wrote the test first" is unverifiable
narrative. With one, the harness can replay the chain and confirm that
the failing test predates the implementation. This closes the loophole
where tests are quietly added *after* the implementation passes — the
oldest TDD anti-pattern.
