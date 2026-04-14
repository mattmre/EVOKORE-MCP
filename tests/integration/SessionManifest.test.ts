import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  appendEvent,
  compactIfNeeded,
  getLegacySnapshotPath,
  getManifestPath,
  readManifest,
} from '../../src/SessionManifest';
import { SCHEMA_VERSION } from '../../src/SessionManifest.schema';

/**
 * Each test gets its own isolated EVOKORE_HOME under a temp dir so appends,
 * reads, and compactions cannot leak into the operator's real ~/.evokore.
 */

let originalEvokoreHome: string | undefined;
let tempHome: string;

beforeEach(() => {
  originalEvokoreHome = process.env.EVOKORE_HOME;
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'session-manifest-test-'));
  process.env.EVOKORE_HOME = tempHome;
});

afterEach(() => {
  if (originalEvokoreHome === undefined) {
    delete process.env.EVOKORE_HOME;
  } else {
    process.env.EVOKORE_HOME = originalEvokoreHome;
  }
  try {
    fs.rmSync(tempHome, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

function readLines(filePath: string): string[] {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
}

describe('getManifestPath / getLegacySnapshotPath', () => {
  it('uses EVOKORE_HOME/sessions/{id}.jsonl', () => {
    const p = getManifestPath('abc123');
    expect(p).toBe(path.join(tempHome, 'sessions', 'abc123.jsonl'));
  });

  it('legacy snapshot path uses .json suffix in the same directory', () => {
    const p = getLegacySnapshotPath('abc123');
    expect(p).toBe(path.join(tempHome, 'sessions', 'abc123.json'));
  });

  it('sanitizes unsafe characters in session id', () => {
    const p = getManifestPath('../weird/../id:with*chars');
    const filename = path.basename(p);
    expect(filename).not.toContain('/');
    expect(filename).not.toContain('\\');
    expect(filename).not.toContain(':');
    expect(filename).not.toContain('*');
    expect(filename.endsWith('.jsonl')).toBe(true);
  });
});

describe('appendEvent', () => {
  it('writes a valid JSONL line with schemaVersion, ts, sessionId, type, payload', () => {
    appendEvent('sess-1', {
      type: 'session_initialized',
      payload: { workspaceRoot: '/repo', repoName: 'repo' },
    });

    const lines = readLines(getManifestPath('sess-1'));
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(typeof parsed.ts).toBe('string');
    expect(new Date(parsed.ts).toString()).not.toBe('Invalid Date');
    expect(parsed.sessionId).toBe('sess-1');
    expect(parsed.type).toBe('session_initialized');
    expect(parsed.payload).toEqual({ workspaceRoot: '/repo', repoName: 'repo' });
  });

  it('appends multiple lines in order without rewriting', () => {
    appendEvent('sess-2', { type: 'session_initialized', payload: { workspaceRoot: '/r' } });
    appendEvent('sess-2', { type: 'purpose_recorded', payload: { purpose: 'ship' } });
    appendEvent('sess-2', { type: 'tool_invoked', payload: { tool: 'Read', summary: 's', outcome: 'ok' } });

    const lines = readLines(getManifestPath('sess-2'));
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]).type).toBe('session_initialized');
    expect(JSON.parse(lines[1]).type).toBe('purpose_recorded');
    expect(JSON.parse(lines[2]).type).toBe('tool_invoked');
  });

  it('swallows errors so hooks never crash Claude Code', () => {
    // Force a real append failure by making the sessions directory be an
    // ordinary file. `mkdirSync({ recursive: true })` will throw ENOTDIR
    // and `appendFileSync` would fail as well — both must be swallowed.
    const sessionsDir = path.join(tempHome, 'sessions');
    fs.writeFileSync(sessionsDir, 'not-a-directory', 'utf8');

    expect(() =>
      appendEvent('sess-err', {
        type: 'purpose_reminder',
        payload: { lastPromptAt: new Date().toISOString() },
      }),
    ).not.toThrow();
  });

  it('creates the sessions directory lazily on first append', () => {
    const sessionsDir = path.join(tempHome, 'sessions');
    expect(fs.existsSync(sessionsDir)).toBe(false);
    appendEvent('lazy', { type: 'purpose_reminder', payload: { lastPromptAt: new Date().toISOString() } });
    expect(fs.existsSync(sessionsDir)).toBe(true);
  });
});

describe('readManifest', () => {
  it('returns null for a session with no manifest file', async () => {
    const state = await readManifest('nonexistent');
    expect(state).toBeNull();
  });

  it('folds session_initialized, setting status=awaiting-purpose and paths', async () => {
    appendEvent('s-init', {
      type: 'session_initialized',
      payload: { workspaceRoot: '/repo', canonicalRepoRoot: '/repo', repoName: 'repo' },
    });
    const state = await readManifest('s-init');
    expect(state).not.toBeNull();
    expect(state!.status).toBe('awaiting-purpose');
    expect(state!.workspaceRoot).toBe('/repo');
    expect(state!.canonicalRepoRoot).toBe('/repo');
    expect(state!.repoName).toBe('repo');
    expect(state!.createdAt).toBeDefined();
    expect(state!.created).toBe(state!.createdAt);
  });

  it('folds purpose_recorded, setting status=active and purpose and purposeSetAt/set_at', async () => {
    appendEvent('s-purpose', {
      type: 'session_initialized',
      payload: { workspaceRoot: '/r' },
    });
    appendEvent('s-purpose', {
      type: 'purpose_recorded',
      payload: { purpose: 'ship it', mode: 'build', modeSetAt: '2026-01-01T00:00:00.000Z', purposeSetAt: '2026-01-01T00:00:01.000Z' },
    });
    const state = await readManifest('s-purpose');
    expect(state!.status).toBe('active');
    expect(state!.purpose).toBe('ship it');
    expect(state!.purposeSetAt).toBe('2026-01-01T00:00:01.000Z');
    expect(state!.set_at).toBe('2026-01-01T00:00:00.000Z');
    expect(state!.lastActivityAt).toBeDefined();
    expect(state!.lastPromptAt).toBeDefined();
  });

  it('folds purpose_reminder, updating lastPromptAt and status=active', async () => {
    appendEvent('s-remind', {
      type: 'purpose_reminder',
      payload: { lastPromptAt: '2026-01-01T00:00:00.000Z' },
    });
    const state = await readManifest('s-remind');
    expect(state!.status).toBe('active');
    expect(state!.lastPromptAt).toBeDefined();
    expect(state!.lastActivityAt).toBeDefined();
  });

  it('folds tool_invoked, setting lastToolName and lastReplayAt', async () => {
    appendEvent('s-tool', {
      type: 'tool_invoked',
      payload: { tool: 'Edit', summary: 'edit file', outcome: 'ok' },
    });
    const state = await readManifest('s-tool');
    expect(state!.lastToolName).toBe('Edit');
    expect(state!.lastReplayAt).toBeDefined();
    expect(state!.lastActivityAt).toBeDefined();
  });

  it('folds evidence_captured, setting lastEvidenceId/type/tool/At', async () => {
    appendEvent('s-ev', {
      type: 'evidence_captured',
      payload: {
        evidence_id: 'E-001',
        evidence_type: 'test-result',
        tool: 'Bash',
        summary: 'vitest run',
        passed: true,
      },
    });
    const state = await readManifest('s-ev');
    expect(state!.lastEvidenceId).toBe('E-001');
    expect(state!.lastEvidenceType).toBe('test-result');
    expect(state!.lastToolName).toBe('Bash');
    expect(state!.lastEvidenceAt).toBeDefined();
  });

  it('folds task_action and stop_check', async () => {
    appendEvent('s-task', {
      type: 'task_action',
      payload: { action: 'add', taskText: 'do thing' },
    });
    appendEvent('s-task', {
      type: 'stop_check',
      payload: { result: 'blocked', incompleteCount: 2 },
    });
    const state = await readManifest('s-task');
    expect(state!.lastTaskAction).toBe('add');
    expect(state!.lastStopCheckResult).toBe('blocked');
    expect(state!.lastStopCheckAt).toBeDefined();
  });

  it('later values win for the same key (left-fold semantics)', async () => {
    appendEvent('s-fold', {
      type: 'tool_invoked',
      payload: { tool: 'Read', summary: 'r1', outcome: 'ok' },
    });
    appendEvent('s-fold', {
      type: 'tool_invoked',
      payload: { tool: 'Write', summary: 'w1', outcome: 'ok' },
    });
    const state = await readManifest('s-fold');
    expect(state!.lastToolName).toBe('Write');
  });

  it('skips corrupt JSON lines and folds the rest', async () => {
    const filePath = getManifestPath('s-corrupt');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const good1 = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      ts: '2026-01-01T00:00:00.000Z',
      sessionId: 's-corrupt',
      type: 'session_initialized',
      payload: { workspaceRoot: '/repo', repoName: 'repo' },
    });
    const good2 = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      ts: '2026-01-02T00:00:00.000Z',
      sessionId: 's-corrupt',
      type: 'tool_invoked',
      payload: { tool: 'Edit', summary: 'x', outcome: 'ok' },
    });
    fs.writeFileSync(filePath, `${good1}\n{not valid json\n${good2}\n`, 'utf8');

    const state = await readManifest('s-corrupt');
    expect(state).not.toBeNull();
    expect(state!.workspaceRoot).toBe('/repo');
    expect(state!.lastToolName).toBe('Edit');
  });

  it('handles an empty manifest file by returning a default-shaped state', async () => {
    const filePath = getManifestPath('s-empty');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '', 'utf8');

    const state = await readManifest('s-empty');
    expect(state).not.toBeNull();
    expect(state!.continuityVersion).toBe(SCHEMA_VERSION);
    expect(state!.sessionId).toBe('s-empty');
  });

  it('reads back correctly from a compacted (__snapshot__) file', async () => {
    // Seed with events, then force compaction by lowering threshold.
    appendEvent('s-snap', {
      type: 'session_initialized',
      payload: { workspaceRoot: '/r' },
    });
    appendEvent('s-snap', {
      type: 'purpose_recorded',
      payload: { purpose: 'focus' },
    });
    appendEvent('s-snap', {
      type: 'tool_invoked',
      payload: { tool: 'Grep', summary: 'g', outcome: 'ok' },
    });

    const compacted = await compactIfNeeded('s-snap', { maxBytes: 1 });
    expect(compacted).toBe(true);

    // Confirm the JSONL file now has a single line of type __snapshot__.
    const lines = readLines(getManifestPath('s-snap'));
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe('__snapshot__');

    const state = await readManifest('s-snap');
    expect(state).not.toBeNull();
    expect(state!.purpose).toBe('focus');
    expect(state!.lastToolName).toBe('Grep');
    expect(state!.status).toBe('active');
  });
});

