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

- Added explicit `aquasecurity/setup-trivy@v0.2.2` steps in all four jobs.
- Pinned Trivy to `v0.68.1`.
- Upgraded all scan steps to `aquasecurity/trivy-action@0.33.1`.
- Added `skip-setup-trivy: true` so the action reuses the explicit setup rather than invoking its own internal bootstrap.
- Upgraded SARIF upload to `github/codeql-action/upload-sarif@v4`.
- Added `test-security-scan-workflow-validation.js` and wired it into `npm test`.

## Expected Outcome

- Shared security jobs should either produce real findings from the repository or pass cleanly.
- The SARIF upload step should stop failing due to a missing output file caused by upstream Trivy setup failure.
- Future regressions in action versions or workflow shape should be caught by the new validation test.
