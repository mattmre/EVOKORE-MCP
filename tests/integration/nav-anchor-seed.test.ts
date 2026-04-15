/**
 * Wave 2 Phase 2-A — `scripts/seed-nav-anchors.js` integration tests.
 *
 * Covers:
 *  - `--dry-run` prints a plan without modifying files.
 *  - Running on an un-seeded fixture adds anchors with valid SEC/END pairs.
 *  - A second run is idempotent (file bytes unchanged).
 *  - `nav_get_map` from the compiled NavigationAnchorManager can parse the
 *    seeded fixture without warnings, proving the seeded anchors conform to
 *    the runtime regex contract.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SEED_SCRIPT = path.join(REPO_ROOT, 'scripts', 'seed-nav-anchors.js');
const NAV_MANAGER_JS = path.join(REPO_ROOT, 'dist', 'NavigationAnchorManager.js');

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-nav-seed-'));
}

function writeFixtureTs(dir: string): string {
  const fp = path.join(dir, 'Fixture.ts');
  const src = [
    'import fs from "fs";',
    'import path from "path";',
    '',
    'export interface FixtureConfig {',
    '  name: string;',
    '  retries: number;',
    '}',
    '',
    'export class FixtureRunner {',
    '  private config: FixtureConfig;',
    '  constructor(cfg: FixtureConfig) {',
    '    this.config = cfg;',
    '  }',
    '',
    '  run(): boolean {',
    '    return this.config.retries > 0;',
    '  }',
    '}',
    '',
    'export function helper(x: number): number {',
    '  return x + 1;',
    '}',
    '',
  ].join('\n');
  fs.writeFileSync(fp, src, 'utf8');
  return fp;
}

describe('seed-nav-anchors.js', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTempDir();
  });

  afterEach(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('--dry-run prints a plan without modifying files', () => {
    const fixture = writeFixtureTs(tmp);
    const before = fs.readFileSync(fixture, 'utf8');

    const output = execFileSync(
      process.execPath,
      [SEED_SCRIPT, '--dry-run', '--file', fixture],
      { encoding: 'utf8' }
    );

    expect(output).toContain('[plan]');
    expect(output).toContain('@AI:NAV[SEC:imports]');
    expect(output).toContain('@AI:NAV[END:imports]');

    const after = fs.readFileSync(fixture, 'utf8');
    expect(after).toBe(before);
  });

  it('seeds a fresh TypeScript file with paired SEC/END anchors', () => {
    const fixture = writeFixtureTs(tmp);
    const output = execFileSync(
      process.execPath,
      [SEED_SCRIPT, '--file', fixture],
      { encoding: 'utf8' }
    );
    expect(output).toContain('[seeded]');

    const seeded = fs.readFileSync(fixture, 'utf8');
    // Every SEC:id must have a matching END:id.
    const secIds = [...seeded.matchAll(/@AI:NAV\[SEC:([a-z0-9-]+)\]/g)].map((m) => m[1]);
    const endIds = [...seeded.matchAll(/@AI:NAV\[END:([a-z0-9-]+)\]/g)].map((m) => m[1]);
    expect(secIds.length).toBeGreaterThan(0);
    expect(secIds.sort()).toEqual(endIds.sort());
    // Anchors we specifically expect from the TS plan builder.
    expect(seeded).toContain('@AI:NAV[SEC:imports]');
    expect(seeded).toContain('@AI:NAV[SEC:class-fixturerunner]');
    expect(seeded).toContain('@AI:NAV[SEC:function-helper]');
  });

  it('is idempotent: a second run does not change the file', () => {
    const fixture = writeFixtureTs(tmp);
    execFileSync(process.execPath, [SEED_SCRIPT, '--file', fixture], { encoding: 'utf8' });
    const firstBytes = fs.readFileSync(fixture, 'utf8');

    const second = execFileSync(
      process.execPath,
      [SEED_SCRIPT, '--file', fixture],
      { encoding: 'utf8' }
    );
    expect(second).toContain('[already-seeded]');

    const secondBytes = fs.readFileSync(fixture, 'utf8');
    expect(secondBytes).toBe(firstBytes);
  });

  it('seeded fixture is parseable by nav_get_map without warnings', async () => {
    const fixture = writeFixtureTs(tmp);
    execFileSync(process.execPath, [SEED_SCRIPT, '--file', fixture], { encoding: 'utf8' });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NavigationAnchorManager } = require(NAV_MANAGER_JS);
    const mgr = new NavigationAnchorManager();
    const result = await mgr.handleToolCall('nav_get_map', { path: fixture });
    expect(result).toBeTruthy();
    expect(result.isError).not.toBe(true);
    const map = JSON.parse(result.content[0].text);
    expect(map.anchor_count).toBeGreaterThan(0);
    expect(map.sections.length).toBeGreaterThan(0);
    // No unpaired-anchor warnings.
    expect(map.warnings || []).toEqual([]);
    // Section IDs should include the imports block at minimum.
    const sectionIds = map.sections.map((s: any) => s.id);
    expect(sectionIds).toContain('imports');
  });

  it('skips files that do not exist and reports `missing` without erroring', () => {
    const bogus = path.join(tmp, 'does-not-exist.ts');
    const output = execFileSync(
      process.execPath,
      [SEED_SCRIPT, '--file', bogus],
      { encoding: 'utf8' }
    );
    expect(output).toContain('[missing]');
  });
});

describe('seed-nav-anchors.js — module API', () => {
  it('exports helpers for unit testing', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require(SEED_SCRIPT);
    expect(typeof api.hasExistingAnchors).toBe('function');
    expect(typeof api.buildPlan).toBe('function');
    expect(typeof api.applyPlan).toBe('function');
    expect(api.hasExistingAnchors('// @AI:NAV[SEC:x] test')).toBe(true);
    expect(api.hasExistingAnchors('no markers here')).toBe(false);
  });
});
