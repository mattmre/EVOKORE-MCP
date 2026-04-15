---
name: agentic-jujutsu
description: "Use when multiple agents need to write to the same repo concurrently without file-lock stalls — applies claim-before-write, parallel branch fan-out, and semantic 3-way merge to achieve ~87% auto-conflict resolution."
aliases: [jujutsu, multi-agent-vcs, non-locking-vcs, agent-concurrency]
category: orchestration
tags: [multi-agent, vcs, git, conflict-resolution, claims, concurrency]
archetype: AGT-019
version: 1.0.0
---

# Agentic Jujutsu Skill

Coordinates concurrent multi-agent writes to a single git repository without traditional file locking. Agents register soft claims through `ClaimsManager`, fan out into isolated worktree branches, and reconverge via semantic 3-way merge. Benchmarked at ~87% auto-conflict resolution on the EVOKORE corpus; the remaining 13% route to manual escalation with structured context.

## Trigger

Use this skill when:
- Orchestrating 3+ agents writing to overlapping code paths in the same session
- Fan-out / fan-in workflows (e.g. architect → 5 implementers → reviewer) are hitting `.git/index.lock` collisions
- Agents are stomping on each other's commits mid-squash
- A merge wave has produced more conflicts than it resolved and you need a replayable strategy

## Core Principle

**Claim first, write second, merge semantically.** Locking is replaced with cooperative soft claims that record intent. If two agents claim overlapping regions, the later claim is told upfront (not after a wasted write) and can either wait, re-scope, or route to a different branch.

## Claim Protocol

Every agent invokes `claim_acquire` before editing. Claims are scoped to `{path, range?, intent}` and held by session ID.

```jsonc
// Agent A: claim exclusive write on a function range
{
  "tool": "claim_acquire",
  "arguments": {
    "path": "src/ProxyManager.ts",
    "range": { "startLine": 120, "endLine": 210 },
    "intent": "refactor:hashmap-lookup",
    "ttlMs": 900000
  }
}
```

```jsonc
// Agent B: overlapping claim returns conflict with holder info
{
  "tool": "claim_acquire",
  "arguments": {
    "path": "src/ProxyManager.ts",
    "range": { "startLine": 180, "endLine": 260 },
    "intent": "add:connection-pool"
  }
}
// → { ok: false, conflict: { holder: "agent-a", intent: "refactor:hashmap-lookup", expiresAt: ... } }
```

Release on completion (success or abort):

```jsonc
{ "tool": "claim_release", "arguments": { "claimId": "clm_7h2..." } }
```

List active claims to debug stalls:

```jsonc
{ "tool": "claim_list", "arguments": {} }
```

Sweep expired claims (run by the orchestrator, not individual agents):

```jsonc
{ "tool": "claim_sweep", "arguments": { "olderThanMs": 1800000 } }
```

## Branch Fan-Out Pattern

Instead of serializing on `main`, the orchestrator spawns N worktree branches off a shared base. Each agent owns a disposable worktree under `.claude/worktrees/agent-{id}/`.

```
              origin/main
                  |
        base: feat/wave-4-base
         /    |    |    \
      a1    a2    a3    a4    (agent worktrees, parallel)
         \    |    |    /
        semantic-merge
                  |
              PR → main
```

Spawning is handled by `FleetManager`:

```jsonc
{ "tool": "fleet_spawn", "arguments": { "count": 4, "base": "feat/wave-4-base" } }
```

## Semantic Auto-Merge

On fan-in, the merger walks each branch and applies a 3-way merge biased by claim metadata:

1. **Non-overlapping hunks** — auto-accept both (the 60–70% common case).
2. **Adjacent hunks on the same file** — auto-stack if claim `intent` tags are non-conflicting (`add:*` + `refactor:*` are compatible; `refactor:*` + `refactor:*` are not).
3. **Overlapping hunks** — apply AST-aware merge: if both edits are pure additions to different AST nodes, accept both; if they mutate the same node, escalate.
4. **Import / config merges** — dedupe by semantic key (import path, YAML key) rather than line-diff.
5. **Moved code detection** — if one agent moved a block and the other edited it, apply the edit to the new location.

Target success rate is ~87% fully automated on the EVOKORE corpus; the remaining ~13% surface a structured escalation record.

## Manual Escalation Triggers

Escalate to a human (or a dedicated `reviewer` agent) when:
- Two claims with compatible intents still produce overlapping AST mutations
- A merge would change the exported shape of a type/interface in ways neither agent declared
- Tests pass individually on both branches but fail on the merged tree
- Any `deny`-policy path (secrets, `.env`, `.git/config`) appears in the diff

Escalation payload format (written to `~/.evokore/sessions/{sessionId}-escalations.jsonl`):

```jsonc
{
  "id": "esc_001",
  "ts": 1713180000000,
  "kind": "ast-overlap",
  "branches": ["agent-a", "agent-b"],
  "path": "src/ProxyManager.ts",
  "claimIntents": ["refactor:hashmap-lookup", "refactor:connection-pool"],
  "suggestedResolution": "sequence: apply agent-a first, rebase agent-b"
}
```

## Anti-Patterns

- **Skipping `claim_acquire` for "small edits"** — small edits are where unrecorded conflicts hide.
- **Long-lived claims** — default TTL is 15 minutes; agents that need longer should renew, not hold indefinitely.
- **Merging without the claim ledger** — the ledger is the only record of intent; losing it forces line-diff merge and collapses success rate to ~50%.
- **Treating escalations as failures** — escalation is the release valve that keeps auto-merge honest.
- **Re-using a worktree across unrelated tasks** — always `fleet_release` and spawn fresh; stale worktrees are the #1 source of "impossible" conflicts.
