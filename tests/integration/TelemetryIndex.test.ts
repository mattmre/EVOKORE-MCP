import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const telemetryJsPath = path.join(ROOT, 'dist', 'TelemetryIndex.js');

function makeTempFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-telemetry-test-'));
  return path.join(dir, 'routing-telemetry.jsonl');
}

async function rimraf(filePath: string): Promise<void> {
  try {
    await fsp.rm(path.dirname(filePath), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe('TelemetryIndex', () => {
  let filePath: string;
  let TelemetryIndex: any;

  beforeEach(() => {
    filePath = makeTempFile();
    ({ TelemetryIndex } = require(telemetryJsPath));
  });

  afterEach(async () => {
    await rimraf(filePath);
  });

  it('compiled module exists and exports TelemetryIndex', () => {
    expect(fs.existsSync(telemetryJsPath)).toBe(true);
    expect(typeof TelemetryIndex).toBe('function');
  });

  it('append writes a valid JSONL line', async () => {
    const idx = new TelemetryIndex(filePath);
    await idx.append({
      ts: '2026-01-01T00:00:00.000Z',
      query: 'deploy app',
      topCandidate: 'deploy-helper',
      candidates: ['deploy-helper', 'ship-app', 'release-it'],
    });

    const raw = await fsp.readFile(filePath, 'utf-8');
    const lines = raw.trim().split('\n');
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.query).toBe('deploy app');
    expect(parsed.topCandidate).toBe('deploy-helper');
    expect(parsed.candidates).toEqual(['deploy-helper', 'ship-app', 'release-it']);
  });

  it('readAll returns all entries in order', async () => {
    const idx = new TelemetryIndex(filePath);
    for (let i = 0; i < 5; i++) {
      await idx.append({
        ts: `2026-01-01T00:00:0${i}.000Z`,
        query: `q${i}`,
        topCandidate: `skill${i}`,
        candidates: [`skill${i}`],
      });
    }
    const all = await idx.readAll();
    expect(all.length).toBe(5);
    expect(all[0].query).toBe('q0');
    expect(all[4].query).toBe('q4');
  });

  it('readRecent(3) returns the last 3 entries', async () => {
    const idx = new TelemetryIndex(filePath);
    for (let i = 0; i < 10; i++) {
      await idx.append({
        ts: `2026-01-01T00:00:0${i}.000Z`,
        query: `q${i}`,
        topCandidate: `skill${i}`,
        candidates: [`skill${i}`],
      });
    }
    const recent = await idx.readRecent(3);
    expect(recent.length).toBe(3);
    expect(recent[0].query).toBe('q7');
    expect(recent[1].query).toBe('q8');
    expect(recent[2].query).toBe('q9');
  });

  it('recordExecution patches the matching entry and leaves others unchanged', async () => {
    const idx = new TelemetryIndex(filePath);
    const tsA = '2026-01-01T00:00:00.000Z';
    const tsB = '2026-01-01T00:00:01.000Z';
    await idx.append({ ts: tsA, query: 'a', topCandidate: 'skill-a', candidates: ['skill-a'] });
    await idx.append({ ts: tsB, query: 'b', topCandidate: 'skill-b', candidates: ['skill-b'] });

    await idx.recordExecution(tsB, 'skill-b', true);

    const all = await idx.readAll();
    expect(all.length).toBe(2);
    expect(all[0].success).toBeUndefined();
    expect(all[1].success).toBe(true);
    expect(all[1].executedSkill).toBe('skill-b');
  });

  it('getSuccessRates computes correct rates per topCandidate', async () => {
    const idx = new TelemetryIndex(filePath);
    // skill-a: 2/3 success, skill-b: 0/2 success
    const entries = [
      { ts: 't1', topCandidate: 'skill-a', query: 'q', candidates: ['skill-a'], success: true },
      { ts: 't2', topCandidate: 'skill-a', query: 'q', candidates: ['skill-a'], success: true },
      { ts: 't3', topCandidate: 'skill-a', query: 'q', candidates: ['skill-a'], success: false },
      { ts: 't4', topCandidate: 'skill-b', query: 'q', candidates: ['skill-b'], success: false },
      { ts: 't5', topCandidate: 'skill-b', query: 'q', candidates: ['skill-b'], success: false },
      // success missing -> should be skipped
      { ts: 't6', topCandidate: 'skill-c', query: 'q', candidates: ['skill-c'] },
    ];
    for (const e of entries) await idx.append(e);

    const rates = await idx.getSuccessRates();
    expect(rates.get('skill-a')).toEqual({ rate: 2 / 3, count: 3 });
    expect(rates.get('skill-b')).toEqual({ rate: 0, count: 2 });
    expect(rates.has('skill-c')).toBe(false);
  });

  it('totalRows matches line count', async () => {
    const idx = new TelemetryIndex(filePath);
    expect(await idx.totalRows()).toBe(0);
    for (let i = 0; i < 7; i++) {
      await idx.append({
        ts: `ts${i}`,
        query: `q${i}`,
        topCandidate: `skill${i}`,
        candidates: [`skill${i}`],
      });
    }
    expect(await idx.totalRows()).toBe(7);
  });

  it('concurrent appends do not corrupt the file', async () => {
    const idx = new TelemetryIndex(filePath);
    const N = 20;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        idx.append({
          ts: `ts-concurrent-${i}`,
          query: `q${i}`,
          topCandidate: `skill${i % 3}`,
          candidates: [`skill${i % 3}`],
        }),
      ),
    );

    const raw = await fsp.readFile(filePath, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    expect(lines.length).toBe(N);
    // Every line must be valid JSON.
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    const all = await idx.readAll();
    expect(all.length).toBe(N);
  });
});
