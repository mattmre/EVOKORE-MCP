# RULES.md -- EVOKORE-MCP Declarative Security Policies

> This document declares **policy intent**. Runtime enforcement lives in `damage-control-rules.yaml`, `permissions.yml`, and the hook scripts under `scripts/hooks/`. RULES.md is the human-readable "why"; the YAML/JS files are the machine-readable "how."
>
> If RULES.md and a runtime rule disagree, the runtime rule wins for *this* invocation, and the discrepancy is a bug to file. Policy drift is a failure mode.

---

## 1. File Access Policies

File access is tiered. Every path on disk falls into exactly one access class.

### Zero-Access (blocked for read and write)

These paths must never be read, written, or traversed by any tool invocation. Damage-control blocks them at the PreToolUse hook.

- `.env`, `.env.*` (except `.env.example`) -- contains runtime secrets
- `.git/config`, `.git/credentials` -- contains git authentication state
- `*.pem`, `*.key`, `id_rsa`, `id_ed25519` -- private keys of any kind
- `~/.aws/credentials`, `~/.ssh/id_*` -- external credential stores
- Any path matching `*secret*`, `*credential*`, `*token*` under user home unless explicitly allowlisted

**Intent:** Secret leakage is irreversible. A secret read into context has already been compromised. Zero-access is enforced at the hook layer because no tool-level check is trustworthy enough.

### Read-Only (reads allowed, writes blocked)

- `damage-control-rules.yaml` -- runtime policy source (edit requires explicit workflow)
- `permissions.yml` -- RBAC role definitions (edit requires explicit workflow)
- `.claude/settings.json` -- hook wiring (edit requires explicit workflow)
- `mcp.config.json` -- proxy and webhook configuration (edit requires explicit workflow)
- `package-lock.json` -- dependency lock file (modified only by `npm install`)

**Intent:** These files are the control plane. Editing them mid-session without explicit purpose is how configuration drift becomes silent regression. A dedicated workflow for each edit forces the operator to declare intent.

### Write-Allowed (reads and writes permitted)

- `src/**` -- TypeScript source files
- `tests/**` -- vitest test files
- `docs/**` -- documentation and research notes
- `scripts/**` (excluding `scripts/hooks/` core files) -- operational scripts
- `SKILLS/**` -- skill markdown files (respecting submodule boundaries)
- `.claude/worktrees/**` -- ephemeral agent worktrees

**Intent:** These are the normal work surfaces. Writes here are expected, captured by evidence-capture, and reviewable through the PR flow.

### Append-Only (writes allowed, edits discouraged)

- `~/.evokore/sessions/*-replay.jsonl` -- session replay log
- `~/.evokore/sessions/*-evidence.jsonl` -- evidence capture log
- `~/.evokore/logs/*.log` -- hook runtime logs

**Intent:** Historical records lose their value if they can be silently rewritten. These files are intended to be appended to and rotated, never edited in place.

---

## 2. Tool Restrictions

Tool access is tiered by trust and reversibility. Tier assignments are enforced by `permissions.yml` (RBAC) and the HITL approval token system.

### Always-Allow (no approval required)

- Read-only skill resolution: `discover_tools`, `resolve_workflow`, `search_skills`, `get_skill_help`, `list_registry`
- Read-only session analytics: `session_context_health`, `session_analyze_replay`, `session_work_ratio`
- Navigation: `nav_get_map`, `nav_read_anchor`
- Telemetry inspection: `get_telemetry`
- Status queries: `proxy_server_status`
- Any MCP tool annotated with `readOnlyHint: true`

**Intent:** Observability is never a security risk. An operator needs to see what is happening before they can make a safe decision about what to do next.

### Require-Approval (HITL token required)

- Tools that mutate persistent state: Edit, Write, Bash (for state-changing commands)
- Tools that spend external credits or send external traffic: LLM calls, remote fetches
- Tools marked `destructiveHint: true` or `openWorldHint: true` without an explicit allowlist
- Proxied supabase mutation tools (per `mcp.config.json` tiered permissions)

**Intent:** Every mutation should cross a human-judgment checkpoint at least once per session. The HITL approval token ensures the operator actively authorized the class of action, not merely that the agent decided it was a good idea.

### Deny (blocked unconditionally)

- Tools that would exfiltrate secrets: any Bash command matching `.env`, credential paths, or private key globs
- Tools that would bypass enforcement: `git commit --no-verify`, `git push --force origin main`
- Tools that would corrupt history: `git reset --hard origin/main` when the working tree is dirty, `git clean -f` without explicit scope
- Tools that match damage-control fork-bomb, rm-rf, or recursive-delete patterns

**Intent:** Some actions have no legitimate agent use case. Deny-list tools are reserved for explicit operator-initiated recovery workflows, never for routine agent execution.

---

## 3. Commit Policies

All commits to this repository must satisfy the following policies.

- **Conventional commits required.** Every commit message follows the `type(scope): subject` format. Valid types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`, `build`. Scope is optional but encouraged. Phase 8.3 of the ECC integration adds commitlint enforcement.

- **No `--no-verify`.** Hooks are the last line of defense. Skipping them because one is in a hurry is how silent regressions land. If a hook is misfiring, fix the hook -- do not bypass it.

- **No force push to main or master.** `git push --force origin main` is unconditionally denied. Force push to feature branches is allowed only when the operator explicitly requests it and the branch has no open PR under active review.

- **PR template enforced.** Every PR must satisfy the sections in `.github/PULL_REQUEST_TEMPLATE.md`: `## Description`, `## Type of Change`, `## Testing`, `## Evidence`. `validate-pr-metadata.js` checks this in CI.

