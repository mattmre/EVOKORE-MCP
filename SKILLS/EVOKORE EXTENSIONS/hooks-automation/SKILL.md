---
name: hooks-automation
description: "Use when you need to implement or debug Claude Code hooks using the 3-phase memory sync pattern (STATUS→PROGRESS→COMPLETE) with JSON flow-control responses."
aliases: [hooks, hook-automation, claude-hooks]
category: automation
tags: [hooks, automation, memory-sync, json-flow-control, claude-code]
archetype: AGT-018
version: 1.0.0
---

# Hooks Automation Skill

Implements Claude Code hooks using the STATUS→PROGRESS→COMPLETE 3-phase memory sync pattern for reliable hook orchestration.

## Trigger

Use this skill when:
- Implementing new Claude Code hook scripts
- Debugging existing hooks (PreToolUse, PostToolUse, UserPromptSubmit, Stop)
- Adding JSON flow-control responses to existing hooks
- Implementing memory sync between hook invocations

## Hook Types

| Hook | Trigger | Control Response |
|------|---------|-----------------|
| `PreToolUse` | Before any tool call | `{decision: "block"\|"ask"\|"allow", reason?}` |
| `PostToolUse` | After any tool call | `{suppress?: true}` (suppress tool result from context) |
| `UserPromptSubmit` | On each user message | `{additionalContext: "..."}` (inject context) |
| `Stop` | Before session ends | `{decision: "block", reason}` (prevent exit) |

## 3-Phase Memory Sync Pattern

All hooks should implement the STATUS→PROGRESS→COMPLETE lifecycle:

### STATUS Phase
On hook invocation, emit status to session manifest:
```javascript
appendEvent(sessionId, { type: 'stop_check', payload: { status: 'checking', ts: Date.now() } });
```

### PROGRESS Phase
During computation, write incremental state (for long-running hooks):
```javascript
appendEvent(sessionId, { type: 'stop_check', payload: { status: 'in_progress', step: 'checking_tasks' } });
```

### COMPLETE Phase
On completion, emit final result:
```javascript
appendEvent(sessionId, { type: 'stop_check', payload: { status: 'complete', result: decision } });
```

## JSON Flow-Control Response Format

Hooks communicate with Claude Code via stdout JSON:
```javascript
// Allow (default if no output)
// No output needed

// Block with reason
console.log(JSON.stringify({ decision: 'block', reason: 'X incomplete tasks remain' }));

// Ask for approval
console.log(JSON.stringify({ decision: 'ask', reason: 'Destructive action detected', reason }));

// Inject context into next prompt
console.log(JSON.stringify({ additionalContext: 'Current session has 3 pending tasks:\n1. ...' }));
```

## Fail-Safe Pattern

All hooks must fail-open:
```javascript
try {
  // hook logic
  console.log(JSON.stringify({ decision: 'allow' }));
} catch (err) {
  // fail-open: don't block Claude Code on hook error
  process.stderr.write('Hook error: ' + err.message + '\n');
  process.exit(0); // exit 0 = allow
}
```

## Canonical Hook Entrypoints

All hooks live under `scripts/hooks/*.js` and delegate to `scripts/*.js` via:
```javascript
const { requireHookSafely } = require('../fail-safe-loader.js');
requireHookSafely('../../scripts/actual-hook-logic.js');
```
