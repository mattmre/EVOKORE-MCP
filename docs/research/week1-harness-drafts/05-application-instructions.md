# Week-1 Harness Drafts — Application Instructions

> **STATUS: DRAFT. Nothing has been applied.**
> The drafting agent was explicitly told **not** to modify `~/.claude/settings.json`, `~/.claude/settings.local.json`, or `~/.codex/config.toml`. You (the user) must review and apply each change yourself.

Date drafted: **2026-04-24**.
Source audit: `D:/github/EVOKORE-MCP/docs/research/workflow-audit-2026-04-24.md`.

---

## What's in this folder

| File | Target | Type |
|---|---|---|
| `01-claude-CLAUDE.md.draft` | `~/.claude/CLAUDE.md` (new file) | Full content |
| `02-codex-AGENTS.md.draft` | `~/.codex/AGENTS.md` (currently 0 bytes) | Full content |
| `03-settings.json.diff` | `~/.claude/settings.json` | Unified diff |
| `04-codex-config.toml.diff` | `~/.codex/config.toml` | Unified diff |
| `05-application-instructions.md` | This file | README |

---

## Apply order

**03 -> 04 -> 01 -> 02.** Settings first, docs second. Reasoning:

1. **03 (Claude settings)** — disables `skipDangerousModePermissionPrompt` and trims dead-weight allowlist. Smallest blast radius, easiest rollback (one JSON key).
2. **04 (Codex config)** — downgrades sandbox to `workspace-write`, disables Windows `elevated`. Larger behavioral change, but isolated to Codex.
3. **01 (Claude CLAUDE.md)** — drops a new file at `~/.claude/CLAUDE.md`. Pure additive; no existing file to overwrite. If something is wrong, delete the file.
4. **02 (Codex AGENTS.md)** — replaces the 0-byte placeholder with content. Same: pure additive.

If you do them in the reverse order, the docs reference a permissions posture that doesn't exist yet. Settings-first keeps reality and documentation in sync.

---

## What breaks if applied incorrectly

### 03 (Claude settings.json)
- **Risk:** removing the wrong allowlist entry surfaces a permission prompt the next time you run that exact pattern. Annoying, not destructive.
- **Rollback (one line):** restore the removed entries from the diff's `--- before` block, save, restart Claude Code.
- **Don't do:** flip `defaultMode: bypassPermissions` to `default` in the same change. That's a separate, larger decision. The current draft only touches `skipDangerousModePermissionPrompt` and the allowlist.

### 04 (Codex config.toml)
- **Risk:** `workspace-write` blocks legitimate cross-workspace ops you previously did under `danger-full-access`. Most likely candidates: global package installs, writes to `C:/ProgramData`, service control, registry edits.
- **Symptom:** Codex asks for approval where it didn't before, or refuses with a sandbox-violation error.
- **Rollback (one line):** in `~/.codex/config.toml`, set `sandbox_mode = "danger-full-access"` and uncomment the `[windows]` block. Restart Codex CLI.
- **Watch the first 24 hours.** If the same approval prompt fires more than 3x for the same pattern, that pattern is a candidate to either bake into a script-with-explicit-elevation or to live with as a one-time approval.

### 01 / 02 (CLAUDE.md / AGENTS.md)
- **Risk:** the new instruction conflicts with a per-repo `CLAUDE.md` or with the user's actual workflow. Per-repo files override user-level ones, so conflicts surface as "agent is more cautious in fresh repos."
- **Rollback:** delete or rename the file. There is no state to restore.

---

## How to verify each change worked

### 03 — Claude settings
- Open Claude Code, run `/permissions` (the slash command lists current allowlist).
- Confirm: the pinned `git commit -m "$(cat <<EOF\nfeat: Implement Phase 2 ..."` entries are **gone**, and `Bash(gh pr create:*)` is **present**.
- Run any Bash command that previously hit `skipDangerousModePermissionPrompt` (for example a fresh git command from a new repo). If it now prompts where it used to silently proceed, the change took effect.

### 04 — Codex config
- Restart Codex CLI (config is read on startup).
- Try a write outside a trusted workspace: e.g., from a Codex session inside `D:/github/EVOKORE-MCP`, attempt to write `C:/Windows/Temp/codex-sandbox-test.txt`. It should require approval.
- Inside the workspace, normal writes should still work without prompting.
- If approval is *not* required for the cross-workspace write, the config did not load — check the file is valid TOML (`toml-test` or just open Codex with verbose logging).

### 01 — Claude CLAUDE.md
- Start a new Claude session in a directory with **no** local `CLAUDE.md` (e.g., `C:/Users/mattm/Desktop`).
- Ask: "What conventions should you follow when committing?"
- Expected: it cites the `<type>: <imperative summary>` format from the user-level file.

### 02 — Codex AGENTS.md
- Start a new Codex CLI session.
- Ask: "How should you handle an `apply_patch verification failed` error?"
- Expected: it cites "re-read the file before retry" from the new AGENTS.md, not generic advice.

---

## Risks the audit panels flagged (read these before applying)

From `workflow-audit-2026-04-24.md` Section 5 ("Risks the research agents under-weighted"):

- **Risk #2 — Hooks compound silently.** These drafts do **not** add new hooks. If you also apply the proposed Read-before-Edit hook (Week-1 #7) or the parallel-Bash throttle (Week-1 #8) without telemetry, you will be unable to debug the next regression. Add the hook-traces JSONL line in `01-claude-CLAUDE.md.draft` Section 6 *before* you ship a single hook.
- **Risk #4 — `bypassPermissions` + `danger-full-access` on Windows with 20 repos and an active EVOKORE-MCP server: a single prompt-injected document can rewrite the filesystem.** The `03` and `04` diffs are the minimum mitigation. They are necessary but not sufficient — the SSRF in `httpUtils.ts httpGet()` (SEC-03) is the matching code-side fix and is Week-1 item #1.

If you apply these drafts but skip Week-1 #1 (the SSRF patch), you have closed the *prompt* boundary but left the *exfil* boundary open. The exploit chain in audit Theme F still resolves.

---

## Things the drafting agent could not determine without you

1. **Whether `defaultMode: bypassPermissions` itself should change.** This draft preserves it and only removes the dangerous-prompt skip. A fuller change to `default` mode is in scope for a separate decision.
2. **Whether `Bash(findstr:*)` and `Bash(dir:*)` should stay in the allowlist.** They are `cmd.exe` syntax, which the new CLAUDE.md asks the agent to avoid. Removing them now would block any in-flight work that still uses them. Recommend: leave for one week, then audit usage and remove.
3. **Whether the `[projects.*]` trust list in `~/.codex/config.toml` should shrink.** 13 trusted projects is wide. Audit didn't carry repo-by-repo activity counts at write-time; the user is best positioned to prune.
4. **Whether to keep `personality = "pragmatic"` and `service_tier = "fast"` in Codex.** Out of scope for this draft, but flagging for awareness — both affect every session.

---

## After applying

Update `D:/github/EVOKORE-MCP/docs/research/workflow-audit-2026-04-24.md` Section 3 (Week-1 table) to mark items #3 and #9 as **applied YYYY-MM-DD**, and link back to this folder.
