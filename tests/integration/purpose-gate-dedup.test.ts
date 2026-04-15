/**
 * Wave 2 Phase 2-A — purpose-gate content-hash dedup tests.
 *
 * Covers:
 *  - computeContextHash is stable and short (16 chars).
 *  - readLastPurposeHash returns null when no hash file exists.
 *  - writeLastPurposeHash + readLastPurposeHash round-trip.
 *  - Full stdin hook path: first subsequent-prompt injection stores a hash,
 *    a second prompt with identical state elides the large SOUL/mode body,
 *    and a third prompt with a different purpose re-injects.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PURPOSE_GATE = path.join(REPO_ROOT, 'scripts', 'purpose-gate.js');

type PurposeGateExports = {
  computeContextHash: (content: string) => string;
  purposeHashPath: (sessionId: string) => string;
  readLastPurposeHash: (sessionId: string) => string | null;
  writeLastPurposeHash: (sessionId: string, hash: string) => void;
};

function loadPurposeGate(): PurposeGateExports {
  // Clear module cache for purpose-gate AND its session-continuity dependency
  // so that `SESSIONS_DIR` (a module-level constant) picks up the USERPROFILE /
  // HOME overrides we set in beforeEach.
  const continuityPath = path.join(REPO_ROOT, 'scripts', 'session-continuity.js');
  delete require.cache[require.resolve(PURPOSE_GATE)];
  delete require.cache[require.resolve(continuityPath)];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(PURPOSE_GATE) as PurposeGateExports;
}

describe('purpose-gate dedup helpers', () => {
  let tmp: string;
  let priorHome: string | undefined;
  let priorUserProfile: string | undefined;
  let priorPosixHome: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-pg-dedup-'));
    priorHome = process.env.EVOKORE_HOME;
    priorUserProfile = process.env.USERPROFILE;
    priorPosixHome = process.env.HOME;
    // `scripts/session-continuity.js` computes SESSIONS_DIR from
    // `os.homedir()` at require time; override the homedir envs to redirect.
    process.env.EVOKORE_HOME = path.join(tmp, '.evokore');
    process.env.USERPROFILE = tmp;
    process.env.HOME = tmp;
    fs.mkdirSync(path.join(tmp, '.evokore', 'sessions'), { recursive: true });
  });

  afterEach(() => {
    if (priorHome === undefined) delete process.env.EVOKORE_HOME;
    else process.env.EVOKORE_HOME = priorHome;
    if (priorUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = priorUserProfile;
    if (priorPosixHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorPosixHome;
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('computeContextHash produces a stable 16-char hash', () => {
    const api = loadPurposeGate();
    const h1 = api.computeContextHash('hello world');
    const h2 = api.computeContextHash('hello world');
    const h3 = api.computeContextHash('hello world!');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toHaveLength(16);
    expect(/^[0-9a-f]{16}$/.test(h1)).toBe(true);
  });

  it('readLastPurposeHash returns null before any hash file exists', () => {
    const api = loadPurposeGate();
    expect(api.readLastPurposeHash('session-a')).toBeNull();
  });

  it('writeLastPurposeHash + readLastPurposeHash round-trip', () => {
    const api = loadPurposeGate();
    api.writeLastPurposeHash('session-a', 'deadbeefcafebabe');
    expect(api.readLastPurposeHash('session-a')).toBe('deadbeefcafebabe');
  });

  it('sanitizes session ids so path-traversal chars cannot escape the sessions dir', () => {
    const api = loadPurposeGate();
    const p = api.purposeHashPath('../../evil/path');
    const resolved = path.resolve(p);
    // Must still live under the sessions dir, with separators replaced by `_`.
    const sessionsDir = path.resolve(path.join(tmp, '.evokore', 'sessions'));
    expect(resolved.startsWith(sessionsDir)).toBe(true);
    // All non-[A-Za-z0-9_-] characters must be replaced by `_` — no real
    // `/` or `\` survive in the basename.
    const base = path.basename(p);
    expect(base).not.toContain('/');
    expect(base).not.toContain('\\');
    expect(base.endsWith('-purpose-hash.txt')).toBe(true);
  });
});

/**
 * End-to-end hook behavior: invoke `node scripts/hooks/purpose-gate.js` via
 * its fail-safe wrapper with JSON on stdin, inspect the stdout contract and
 * the hash file side-effect across three prompts.
 */
function runHook(input: object, env: NodeJS.ProcessEnv): {
  stdout: string;
  stderr: string;
  status: number | null;
} {
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'scripts', 'hooks', 'purpose-gate.js')],
    {
      input: JSON.stringify(input),
      encoding: 'utf8',
      env,
      timeout: 10_000,
    }
  );
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
}

function writeLegacyState(sessionsDir: string, sessionId: string, state: Record<string, unknown>): void {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  fs.writeFileSync(
    path.join(sessionsDir, `${safeId}.json`),
    JSON.stringify(state, null, 2),
    'utf8'
  );
}