describe('compactIfNeeded', () => {
  it('returns false when the manifest file does not exist', async () => {
    const result = await compactIfNeeded('never-existed');
    expect(result).toBe(false);
  });

  it('returns false when the manifest file is smaller than maxBytes', async () => {
    appendEvent('s-small', { type: 'purpose_reminder', payload: { lastPromptAt: 'x' } });
    const result = await compactIfNeeded('s-small'); // default 1 MB threshold
    expect(result).toBe(false);

    // Ensure the file was not rewritten.
    const lines = readLines(getManifestPath('s-small'));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).type).toBe('purpose_reminder');
  });

  it('compacts when file exceeds threshold and writes a legacy JSON snapshot', async () => {
    appendEvent('s-big', {
      type: 'session_initialized',
      payload: { workspaceRoot: '/r', repoName: 'r' },
    });
    appendEvent('s-big', {
      type: 'purpose_recorded',
      payload: { purpose: 'big' },
    });

    const result = await compactIfNeeded('s-big', { maxBytes: 1 });
    expect(result).toBe(true);

    const lines = readLines(getManifestPath('s-big'));
    expect(lines).toHaveLength(1);
    const snapshot = JSON.parse(lines[0]);
    expect(snapshot.type).toBe('__snapshot__');
    expect(snapshot.schemaVersion).toBe(SCHEMA_VERSION);
    expect(snapshot.payload.purpose).toBe('big');

    // Legacy snapshot must exist and be valid JSON.
    const legacyPath = getLegacySnapshotPath('s-big');
    expect(fs.existsSync(legacyPath)).toBe(true);
    const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    expect(legacy.purpose).toBe('big');
    expect(legacy.sessionId).toBe('s-big');
  });

  it('is idempotent when called a second time below threshold post-compaction', async () => {
    appendEvent('s-idem', {
      type: 'session_initialized',
      payload: { workspaceRoot: '/r' },
    });
    appendEvent('s-idem', {
      type: 'purpose_recorded',
      payload: { purpose: 'p' },
    });

    const first = await compactIfNeeded('s-idem', { maxBytes: 1 });
    expect(first).toBe(true);
    // After compaction the single snapshot line may still exceed 1 byte, so
    // raise the threshold above the snapshot size for the second call.
    const second = await compactIfNeeded('s-idem', { maxBytes: 10 * 1024 * 1024 });
    expect(second).toBe(false);
  });
});

describe('concurrent appends', () => {
  it('does not lose lines when 50 appends run in parallel', async () => {
    const sessionId = 's-concurrent';
    const tasks: Array<Promise<void>> = [];
    for (let i = 0; i < 50; i += 1) {
      tasks.push(
        Promise.resolve().then(() => {
          appendEvent(sessionId, {
            type: 'tool_invoked',
            payload: { tool: `tool-${i}`, summary: 's', outcome: 'ok' },
          });
        }),
      );
    }
    await Promise.all(tasks);

    const lines = readLines(getManifestPath(sessionId));
    expect(lines).toHaveLength(50);

    // Every line must parse to a valid SessionEvent.
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
      expect(parsed.type).toBe('tool_invoked');
      expect(typeof parsed.payload.tool).toBe('string');
    }
  });
});
