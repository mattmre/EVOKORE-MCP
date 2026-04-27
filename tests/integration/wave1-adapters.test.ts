import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Wave 1: adapter SKILL.md validation.
 *
 * Verifies the two ported adapter skills (`zoom-out` and
 * `ubiquitous-language`) satisfy:
 * - The full set of EVOKORE adapter-frontmatter provenance fields
 *   (`upstream`, `upstream-sha`, `upstream-path`).
 * - Trigger-explicit `description:` (starts with "Use when ").
 * - The 5-second-decide rule: `## When to use this skill` H2 within the
 *   first 30 lines after the closing frontmatter.
 *
 * For `ubiquitous-language` specifically: the body must literally
 * reference at least 3 of the bounded contexts named in
 * `docs/adr/0005-bounded-contexts.md`. This guards against drift back
 * into a repo-wide glossary mode (the explicit anti-pattern).
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ADR_PATH = path.join(REPO_ROOT, 'docs', 'adr', '0005-bounded-contexts.md');

const ADAPTERS = [
  {
    label: 'zoom-out',
    skillPath: path.join(REPO_ROOT, 'SKILLS', 'COMMUNICATION', 'zoom-out', 'SKILL.md'),
    expectedName: 'zoom-out',
    expectedUpstreamPath: 'zoom-out/SKILL.md',
  },
  {
    label: 'ubiquitous-language',
    skillPath: path.join(
      REPO_ROOT,
      'SKILLS',
      'CONTEXT',
      'ubiquitous-language',
      'SKILL.md'
    ),
    expectedName: 'ubiquitous-language',
    expectedUpstreamPath: 'ubiquitous-language/SKILL.md',
  },
] as const;

interface ParsedSkill {
  frontmatter: string;
  body: string;
  raw: string;
}

function parseFrontmatter(content: string): ParsedSkill | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  return { frontmatter: match[1], body: match[2], raw: content };
}

function extractField(frontmatter: string, field: string): string | null {
  const re = new RegExp(`^${field}:\\s*(.+?)\\s*$`, 'm');
  const m = frontmatter.match(re);
  return m ? m[1].trim() : null;
}

