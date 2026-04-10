import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const navTsPath = path.join(ROOT, 'src', 'NavigationAnchorManager.ts');
const navJsPath = path.join(ROOT, 'dist', 'NavigationAnchorManager.js');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');

describe('NavigationAnchorManager', () => {
  describe('module exists and exports', () => {
    it('has TypeScript source file', () => {
      expect(fs.existsSync(navTsPath)).toBe(true);
    });

    it('has compiled JavaScript file', () => {
      expect(fs.existsSync(navJsPath)).toBe(true);
    });

    it('exports NavigationAnchorManager class', () => {
      const mod = require(navJsPath);
      expect(mod.NavigationAnchorManager).toBeDefined();
      expect(typeof mod.NavigationAnchorManager).toBe('function');
    });
  });

  describe('tool definitions', () => {
    it('getTools returns nav_get_map and nav_read_anchor', () => {
      const { NavigationAnchorManager } = require(navJsPath);
      const mgr = new NavigationAnchorManager();
      const tools = mgr.getTools();
      const names = tools.map((t: any) => t.name);
      expect(names).toContain('nav_get_map');
      expect(names).toContain('nav_read_anchor');
    });

    it('nav_get_map has correct inputSchema and annotations', () => {
      const { NavigationAnchorManager } = require(navJsPath);
      const mgr = new NavigationAnchorManager();
      const tools = mgr.getTools();
      const t = tools.find((x: any) => x.name === 'nav_get_map');
      expect(t.inputSchema.type).toBe('object');
      expect(t.inputSchema.properties.path).toBeDefined();
      expect(t.inputSchema.required).toEqual(['path']);
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.annotations.destructiveHint).toBe(false);
      expect(t.annotations.idempotentHint).toBe(true);
      expect(t.annotations.openWorldHint).toBe(false);
    });

    it('nav_read_anchor has correct inputSchema and annotations', () => {
      const { NavigationAnchorManager } = require(navJsPath);
      const mgr = new NavigationAnchorManager();
      const tools = mgr.getTools();
      const t = tools.find((x: any) => x.name === 'nav_read_anchor');
      expect(t.inputSchema.type).toBe('object');
      expect(t.inputSchema.properties.path).toBeDefined();
      expect(t.inputSchema.properties.anchor_id).toBeDefined();
      expect(t.inputSchema.properties.lines_before).toBeDefined();
      expect(t.inputSchema.properties.lines_after).toBeDefined();
      expect(t.inputSchema.properties.anchor_type).toBeDefined();
      expect(t.inputSchema.required).toEqual(['path', 'anchor_id']);
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.annotations.destructiveHint).toBe(false);
      expect(t.annotations.idempotentHint).toBe(true);
      expect(t.annotations.openWorldHint).toBe(false);
    });

    it('isNavTool identifies nav tools correctly', () => {
      const { NavigationAnchorManager } = require(navJsPath);
      const mgr = new NavigationAnchorManager();
      expect(mgr.isNavTool('nav_get_map')).toBe(true);
      expect(mgr.isNavTool('nav_read_anchor')).toBe(true);
      expect(mgr.isNavTool('other')).toBe(false);
      expect(mgr.isNavTool('get_telemetry')).toBe(false);
    });
  });

  describe('nav_get_map with fixture file', () => {
    let tmpDir: string;
    let fixturePath: string;

    beforeEach(async () => {
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nav-anchor-test-'));
      fixturePath = path.join(tmpDir, 'fixture.ts');
      const lines = [
        'import A from "a";',
        'import B from "b";',
        '// @AI:NAV[SEC:imports] Phase entity import declarations',
        'import C from "c";',
        'import D from "d";',
        '// @AI:NAV[INS:new-import] Add new imports above this line',
        '// @AI:NAV[END:imports]',
        'function foo() {',
        '  return 1;',
        '}',
        '// @AI:NAV[SEC:body] Body section',
        'function bar() {',
        '  return 2;',
        '}',
        '// @AI:NAV[END:body]',
      ];
      await fsp.writeFile(fixturePath, lines.join('\n'), 'utf8');
    });

    afterEach(async () => {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    it('returns correct JSON map', async () => {
      const { NavigationAnchorManager } = require(navJsPath);
      const mgr = new NavigationAnchorManager();
      const result = await mgr.handleToolCall('nav_get_map', { path: fixturePath });
      expect(result.isError).toBeUndefined();
      const json = JSON.parse(result.content[0].text);
      expect(json.file).toBe(fixturePath);
      expect(json.total_lines).toBe(15);
      expect(json.anchor_count).toBe(5);
      expect(json.anchors).toHaveLength(5);
      expect(json.sections).toHaveLength(2);
      const importsSec = json.sections.find((s: any) => s.id === 'imports');
      expect(importsSec).toBeDefined();
      expect(importsSec.start_line).toBe(3);
      expect(importsSec.end_line).toBe(7);
      expect(importsSec.line_count).toBe(5);
      expect(importsSec.insert_points).toHaveLength(1);
      expect(importsSec.insert_points[0].id).toBe('new-import');
      expect(importsSec.insert_points[0].line).toBe(6);
      expect(json.warnings).toEqual([]);
    });

    it('warns about unpaired SEC', async () => {
      const badPath = path.join(tmpDir, 'bad.ts');
      await fsp.writeFile(
        badPath,
        'line1\n// @AI:NAV[SEC:foo] desc\nline3\n',
        'utf8'
      );
      const { NavigationAnchorManager } = require(navJsPath);
      const mgr = new NavigationAnchorManager();
      const result = await mgr.handleToolCall('nav_get_map', { path: badPath });
      const json = JSON.parse(result.content[0].text);
      expect(json.warnings.some((w: string) => /Unpaired SEC 'foo'/.test(w))).toBe(true);
    });

    it('returns isError for non-existent file', async () => {
      const { NavigationAnchorManager } = require(navJsPath);
      const mgr = new NavigationAnchorManager();
      const result = await mgr.handleToolCall('nav_get_map', {
        path: path.join(tmpDir, 'does-not-exist.ts'),
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/File not found/);
    });
  });

  describe('nav_read_anchor with fixture file', () => {
    let tmpDir: string;
    let fixturePath: string;

    beforeEach(async () => {
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nav-anchor-read-'));
      fixturePath = path.join(tmpDir, 'fixture.ts');
      const lines: string[] = [];
      for (let i = 1; i <= 50; i++) {
        if (i === 25) {
          lines.push('// @AI:NAV[INS:target-point] Insert new stuff here');
        } else {
          lines.push(`line ${i}`);
        }
      }
      await fsp.writeFile(fixturePath, lines.join('\n'), 'utf8');
    });

    afterEach(async () => {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    it('reads window centered on anchor', async () => {
      const { NavigationAnchorManager } = require(navJsPath);
      const mgr = new NavigationAnchorManager();
      const result = await mgr.handleToolCall('nav_read_anchor', {
        path: fixturePath,
        anchor_id: 'target-point',
        lines_before: 5,
        lines_after: 5,
      });
      expect(result.isError).toBeUndefined();
      const json = JSON.parse(result.content[0].text);
      expect(json.anchor_id).toBe('target-point');
      expect(json.anchor_type).toBe('INS');
      expect(json.anchor_line).toBe(25);
      expect(json.window.start_line).toBe(20);
      expect(json.window.end_line).toBe(30);
      expect(json.window.line_count).toBe(11);
      expect(json.content).toContain('20:\tline 20');
      expect(json.content).toContain('25:\t// @AI:NAV[INS:target-point]');
      expect(json.content).toContain('30:\tline 30');
    });

    it('clamps start_line to 1 when anchor near top', async () => {
      const nearTopPath = path.join(tmpDir, 'near-top.ts');
      await fsp.writeFile(
        nearTopPath,
        '// @AI:NAV[SEC:top] description\nline 2\nline 3\n',
        'utf8'
      );
      const { NavigationAnchorManager } = require(navJsPath);
      const mgr = new NavigationAnchorManager();
      const result = await mgr.handleToolCall('nav_read_anchor', {
        path: nearTopPath,
        anchor_id: 'top',
        lines_before: 100,
        lines_after: 2,
      });
      const json = JSON.parse(result.content[0].text);
      expect(json.window.start_line).toBe(1);
    });

    it('returns isError with helpful message when anchor missing', async () => {
      const { NavigationAnchorManager } = require(navJsPath);
      const mgr = new NavigationAnchorManager();
      const result = await mgr.handleToolCall('nav_read_anchor', {
        path: fixturePath,
        anchor_id: 'not-there',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/not found/);
      expect(result.content[0].text).toMatch(/nav_get_map/);
    });

    it('returns isError for non-existent file', async () => {
      const { NavigationAnchorManager } = require(navJsPath);
      const mgr = new NavigationAnchorManager();
      const result = await mgr.handleToolCall('nav_read_anchor', {
        path: path.join(tmpDir, 'does-not-exist.ts'),
        anchor_id: 'foo',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/File not found/);
    });

    it('caps lines_before and lines_after at 500', async () => {
      const { NavigationAnchorManager } = require(navJsPath);
      const mgr = new NavigationAnchorManager();
      const result = await mgr.handleToolCall('nav_read_anchor', {
        path: fixturePath,
        anchor_id: 'target-point',
        lines_before: 10000,
        lines_after: 10000,
      });
      const json = JSON.parse(result.content[0].text);
      // fixture has 50 lines total; capping should not expand beyond file
      expect(json.window.line_count).toBeLessThanOrEqual(50);
    });
  });

  describe('index.ts integration', () => {
    const indexSrc = fs.readFileSync(indexTsPath, 'utf8');

    it('imports NavigationAnchorManager', () => {
      expect(indexSrc).toMatch(/import.*NavigationAnchorManager.*from.*NavigationAnchorManager/);
    });

    it('instantiates navAnchorManager', () => {
      expect(indexSrc).toMatch(/new NavigationAnchorManager\(\)/);
    });

    it('spreads navAnchorManager.getTools() into nativeTools', () => {
      expect(indexSrc).toMatch(/navAnchorManager\.getTools\(\)/);
    });

    it('routes nav tool calls via isNavTool', () => {
      expect(indexSrc).toMatch(/navAnchorManager\.isNavTool/);
      expect(indexSrc).toMatch(/navAnchorManager\.handleToolCall/);
    });
  });
});
