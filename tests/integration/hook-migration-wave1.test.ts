/**
 * Wave 1 Phase 0-C — Hook migration wave 1 (dual-write verification)
 *
 * Spawns each of the three migrated hook scripts as a child process against
 * an isolated HOME / EVOKORE_HOME, feeds a realistic stdin payload, and
 * verifies:
 *   1. The legacy `{sessionId}.json` snapshot is still written (no reader
 *      regression during the migration window).
 *   2. The new append-only `{sessionId}.jsonl` manifest contains the
 *      expected event with schemaVersion=1 and the documented payload
 *      fields.
 *
 * Hooks under test:
 *   - scripts/purpose-gate.js   → session_initialized, purpose_recorded,
 *                                 purpose_reminder
 *   - scripts/session-replay.js → tool_invoked
 *   - scripts/evidence-capture.js → evidence_captured
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS_DIR = path.join(REPO_ROOT, 'scripts');

const PURPOSE_GATE_SCRIPT = path.join(SCRIPTS_DIR, 'purpose-gate.js');
const SESSION_REPLAY_SCRIPT = path.join(SCRIPTS_DIR, 'session-replay.js');
const EVIDENCE_CAPTURE_SCRIPT = path.join(SCRIPTS_DIR, 'evidence-capture.js');

// Per-test-run temporary HOME so neither the legacy JSON writer (os.homedir)
// nor the new JSONL writer (EVOKORE_HOME) leaks into the operator's real
// ~/.evokore.
const TEST_HOME = fs.mkdtempSync(
  path.join(os.tmpdir(), 'evokore-hook-migration-wave1-')
);
const EVOKORE_DIR = path.join(TEST_HOME, '.evokore');
const SESSIONS_DIR = path.join(EVOKORE_DIR, 'sessions');

interface HookResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

function runHook(
  scriptPath: string,
  payload: Record<string, unknown>
): HookResult {
  const result = spawnSync(process.execPath, [scriptPath], {
    input: JSON.stringify(payload),
    env: {
      ...process.env,
      HOME: TEST_HOME,
      USERPROFILE: TEST_HOME, // Windows
      EVOKORE_HOME: EVOKORE_DIR
    },
    encoding: 'utf8',
    timeout: 15000
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status
  };
}

function sessionStatePath(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId + '.json');
}

function manifestPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId + '.jsonl');
}

function readManifestLines(
  sessionId: string
): Array<Record<string, unknown>> {
  const p = manifestPath(sessionId);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8').trim();
  if (!raw) return [];
  return raw.split(/\r?\n/).map((line) => JSON.parse(line));
}

function readState(sessionId: string): Record<string, unknown> | null {
  const p = sessionStatePath(sessionId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

beforeEach(() => {
  if (fs.existsSync(SESSIONS_DIR)) {
    for (const name of fs.readdirSync(SESSIONS_DIR)) {
      try {
        fs.unlinkSync(path.join(SESSIONS_DIR, name));
      } catch {
        // best effort
      }
    }
  }
});

afterAll(() => {
  try {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

describe('Wave 1 Phase 0-C — purpose-gate dual-write', () => {
  it('writes session_initialized JSONL event + legacy JSON on first prompt', () => {
    const sessionId = 'sess-wave1-init';
    const result = runHook(PURPOSE_GATE_SCRIPT, {
      session_id: sessionId,
      user_message: 'hello'
    });
    expect(result.status).toBe(0);

    const state = readState(sessionId);
    expect(state).not.toBeNull();
    expect(state!.status).toBe('awaiting-purpose');

    const events = readManifestLines(sessionId);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const initEvt = events.find((e) => e.type === 'session_initialized');
    expect(initEvt).toBeDefined();
    expect(initEvt!.schemaVersion).toBe(1);
    expect(initEvt!.sessionId).toBe(sessionId);
    expect(typeof initEvt!.ts).toBe('string');
    const payload = initEvt!.payload as Record<string, unknown>;
    expect(typeof payload.workspaceRoot).toBe('string');
    expect(typeof payload.repoName).toBe('string');
  });

  it('writes purpose_recorded JSONL event when the user supplies a purpose', () => {
    const sessionId = 'sess-wave1-purpose';
    // First prompt initializes state with purpose=null.
    runHook(PURPOSE_GATE_SCRIPT, {
      session_id: sessionId,
      user_message: 'init'
    });
    // Second prompt supplies the purpose.
    const purpose = 'implement Wave 1 Phase 0-C hook migration';
    const result = runHook(PURPOSE_GATE_SCRIPT, {
      session_id: sessionId,
      user_message: purpose
    });
    expect(result.status).toBe(0);

    const state = readState(sessionId);
    expect(state).not.toBeNull();
    expect(state!.purpose).toBe(purpose);

    const events = readManifestLines(sessionId);
    const recorded = events.find((e) => e.type === 'purpose_recorded');
    expect(recorded).toBeDefined();
    expect(recorded!.schemaVersion).toBe(1);
    const payload = recorded!.payload as Record<string, unknown>;
    expect(payload.purpose).toBe(purpose);
    expect(typeof payload.mode).toBe('string');
    expect(typeof payload.purposeSetAt).toBe('string');
    expect(typeof payload.modeSetAt).toBe('string');
  });

  it('writes purpose_reminder JSONL event on subsequent prompts', () => {
    const sessionId = 'sess-wave1-reminder';
    runHook(PURPOSE_GATE_SCRIPT, {
      session_id: sessionId,
      user_message: 'init'
    });
    runHook(PURPOSE_GATE_SCRIPT, {
      session_id: sessionId,
      user_message: 'implement hook migration wave 1 correctly'
    });
    const result = runHook(PURPOSE_GATE_SCRIPT, {
      session_id: sessionId,
      user_message: 'what next?'
    });
    expect(result.status).toBe(0);

    const events = readManifestLines(sessionId);
    const reminders = events.filter((e) => e.type === 'purpose_reminder');
    expect(reminders.length).toBeGreaterThanOrEqual(1);
    const reminder = reminders[reminders.length - 1];
    expect(reminder.schemaVersion).toBe(1);
    const payload = reminder.payload as Record<string, unknown>;
    expect(typeof payload.lastPromptAt).toBe('string');
  });
});

describe('Wave 1 Phase 0-C — session-replay dual-write', () => {
  it('writes tool_invoked JSONL event alongside legacy JSON', () => {
    const sessionId = 'sess-wave1-replay';
    const result = runHook(SESSION_REPLAY_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
      tool_response: { is_error: false, content: [{ text: 'hello' }] }
    });
    expect(result.status).toBe(0);

    // Legacy snapshot still written.
    const state = readState(sessionId);
    expect(state).not.toBeNull();
    expect(state!.lastToolName).toBe('Bash');

    // New JSONL event appended.
    const events = readManifestLines(sessionId);
    const invoked = events.find((e) => e.type === 'tool_invoked');
    expect(invoked).toBeDefined();
    expect(invoked!.schemaVersion).toBe(1);
    expect(invoked!.sessionId).toBe(sessionId);
    const payload = invoked!.payload as Record<string, unknown>;
    expect(payload.tool).toBe('Bash');
    expect(payload.outcome).toBe('ok');
    expect(typeof payload.summary).toBe('string');
  });

  it('marks outcome=error when tool_response.is_error is true', () => {
    const sessionId = 'sess-wave1-replay-err';
    const result = runHook(SESSION_REPLAY_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'false' },
      tool_response: { is_error: true, content: [{ text: 'boom' }] }
    });
    expect(result.status).toBe(0);

    const invoked = readManifestLines(sessionId).find(
      (e) => e.type === 'tool_invoked'
    );
    expect(invoked).toBeDefined();
    const payload = invoked!.payload as Record<string, unknown>;
    expect(payload.outcome).toBe('error');
  });
});

describe('Wave 1 Phase 0-C — evidence-capture dual-write', () => {
  it('writes evidence_captured JSONL event for a test-run Bash command', () => {
    const sessionId = 'sess-wave1-evidence-test';
    const result = runHook(EVIDENCE_CAPTURE_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      tool_response: { is_error: false }
    });
    expect(result.status).toBe(0);

    const state = readState(sessionId);
    expect(state).not.toBeNull();
    expect(state!.lastEvidenceType).toBe('test-result');

    const events = readManifestLines(sessionId);
    const captured = events.find((e) => e.type === 'evidence_captured');
    expect(captured).toBeDefined();
    expect(captured!.schemaVersion).toBe(1);
    const payload = captured!.payload as Record<string, unknown>;
    expect(payload.evidence_type).toBe('test-result');
    expect(payload.tool).toBe('Bash');
    expect(typeof payload.evidence_id).toBe('string');
    expect((payload.evidence_id as string).startsWith('E-')).toBe(true);
    expect(payload.passed).toBe(true);
  });

  it('writes evidence_captured JSONL event for a Write/Edit file-change', () => {
    const sessionId = 'sess-wave1-evidence-file';
    const result = runHook(EVIDENCE_CAPTURE_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/some-file.ts' },
      tool_response: { is_error: false }
    });
    expect(result.status).toBe(0);

    const captured = readManifestLines(sessionId).find(
      (e) => e.type === 'evidence_captured'
    );
    expect(captured).toBeDefined();
    const payload = captured!.payload as Record<string, unknown>;
    expect(payload.evidence_type).toBe('file-change');
    expect(payload.tool).toBe('Write');
    expect(typeof payload.summary).toBe('string');
  });

  it('writes no JSONL event when the operation is not classified', () => {
    const sessionId = 'sess-wave1-evidence-skip';
    const result = runHook(EVIDENCE_CAPTURE_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
      tool_response: { is_error: false }
    });
    expect(result.status).toBe(0);
    expect(readManifestLines(sessionId)).toEqual([]);
  });
});

describe('Wave 1 Phase 0-C — structural guards', () => {
  it('purpose-gate.js requires ../dist/SessionManifest.js and calls appendEvent', () => {
    const source = fs.readFileSync(PURPOSE_GATE_SCRIPT, 'utf8');
    expect(source).toContain("require('../dist/SessionManifest.js')");
    expect(source).toContain("type: 'session_initialized'");
    expect(source).toContain("type: 'purpose_recorded'");
    expect(source).toContain("type: 'purpose_reminder'");
    // writeSessionState must remain for backward-compat reads during the
    // 0-C/0-D migration window.
    expect(source).toContain('writeSessionState(sessionId, {');
  });

  it('session-replay.js requires ../dist/SessionManifest.js and emits tool_invoked', () => {
    const source = fs.readFileSync(SESSION_REPLAY_SCRIPT, 'utf8');
    expect(source).toContain("require('../dist/SessionManifest.js')");
    expect(source).toContain("type: 'tool_invoked'");
    expect(source).toContain('writeSessionState(sessionId, {');
  });

  it('evidence-capture.js requires ../dist/SessionManifest.js and emits evidence_captured', () => {
    const source = fs.readFileSync(EVIDENCE_CAPTURE_SCRIPT, 'utf8');
    expect(source).toContain("require('../dist/SessionManifest.js')");
    expect(source).toContain("type: 'evidence_captured'");
    expect(source).toContain('writeSessionState(sessionId, {');
  });
});
