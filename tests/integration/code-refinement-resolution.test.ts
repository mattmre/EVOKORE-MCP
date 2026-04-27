import { describe, expect, it, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';

const ROOT = path.resolve(__dirname, '../..');
const skillManagerJsPath = path.join(ROOT, 'dist', 'SkillManager.js');

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

/**
 * Sprint 2.0 — code-refinement blocker resolution guard.
 *
 * Decision doc: docs/decisions/2026-04-26-code-refinement-blocker.md
 *
 * The "verified blocker" called out by panel D in
 * docs/plans/tool-discovery-tiering-2026-04-26.md §10 was that an
 * executable `code-refinement` skill did not exist. Verification showed
 * the panel-of-experts panel IS a loadable skill (registered name
 * `panel-code-refinement`), and that the
 * `pr-manager -> security-review -> code-refinement` chain referenced
 * in three planning docs was never wired in any skill body.
 *
 * This guard asserts two things:
 *
 *   1. The panel skill loads under the canonical registered name.
 *      (Closes the "skill is missing" half of the blocker.)
 *   2. No production / planning surface re-introduces the dangling
 *      "code-refinement" prose. Legitimate panel-name references
 *      inside the panel-of-experts framework, the decision doc, the
 *      historical research note, and the snapshot fixture are
 *      allowlisted. Anything else outside that allowlist would mean
 *      the dangling-prose drift has come back.
 */

const REPO_ROOT = ROOT;

const SCAN_DIRS = ['SKILLS', 'docs', 'src', 'scripts', 'tests'];
// Also walk a curated set of root-level files so prose drift in CLAUDE.md
// or next-session.md is caught without indiscriminately walking the entire
// repo root.
const SCAN_ROOT_FILES = ['CLAUDE.md', 'README.md', 'next-session.md'];
// Match all separator variants — including the no-separator
// `coderefinement` form mentioned in the audit description.
const PATTERN = /code[-_ ]?refinement/i;

// File suffixes we walk into. Keep this conservative — we want to catch
// real prose drift, not chase every binary.
const TEXT_SUFFIXES = ['.md', '.ts', '.tsx', '.js', '.json', '.yaml', '.yml', '.snap'];

// Files / directories where references to `code-refinement` are
// legitimate and intentional. Paths are repo-relative, forward-slash.
const ALLOWLIST = [
  // Panel-of-experts framework — the canonical home of the panel.
  'SKILLS/ORCHESTRATION FRAMEWORK/panel-of-experts/SKILL.md',
  'SKILLS/ORCHESTRATION FRAMEWORK/panel-of-experts/expert-roster.md',
  'SKILLS/ORCHESTRATION FRAMEWORK/panel-of-experts/persistent-narratives.md',
  'SKILLS/ORCHESTRATION FRAMEWORK/panel-of-experts/panels/code-refinement.md',
  'SKILLS/ORCHESTRATION FRAMEWORK/panel-of-experts/panels/wiring-ui.md',
  'SKILLS/ORCHESTRATION FRAMEWORK/panel-of-experts/workflows/panel-review-generic.json',
  'SKILLS/ORCHESTRATION FRAMEWORK/panel-of-experts/workflows/cascading-multi-panel.json',

  // Decision record + historical research kept as context.
  'docs/decisions/2026-04-26-code-refinement-blocker.md',
  'docs/research/panel-of-experts-expansion-2026-04-03.md',

  // Sprint 2.0 resolved-state context. These two files describe why
  // the blocker was resolved and link to the decision doc — they are
  // the public record of the resolution and are expected to mention
  // `code-refinement` in that explanatory context.
  'docs/handoffs/2026-04-26-overnight.md',
  'docs/plans/tool-discovery-tiering-2026-04-26.md',
  'next-session.md',

  // The snapshot intentionally captures the legitimate skill name
  // `panel-code-refinement`.
  'tests/integration/__snapshots__/default-profile-search-snapshot.test.ts.snap',

  // This guard test.
  'tests/integration/code-refinement-resolution.test.ts',

  // CLAUDE.md picks up a learning entry pointing at the decision doc.
  'CLAUDE.md',
];

function toRel(p: string): string {
  return path.relative(REPO_ROOT, p).split(path.sep).join('/');
}

function isAllowlisted(rel: string): boolean {
  return ALLOWLIST.includes(rel);
}

function walkText(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip dist, node_modules, .git inside scanned dirs (defensive).
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      walkText(full, out);
    } else if (entry.isFile()) {
      if (TEXT_SUFFIXES.some((suf) => entry.name.toLowerCase().endsWith(suf))) {
        out.push(full);
      }
    }
  }
}

describe('Sprint 2.0 code-refinement resolution', () => {
  it('panel-code-refinement skill loads under the canonical name', async () => {
    const { SkillManager } = require(skillManagerJsPath);
    const sm = new SkillManager(mockProxyManager);
    await sm.loadSkills();

    expect(sm.getSkillCount()).toBeGreaterThan(0);

    const panelHit = sm.findSkillByName('panel-code-refinement');
    expect(panelHit).not.toBeNull();
    expect(panelHit?.name).toBe('panel-code-refinement');

    // The bare `code-refinement` name was the orchestrator-imagined
    // skill that never existed. Confirm the index does not surface it
    // as an exact-name match — it should resolve only to the panel.
    const bareHit = sm.findSkillByName('code-refinement');
    if (bareHit) {
      // findSkillByName has a fuzzy fallback; an exact-name lookup
      // should not return a skill whose canonical name is bare
      // `code-refinement`.
      // Case-insensitive — findSkillByName fuzzy lookup may return
      // any-casing variants and we want to catch all of them.
      expect(bareHit.name.toLowerCase()).not.toBe('code-refinement');
    }
  }, 30_000);

  it('no dangling bare code-refinement prose outside the allowlist', () => {
    const files: string[] = [];
    for (const sub of SCAN_DIRS) {
      walkText(path.join(REPO_ROOT, sub), files);
    }
    // Curated root-level files — surface drift in top-level docs without
    // walking the entire repo root.
    for (const rootFile of SCAN_ROOT_FILES) {
      const full = path.join(REPO_ROOT, rootFile);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        files.push(full);
      }
    }

    const offenders: Array<{ file: string; line: number; text: string }> = [];

    for (const file of files) {
      const rel = toRel(file);
      if (isAllowlisted(rel)) continue;

      let raw: string;
      try {
        raw = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      const lines = raw.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (PATTERN.test(lines[i])) {
          offenders.push({ file: rel, line: i + 1, text: lines[i].trim().slice(0, 200) });
        }
      }
    }

    if (offenders.length > 0) {
      const summary = offenders
        .map((o) => `  ${o.file}:${o.line}  ${o.text}`)
        .join('\n');
      throw new Error(
        `Found ${offenders.length} dangling code-refinement reference(s) ` +
          `outside the allowlist. Either delete the prose or add the file to ` +
          `the ALLOWLIST in this test (with a comment explaining why):\n${summary}`,
      );
    }

    // sanity: the scan actually found something to inspect.
    expect(files.length).toBeGreaterThan(0);
  });
});
