import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(__dirname, '../..');
const tilldonePath = path.join(ROOT, 'scripts', 'tilldone.js');

function makeTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-tilldone-test-'));
}

async function rimraf(dir: string): Promise<void> {
  try { await fsp.rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function clearRequireCache() {
  delete require.cache[require.resolve(tilldonePath)];
}

function readTasksFile(home: string, sessionId: string): any[] {
  const p = path.join(home, '.evokore', 'sessions', `${sessionId}-tasks.json`);
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function runCli(home: string, args: string[]): { stdout: string; stderr: string; status: number | null } {
  const env = Object.assign({}, process.env, { HOME: home, USERPROFILE: home });
  const r = spawnSync(process.execPath, [tilldonePath, ...args], {
    env,
    encoding: 'utf8',
    timeout: 10_000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

describe('tilldone dependency graph (Phase 2.5-C)', () => {
  let home: string;

  beforeEach(() => {
    home = makeTempHome();
    clearRequireCache();
  });

  afterEach(async () => {
    await rimraf(home);
  });

  it('exports recomputeBlocked and findTaskByRef helpers', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tilldone = require(tilldonePath);
    expect(typeof tilldone.recomputeBlocked).toBe('function');
    expect(typeof tilldone.findTaskByRef).toBe('function');
    expect(typeof tilldone.loadTasks).toBe('function');
    expect(typeof tilldone.groupByDomain).toBe('function');
  });

  it('tasks without depends_on remain unblocked (back-compat)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { recomputeBlocked } = require(tilldonePath);
    const tasks = [
      { text: 'old task A', done: false, added: '2025-01-01T00:00:00Z' },
      { text: 'old task B', done: true, added: '2025-01-01T00:00:00Z' },
    ];
    const unblocked = recomputeBlocked(tasks);
    expect(unblocked).toEqual([]);
    // Should not introduce blocked_by where there isn't one.
    expect(tasks[0].blocked_by == null || tasks[0].blocked_by.length === 0).toBe(true);
  });

  it('depends_on by index resolves to the correct dependency', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { recomputeBlocked, findTaskByRef } = require(tilldonePath);
    const tasks: any[] = [
      { text: 'foundation', done: false, added: 't' },
      { text: 'on top', done: false, added: 't', depends_on: ['1'] },
    ];
    expect(findTaskByRef(tasks, '1')).toBe(0);
    recomputeBlocked(tasks);
    expect(tasks[1].blocked_by).toEqual(['1']);
    tasks[0].done = true;
    const unblocked = recomputeBlocked(tasks);
    expect(tasks[1].blocked_by).toEqual([]);
    expect(unblocked).toHaveLength(1);
    expect(unblocked[0].text).toBe('on top');
  });

  it('depends_on by substring resolves to the correct dependency', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { recomputeBlocked } = require(tilldonePath);
    const tasks: any[] = [
      { text: 'write the migration', done: false, added: 't' },
      { text: 'run integration tests', done: false, added: 't', depends_on: ['migration'] },
    ];
    recomputeBlocked(tasks);
    expect(tasks[1].blocked_by).toEqual(['migration']);
    tasks[0].done = true;
    const unblocked = recomputeBlocked(tasks);
    expect(tasks[1].blocked_by).toEqual([]);
    expect(unblocked.find((u: any) => u.text === 'run integration tests')).toBeTruthy();
  });

  it('CLI --add accepts --depends-on and --domain', () => {
    const sid = 'cli-deps';
    const r1 = runCli(home, ['--add', 'design schema', '--domain', 'backend', '--session', sid]);
    expect(r1.status).toBe(0);
    const r2 = runCli(home, ['--add', 'apply migration', '--depends-on', 'schema', '--domain', 'backend', '--session', sid]);
    expect(r2.status).toBe(0);
    const tasks = readTasksFile(home, sid);
    expect(tasks).toHaveLength(2);
    expect(tasks[1].depends_on).toEqual(['schema']);
    expect(tasks[1].domain).toBe('backend');
    expect(tasks[1].blocked_by).toEqual(['schema']);
  });

  it('CLI --done auto-unblocks dependents and reports them', () => {
    const sid = 'cli-unblock';
    runCli(home, ['--add', 'parent task', '--session', sid]);
    runCli(home, ['--add', 'child task', '--depends-on', 'parent', '--session', sid]);
    const before = readTasksFile(home, sid);
    expect(before[1].blocked_by).toEqual(['parent']);
    const r = runCli(home, ['--done', '1', '--session', sid]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Unblocked');
    expect(r.stdout).toContain('child task');
    const after = readTasksFile(home, sid);
    expect(after[1].blocked_by).toEqual([]);
  });

  it('CLI --list shows blocked status for tasks with unsatisfied deps', () => {
    const sid = 'cli-list';
    runCli(home, ['--add', 'A', '--session', sid]);
    runCli(home, ['--add', 'B', '--depends-on', 'A', '--session', sid]);
    const r = runCli(home, ['--list', '--session', sid]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('blocked by');
  });

  it('groupByDomain partitions tasks by domain field', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { groupByDomain } = require(tilldonePath);
    const tasks = [
      { text: 'A', done: false, added: 't', domain: 'frontend' },
      { text: 'B', done: false, added: 't', domain: 'backend' },
      { text: 'C', done: false, added: 't', domain: 'frontend' },
      { text: 'D', done: false, added: 't' },
    ];
    const groups = groupByDomain(tasks);
    expect(groups.get('frontend')).toHaveLength(2);
    expect(groups.get('backend')).toHaveLength(1);
    expect(groups.get('__none__')).toHaveLength(1);
  });

  it('Stop hook surfaces blocked vs ready counts and groups by domain', () => {
    const sid = 'hook-deps';
    runCli(home, ['--add', 'parent task', '--domain', 'backend', '--session', sid]);
    runCli(home, ['--add', 'child task', '--depends-on', 'parent', '--domain', 'frontend', '--session', sid]);
    // Invoke hook mode by piping JSON via stdin.
    const env = Object.assign({}, process.env, { HOME: home, USERPROFILE: home });
    const r = spawnSync(process.execPath, [tilldonePath], {
      env,
      input: JSON.stringify({ session_id: sid }),
      encoding: 'utf8',
      timeout: 10_000,
    });
    // Hook exits 2 when there are incomplete tasks.
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('TillDone');
    expect(r.stderr).toContain('blocked by deps');
    expect(r.stderr).toContain('Grouped by domain');
  });
});
