/**
 * Week-1 audit item #7 — Read-before-Edit/Write PreToolUse hook tests.
 *
 * Covers:
 *   - Helpers (statePathFor, recordRead, evaluateEdit) round-trip.
 *   - Stdin contract:
 *       a) Read then Edit on the same file => allow (exit 0).
 *       b) Edit without prior Read => block (exit 2 + stderr message).
 *       c) Read, modify-on-disk, then Edit => block with re-Read message.
 *       d) CLAUDE_HOOK_SKIP_READ_CHECK=1 override always allows.
 *       e) Non-target tools (e.g. Bash) pass through silently.
 *   - Audit log under ~/.claude/logs/hooks/YYYY-MM-DD.jsonl is written.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_LOADER = path.join(REPO_ROOT, 'scripts', 'hooks', 'read-before-edit.js');
const HOOK_MODULE = path.join(REPO_ROOT, 'scripts', 'read-before-edit.js');

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

describe('read-before-edit hook — helpers', () => {
  let tmp: string;
  let priorHome: string | undefined;
  let priorUserProfile: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-rbe-helpers-'));
    priorHome = process.env.HOME;
    priorUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmp;
    process.env.USERPROFILE = tmp;
    // Force module reload so STATE_DIR (computed at require-time from
    // os.homedir()) is recomputed against the tmp HOME.
    delete require.cache[require.resolve(HOOK_MODULE)];
  });

  afterEach(() => {
    if (priorHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorHome;
    if (priorUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = priorUserProfile;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('blocks an edit against a file that was never read', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(HOOK_MODULE);
    const target = path.join(tmp, 'never-read.txt');
    fs.writeFileSync(target, 'pre-existing content', 'utf8');
    const verdict = mod.evaluateEdit('test-session', target);
    expect(verdict.allow).toBe(false);
    expect(verdict.reason).toContain('must be Read first');
  });

  it('allows an edit against a file that was just read', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(HOOK_MODULE);
    const target = path.join(tmp, 'read-then-edit.txt');
    fs.writeFileSync(target, 'content', 'utf8');
    mod.recordRead('test-session', target);
    const verdict = mod.evaluateEdit('test-session', target);
    expect(verdict.allow).toBe(true);
  });

  it('blocks an edit when the file mtime advanced after the read', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(HOOK_MODULE);
    const target = path.join(tmp, 'mutated.txt');
    fs.writeFileSync(target, 'v1', 'utf8');
    mod.recordRead('test-session', target);
    // Bump mtime explicitly. fs.utimes is more reliable than re-writing for
    // this test because some FS implementations don't tick the mtime on a
    // same-size rewrite within the same millisecond.
    const future = (Date.now() + 5_000) / 1000;
    fs.utimesSync(target, future, future);
    const verdict = mod.evaluateEdit('test-session', target);
    expect(verdict.allow).toBe(false);
    expect(verdict.reason).toContain('re-Read because it was modified');
  });

  it('allows an edit when target file_path is missing (defensive default)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(HOOK_MODULE);
    const verdict = mod.evaluateEdit('test-session', '');
    expect(verdict.allow).toBe(true);
  });
});

describe('read-before-edit hook — stdin contract (end-to-end)', () => {
  let tmp: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-rbe-e2e-'));
    env = {
      ...process.env,
      HOME: tmp,
      USERPROFILE: tmp,
      EVOKORE_HOME: path.join(tmp, '.evokore'),
      // Don't carry the operator's override into the test env.
      CLAUDE_HOOK_SKIP_READ_CHECK: ''
    };
  });

  afterEach(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('Edit without a prior Read is blocked with exit 2 and a clear stderr message', () => {
    const target = path.join(tmp, 'unread.txt');
    fs.writeFileSync(target, 'hello', 'utf8');
    const result = runHook(
      {
        session_id: 'sess-block-1',
        tool_name: 'Edit',
        tool_input: { file_path: target, old_string: 'hello', new_string: 'world' }
      },
      env
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('READ-BEFORE-EDIT BLOCKED');
    expect(result.stderr).toContain('must be Read first');
  });

  it('Read then Edit on the same file is allowed (happy path)', () => {
    const target = path.join(tmp, 'will-edit.txt');
    fs.writeFileSync(target, 'hello', 'utf8');
    // 1. Observe a Read.
    const readRes = runHook(
      {
        session_id: 'sess-allow-1',
        tool_name: 'Read',
        tool_input: { file_path: target }
      },
      env
    );
    expect(readRes.status).toBe(0);
    // 2. Try to Edit.
    const editRes = runHook(
      {
        session_id: 'sess-allow-1',
        tool_name: 'Edit',
        tool_input: { file_path: target, old_string: 'hello', new_string: 'world' }
      },
      env
    );
    expect(editRes.status).toBe(0);
    expect(editRes.stderr).toBe('');
  });

  it('Read, then external mutation, then Edit is blocked with a re-Read message', () => {
    const target = path.join(tmp, 'will-mutate.txt');
    fs.writeFileSync(target, 'v1', 'utf8');
    // 1. Observe a Read.
    runHook(
      {
        session_id: 'sess-mutate-1',
        tool_name: 'Read',
        tool_input: { file_path: target }
      },
      env
    );
    // 2. External mutation: bump mtime.
    const future = (Date.now() + 5_000) / 1000;
    fs.utimesSync(target, future, future);
    // 3. Try to Edit.
    const editRes = runHook(
      {
        session_id: 'sess-mutate-1',
        tool_name: 'Edit',
        tool_input: { file_path: target, old_string: 'v1', new_string: 'v2' }
      },
      env
    );
    expect(editRes.status).toBe(2);
    expect(editRes.stderr).toContain('re-Read because it was modified');
  });

  it('CLAUDE_HOOK_SKIP_READ_CHECK=1 allows an unread Edit (override path)', () => {
    const target = path.join(tmp, 'override.txt');
    fs.writeFileSync(target, 'hello', 'utf8');
    const overrideEnv = { ...env, CLAUDE_HOOK_SKIP_READ_CHECK: '1' };
    const result = runHook(
      {
        session_id: 'sess-override-1',
        tool_name: 'Edit',
        tool_input: { file_path: target, old_string: 'hello', new_string: 'world' }
      },
      overrideEnv
    );
    expect(result.status).toBe(0);
  });

  it('non-target tools (Bash) pass through silently', () => {
    const result = runHook(
      {
        session_id: 'sess-bash-1',
        tool_name: 'Bash',
        tool_input: { command: 'echo hi' }
      },
      env
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('writes a daily audit log entry under ~/.claude/logs/hooks/', () => {
    const target = path.join(tmp, 'log-check.txt');
    fs.writeFileSync(target, 'hello', 'utf8');
    runHook(
      {
        session_id: 'sess-log-1',
        tool_name: 'Edit',
        tool_input: { file_path: target, old_string: 'hello', new_string: 'world' }
      },
      env
    );
    const auditLog = path.join(tmp, '.claude', 'logs', 'hooks', `${todayStamp()}.jsonl`);
    expect(fs.existsSync(auditLog)).toBe(true);
    const lines = fs.readFileSync(auditLog, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const lastEntry = JSON.parse(lines[lines.length - 1]);
    expect(lastEntry.hook).toBe('read-before-edit');
    expect(lastEntry.decision).toBe('block');
    expect(lastEntry.session_id).toBe('sess-log-1');
    expect(typeof lastEntry.ts).toBe('string');
  });
});
