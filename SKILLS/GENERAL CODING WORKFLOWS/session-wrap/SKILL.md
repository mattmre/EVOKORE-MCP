---
name: session-wrap
description: Wrap up the current coding session by creating PRs, updating the
  session log, preparing the next session md, and updating the claude md with
  learnings.
---

# Session Wrap

This skill wraps up the current coding session, ensuring no context is lost and the handoff to the next session is seamless.

## Workflow

1. **Commit and PR**: Create a PR for any work not already committed to a PR. If you need to use git, ensure you confirm the repo and completion.
2. **Log Session**: Update the session log (`docs/session-logs` or similar). Ensure you have per-session documentation for all previous sessions for this repo. Use agentic orchestration to explore and update as needed.
3. **Prepare Next Session**: Update `next-session.md` and prepare for the next session. Keep in mind there may have been another session running that just completed; incorporate its handoff points if applicable.
4. **Update Claude Learnings**: Use agentic orchestration to explore the session logs. Update `CLAUDE.md` with any information from the agents that might be pertinent to future sessions, especially repetitive errors and noticed problems that affect progress. We want to make sure future sessions improve upon previous ones. Update `CLAUDE.md` once findings are prepared.
5. **Finalize**: Confirm completion once all the logs and PRs are updated.
