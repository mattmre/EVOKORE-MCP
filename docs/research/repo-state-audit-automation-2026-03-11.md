# Repo-State Audit Automation Research

**Date:** 2026-03-11  
**Slice:** `T26`

## Problem

The root control plane correctly described merged `main`, but the checked-out root branch was still a stale pre-roadmap feature branch. Existing validations guarded docs freshness, tracker integrity, and workflow metadata, but there was no single session-start audit that surfaced:

- current branch divergence from `main`
- stale local branches and gone upstreams
- merged remote branches still lingering on `origin`
- live worktree pressure
- handoff/control-plane drift in `CLAUDE.md`, `next-session.md`, and root planning files

## Decision

Add a non-destructive repo-state audit CLI instead of another doc-only reminder.

## Contract

- `node scripts/repo-state-audit.js` prints a human-readable audit summary
- `node scripts/repo-state-audit.js --json` emits machine-readable JSON for future automation
- audit is best-effort around GitHub CLI access; it still reports local git state if `gh` is unavailable
- audit does not mutate branches, worktrees, or docs

## Scope

1. Report current branch and divergence from `main`
2. Parse worktree state from `git worktree list --porcelain`
3. Classify stale local branches via gone upstreams or merged-into-`origin/main` state
4. Classify merged remote branch candidates with no open PR
5. Surface control-plane drift for `CLAUDE.md`, `next-session.md`, root planning files, and `docs/session-logs/*`

## Why a standalone script

This needs to run before implementation starts, not only after docs are already stale. A small CLI keeps the audit visible to operators and gives future automation a stable JSON input.
