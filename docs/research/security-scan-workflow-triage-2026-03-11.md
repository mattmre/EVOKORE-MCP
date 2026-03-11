# Security Scan Workflow Triage - 2026-03-11

## Purpose

Diagnose why the shared security jobs (`Dependency CVE Scan`, `IaC Misconfiguration Scan`, `Secret Leak Detection`, `Trivy SARIF Upload`) were failing across multiple PRs regardless of changed files.

## Evidence

- PRs `#86` and `#88` both had passing build/test/type/windows checks while all four Trivy-based security jobs failed.
- `gh run view --log-failed` for runs `22960371119` and `22911285492` showed the failure occurring in the Trivy bootstrap path before repository-specific results were emitted.
- `Trivy SARIF Upload` failed secondarily because `results/trivy-results.sarif` did not exist after the Trivy action failed.

## Root Cause

The repository was using an older `aquasecurity/trivy-action@0.28.0` path that internally bootstrapped Trivy through an older `setup-trivy` flow. The failing jobs were infrastructure/setup failures in that bootstrap path, not content-specific findings in the repository under test.

## Remediation

- First attempted an explicit `setup-trivy@v0.2.2` + newer `trivy-action` path. That still failed inside the bootstrap step after version resolution.
- Replaced the bootstrap-dependent action path entirely with containerized `aquasec/trivy:0.68.1` CLI invocations.
- Mounted the workspace and `~/.cache/trivy` into the container for deterministic execution and cache reuse.
- Upgraded SARIF upload to `github/codeql-action/upload-sarif@v4`.
- Added `test-security-scan-workflow-validation.js` and wired it into `npm test`.
- After the workflow fix exposed real dependency findings, updated `@modelcontextprotocol/sdk` from `^1.26.0` to `^1.27.1`.
- Added package `overrides` so the lockfile resolves patched `hono`, `@hono/node-server`, and `express-rate-limit` versions deterministically in CI.

## Expected Outcome

- Shared security jobs should either produce real findings from the repository or pass cleanly.
- The SARIF upload step should stop failing due to a missing output file caused by upstream bootstrap failure.
- Future regressions in action versions or workflow shape should be caught by the new validation test.
