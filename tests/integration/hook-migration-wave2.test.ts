/**
 * Wave 1 Phase 0-D — Hook migration wave 2 (final cut-over to JSONL manifest)
 *
 * Spawns each migrated wave-2 hook/CLI script against an isolated HOME /
 * EVOKORE_HOME and verifies:
 *
 *   - tilldone CLI emits `task_action` events for add/toggle/done/list/clear.
 *   - tilldone Stop hook emits `stop_check` events (blocked + clear).
 *   - tilldone Stop hook triggers `compactIfNeeded` when the JSONL manifest
 *     exceeds the compaction threshold.
 *   - after-edit emits `evidence_captured` with `evidence_type: 'edit-trace'`.
 *   - subagent-tracker emits `subagent_tracked` on Task tool invocations.
 *   - pre-compact emits `pre_compact` on PreCompact triggers.
 *   - Wave-1 hooks no longer call `writeSessionState(sessionId, {`.
 *   - Round-trip: hook sequence → `readManifest` returns the expected folded
 *     state (purpose recorded, lastToolName, stop_check, etc.).
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS_DIR = path.join(REPO_ROOT, 'scripts');

const TILLDONE_SCRIPT = path.join(SCRIPTS_DIR, 'tilldone.js');
const AFTER_EDIT_SCRIPT = path.join(SCRIPTS_DIR, 'after-edit.js');
const SUBAGENT_TRACKER_SCRIPT = path.join(SCRIPTS_DIR, 'subagent-tracker.js');
const PRE_COMPACT_SCRIPT = path.join(SCRIPTS_DIR, 'pre-compact.js');
const PURPOSE_GATE_SCRIPT = path.join(SCRIPTS_DIR, 'purpose-gate.js');
const SESSION_REPLAY_SCRIPT = path.join(SCRIPTS_DIR, 'session-replay.js');
const EVIDENCE_CAPTURE_SCRIPT = path.join(SCRIPTS_DIR, 'evidence-capture.js');

// dist-resident SessionManifest module for the round-trip assertion.
import { readManifest } from '../../dist/SessionManifest.js';

const TEST_HOME = fs.mkdtempSync(
  path.join(os.tmpdir(), 'evokore-hook-migration-wave2-')
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
      USERPROFILE: TEST_HOME,
      EVOKORE_HOME: EVOKORE_DIR,
      // Skip the memory-sync side effect for tilldone Stop tests.
      EVOKORE_AUTO_MEMORY_SYNC: 'false'
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

function runCli(scriptPath: string, args: string[]): HookResult {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    env: {
      ...process.env,
      HOME: TEST_HOME,
      USERPROFILE: TEST_HOME,
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

describe('Wave 1 Phase 0-D — tilldone CLI task_action events', () => {
  it('emits task_action for --add', () => {
    const sessionId = 'sess-wave2-add';
    const result = runCli(TILLDONE_SCRIPT, [
      '--add',
      'ship phase 0-D',
      '--session',
      sessionId
    ]);
    expect(result.status).toBe(0);

    const events = readManifestLines(sessionId);
    const added = events.find(
      (e) =>
        e.type === 'task_action' &&
        (e.payload as Record<string, unknown>).action === 'add'
    );
    expect(added).toBeDefined();
    expect(added!.schemaVersion).toBe(1);
    const payload = added!.payload as Record<string, unknown>;
    expect(payload.taskText).toBe('ship phase 0-D');
    expect(payload.taskIndex).toBe(0);
  });

  it('emits task_action for --toggle and --done', () => {
    const sessionId = 'sess-wave2-toggle';
    runCli(TILLDONE_SCRIPT, [
      '--add',
      'task one',
      '--session',
      sessionId
    ]);
    const toggleResult = runCli(TILLDONE_SCRIPT, [
      '--toggle',
      '1',
      '--session',
      sessionId
    ]);
    expect(toggleResult.status).toBe(0);
    const doneResult = runCli(TILLDONE_SCRIPT, [
      '--done',
      '1',
      '--session',
      sessionId
    ]);
    expect(doneResult.status).toBe(0);

    const events = readManifestLines(sessionId);
    const actions = events
      .filter((e) => e.type === 'task_action')
      .map((e) => (e.payload as Record<string, unknown>).action);
    expect(actions).toEqual(['add', 'toggle', 'done']);
  });

  it('emits task_action for --list and --clear', () => {
    const sessionId = 'sess-wave2-listclear';
    runCli(TILLDONE_SCRIPT, [
      '--add',
      'task a',
      '--session',
      sessionId
    ]);
    runCli(TILLDONE_SCRIPT, ['--list', '--session', sessionId]);
    runCli(TILLDONE_SCRIPT, ['--clear', '--session', sessionId]);

    const actions = readManifestLines(sessionId)
      .filter((e) => e.type === 'task_action')
      .map((e) => (e.payload as Record<string, unknown>).action);
    expect(actions).toEqual(['add', 'list', 'clear']);
  });
});

describe('Wave 1 Phase 0-D — tilldone Stop hook stop_check events', () => {
  it('emits stop_check result=clear when no tasks are open and exits 0', () => {
    const sessionId = 'sess-wave2-stop-clear';
    const result = runHook(TILLDONE_SCRIPT, { session_id: sessionId });
    expect(result.status).toBe(0);

    const stopEvt = readManifestLines(sessionId).find(
      (e) => e.type === 'stop_check'
    );
    expect(stopEvt).toBeDefined();
    const payload = stopEvt!.payload as Record<string, unknown>;
    expect(payload.result).toBe('clear');
    expect(payload.incompleteCount).toBe(0);
  });

  it('emits stop_check result=blocked when incomplete tasks remain and exits 2', () => {
    const sessionId = 'sess-wave2-stop-block';
    runCli(TILLDONE_SCRIPT, [
      '--add',
      'unfinished task',
      '--session',
      sessionId
    ]);
    const result = runHook(TILLDONE_SCRIPT, { session_id: sessionId });
    expect(result.status).toBe(2);

    const blockEvt = readManifestLines(sessionId).find(
      (e) =>
        e.type === 'stop_check' &&
        (e.payload as Record<string, unknown>).result === 'blocked'
    );
    expect(blockEvt).toBeDefined();
    expect((blockEvt!.payload as Record<string, unknown>).incompleteCount).toBe(
      1
    );
  });

  it('compacts the JSONL manifest on Stop when the file exceeds the threshold', () => {
    const sessionId = 'sess-wave2-compact';
    // Prime the manifest with many real events (no tasks added, so Stop is
    // clear — compact path runs without blocking).
    const jsonlPath = manifestPath(sessionId);
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    const padEvent = () =>
      JSON.stringify({
        schemaVersion: 1,
        ts: new Date().toISOString(),
        sessionId,
        type: 'tool_invoked',
        payload: {
          tool: 'Bash',
          summary: 'x'.repeat(500),
          outcome: 'ok'
        }
      }) + '\n';
    // Build up ~1.2 MB so the 1 MB default threshold trips.
    const lineBytes = Buffer.byteLength(padEvent(), 'utf8');
    const linesNeeded = Math.ceil((1_200_000 / lineBytes) as number);
    const stream = fs.openSync(jsonlPath, 'a');
    try {
      for (let i = 0; i < linesNeeded; i++) {
        fs.writeSync(stream, padEvent());
      }
    } finally {
      fs.closeSync(stream);
    }
    const sizeBefore = fs.statSync(jsonlPath).size;
    expect(sizeBefore).toBeGreaterThan(1_000_000);

    const result = runHook(TILLDONE_SCRIPT, { session_id: sessionId });
    expect(result.status).toBe(0);

    const sizeAfter = fs.statSync(jsonlPath).size;
    expect(sizeAfter).toBeLessThan(sizeBefore);

    // After compaction the first surviving line must be the snapshot.
    const lines = readManifestLines(sessionId);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0].type).toBe('__snapshot__');
  });
});

describe('Wave 1 Phase 0-D — after-edit evidence_captured:edit-trace', () => {
  it('emits evidence_captured with evidence_type edit-trace for Edit tool', () => {
    const sessionId = 'sess-wave2-edit';
    const result = runHook(AFTER_EDIT_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Edit',
      tool_input: { file_path: '/tmp/some-file.ts' },
      tool_response: { is_error: false }
    });
    expect(result.status).toBe(0);

    const captured = readManifestLines(sessionId).find(
      (e) =>
        e.type === 'evidence_captured' &&
        (e.payload as Record<string, unknown>).evidence_type === 'edit-trace'
    );
    expect(captured).toBeDefined();
    expect(captured!.schemaVersion).toBe(1);
    const payload = captured!.payload as Record<string, unknown>;
    expect(payload.tool).toBe('Edit');
    expect(payload.summary).toBe('/tmp/some-file.ts');
    expect(typeof payload.evidence_id).toBe('string');
    expect((payload.evidence_id as string).startsWith('E-')).toBe(true);
    expect(payload.passed).toBe(true);
  });

  it('is a no-op for non-watched tools', () => {
    const sessionId = 'sess-wave2-edit-skip';
    const result = runHook(AFTER_EDIT_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_response: { is_error: false }
    });
    expect(result.status).toBe(0);
    expect(readManifestLines(sessionId)).toEqual([]);
  });
});

describe('Wave 1 Phase 0-D — subagent-tracker subagent_tracked events', () => {
  it('emits subagent_tracked for a Task invocation', () => {
    const sessionId = 'sess-wave2-subagent';
    const result = runHook(SUBAGENT_TRACKER_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Task',
      tool_input: {
        description: 'implementer slice',
        prompt: 'do the work',
        subagent_type: 'implementer'
      },
      tool_response: { is_error: false }
    });
    expect(result.status).toBe(0);

    const tracked = readManifestLines(sessionId).find(
      (e) => e.type === 'subagent_tracked'
    );
    expect(tracked).toBeDefined();
    const payload = tracked!.payload as Record<string, unknown>;
    expect(payload.subagent_type).toBe('implementer');
    expect(payload.outcome).toBe('ok');
    expect(typeof payload.subagent_id).toBe('string');
    expect((payload.subagent_id as string).startsWith('SA-')).toBe(true);
  });

  it('is a no-op for non-Task tools', () => {
    const sessionId = 'sess-wave2-subagent-skip';
    const result = runHook(SUBAGENT_TRACKER_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_response: { is_error: false }
    });
    expect(result.status).toBe(0);
    expect(readManifestLines(sessionId)).toEqual([]);
  });
});

describe('Wave 1 Phase 0-D — pre-compact pre_compact events', () => {
  it('emits a pre_compact event with trigger + counts', () => {
    const sessionId = 'sess-wave2-precompact';
    const result = runHook(PRE_COMPACT_SCRIPT, {
      session_id: sessionId,
      trigger: 'auto'
    });
    expect(result.status).toBe(0);

    const evt = readManifestLines(sessionId).find(
      (e) => e.type === 'pre_compact'
    );
    expect(evt).toBeDefined();
    const payload = evt!.payload as Record<string, unknown>;
    expect(payload.trigger).toBe('auto');
    expect(typeof payload.incompleteTasks).toBe('number');
    expect(typeof payload.recentEvidence).toBe('number');
  });
});

describe('Wave 1 Phase 0-D — wave-1 hook cleanup', () => {
  it('purpose-gate.js no longer calls writeSessionState', () => {
    const source = fs.readFileSync(PURPOSE_GATE_SCRIPT, 'utf8');
    expect(source).not.toContain('writeSessionState(sessionId, {');
  });

  it('session-replay.js no longer calls writeSessionState', () => {
    const source = fs.readFileSync(SESSION_REPLAY_SCRIPT, 'utf8');
    expect(source).not.toContain('writeSessionState(sessionId, {');
  });

  it('evidence-capture.js no longer calls writeSessionState', () => {
    const source = fs.readFileSync(EVIDENCE_CAPTURE_SCRIPT, 'utf8');
    expect(source).not.toContain('writeSessionState(sessionId, {');
  });
});

describe('Wave 1 Phase 0-D — end-to-end round-trip via readManifest', () => {
  it('folds a wave1 + wave2 hook sequence into the expected state', async () => {
    const sessionId = 'sess-wave2-roundtrip';

    // 1. First prompt initializes the session.
    runHook(PURPOSE_GATE_SCRIPT, {
      session_id: sessionId,
      user_message: 'init'
    });
    // 2. Second prompt records the purpose.
    const purpose = 'run the full phase 0-D migration round trip';
    runHook(PURPOSE_GATE_SCRIPT, {
      session_id: sessionId,
      user_message: purpose
    });
    // 3. A tool invocation is replayed.
    runHook(SESSION_REPLAY_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      tool_response: { is_error: false, content: [{ text: 'ok' }] }
    });
    // 4. Test-run evidence is captured.
    runHook(EVIDENCE_CAPTURE_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      tool_response: { is_error: false }
    });
    // 5. tilldone CLI adds a task.
    runCli(TILLDONE_SCRIPT, [
      '--add',
      'wrap up 0-D',
      '--session',
      sessionId
    ]);
    // 6. Complete it so the Stop hook is clear.
    runCli(TILLDONE_SCRIPT, ['--done', '1', '--session', sessionId]);
    // 7. Stop hook runs.
    runHook(TILLDONE_SCRIPT, { session_id: sessionId });

    // Inject EVOKORE_HOME for the readManifest call in the test process.
    const prevEvokoreHome = process.env.EVOKORE_HOME;
    process.env.EVOKORE_HOME = EVOKORE_DIR;
    let state;
    try {
      state = await readManifest(sessionId);
    } finally {
      if (prevEvokoreHome === undefined) delete process.env.EVOKORE_HOME;
      else process.env.EVOKORE_HOME = prevEvokoreHome;
    }
    expect(state).not.toBeNull();
    expect(state!.purpose).toBe(purpose);
    expect(state!.status).toBe('active');
    expect(state!.lastToolName).toBe('Bash');
    expect(state!.lastEvidenceType).toBe('test-result');
    expect(state!.lastTaskAction).toBe('done');
    expect(state!.lastStopCheckResult).toBe('clear');
  });
});