describe('purpose-gate stdin hook — subsequent-prompt dedup', () => {
  let tmp: string;
  let sessionsDir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-pg-hook-'));
    // `scripts/session-continuity.js` resolves `SESSIONS_DIR` from
    // `os.homedir()`, which on Windows reads `USERPROFILE` and on POSIX
    // falls back to `HOME`. Set BOTH so the hook redirects its session
    // writes into our temp directory regardless of platform.
    const fakeHome = tmp;
    sessionsDir = path.join(fakeHome, '.evokore', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    env = {
      ...process.env,
      // SessionManifest (TS) honors EVOKORE_HOME directly.
      EVOKORE_HOME: path.join(fakeHome, '.evokore'),
      // session-continuity.js derives paths from os.homedir().
      USERPROFILE: fakeHome,
      HOME: fakeHome,
      // Disable the status hook so stdout is fully deterministic.
      EVOKORE_STATUS_HOOK: 'false',
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('first subsequent-prompt injection stores hash and returns full SOUL/mode payload', () => {
    const sessionId = 'test-dedup-1';
    writeLegacyState(sessionsDir, sessionId, {
      sessionId,
      purpose: 'fix login auth bug in session handler',
      mode: 'debug',
      status: 'active',
    });

    const { stdout, status } = runHook(
      { session_id: sessionId, user_message: 'continue the work' },
      env
    );
    expect(status).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
    const parsed = JSON.parse(stdout);
    expect(typeof parsed.additionalContext).toBe('string');
    expect(parsed.additionalContext).toContain('Session purpose');
    // First injection should contain the SOUL/mode payload markers.
    expect(
      parsed.additionalContext.includes('[SESSION MODE:') ||
        parsed.additionalContext.includes('[EVOKORE VALUES HIERARCHY]')
    ).toBe(true);

    // Hash file should now exist.
    const hashFile = path.join(sessionsDir, `${sessionId}-purpose-hash.txt`);
    expect(fs.existsSync(hashFile)).toBe(true);
    const storedHash = fs.readFileSync(hashFile, 'utf8').trim();
    expect(storedHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('second injection with unchanged purpose/mode is deduped to a compact marker', () => {
    const sessionId = 'test-dedup-2';
    writeLegacyState(sessionsDir, sessionId, {
      sessionId,
      purpose: 'research ECC phase 2 dedup strategy for token spend',
      mode: 'research',
      status: 'active',
    });

    // Prime the hash.
    const first = runHook(
      { session_id: sessionId, user_message: 'prompt one' },
      env
    );
    expect(first.status).toBe(0);
    const firstParsed = JSON.parse(first.stdout);
    const firstLen = firstParsed.additionalContext.length;

    // Second prompt — same state, should be deduped.
    const second = runHook(
      { session_id: sessionId, user_message: 'prompt two' },
      env
    );
    expect(second.status).toBe(0);
    const secondParsed = JSON.parse(second.stdout);
    expect(typeof secondParsed.additionalContext).toBe('string');
    expect(secondParsed.additionalContext).toContain('Purpose unchanged');
    // Deduped payload should be materially shorter than first injection.
    expect(secondParsed.additionalContext.length).toBeLessThan(firstLen);
    // And must not contain the large SOUL/mode blocks.
    expect(secondParsed.additionalContext).not.toContain('[SESSION MODE:');
    expect(secondParsed.additionalContext).not.toContain('[EVOKORE VALUES HIERARCHY]');
  });

  it('hash mismatch (e.g., purpose changed) re-injects the full payload and updates the hash', () => {
    const sessionId = 'test-dedup-3';
    writeLegacyState(sessionsDir, sessionId, {
      sessionId,
      purpose: 'original purpose for token dedup tests',
      mode: 'dev',
      status: 'active',
    });

    const first = runHook({ session_id: sessionId, user_message: 'one' }, env);
    expect(first.status).toBe(0);
    const hashFile = path.join(sessionsDir, `${sessionId}-purpose-hash.txt`);
    const hashA = fs.readFileSync(hashFile, 'utf8').trim();

    // Mutate the legacy state to simulate a new purpose (and therefore new
    // dedup basis). We preserve the JSON state and let purpose-gate pick up
    // the change on the next prompt.
    writeLegacyState(sessionsDir, sessionId, {
      sessionId,
      purpose: 'pivoted to a security audit of the RBAC gates',
      mode: 'security-audit',
      status: 'active',
    });

    const second = runHook({ session_id: sessionId, user_message: 'two' }, env);
    expect(second.status).toBe(0);
    const secondParsed = JSON.parse(second.stdout);
    // New payload — not the compact "Purpose unchanged" marker.
    expect(secondParsed.additionalContext).not.toContain('Purpose unchanged');
    expect(secondParsed.additionalContext).toContain('pivoted to a security audit');

    const hashB = fs.readFileSync(hashFile, 'utf8').trim();
    expect(hashB).not.toBe(hashA);
  });
});