describe('Wave 1 adapter SKILL.md files', () => {
  for (const adapter of ADAPTERS) {
    describe(adapter.label, () => {
      it(`exists at the expected path`, () => {
        expect(fs.existsSync(adapter.skillPath)).toBe(true);
      });

      it('has parseable frontmatter', () => {
        const content = fs.readFileSync(adapter.skillPath, 'utf-8');
        const parsed = parseFrontmatter(content);
        expect(parsed).not.toBeNull();
      });

      it('has all three adapter provenance fields', () => {
        const content = fs.readFileSync(adapter.skillPath, 'utf-8');
        const parsed = parseFrontmatter(content);
        expect(parsed).not.toBeNull();
        const fm = parsed!.frontmatter;
        expect(extractField(fm, 'upstream')).toBe('mattpocock/skills');
        const sha = extractField(fm, 'upstream-sha');
        // Must be a 40-char lowercase hex SHA, not the placeholder template.
        expect(sha).toMatch(/^[0-9a-f]{40}$/);
        const upstreamPath = extractField(fm, 'upstream-path');
        expect(upstreamPath).toBe(adapter.expectedUpstreamPath);
      });

      it('has the canonical name', () => {
        const content = fs.readFileSync(adapter.skillPath, 'utf-8');
        const parsed = parseFrontmatter(content);
        expect(parsed).not.toBeNull();
        const name = extractField(parsed!.frontmatter, 'name');
        expect(name).toBe(adapter.expectedName);
      });

      it('description starts with "Use when "', () => {
        const content = fs.readFileSync(adapter.skillPath, 'utf-8');
        const parsed = parseFrontmatter(content);
        expect(parsed).not.toBeNull();
        const description = extractField(parsed!.frontmatter, 'description');
        expect(description).toBeTruthy();
        expect(description!.toLowerCase().startsWith('use when ')).toBe(true);
      });

      it('body has H2 "## When to use this skill" within first 30 lines', () => {
        const content = fs.readFileSync(adapter.skillPath, 'utf-8');
        const parsed = parseFrontmatter(content);
        expect(parsed).not.toBeNull();
        const lines = parsed!.body.split(/\r?\n/);
        const head = lines.slice(0, 30);
        const found = head.some((ln) => /^##\s+When to use this skill\s*$/i.test(ln.trim()));
        expect(found).toBe(true);
      });

      it('body declares Adapted From Upstream and EVOKORE-Specific Adaptations sections', () => {
        const content = fs.readFileSync(adapter.skillPath, 'utf-8');
        const parsed = parseFrontmatter(content);
        expect(parsed).not.toBeNull();
        expect(parsed!.body).toMatch(/^##\s+Adapted From Upstream\s*$/m);
        expect(parsed!.body).toMatch(/^##\s+EVOKORE-Specific Adaptations\s*$/m);
        expect(parsed!.body).toMatch(/^##\s+Composition\s*$/m);
      });
    });
  }

  describe('ubiquitous-language bounded-context coupling', () => {
    it('references at least 3 bounded contexts named in ADR-0005', () => {
      // Names harvested from docs/adr/0005-bounded-contexts.md headings.
      const boundedContexts = [
        'Skill Registry & Discovery',
        'Proxy & Routing',
        'Auth & Security',
        'Session & Continuity',
        'Orchestration & Fleet',
        'Audit & Webhooks',
        'Telemetry & Analytics',
        'Memory & Knowledge',
      ];

      // Sanity-check the ADR is on disk and contains every context name we expect.
      expect(fs.existsSync(ADR_PATH)).toBe(true);
      const adrText = fs.readFileSync(ADR_PATH, 'utf-8');
      for (const name of boundedContexts) {
        expect(adrText.includes(name)).toBe(true);
      }

      const skillPath = path.join(
        REPO_ROOT,
        'SKILLS',
        'CONTEXT',
        'ubiquitous-language',
        'SKILL.md'
      );
      const skillText = fs.readFileSync(skillPath, 'utf-8');
      const present = boundedContexts.filter((name) => skillText.includes(name));
      expect(present.length).toBeGreaterThanOrEqual(3);
    });

    it('refuses repo-wide glossary mode in its body', () => {
      const skillPath = path.join(
        REPO_ROOT,
        'SKILLS',
        'CONTEXT',
        'ubiquitous-language',
        'SKILL.md'
      );
      const skillText = fs.readFileSync(skillPath, 'utf-8');
      // The skill must explicitly REJECT a repo-wide invocation.
      expect(skillText).toMatch(/MUST refuse|hard-fail|repo-wide.*anti-pattern|REFUSES to run/);
      // And must point at ADR-0005.
      expect(skillText).toMatch(/0005-bounded-contexts\.md/);
    });
  });

  describe('upstream-sha alignment', () => {
    it('both adapter SHAs match SKILLS/upstream/UPSTREAM-mattpocock-skills.md', () => {
      const upstreamDoc = fs.readFileSync(
        path.join(REPO_ROOT, 'SKILLS', 'upstream', 'UPSTREAM-mattpocock-skills.md'),
        'utf-8'
      );
      const shaMatch = upstreamDoc.match(/Pinned commit SHA:\*\*\s+`([0-9a-f]{40})`/i);
      expect(shaMatch).not.toBeNull();
      const expectedSha = shaMatch![1];

      for (const adapter of ADAPTERS) {
        const content = fs.readFileSync(adapter.skillPath, 'utf-8');
        const parsed = parseFrontmatter(content);
        expect(parsed).not.toBeNull();
        const sha = extractField(parsed!.frontmatter, 'upstream-sha');
        expect(sha).toBe(expectedSha);
      }
    });
  });
});