- **Sequential merges for shared-surface changes.** When a PR touches hook scripts, CLAUDE.md, `.claude/settings.json`, validation scripts, or control-plane files, the next PR must be rebased onto the updated main and its CI must pass fresh before merging. No batch merges on shared surfaces. This is the lesson of PR #105.

- **Use `.commit-msg.txt` + `-F`.** Commit messages are drafted in `.commit-msg.txt` and passed to `git commit -F .commit-msg.txt`. Heredocs and inline `-m` strings can false-positive damage-control on complex command strings.

- **New commits, not amends.** When a pre-commit hook fails, the commit did not happen -- `--amend` would modify the *previous* commit, potentially destroying previous work. Fix the issue, re-stage, and create a new commit.

**Intent:** Commit hygiene is how history stays trustworthy. A git log that follows conventional commits can generate changelogs automatically. A git log with bypassed hooks cannot be trusted to reflect what is actually in the working tree.

---

## 4. Session Policies

Every focused work block is a session, with its own manifest at `~/.evokore/sessions/{sessionId}.json`.

- **Purpose required on session start.** The `purpose-gate` hook asks for session intent on the first user prompt and refuses to proceed without one. Purpose is injected into every subsequent prompt via `additionalContext` so the agent cannot drift silently.

- **Evidence capture always enabled.** The `evidence-capture` hook writes test results, file changes, and git operations to the session evidence JSONL. This is not optional. Evidence is how future sessions reconstruct what happened.

- **Replay logging always active.** The `session-replay` hook writes every tool invocation to the session replay JSONL. This is not optional. Replay is how regressions are debugged.

- **Till-done gate before session stop.** The `tilldone` hook blocks session Stop events while incomplete tasks remain in `~/.evokore/sessions/{sessionId}-tasks.json`. Tasks are completed via `node scripts/tilldone.js --done <N>` or explicitly cleared with `--clear`.

- **Session manifest is the source of truth.** Agents read purpose, task state, and continuity health from the session manifest -- not from inferred context. Guessing session state is an anti-pattern (see SOUL.md section 5).

- **One session, one purpose.** Multi-purpose sessions produce context rot. If the scope changes, the current session is closed via `tilldone` and a new session is opened with a fresh purpose declaration.

**Intent:** Session discipline is what keeps work focused, auditable, and recoverable. A session without purpose, evidence, and replay is indistinguishable from random tool calls.

---

## 5. Escalation Policies

Some actions require human approval beyond the default HITL token flow. These escalations are routed through explicit operator prompts.

- **Destructive git operations.** Force push (to any branch), `git reset --hard`, `git branch -D`, worktree removal with uncommitted state, and submodule reset all require explicit operator confirmation. The operator sees the exact command and states before approving.

- **`.env` or credential file access.** Any tool invocation that resolves to a `.env` path, credential file, or private key is denied at damage-control and requires operator intervention to unblock. Even *reading* these paths requires explicit scoped approval.

- **Force push to main or master.** Unconditionally denied regardless of operator approval. This is not an escalation path -- it is a hard block. If history rewriting on main is required, the operator performs it manually with a documented runbook.

- **Schema or configuration changes.** Edits to `mcp.config.json`, `permissions.yml`, `damage-control-rules.yaml`, `.claude/settings.json`, and database schemas require explicit operator approval. These files are the control plane; silent edits produce policy drift.

- **Release operations.** Publishing to npm, tagging a release, and creating a GitHub release all require explicit operator approval. `release:preflight` must pass; `NPM_TOKEN` presence must be verified.

- **Cross-session artifact writes.** Writing to shared trackers (`ORCHESTRATION_TRACKER.md`, `next-session.md`, session logs) from inside an agent worktree requires explicit operator approval -- the lesson of the orchestration conflicts incident (see CLAUDE.md). Shared trackers are updated on main, not on feature branches.

- **External network calls from agents.** An agent invoking a webhook, remote fetch, or external LLM call spends real resources and emits real network traffic. These are escalated through the HITL token flow and logged as evidence.

**Intent:** Escalation is how the system refuses to trade speed for safety. Every escalated action has a human who said "yes" for a reason that is preserved in the session manifest and evidence log.

---

## Cross-References

- **SOUL.md** -- the "who I am" that motivates these policies
- **CLAUDE.md** -- implementation details and historical lessons
- **`damage-control-rules.yaml`** -- runtime enforcement of file and command policies
- **`permissions.yml`** -- RBAC role and tool tier definitions
- **`.claude/settings.json`** -- hook wiring for session, evidence, and replay policies
- **`.github/PULL_REQUEST_TEMPLATE.md`** -- PR template that enforces commit policies
- **`docs/ECC-INTEGRATION-PLAN.md`** -- Phase 0 acceptance criteria for this file

---

*If a runtime rule conflicts with RULES.md, the runtime wins for that invocation. File a bug; fix the drift; keep the two in sync.*
