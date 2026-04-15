---
name: github-release-management
description: "Use when cutting a GitHub release that needs progressive canary rollout (5%→25%→50%→100%) with automated health gates and auto-rollback on error-rate or latency regressions."
aliases: [release-canary, canary-release, progressive-rollout, release-engineering]
category: devops
tags: [release, canary, deployment, rollback, github-actions]
archetype: AGT-021
version: 1.0.0
---

# GitHub Release Management Skill

Ships releases via progressive canary traffic gates (5% → 25% → 50% → 100%) with auto-rollback on health-gate failures. Implemented as a GitHub Actions workflow that pauses between stages to evaluate error rate, p95 latency, and health-check telemetry before widening the blast radius.

## Trigger

Use this skill when:
- Cutting a production release that must not flip 100% of traffic at once
- Introducing a breaking runtime change behind a feature flag
- Wiring GitHub Actions to promote a build through canary gates with auto-rollback
- Debugging a release that stalled mid-canary or rolled back unexpectedly

## Canary Traffic Routing

Traffic is shifted by updating the weight on the canary target. Each stage is held long enough to accumulate meaningful telemetry (default: 10 min minimum, 30 min for stage 1).

| Stage | Canary Weight | Stable Weight | Min Hold | Gate Required |
|-------|---------------|---------------|----------|---------------|
| 1     | 5%            | 95%           | 30 min   | Yes           |
| 2     | 25%           | 75%           | 15 min   | Yes           |
| 3     | 50%           | 50%           | 15 min   | Yes           |
| 4     | 100%          | 0%            | sticky   | Final check   |

Example GitHub Actions step (weight update via router API):

```yaml
- name: Shift traffic to canary 5%
  run: |
    curl -sSf -X POST "$ROUTER_API/releases/$RELEASE_ID/weights" \
      -H "Authorization: Bearer $ROUTER_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"canary": 5, "stable": 95}'
```

## Health Gate Criteria

A stage is **healthy** only when ALL of the following are true over the hold window:

- **Error rate:** canary 5xx rate <= stable 5xx rate + 0.5 percentage points AND absolute canary 5xx rate < 1.0%
- **p95 latency:** canary p95 <= stable p95 × 1.20 (max +20% regression tolerated)
- **Health checks:** 100% of `/healthz` probes return 200 for the last 5 minutes
- **Saturation:** canary CPU and memory within 90% of stable baseline

```yaml
- name: Evaluate canary health gate
  id: gate
  run: node scripts/release/evaluate-canary-gate.js \
    --release "$RELEASE_ID" \
    --stage "$STAGE" \
    --window 10m \
    --error-rate-delta 0.005 \
    --latency-ratio 1.20
```

The evaluator exits non-zero if any criterion fails, which triggers the rollback job via `if: failure()`.

## Auto-Rollback Procedure

Auto-rollback fires when:
1. The gate evaluator exits non-zero, OR
2. Error rate jumps above the absolute ceiling (>= 2.0%) at any point during the hold, OR
3. Three consecutive health-check probes fail.

```yaml
rollback:
  if: failure()
  needs: [canary-stage-1, canary-stage-2, canary-stage-3]
  runs-on: ubuntu-latest
  steps:
    - name: Revert traffic to stable
      run: |
        curl -sSf -X POST "$ROUTER_API/releases/$RELEASE_ID/weights" \
          -H "Authorization: Bearer $ROUTER_TOKEN" \
          -H "Content-Type: application/json" \
          -d '{"canary": 0, "stable": 100}'
    - name: Mark release as rolled_back
      run: gh release edit "$RELEASE_TAG" --prerelease --notes-file rollback-notes.md
    - name: Notify on-call
      run: node scripts/release/notify-oncall.js --release "$RELEASE_ID" --reason auto-rollback
```

The `rollback-notes.md` should include: stage reached, failing metric, telemetry link, and the commit SHA of the last known good stable.

## Manual Rollback

If observability lags the gate (e.g. a slow-burn bug surfaces 2 hours after 100% rollout), operators can force-revert:

```bash
# 1. Flip router weights back
curl -sSf -X POST "$ROUTER_API/releases/$RELEASE_ID/weights" \
  -H "Authorization: Bearer $ROUTER_TOKEN" \
  -d '{"canary": 0, "stable": 100}'

# 2. Re-tag previous stable as `latest`
gh release edit "$PREVIOUS_STABLE_TAG" --latest

# 3. Open incident issue with telemetry
gh issue create --label incident,rollback \
  --title "Manual rollback of $RELEASE_TAG" \
  --body-file incident-report.md
```

Always open an incident issue on manual rollback — silent reverts erode release-history trust.

## Release Checklist

Before triggering the workflow:

- [ ] CHANGELOG entry drafted and merged to `main`
- [ ] `package.json` version bumped and tagged
- [ ] Release notes drafted in GitHub Release (can be prerelease until stage 4 passes)
- [ ] Telemetry dashboards open for both stable and canary
- [ ] On-call engineer acknowledged the release window
- [ ] Rollback procedure tested in staging within last 30 days
- [ ] Feature flags default to `off` for any risky new path
- [ ] Database migrations are backward-compatible (rollback-safe)

After 100% promotion:

- [ ] GitHub Release promoted from prerelease to latest
- [ ] `previous-stable` tag moved to the prior release
- [ ] Canary infra scaled down
- [ ] Post-release review scheduled if any stage required manual intervention

## Anti-Patterns

- Skipping stage 1 (5%) because "the change is small" — low traffic is where you catch cold-path bugs
- Shortening hold windows below 10 minutes — telemetry aggregation windows often need that long
- Gating only on error rate — latency regressions silently degrade UX without tripping 5xx counters
- Treating rollback as failure — rollback is the release system working correctly
