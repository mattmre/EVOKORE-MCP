/**
 * ECC Phase 2 — after-edit, subagent-tracker, pre-compact hooks
 *
 * Runtime tests spawn each hook script as a child process, feed a JSON
 * payload to stdin, and assert on the side effects against an isolated
 * HOME directory (~/.evokore is keyed off os.homedir()).
 *
 * Structural tests verify wrappers exist + settings.json is wired.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS_DIR = path.join(REPO_ROOT, 'scripts');
const HOOKS_DIR = path.join(SCRIPTS_DIR, 'hooks');

const AFTER_EDIT_SCRIPT = path.join(SCRIPTS_DIR, 'after-edit.js');
const SUBAGENT_SCRIPT = path.join(SCRIPTS_DIR, 'subagent-tracker.js');
const PRE_COMPACT_SCRIPT = path.join(SCRIPTS_DIR, 'pre-compact.js');

const SETTINGS_JSON_PATH = path.join(REPO_ROOT, '.claude', 'settings.json');

// Use a per-test-run temporary HOME so ~/.evokore is isolated from the
// developer's real session state.
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-ecc2-'));
const EVOKORE_DIR = path.join(TEST_HOME, '.evokore');
const SESSIONS_DIR = path.join(EVOKORE_DIR, 'sessions');

function runHook(
  scriptPath: string,
  payload: Record<string, unknown>
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [scriptPath], {
    input: JSON.stringify(payload),
    env: {
      ...process.env,
      HOME: TEST_HOME,
      USERPROFILE: TEST_HOME // Windows
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

function readState(sessionId: string): Record<string, unknown> | null {
  const p = sessionStatePath(sessionId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function evidenceLogPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId + '-evidence.jsonl');
}

function readEvidence(sessionId: string): Array<Record<string, unknown>> {
  const p = evidenceLogPath(sessionId);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').map((line) => JSON.parse(line));
}

beforeEach(() => {
  // Clear sessions between tests for clean state.
  if (fs.existsSync(SESSIONS_DIR)) {
    for (const name of fs.readdirSync(SESSIONS_DIR)) {
      try {
        fs.unlinkSync(path.join(SESSIONS_DIR, name));
      } catch {
        // directory entry; ignore
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

describe('ECC Phase 2 — after-edit hook', () => {
  it('writes an edit-trace evidence entry for an Edit tool call', () => {
    const sessionId = 'sess-after-edit-1';
    const filePath = '/tmp/fake-file.ts';
    const result = runHook(AFTER_EDIT_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Edit',
      tool_input: { file_path: filePath },
      tool_response: { is_error: false }
    });
    expect(result.status).toBe(0);

    const entries = readEvidence(sessionId);
    expect(entries.length).toBe(1);
    const entry = entries[0];
    expect(entry.type).toBe('edit-trace');
    expect(entry.tool).toBe('Edit');
    expect(entry.file).toBe(filePath);
    expect(entry.is_error).toBe(false);
    expect(typeof entry.evidence_id).toBe('string');
    expect((entry.evidence_id as string).startsWith('E-')).toBe(true);

    const state = readState(sessionId);
    expect(state).not.toBeNull();
    expect(state!.lastEditedFile).toBe(filePath);
  });

  it('exits cleanly without writing evidence when tool is Bash (non-watched)', () => {
    // Structural source check: Bash is not in the WATCHED_TOOLS set and
    // the script early-exits when tool_name is not Edit/Write/MultiEdit.
    const source = fs.readFileSync(AFTER_EDIT_SCRIPT, 'utf8');
    expect(source).toMatch(/WATCHED_TOOLS\s*=\s*new Set\(\[['"]Edit['"]/);
    expect(source).toContain('MultiEdit');
    expect(source).toMatch(/if\s*\(\s*!WATCHED_TOOLS\.has\(\s*toolName\s*\)\s*\)/);

    // Also execute it to prove it exits 0 and writes nothing.
    const sessionId = 'sess-after-edit-bash';
    const result = runHook(AFTER_EDIT_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_response: { is_error: false }
    });
    expect(result.status).toBe(0);
    expect(readEvidence(sessionId).length).toBe(0);
  });

  it('fails gracefully on malformed stdin payload (fail-safe exit 0)', () => {
    const result = spawnSync(process.execPath, [AFTER_EDIT_SCRIPT], {
      input: 'not-json-at-all',
      env: {
        ...process.env,
        HOME: TEST_HOME,
        USERPROFILE: TEST_HOME
      },
      encoding: 'utf8',
      timeout: 15000
    });
    expect(result.status).toBe(0);
  });
});

describe('ECC Phase 2 — subagent-tracker hook', () => {
  it('appends a SA-NNN entry to sessionState.subagents when tool is Task', () => {
    const sessionId = 'sess-subagent-1';
    const result = runHook(SUBAGENT_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Task',
      tool_input: {
        description: 'Research ECC phase 2 hooks',
        prompt: 'Investigate the hook surface area and wire three new hooks.',
        subagent_type: 'general-purpose'
      },
      tool_response: { is_error: false }
    });
    expect(result.status).toBe(0);

    const state = readState(sessionId);
    expect(state).not.toBeNull();
    const subagents = (state as Record<string, unknown>).subagents as Array<
      Record<string, unknown>
    >;
    expect(Array.isArray(subagents)).toBe(true);
    expect(subagents.length).toBe(1);
    const entry = subagents[0];
    expect(entry.id).toBe('SA-001');
    expect(entry.type).toBe('general-purpose');
    expect(entry.outcome).toBe('ok');
    expect(entry.description).toBe('Research ECC phase 2 hooks');
    expect(state!.activeSubagentCount).toBe(1);
  });

  it('early-exits for non-Task tools (source-level check + runtime no-op)', () => {
    const source = fs.readFileSync(SUBAGENT_SCRIPT, 'utf8');
    expect(source).toMatch(/toolName\s*!==\s*['"]Task['"]/);

    const sessionId = 'sess-subagent-edit';
    const result = runHook(SUBAGENT_SCRIPT, {
      session_id: sessionId,
      tool_name: 'Edit',
      tool_input: { file_path: '/tmp/x.ts' },
      tool_response: { is_error: false }
    });
    expect(result.status).toBe(0);
    // No manifest should be created solely by subagent-tracker on non-Task.
    const state = readState(sessionId);
    expect(state).toBeNull();
  });
});

describe('ECC Phase 2 — pre-compact hook', () => {
  it('writes a preCompactSnapshot on the manifest and a sidecar JSON file', () => {
    const sessionId = 'sess-precompact-1';
    const result = runHook(PRE_COMPACT_SCRIPT, {
      session_id: sessionId,
      trigger: 'auto'
    });
    expect(result.status).toBe(0);

    const state = readState(sessionId);
    expect(state).not.toBeNull();
    const snapshot = (state as Record<string, unknown>).preCompactSnapshot as Record<
      string,
      unknown
    >;
    expect(snapshot).toBeTruthy();
    expect(snapshot.trigger).toBe('auto');
    expect(Array.isArray(snapshot.incompleteTasks)).toBe(true);
    expect(Array.isArray(snapshot.recentTools)).toBe(true);
    expect(Array.isArray(snapshot.recentEvidenceIds)).toBe(true);

    const sidecarPath = path.join(SESSIONS_DIR, sessionId + '-pre-compact.json');
    expect(fs.existsSync(sidecarPath)).toBe(true);
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
    expect(sidecar.trigger).toBe('auto');
  });

  it('is graceful when tasks file is missing (no crash, snapshot still written)', () => {
    const sessionId = 'sess-precompact-no-tasks';
    // Intentionally do not seed a tasks file.
    const result = runHook(PRE_COMPACT_SCRIPT, { session_id: sessionId });
    expect(result.status).toBe(0);

    const state = readState(sessionId);
    expect(state).not.toBeNull();
    const snapshot = (state as Record<string, unknown>).preCompactSnapshot as Record<
      string,
      unknown
    >;
    expect(snapshot).toBeTruthy();
    expect(Array.isArray(snapshot.incompleteTasks)).toBe(true);
    expect((snapshot.incompleteTasks as unknown[]).length).toBe(0);
  });
});

describe('ECC Phase 2 — status-runtime subagents segment', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const statusRuntime = require(path.join(
    REPO_ROOT,
    'scripts',
    'status-runtime.js'
  )) as {
    renderSubagentsSegment: (
      sessionState: Record<string, unknown> | null,
      useAnsi: boolean
    ) => string | null;
  };
  /* eslint-enable @typescript-eslint/no-require-imports */

  it('returns null when there are no subagents', () => {
    expect(statusRuntime.renderSubagentsSegment({}, false)).toBeNull();
    expect(statusRuntime.renderSubagentsSegment({ subagents: [] }, false)).toBeNull();
    expect(statusRuntime.renderSubagentsSegment(null, false)).toBeNull();
  });

  it('returns "agents:3" for a session manifest with 3 subagents (no ANSI)', () => {
    const state = { subagents: [{ id: 'SA-001' }, { id: 'SA-002' }, { id: 'SA-003' }] };
    expect(statusRuntime.renderSubagentsSegment(state, false)).toBe('agents:3');
  });

  it('wraps the label in dim ANSI when useAnsi is true', () => {
    const state = { subagents: [{ id: 'SA-001' }] };
    const out = statusRuntime.renderSubagentsSegment(state, true) || '';
    expect(out).toContain('agents:1');
    expect(out).toContain('\x1b[2m');
    expect(out).toContain('\x1b[0m');
  });
});

