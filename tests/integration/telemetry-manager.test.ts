import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const telemetryManagerTsPath = path.join(ROOT, 'src', 'TelemetryManager.ts');
const telemetryManagerJsPath = path.join(ROOT, 'dist', 'TelemetryManager.js');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');

describe('TelemetryManager', () => {

  // ---- Module existence ----

  describe('module exists and exports', () => {
    it('has TypeScript source file', () => {
      expect(fs.existsSync(telemetryManagerTsPath)).toBe(true);
    });

    it('has compiled JavaScript file', () => {
      expect(fs.existsSync(telemetryManagerJsPath)).toBe(true);
    });

    it('exports TelemetryManager class', () => {
      const mod = require(telemetryManagerJsPath);
      expect(mod.TelemetryManager).toBeDefined();
      expect(typeof mod.TelemetryManager).toBe('function');
    });
  });

  // ---- Source structure ----

  describe('source structure', () => {
    const src = fs.readFileSync(telemetryManagerTsPath, 'utf8');

    it('defines TelemetryMetrics interface', () => {
      expect(src).toMatch(/export interface TelemetryMetrics/);
    });

    it('TelemetryMetrics has required fields', () => {
      expect(src).toMatch(/toolCallCount:\s*number/);
      expect(src).toMatch(/toolErrorCount:\s*number/);
      expect(src).toMatch(/sessionCount:\s*number/);
      expect(src).toMatch(/avgLatencyMs:\s*number/);
      expect(src).toMatch(/startTime:\s*string/);
      expect(src).toMatch(/uptime:\s*number/);
    });

    it('has initialize method', () => {
      expect(src).toMatch(/initialize\(\)/);
    });

    it('has shutdown method', () => {
      expect(src).toMatch(/shutdown\(\)/);
    });

    it('has recordToolCall method', () => {
      expect(src).toMatch(/recordToolCall/);
    });

    it('has recordToolError method', () => {
      expect(src).toMatch(/recordToolError/);
    });

    it('has recordSessionStart method', () => {
      expect(src).toMatch(/recordSessionStart/);
    });

    it('has getMetrics method', () => {
      expect(src).toMatch(/getMetrics\(\):\s*TelemetryMetrics/);
    });

    it('has getPrometheusMetrics method', () => {
      expect(src).toMatch(/getPrometheusMetrics\(\):\s*string/);
    });

    it('has resetMetrics method', () => {
      expect(src).toMatch(/resetMetrics/);
    });

    it('has flushToDisk method', () => {
      expect(src).toMatch(/flushToDisk/);
    });

    it('has loadFromDisk method', () => {
      expect(src).toMatch(/loadFromDisk/);
    });

    it('has getTools method', () => {
      expect(src).toMatch(/getTools\(\):\s*Tool\[\]/);
    });

    it('has handleToolCall method', () => {
      expect(src).toMatch(/handleToolCall/);
    });

    it('has isTelemetryTool method', () => {
      expect(src).toMatch(/isTelemetryTool/);
    });

    it('checks EVOKORE_TELEMETRY env var', () => {
      expect(src).toMatch(/EVOKORE_TELEMETRY/);
    });

    it('stores metrics at ~/.evokore/telemetry/metrics.json', () => {
      // Source uses path.join(os.homedir(), ".evokore", "telemetry") and path.join(TELEMETRY_DIR, "metrics.json")
      expect(src).toMatch(/\.evokore/);
      expect(src).toMatch(/telemetry/);
      expect(src).toMatch(/metrics\.json/);
    });

    it('has periodic flush with unref', () => {
      expect(src).toMatch(/setInterval/);
      expect(src).toMatch(/unref/);
    });
  });

  // ---- Metric recording ----

  describe('metric recording', () => {
    it('records tool calls', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      tm.setEnabled(true);

      tm.recordToolCall(100);
      tm.recordToolCall(200);

      const metrics = tm.getMetrics();
      expect(metrics.toolCallCount).toBe(2);
      expect(metrics.avgLatencyMs).toBe(150);
    });

    it('records tool errors', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      tm.setEnabled(true);

      tm.recordToolError();
      tm.recordToolError();
      tm.recordToolError();

      const metrics = tm.getMetrics();
      expect(metrics.toolErrorCount).toBe(3);
    });

    it('records session starts', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      tm.setEnabled(true);

      tm.recordSessionStart();
      tm.recordSessionStart();

      const metrics = tm.getMetrics();
      expect(metrics.sessionCount).toBe(2);
    });

    it('records tool calls without latency', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      tm.setEnabled(true);

      tm.recordToolCall(); // no latency
      tm.recordToolCall(50);

      const metrics = tm.getMetrics();
      expect(metrics.toolCallCount).toBe(2);
      // Only one had latency recorded
      expect(metrics.avgLatencyMs).toBe(50);
    });

    it('reports zero avgLatencyMs when no latency recorded', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      tm.setEnabled(true);

      tm.recordToolCall();

      const metrics = tm.getMetrics();
      expect(metrics.avgLatencyMs).toBe(0);
    });

    it('computes uptime from startTime', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      tm.setEnabled(true);

      const metrics = tm.getMetrics();
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.startTime).toBe('string');
    });
  });

  // ---- Disabled state ----

  describe('disabled state (no recording)', () => {
    it('does not record tool calls when disabled', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      // Default: disabled

      expect(tm.isEnabled()).toBe(false);

      tm.recordToolCall(100);
      tm.recordToolError();
      tm.recordSessionStart();

      const metrics = tm.getMetrics();
      expect(metrics.toolCallCount).toBe(0);
      expect(metrics.toolErrorCount).toBe(0);
      expect(metrics.sessionCount).toBe(0);
    });

    it('isEnabled defaults to false', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const originalEnv = process.env.EVOKORE_TELEMETRY;
      delete process.env.EVOKORE_TELEMETRY;
      try {
        const tm = new TelemetryManager();
        expect(tm.isEnabled()).toBe(false);
      } finally {
        if (originalEnv !== undefined) {
          process.env.EVOKORE_TELEMETRY = originalEnv;
        }
      }
    });

    it('get_telemetry returns disabled message when not enabled', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();

      const result = tm.handleToolCall('get_telemetry');
      expect(result.content[0].text).toMatch(/disabled/i);
    });

    it('reset_telemetry returns disabled message when not enabled', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();

      const result = tm.handleToolCall('reset_telemetry');
      expect(result.content[0].text).toMatch(/disabled/i);
    });

    it('initialize is a no-op when disabled', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();

      // Should not throw
      tm.initialize();
      tm.shutdown();
    });
  });

  // ---- Reset functionality ----

  describe('reset functionality', () => {
    it('resets all counters to zero', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      tm.setEnabled(true);

      tm.recordToolCall(100);
      tm.recordToolCall(200);
      tm.recordToolError();
      tm.recordSessionStart();

      tm.resetMetrics();

      const metrics = tm.getMetrics();
      expect(metrics.toolCallCount).toBe(0);
      expect(metrics.toolErrorCount).toBe(0);
      expect(metrics.sessionCount).toBe(0);
      expect(metrics.avgLatencyMs).toBe(0);
    });

    it('resets startTime to current time', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      tm.setEnabled(true);

      const beforeReset = new Date().toISOString();
      tm.resetMetrics();
      const metrics = tm.getMetrics();

      expect(new Date(metrics.startTime).getTime()).toBeGreaterThanOrEqual(new Date(beforeReset).getTime() - 1000);
    });

    it('reset_telemetry tool handler resets metrics', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      tm.setEnabled(true);

      tm.recordToolCall(100);
      tm.recordToolError();

      const result = tm.handleToolCall('reset_telemetry');
      expect(result.content[0].text).toMatch(/reset/i);

      const metrics = tm.getMetrics();
      expect(metrics.toolCallCount).toBe(0);
      expect(metrics.toolErrorCount).toBe(0);
    });
  });

  // ---- Local storage read/write ----

  describe('local storage read/write', () => {
    let tmpDir: string;
    let originalMetricsFile: string;

    beforeEach(async () => {
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'evokore-telemetry-test-'));
    });

    afterEach(async () => {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    it('flushToDisk writes metrics to file', async () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      tm.setEnabled(true);

      tm.recordToolCall(150);
      tm.recordToolCall(250);

      const metricsPath = TelemetryManager.getMetricsFilePath();
      await tm.flushToDiskAsync();

      // Verify file exists and contains valid JSON
      expect(fs.existsSync(metricsPath)).toBe(true);
      const raw = fs.readFileSync(metricsPath, 'utf8');
      const data = JSON.parse(raw);
      expect(data.toolCallCount).toBe(2);
      expect(data.avgLatencyMs).toBe(200);
    });

    it('loadFromDisk restores persisted metrics', async () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);

      // First instance: record and flush
      const tm1 = new TelemetryManager();
      tm1.setEnabled(true);
      tm1.recordToolCall(100);
      tm1.recordToolCall(300);
      tm1.recordToolError();
      tm1.recordSessionStart();
      await tm1.flushToDiskAsync();

      // Second instance: load from disk
      const tm2 = new TelemetryManager();
      tm2.setEnabled(true);
      await tm2.loadFromDiskAsync();

      const metrics = tm2.getMetrics();
      expect(metrics.toolCallCount).toBe(2);
      expect(metrics.toolErrorCount).toBe(1);
      expect(metrics.sessionCount).toBe(1);
    });

    it('loadFromDisk handles missing file gracefully', async () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      tm.setEnabled(true);

      await tm.loadFromDiskAsync();
      const metrics = tm.getMetrics();
      expect(typeof metrics.toolCallCount).toBe('number');
    });

    it('getMetricsFilePath returns expected path', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const metricsPath = TelemetryManager.getMetricsFilePath();
      expect(metricsPath).toContain('.evokore');
      expect(metricsPath).toContain('telemetry');
      expect(metricsPath).toContain('metrics.json');
    });

    it('getTelemetryDir returns expected directory', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const dir = TelemetryManager.getTelemetryDir();
      expect(dir).toContain('.evokore');
      expect(dir).toContain('telemetry');
    });
  });

  // ---- Periodic flush ----

  describe('periodic flush', () => {
    const src = fs.readFileSync(telemetryManagerTsPath, 'utf8');

    it('uses setInterval for periodic flush', () => {
      expect(src).toMatch(/setInterval/);
    });

    it('calls unref on interval to avoid blocking exit', () => {
      expect(src).toMatch(/\.unref\(\)/);
    });

    it('clears interval on shutdown', () => {
      expect(src).toMatch(/clearInterval/);
    });

    it('default flush interval is 5 minutes', () => {
      expect(src).toMatch(/5 \* 60 \* 1000/);
    });

    it('constructor accepts custom flush interval', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager(10000);
      expect((tm as any).flushIntervalMs).toBe(10000);
    });
  });

  // ---- Tool definitions ----

  describe('tool definitions', () => {
    it('getTools returns get_telemetry and reset_telemetry', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      const tools = tm.getTools();
      const names = tools.map((t: any) => t.name);

      expect(names).toContain('get_telemetry');
      expect(names).toContain('reset_telemetry');
    });

    it('get_telemetry has readOnlyHint annotation', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      const tools = tm.getTools();
      const getTool = tools.find((t: any) => t.name === 'get_telemetry');

      expect(getTool.annotations.readOnlyHint).toBe(true);
      expect(getTool.annotations.destructiveHint).toBe(false);
    });

    it('reset_telemetry has destructiveHint annotation', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      const tools = tm.getTools();
      const resetTool = tools.find((t: any) => t.name === 'reset_telemetry');

      expect(resetTool.annotations.destructiveHint).toBe(true);
    });

    it('isTelemetryTool correctly identifies telemetry tools', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();

      expect(tm.isTelemetryTool('get_telemetry')).toBe(true);
      expect(tm.isTelemetryTool('reset_telemetry')).toBe(true);
      expect(tm.isTelemetryTool('unknown_tool')).toBe(false);
    });

    it('handleToolCall returns null for unknown tool', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();

      const result = tm.handleToolCall('unknown_tool');
      expect(result).toBeNull();
    });

    it('get_telemetry returns metrics JSON when enabled', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      tm.setEnabled(true);

      tm.recordToolCall(100);

      const result = tm.handleToolCall('get_telemetry');
      const metrics = JSON.parse(result.content[0].text);
      expect(metrics.toolCallCount).toBe(1);
      expect(metrics.avgLatencyMs).toBe(100);
    });
  });

  // ---- Prometheus exposition ----

  describe('Prometheus exposition', () => {
    it('renders current telemetry snapshot in Prometheus text format', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();
      tm.setEnabled(true);

      tm.recordToolCall(100);
      tm.recordToolError();
      tm.recordSessionStart();
      tm.recordSessionResume();
      tm.recordSessionExpire();
      tm.recordAuthSuccess();
      tm.recordAuthFailure();
      tm.recordAuthRateLimited();

      const output = tm.getPrometheusMetrics();

      expect(output).toContain('# HELP evokore_tool_calls_total');
      expect(output).toContain('# TYPE evokore_tool_calls_total counter');
      expect(output).toContain('evokore_tool_calls_total 1');
      expect(output).toContain('evokore_tool_errors_total 1');
      expect(output).toContain('evokore_sessions_started_total 1');
      expect(output).toContain('evokore_sessions_resumed_total 1');
      expect(output).toContain('evokore_sessions_expired_total 1');
      expect(output).toContain('evokore_auth_success_total 1');
      expect(output).toContain('evokore_auth_failure_total 1');
      expect(output).toContain('evokore_auth_rate_limited_total 1');
      expect(output).toContain('evokore_telemetry_enabled 1');
      expect(output).toContain('evokore_tool_latency_average_milliseconds 100');
      expect(output.endsWith('\n')).toBe(true);
    });

    it('reports telemetry disabled when manager is disabled', () => {
      const { TelemetryManager } = require(telemetryManagerJsPath);
      const tm = new TelemetryManager();

      const output = tm.getPrometheusMetrics();

      expect(output).toContain('evokore_telemetry_enabled 0');
      expect(output).toContain('evokore_tool_calls_total 0');
    });
  });

  // ---- index.ts integration ----

  describe('index.ts integration', () => {
    const indexSrc = fs.readFileSync(indexTsPath, 'utf8');

    it('imports TelemetryManager', () => {
      expect(indexSrc).toMatch(/import.*TelemetryManager.*from.*\.\/TelemetryManager/);
    });

    it('creates TelemetryManager instance', () => {
      expect(indexSrc).toMatch(/new TelemetryManager\(\)/);
    });

    it('calls telemetryManager.initialize() in loadSubsystems', () => {
      expect(indexSrc).toMatch(/telemetryManager\.initialize\(\)/);
    });

    it('includes telemetry tools in rebuildToolCatalog', () => {
      expect(indexSrc).toMatch(/telemetryManager\.getTools\(\)/);
    });

    it('routes telemetry tool calls via isTelemetryTool', () => {
      expect(indexSrc).toMatch(/telemetryManager\.isTelemetryTool/);
      expect(indexSrc).toMatch(/telemetryManager\.handleToolCall/);
    });

    it('records tool calls with latency', () => {
      expect(indexSrc).toMatch(/telemetryManager\.recordToolCall\(Date\.now\(\)\s*-\s*callStartTime\)/);
    });

    it('records tool errors', () => {
      expect(indexSrc).toMatch(/telemetryManager\.recordToolError\(\)/);
    });

    it('records session starts', () => {
      expect(indexSrc).toMatch(/telemetryManager\.recordSessionStart\(\)/);
    });

    it('calls telemetryManager.shutdown() in graceful shutdown', () => {
      expect(indexSrc).toMatch(/telemetryManager\.shutdown\(\)/);
    });
  });

  // ---- Privacy validation ----

  describe('privacy-first validation', () => {
    const src = fs.readFileSync(telemetryManagerTsPath, 'utf8');

    it('does not collect tool names', () => {
      // recordToolCall signature does not accept tool names
      expect(src).not.toMatch(/recordToolCall\(.*toolName/);
    });

    it('does not collect arguments', () => {
      expect(src).not.toMatch(/recordToolCall\(.*args/);
    });

    it('does not make any HTTP/network calls', () => {
      expect(src).not.toMatch(/import.*http/);
      expect(src).not.toMatch(/import.*https/);
      expect(src).not.toMatch(/import.*fetch/);
      expect(src).not.toMatch(/import.*axios/);
    });

    it('stores metrics locally only', () => {
      expect(src).toMatch(/\.evokore.*telemetry/);
      expect(src).not.toMatch(/api\.evokore/);
      expect(src).not.toMatch(/telemetry\.send/);
    });

    it('disabled by default', () => {
      expect(src).toMatch(/EVOKORE_TELEMETRY.*===.*"true"/);
    });
  });
});
