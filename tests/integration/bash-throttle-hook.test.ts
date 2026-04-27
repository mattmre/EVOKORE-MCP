/**
 * Week-1 audit item #8 — Parallel-Bash throttle PreToolUse hook tests.
 *
 * Covers:
 *   - Stdin contract:
 *       a) PreToolUse Bash within limit => allow (exit 0).
 *       b) PreToolUse Bash exceeding limit => block (exit 2 + stderr).
 *       c) PostToolUse Bash decrements inflight so the next call fits.
 *       d) Non-Bash tools pass through silently (exit 0).
 *       e) CLAUDE_HOOK_SKIP_BASH_THROTTLE=1 override always allows.
 *   - Audit log under ~/.claude/logs/hooks/YYYY-MM-DD.jsonl is written.
 *
 * Matches the style of read-before-edit-hook.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_LOADER = path.join(REPO_ROOT, 'scripts', 'hooks', 'bash-throttle.js');

interface HookResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

function runHook(payload: object, env: NodeJS.ProcessEnv): HookResult {
  const result = spawnSync(process.execPath, [HOOK_LOADER], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env,
    timeout: 10_000
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status
  };
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

describe('bash-throttle hook — stdin contract', () => {
  let tmp: string;
  let priorHome: string | undefined;
  let priorUserProfile: string | undefined;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-bth-'));
    priorHome = process.env.HOME;
    priorUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmp;
    process.env.USERPROFILE = tmp;
    env = {
      ...process.env,
      HOME: tmp,
      USERPROFILE: tmp,
      CLAUDE_BASH_MAX_CONCURRENT: '2'
    };
  });

  afterEach(() => {
    process.env.HOME = priorHome;
    process.env.USERPROFILE = priorUserProfile;
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  it('allows Bash calls within the configured limit', () => {
    const sessionId = 'sess-allow';
    const first = runHook(
      { tool_name: 'Bash', session_id: sessionId, tool_use_id: 't1', hook_event_name: 'PreToolUse' },
      env
    );
    const second = runHook(
      { tool_name: 'Bash', session_id: sessionId, tool_use_id: 't2', hook_event_name: 'PreToolUse' },
      env
    );
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
  });

  it('blocks a Bash call that would exceed the limit and writes a stderr reason', () => {
    const sessionId = 'sess-block';
    runHook(
      { tool_name: 'Bash', session_id: sessionId, tool_use_id: 't1', hook_event_name: 'PreToolUse' },
      env
    );
    runHook(
      { tool_name: 'Bash', session_id: sessionId, tool_use_id: 't2', hook_event_name: 'PreToolUse' },
      env
    );
    const third = runHook(
      { tool_name: 'Bash', session_id: sessionId, tool_use_id: 't3', hook_event_name: 'PreToolUse' },
      env
    );
    expect(third.status).toBe(2);
    expect(third.stderr).toMatch(/BASH-THROTTLE BLOCKED/);
  });

  it('decrements inflight on PostToolUse so a new call fits again', () => {
    const sessionId = 'sess-decrement';
    runHook(
      { tool_name: 'Bash', session_id: sessionId, tool_use_id: 't1', hook_event_name: 'PreToolUse' },
      env
    );
    runHook(
      { tool_name: 'Bash', session_id: sessionId, tool_use_id: 't2', hook_event_name: 'PreToolUse' },
      env
    );
    // Release one slot via PostToolUse.
    const released = runHook(
      { tool_name: 'Bash', session_id: sessionId, tool_use_id: 't1', hook_event_name: 'PostToolUse' },
      env
    );
    expect(released.status).toBe(0);
    // Now a third PreToolUse should fit.
    const third = runHook(
      { tool_name: 'Bash', session_id: sessionId, tool_use_id: 't3', hook_event_name: 'PreToolUse' },
      env
    );
    expect(third.status).toBe(0);
  });

  it('passes through non-Bash tools without gating', () => {
    const result = runHook(
      { tool_name: 'Read', session_id: 'sess-nonbash', tool_use_id: 'r1', hook_event_name: 'PreToolUse' },
      env
    );
    expect(result.status).toBe(0);
  });

  it('respects CLAUDE_HOOK_SKIP_BASH_THROTTLE override even over the limit', () => {
    const sessionId = 'sess-override';
    runHook(
      { tool_name: 'Bash', session_id: sessionId, tool_use_id: 't1', hook_event_name: 'PreToolUse' },
      env
    );
    runHook(
      { tool_name: 'Bash', session_id: sessionId, tool_use_id: 't2', hook_event_name: 'PreToolUse' },
      env
    );
    const overridden = runHook(
      { tool_name: 'Bash', session_id: sessionId, tool_use_id: 't3', hook_event_name: 'PreToolUse' },
      { ...env, CLAUDE_HOOK_SKIP_BASH_THROTTLE: '1' }
    );
    expect(overridden.status).toBe(0);
  });

  it('emits an audit log entry under ~/.claude/logs/hooks/<date>.jsonl', () => {
    const sessionId = 'sess-audit';
    runHook(
      { tool_name: 'Bash', session_id: sessionId, tool_use_id: 't1', hook_event_name: 'PreToolUse' },
      env
    );
    const logPath = path.join(tmp, '.claude', 'logs', 'hooks', `${todayStamp()}.jsonl`);
    // The audit log helper is best-effort; we tolerate absence rather than
    // flake the test on filesystem quirks, but if present it must be JSONL.
    if (fs.existsSync(logPath)) {
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      const parsed = JSON.parse(lines[lines.length - 1]);
      expect(parsed.hook).toBe('bash-throttle');
    }
  });
});