describe('ECC Phase 2 — structural guards', () => {
  it('scripts/hooks/after-edit.js uses requireHookSafely wrapper pattern', () => {
    const source = fs.readFileSync(path.join(HOOKS_DIR, 'after-edit.js'), 'utf8');
    expect(source).toContain('requireHookSafely');
    expect(source).toContain("hookName: 'after-edit'");
  });

  it('scripts/hooks/subagent-tracker.js uses requireHookSafely wrapper pattern', () => {
    const source = fs.readFileSync(
      path.join(HOOKS_DIR, 'subagent-tracker.js'),
      'utf8'
    );
    expect(source).toContain('requireHookSafely');
    expect(source).toContain("hookName: 'subagent-tracker'");
  });

  it('scripts/hooks/pre-compact.js uses requireHookSafely wrapper pattern', () => {
    const source = fs.readFileSync(path.join(HOOKS_DIR, 'pre-compact.js'), 'utf8');
    expect(source).toContain('requireHookSafely');
    expect(source).toContain("hookName: 'pre-compact'");
  });

  it('.claude/settings.json wires all three ECC Phase 2 hooks', () => {
    const raw = fs.readFileSync(SETTINGS_JSON_PATH, 'utf8');
    // No BOM
    expect(raw.charCodeAt(0)).not.toBe(0xfeff);
    // JSON must still parse
    const cfg = JSON.parse(raw);
    expect(cfg.hooks).toBeTruthy();

    expect(raw).toContain('scripts/hooks/after-edit.js');
    expect(raw).toContain('scripts/hooks/subagent-tracker.js');
    expect(raw).toContain('scripts/hooks/pre-compact.js');

    // PreCompact must be a new top-level key
    expect(cfg.hooks.PreCompact).toBeTruthy();
    expect(Array.isArray(cfg.hooks.PreCompact)).toBe(true);
  });
});
