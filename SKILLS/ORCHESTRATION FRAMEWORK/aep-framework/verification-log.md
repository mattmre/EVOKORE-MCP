# Verification Log

> Adapted from Agent33 ARCH-AEP verification log for use as a portable orchestration skill.

## Usage

Use this log for long-term evidence of test execution and validation results.
When a task closes, record the test command, outcome, and related task ID.

Purpose: Store build/test evidence per PR in a lightweight, searchable format.

## Indexing and Naming Rules

- **Entry Format**: `YYYY-MM-DD` - cycle-id - PR/branch - command - result - notes
- **Cycle ID**: Use task ID (e.g., T13) or descriptive slug (e.g., phase-7-evidence)
- **Artifact Path**: Store session logs in project session-logs directory
- **Cross-reference**: Always link to session log containing full evidence capture

## Partial Run Guidance

When full test suite cannot run (missing deps, docs-only repo, partial environment):

1. **Document Why**: Record the reason tests cannot run (no harness, env issues, etc.)
2. **Record Attempt**: Log the commands tried and their failure output
3. **Alternative Verification**: Use available checks:
   - Link validation: `rg -n "\\[.*\\]\\(.*\\)" <file> | head -20`
   - Markdown lint: `markdownlint <file>` (if available)
   - Doc structure check: `ls -la <dir>` to confirm file presence
4. **Explicit N/A**: Mark result as "not run (reason)" not just blank
5. **Escalation**: If critical verification blocked, note in session log for follow-up

## Example Partial Run Entry

- `2026-01-16` - T13 - phase-7-branch - N/A (docs-only repo; no test harness) - not run - Verified via doc audit: confirmed templates exist; link check passed

## Current Editor Lock

- current editor:
- lock timestamp:

## Index

| date | cycle-id | PR/branch | command | result | rationale link | link |
| --- | --- | --- | --- | --- | --- | --- |
