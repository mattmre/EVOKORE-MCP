import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const tsPath = path.join(ROOT, 'src', 'SessionAnalyticsManager.ts');
const jsPath = path.join(ROOT, 'dist', 'SessionAnalyticsManager.js');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');

describe('SessionAnalyticsManager', () => {
  describe('module exists and exports', () => {
    it('has TypeScript source file', () => {
      expect(fs.existsSync(tsPath)).toBe(true);
    });

    it('has compiled JavaScript file', () => {
      expect(fs.existsSync(jsPath)).toBe(true);
    });

    it('exports SessionAnalyticsManager class', () => {
      const mod = require(jsPath);
      expect(mod.SessionAnalyticsManager).toBeDefined();
      expect(typeof mod.SessionAnalyticsManager).toBe('function');
    });
  });

  describe('tool definitions', () => {
    it('getTools returns 4 tools', () => {
      const { SessionAnalyticsManager } = require(jsPath);
      const mgr = new SessionAnalyticsManager();
      const tools = mgr.getTools();
      const names = tools.map((t: any) => t.name);
      expect(tools).toHaveLength(4);
      expect(names).toContain('session_context_health');
      expect(names).toContain('session_analyze_replay');
      expect(names).toContain('session_work_ratio');
      expect(names).toContain('session_trust_report');
    });

    it('all tools have readOnlyHint annotation', () => {
      const { SessionAnalyticsManager } = require(jsPath);
      const mgr = new SessionAnalyticsManager();
      const tools = mgr.getTools();
      for (const t of tools) {
        expect(t.annotations.readOnlyHint).toBe(true);
        expect(t.annotations.destructiveHint).toBe(false);
        expect(t.annotations.idempotentHint).toBe(true);
        expect(t.annotations.openWorldHint).toBe(false);
      }
    });

    it('isSessionAnalyticsTool identifies tools correctly', () => {
      const { SessionAnalyticsManager } = require(jsPath);
      const mgr = new SessionAnalyticsManager();
      expect(mgr.isSessionAnalyticsTool('session_context_health')).toBe(true);
      expect(mgr.isSessionAnalyticsTool('session_analyze_replay')).toBe(true);
      expect(mgr.isSessionAnalyticsTool('session_work_ratio')).toBe(true);
      expect(mgr.isSessionAnalyticsTool('session_trust_report')).toBe(true);
      expect(mgr.isSessionAnalyticsTool('other')).toBe(false);
      expect(mgr.isSessionAnalyticsTool('get_telemetry')).toBe(false);
    });

    it('handleToolCall returns null for unknown tool', async () => {
      const { SessionAnalyticsManager } = require(jsPath);
      const mgr = new SessionAnalyticsManager();
      const result = await mgr.handleToolCall('unknown_tool', {});
      expect(result).toBeNull();
    });
  });

  describe('session_context_health', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'session-analytics-test-'));
    });

    afterEach(async () => {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    it('returns helpful error for non-existent session_path', async () => {
      const { SessionAnalyticsManager } = require(jsPath);
      const mgr = new SessionAnalyticsManager();
      const result = await mgr.handleToolCall('session_context_health', {
        session_path: path.join(tmpDir, 'does-not-exist.jsonl'),
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/not found/i);
    });

    it('parses a valid session file with usage', async () => {
      const sessionFile = path.join(tmpDir, 'test-session.jsonl');
      const lines = [
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-04-06T14:23:11Z',
          message: {
            usage: {
              cache_read_input_tokens: 84312,
              cache_creation_input_tokens: 1847,
              input_tokens: 500,
              output_tokens: 1200,
            },
          },
        }),
      ];
      await fsp.writeFile(sessionFile, lines.join('\n'), 'utf8');

      const { SessionAnalyticsManager } = require(jsPath);
      const mgr = new SessionAnalyticsManager();
      const result = await mgr.handleToolCall('session_context_health', {
        session_path: sessionFile,
      });
      expect(result.isError).toBeUndefined();
      const json = JSON.parse(result.content[0].text);
      expect(json.session_id).toBe('test-session');
      expect(json.turn_count).toBe(2);
      expect(json.context_tokens.cache_read).toBe(84312);
      expect(json.context_tokens.cache_creation).toBe(1847);
      expect(json.context_tokens.input).toBe(500);
      expect(json.context_tokens.output).toBe(1200);
      expect(json.context_tokens.total_estimated).toBe(87859);
      expect(json.compact_suggested).toBe(true);
      expect(json.compact_reason).toMatch(/strongly recommended/);
      expect(json.last_turn_timestamp).toBe('2026-04-06T14:23:11Z');
      // cost_per_turn = (84312 * 0.30 + 1847 * 3.75 + 500 * 3.0 + 1200 * 15.0) / 1e6
      //               = (25293.6 + 6926.25 + 1500 + 18000) / 1e6 ≈ 0.0517
      expect(json.cost_per_turn_usd).toBeGreaterThan(0);
    });

    it('reports no compact suggestion for low token count', async () => {
      const sessionFile = path.join(tmpDir, 'small.jsonl');
      await fsp.writeFile(
        sessionFile,
        JSON.stringify({
          message: {
            usage: {
              cache_read_input_tokens: 100,
              cache_creation_input_tokens: 0,
              input_tokens: 50,
              output_tokens: 50,
            },
          },
        }),
        'utf8'
      );
      const { SessionAnalyticsManager } = require(jsPath);
      const mgr = new SessionAnalyticsManager();
      const result = await mgr.handleToolCall('session_context_health', {
        session_path: sessionFile,
      });
      const json = JSON.parse(result.content[0].text);
      expect(json.compact_suggested).toBe(false);
    });
  });

  describe('session_analyze_replay', () => {
    it('returns graceful response when no replay files match', async () => {
      const { SessionAnalyticsManager } = require(jsPath);
      const mgr = new SessionAnalyticsManager();
      // Use a project_filter that is extremely unlikely to match anything
      const result = await mgr.handleToolCall('session_analyze_replay', {
        project_filter: '___nonexistent_filter_zzz_' + Date.now(),
        days_back: 1,
      });
      expect(result.isError).toBeUndefined();
      const json = JSON.parse(result.content[0].text);
      expect(json.sessions_analyzed).toBe(0);
      expect(json.tool_frequency).toEqual({});
      expect(json.retry_signals).toEqual([]);
    });
  });

  describe('session_work_ratio', () => {
    it('returns graceful response when no replay files match', async () => {
      const { SessionAnalyticsManager } = require(jsPath);
      const mgr = new SessionAnalyticsManager();
      const result = await mgr.handleToolCall('session_work_ratio', {
        project_filter: '___nonexistent_filter_zzz_' + Date.now(),
        days_back: 1,
      });
      expect(result.isError).toBeUndefined();
      const json = JSON.parse(result.content[0].text);
      expect(json.sessions_scored).toBe(0);
      expect(json.flagged_sessions).toEqual([]);
    });
  });

  describe('index.ts integration', () => {
    const indexSrc = fs.readFileSync(indexTsPath, 'utf8');

    it('imports SessionAnalyticsManager', () => {
      expect(indexSrc).toMatch(
        /import.*SessionAnalyticsManager.*from.*SessionAnalyticsManager/
      );
    });

    it('instantiates sessionAnalyticsManager', () => {
      expect(indexSrc).toMatch(/new SessionAnalyticsManager\(\)/);
    });

    it('spreads sessionAnalyticsManager.getTools() into nativeTools', () => {
      expect(indexSrc).toMatch(/sessionAnalyticsManager\.getTools\(\)/);
    });

    it('routes session analytics tool calls via isSessionAnalyticsTool', () => {
      expect(indexSrc).toMatch(/sessionAnalyticsManager\.isSessionAnalyticsTool/);
      expect(indexSrc).toMatch(/sessionAnalyticsManager\.handleToolCall/);
    });
  });
});
