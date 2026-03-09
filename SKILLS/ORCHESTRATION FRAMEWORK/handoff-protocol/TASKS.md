# TASKS

## Queue (unassigned)
(No tasks in queue)

## In Progress
- [ ] (agent) T#: status / notes / blockers

## Done
(Completed tasks go here with evidence links)

## Task Template
When you pick a task:
1) Create branch: task/T#-short-name
2) Update TASKS.md In Progress line with your agent name + timestamp
3) Implement minimal changes
4) Run checks/tests (or explain why not possible)
5) Capture reviewer output (if risk triggers apply) using `REVIEW_CAPTURE.md`
6) Confirm Definition of Done checklist: `DEFINITION_OF_DONE.md`
7) Commit with message: T#: <summary>
8) Update TASKS Done with summary + commit hash + verification evidence

## Minimum Task Payload
- ID and title
- Owner and start date
- Acceptance criteria
- Verification steps
- Spec-first checklist reference (`SPEC_FIRST_CHECKLIST.md`)
- Autonomy budget (when scope or risk warrants) (`AUTONOMY_BUDGET.md`)
- Reviewer required (yes/no)

## Example Tasks

### T1 - Example: Add new orchestration doc
- [x] T1: Create orchestration protocol document
  - Evidence: `handoff-protocol/STATUS.md` (runtime context and handoff map)
  - Acceptance: File exists with all required sections

### T2 - Example: Implement validation script
- [ ] T2: Add validation script for orchestration index
  - Acceptance: Script runs, exits 0, produces report
  - Verification: `node scripts/validate.js` exits 0
  - Reviewer required: no

### T3 - Example: Security review
- [ ] T3: Review security posture of new tool integration
  - Acceptance: Risk triggers reviewed, evidence captured
  - Reviewer required: yes (security trigger)

## Review-to-Backlog Checklist
- Capture review inputs in `REVIEW_CAPTURE.md` when required.
- Triage findings and assign severity tags.
- Decide accept/defer/reject with rationale.
- Convert accepted findings into TASKS entries with acceptance criteria + verification.

## Acceptance Criteria Examples
- "CLI command exits 0 and produces expected output file."
- "Unit tests for module X pass; new test covers edge case Y."
- "Documentation updated for new flag; examples added."

## Status Update Template
- Status:
- Progress:
- Blockers:
- Next action:
