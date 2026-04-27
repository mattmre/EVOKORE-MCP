import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts', 'derive-skill-composition.js');
const SKILL_MANAGER_JS = path.join(ROOT, 'dist', 'SkillManager.js');

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

function runScript(args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf-8',
    env,
    cwd: ROOT
  });
}

function ensureSkillGraphBuilt(): { graphPath: string; graph: any } {
  const graphPath = path.join(ROOT, 'skill-graph.json');
  // Always regenerate to avoid stale shapes from older runs.
  const result = runScript(['--out', graphPath, '--quiet']);
  expect(result.status, `derive-skill-composition.js exit: ${result.stderr}`).toBe(0);
  const raw = fs.readFileSync(graphPath, 'utf-8');
  return { graphPath, graph: JSON.parse(raw) };
}

describe('Sprint 2.x: Skill composition graph + nextSteps[]', () => {
  describe('derive-skill-composition.js script', () => {
    it('runs without crashing and produces a graph with at least 1 edge', () => {
      const { graph } = ensureSkillGraphBuilt();
      expect(graph).toMatchObject({
        sourceCount: expect.any(Number),
        edges: expect.any(Array),
        cycles: expect.any(Array),
        warnings: expect.any(Array)
      });
      expect(graph.sourceCount).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects cycle-closing edges on insert and surfaces them under _rejected_cycles', () => {
      // Wave 0d-f changed the graph builder: edges that would close a
      // cycle are now rejected on insert (before they reach the
      // adjacency), so DFS no longer detects a planted alpha<->beta
      // cycle. Instead, exactly one of the two edges is recorded under
      // `_rejected_cycles`, preventing the cycle from forming.
      const mod = require(SCRIPT);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-skill-graph-'));
      try {
        const aDir = path.join(tmp, 'alpha');
        const bDir = path.join(tmp, 'beta');
        fs.mkdirSync(aDir);
        fs.mkdirSync(bDir);
        fs.writeFileSync(
          path.join(aDir, 'SKILL.md'),
          [
            '---',
            'name: alpha',
            'description: Alpha skill',
            '---',
            '',
            '# alpha',
            '',
            'When you finish, invoke beta skill to continue.',
            ''
          ].join('\n')
        );
        fs.writeFileSync(
          path.join(bDir, 'SKILL.md'),
          [
            '---',
            'name: beta',
            'description: Beta skill',
            '---',
            '',
            '# beta',
            '',
            'After this, invoke alpha skill again.',
            ''
          ].join('\n')
        );

        const graph = mod.buildGraph(tmp, {});
        // Cycle-rejection-on-insert means the DFS-detected cycles
        // array stays empty; the cycle never forms in the adjacency.
        expect(graph.cycles.length).toBe(0);
        // Exactly one edge of the planted alpha<->beta pair is dropped.
        expect(Array.isArray(graph._rejected_cycles)).toBe(true);
        expect(graph._rejected_cycles.length).toBe(1);
        const dropped = graph._rejected_cycles[0];
        expect(dropped.reason).toBe('would_close_cycle');
        const involved = new Set([dropped.from, dropped.to]);
        expect(involved.has('alpha')).toBe(true);
        expect(involved.has('beta')).toBe(true);
        // The dropped edge must not appear among the emitted edges.
        const leaked = graph.edges.find(
          (e: any) =>
            e.from === dropped.from && e.to === dropped.to && e.kind === 'direct'
        );
        expect(leaked).toBeUndefined();
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('respects the transitiveCloseExpand allowlist', () => {
      const { graph } = ensureSkillGraphBuilt();
      const allow = new Set(graph.transitiveCloseExpand as string[]);
      // Every transitive edge must originate from an allowlisted source.
      const transitiveEdges = graph.edges.filter((e: any) => e.kind === 'transitive');
      for (const edge of transitiveEdges) {
        expect(allow.has(edge.from)).toBe(true);
      }
    });

    it('parses the 7 mandatory injection points from panel-of-experts SKILL.md', () => {
      const { graph } = ensureSkillGraphBuilt();
      const expected = [
        'release-readiness',
        'repo-ingestor',
        'docs-architect',
        'orch-review',
        'orch-plan',
        'tool-governance',
        'orch-refactor'
      ];
      for (const skill of expected) {
        expect(graph.mandatoryInjectionPoints).toContain(skill);
      }
    });
  });

  describe('SkillManager.computeNextSteps + execute_skill', () => {
    function createSkillManager(graphOverridePath?: string) {
      if (graphOverridePath !== undefined) {
        process.env.EVOKORE_SKILL_GRAPH_PATH = graphOverridePath;
      } else {
        delete process.env.EVOKORE_SKILL_GRAPH_PATH;
      }
      // Force a fresh require so the module-level path constants
      // re-evaluate environment-dependent state on subsequent tests.
      delete require.cache[SKILL_MANAGER_JS];
      const { SkillManager } = require(SKILL_MANAGER_JS);
      return new SkillManager(mockProxyManager);
    }

    afterEach(() => {
      delete process.env.EVOKORE_SKILL_GRAPH_PATH;
    });

    it('returns nextSteps[] when the graph has matching edges', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-graph-'));
      const graphPath = path.join(tmpDir, 'skill-graph.json');
      const fakeGraph = {
        generatedAt: new Date().toISOString(),
        sourceCount: 2,
        edges: [
          {
            from: 'pr-manager',
            to: 'security-review',
            file: 'SKILLS/GENERAL CODING WORKFLOWS/pr-manager/SKILL.md',
            line: 43,
            kind: 'direct'
          }
        ],
        cycles: [],
        warnings: [],
        mandatoryInjectionPoints: [],
        transitiveCloseExpand: [],
        maxDepth: 5
      };
      fs.writeFileSync(graphPath, JSON.stringify(fakeGraph));

      try {
        const sm = createSkillManager(graphPath);
        const steps = await sm.computeNextSteps('pr-manager');
        expect(steps).toHaveLength(1);
        expect(steps[0].skill).toBe('security-review');
        expect(steps[0].reason).toMatch(/pr-manager\/SKILL\.md:L43/);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('returns nextSteps: [] when the graph file is absent (no crash)', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-graph-'));
      const missingPath = path.join(tmpDir, 'does-not-exist.json');
      try {
        const sm = createSkillManager(missingPath);
        const steps = await sm.computeNextSteps('any-skill');
        expect(steps).toEqual([]);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('mtime-based reload picks up a regenerated skill-graph.json', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-graph-'));
      const graphPath = path.join(tmpDir, 'skill-graph.json');

      const v1 = {
        generatedAt: 't1',
        sourceCount: 1,
        edges: [
          {
            from: 'src-a',
            to: 'tgt-1',
            file: 'a.md',
            line: 1,
            kind: 'direct'
          }
        ],
        cycles: [],
        warnings: [],
        transitiveCloseExpand: [],
        maxDepth: 5
      };
      fs.writeFileSync(graphPath, JSON.stringify(v1));

      try {
        const sm = createSkillManager(graphPath);
        let steps = await sm.computeNextSteps('src-a');
        expect(steps.map((s: any) => s.skill)).toEqual(['tgt-1']);

        // Wait so mtime changes are observable on FS that round to seconds.
        await new Promise((r) => setTimeout(r, 25));
        const v2 = {
          ...v1,
          edges: [
            {
              from: 'src-a',
              to: 'tgt-2',
              file: 'a.md',
              line: 2,
              kind: 'direct'
            }
          ]
        };
        fs.writeFileSync(graphPath, JSON.stringify(v2));
        // Touch mtime explicitly to handle low-resolution filesystems.
        const future = new Date(Date.now() + 1000);
        fs.utimesSync(graphPath, future, future);

        steps = await sm.computeNextSteps('src-a');
        expect(steps.map((s: any) => s.skill)).toEqual(['tgt-2']);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('_resetSkillGraphCache forces a fresh disk read', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-graph-'));
      const graphPath = path.join(tmpDir, 'skill-graph.json');
      fs.writeFileSync(
        graphPath,
        JSON.stringify({
          generatedAt: 't',
          sourceCount: 0,
          edges: [],
          cycles: [],
          warnings: [],
          transitiveCloseExpand: [],
          maxDepth: 5
        })
      );
      try {
        const sm = createSkillManager(graphPath);
        await sm.computeNextSteps('whatever');
        sm._resetSkillGraphCache();
        // Should not throw on a second computeNextSteps call.
        expect(await sm.computeNextSteps('whatever')).toEqual([]);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Auto-activation contract (index.ts surface)', () => {
    it('execute_skill response shape includes nextSteps when graph is present', () => {
      // The handler attaches `nextSteps` directly to the result object
      // (alongside `content`). Index.ts then reads that field and feeds
      // it through the activation set + sendToolListChanged path.
      const src = fs.readFileSync(path.join(ROOT, 'src', 'index.ts'), 'utf-8');
      expect(src).toMatch(/applyExecuteSkillNextSteps/);
      expect(src).toMatch(/sendToolListChanged\(\)/);
    });

    it('SkillManager source attaches nextSteps to execute_skill returns', () => {
      const src = fs.readFileSync(path.join(ROOT, 'src', 'SkillManager.ts'), 'utf-8');
      expect(src).toMatch(/computeNextSteps\(/);
      expect(src).toMatch(/loadSkillGraph\(/);
      // refreshSkills should invalidate the cache so that the next
      // execute_skill picks up a regenerated graph.
      expect(src).toMatch(/_resetSkillGraphCache\(\);/);
    });
  });
});
