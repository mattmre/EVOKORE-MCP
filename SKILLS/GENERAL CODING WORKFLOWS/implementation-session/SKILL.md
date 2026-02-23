---
name: implementation-session
description: "Start an implementation cycle: review priorities, check stale
  branches, orchestrate agents for coding tasks, and wrap up the session."
---

# Implementation Session

This skill executes a complete implementation cycle from planning through orchestration and final session wrap-up.

## Core Workflows

### 1. Priority Identification
- Review `CLAUDE.md` and `next-session.md` (or equivalent).
- Show the next top 5, or up to top 15 priority items or phases.
- Before implementing anything, review the exact solution we will implement given the parameters to ensure understanding.

### 2. Stale Local Branches
- Walk through "stale local branches" both locally and in the online repo.
- Ensure they are accounted for in GitHub so we aren't losing anything vital. No short or quick scans.
- Check if local repos have changes that were not merged or committed, or might be from partial sessions that were not completed/logged properly. Fix as needed.

### 3. Agentic Implementation
- Use agentic orchestration to complete implementation of these items.
- I want no context rot, so please orchestrate and provide agents with instructions and plans as needed to accomplish tasks, then dispose of the agent and use another fresh agent as you move through the work.
- Please research and plan/architect all features before implementation.
- Coordinate analysis of current research and docs within the repo as needed (we have extensive research but may need more).
- If research is done, please make sure to document and save that to the docs folder for tracking and future use.
- Keep track of the session log and agents' work so we can track and monitor.
- Orchestrate and then make a PR for each so we can review.

### 4. Session Wrap
- Close the session and update the session log.
- Update `next-session.md` and prepare for the next session.
- (Keep in mind there may be another session running that just completed; incorporate its handoff points if applicable.)
