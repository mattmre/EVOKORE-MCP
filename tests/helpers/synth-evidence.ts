/**
 * Test fixture builders for ECC Phase 4 spike.
 *
 * Produces synthetic evidence/replay/tasks/manifest files matching the
 * runtime shapes emitted by scripts/evidence-capture.js,
 * scripts/session-replay.js, scripts/tilldone.js and the session manifest.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface EvidenceEntry {
  evidence_id: string;
  ts: string;
  type: string;
  tool: string;
  summary: string;
  exit_code: number | null;
  passed: boolean;
  invocation_ts?: string;
  file?: string;
  is_error?: boolean;
}

export interface ReplayEntry {
  ts: string;
  tool: string;
  summary: string;
  outcome: string;
  output: string;
}

export interface TaskEntry {
  id: number;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export function evidenceEntry(overrides: Partial<EvidenceEntry> = {}): EvidenceEntry {
  return {
    evidence_id: 'E-001',
    ts: new Date().toISOString(),
    type: 'test-result',
    tool: 'Bash',
    summary: 'npx vitest run',
    exit_code: 0,
    passed: true,
    invocation_ts: new Date().toISOString(),
    ...overrides,
  };
}

export function buildEvidenceJsonl(
  dir: string,
  sessionId: string,
  entries: Partial<EvidenceEntry>[]
): string {
  const filePath = path.join(dir, `${sessionId}-evidence.jsonl`);
  const base = Date.now();
  const lines = entries.map((e, i) => {
    const merged = evidenceEntry({
      evidence_id: `E-${String(i + 1).padStart(3, '0')}`,
      ts: new Date(base + i * 1000).toISOString(),
      ...e,
    });
    return JSON.stringify(merged);
  });
  fs.writeFileSync(filePath, lines.length ? lines.join('\n') + '\n' : '', 'utf8');
  return filePath;
}

export function buildReplayJsonl(
  dir: string,
  sessionId: string,
  entries: Partial<ReplayEntry>[]
): string {
  const filePath = path.join(dir, `${sessionId}-replay.jsonl`);
  const base = Date.now();
  const lines = entries.map((e, i) =>
    JSON.stringify({
      ts: new Date(base + i * 1000).toISOString(),
      tool: 'Bash',
      summary: 'cmd',
      outcome: 'success',
      output: '',
      ...e,
    })
  );
  fs.writeFileSync(filePath, lines.length ? lines.join('\n') + '\n' : '', 'utf8');
  return filePath;
}

export function buildTasksJson(
  dir: string,
  sessionId: string,
  tasks: Partial<TaskEntry>[]
): string {
  const filePath = path.join(dir, `${sessionId}-tasks.json`);
  const full = tasks.map((t, i) => ({
    id: i + 1,
    content: `Task ${i + 1}`,
    status: 'pending' as const,
    ...t,
  }));
  fs.writeFileSync(filePath, JSON.stringify({ tasks: full }), 'utf8');
  return filePath;
}

export function buildManifest(
  dir: string,
  sessionId: string,
  patch: Record<string, unknown> = {}
): string {
  const filePath = path.join(dir, `${sessionId}.json`);
  const manifest = {
    sessionId,
    purpose: 'test session',
    subagents: [] as unknown[],
    preCompactSnapshot: null as unknown,
    ...patch,
  };
  fs.writeFileSync(filePath, JSON.stringify(manifest), 'utf8');
  return filePath;
}

/**
 * "Successful" session: tests pass, a commit is made, tasks completed,
 * reads precede edits in the replay log.
 */
export function buildSuccessfulSession(
  dir: string,
  sessionId: string
): { evidencePath: string } {
  // Replay: Read src/foo.ts, Edit src/foo.ts, Bash vitest, Bash commit
  const replayEntries: Partial<ReplayEntry>[] = [
    { tool: 'Read', summary: 'src/foo.ts' },
    { tool: 'Edit', summary: 'src/foo.ts' },
    { tool: 'Read', summary: 'src/bar.ts' },
    { tool: 'Edit', summary: 'src/bar.ts' },
    { tool: 'Bash', summary: 'npx vitest run' },
    { tool: 'Bash', summary: 'git commit -m "feat: add foo"' },
  ];
  buildReplayJsonl(dir, sessionId, replayEntries);

  buildTasksJson(dir, sessionId, [
    { content: 'Task 1', status: 'completed' },
    { content: 'Task 2', status: 'completed' },
    { content: 'Task 3', status: 'completed' },
  ]);

  buildManifest(dir, sessionId, { purpose: 'implement foo feature' });

  // Evidence: test-result (pass) x2, edit-trace (ok) x2, git-operation commit
  const entries: Partial<EvidenceEntry>[] = [
    { type: 'test-result', tool: 'Bash', summary: 'npx vitest run', exit_code: 0, passed: true },
    { type: 'test-result', tool: 'Bash', summary: 'npx vitest run', exit_code: 0, passed: true },
    {
      type: 'edit-trace',
      tool: 'Edit',
      summary: 'Edit: src/foo.ts',
      exit_code: null,
      passed: true,
      file: 'src/foo.ts',
      is_error: false,
    },
    {
      type: 'edit-trace',
      tool: 'Edit',
      summary: 'Edit: src/bar.ts',
      exit_code: null,
      passed: true,
      file: 'src/bar.ts',
      is_error: false,
    },
    {
      type: 'git-operation',
      tool: 'Bash',
      summary: 'git commit: feat: add foo',
      exit_code: 0,
      passed: true,
    },
  ];
  const evidencePath = buildEvidenceJsonl(dir, sessionId, entries);
  return { evidencePath };
}

/**
 * "Noisy" session: tests fail, no commits, high error rate.
 */
export function buildNoisySession(
  dir: string,
  sessionId: string
): { evidencePath: string } {
  buildReplayJsonl(dir, sessionId, [
    { tool: 'Bash', summary: 'npx vitest run' },
    { tool: 'Edit', summary: 'src/bar.ts' },
    { tool: 'Edit', summary: 'src/baz.ts' },
  ]);

  buildTasksJson(dir, sessionId, [
    { content: 'Task 1', status: 'pending' },
    { content: 'Task 2', status: 'pending' },
  ]);

  buildManifest(dir, sessionId);

  const entries: Partial<EvidenceEntry>[] = [
    { type: 'test-result', tool: 'Bash', summary: 'npx vitest run', exit_code: 1, passed: false },
    { type: 'test-result', tool: 'Bash', summary: 'npx vitest run', exit_code: 1, passed: false },
    {
      type: 'edit-trace',
      tool: 'Edit',
      summary: 'Edit: src/bar.ts',
      exit_code: null,
      passed: false,
      file: 'src/bar.ts',
      is_error: true,
    },
    {
      type: 'edit-trace',
      tool: 'Edit',
      summary: 'Edit: src/baz.ts',
      exit_code: null,
      passed: false,
      file: 'src/baz.ts',
      is_error: true,
    },
    {
      type: 'file-change',
      tool: 'Edit',
      summary: 'Edit: src/baz.ts',
      exit_code: null,
      passed: false,
      is_error: true,
    },
  ];
  const evidencePath = buildEvidenceJsonl(dir, sessionId, entries);
  return { evidencePath };
}
