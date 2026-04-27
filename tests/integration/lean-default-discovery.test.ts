import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';

/**
 * Sprint 1.5 — lean default discovery
 *
 * The default EVOKORE_TOOL_DISCOVERY_MODE was flipped from "legacy" to
 * "dynamic" so an unconfigured operator gets the lean tools/list payload
 * (~1.5-2.5K tokens) instead of the legacy 12-31K-token full proxied dump.
 *
 * Operators who depend on the pre-v3.1 behavior pin
 * EVOKORE_TOOL_DISCOVERY_MODE=legacy explicitly.
 *
 * These assertions cover both the parser helper and the live
 * EvokoreMCPServer construction path.
 */
describe('lean default discovery', () => {
  const ROOT = path.resolve(__dirname, '../..');
  const indexJsPath = path.join(ROOT, 'dist', 'index.js');

  let savedDiscoveryMode: string | undefined;

  beforeEach(() => {
    savedDiscoveryMode = process.env.EVOKORE_TOOL_DISCOVERY_MODE;
    delete process.env.EVOKORE_TOOL_DISCOVERY_MODE;
  });

  afterEach(() => {
    if (savedDiscoveryMode === undefined) {
      delete process.env.EVOKORE_TOOL_DISCOVERY_MODE;
    } else {
      process.env.EVOKORE_TOOL_DISCOVERY_MODE = savedDiscoveryMode;
    }
  });

  // The parser is a private instance method; call it through prototype with
  // a stub `this`. Keeps the public class API unchanged.
  function callParser(value: string | undefined): 'legacy' | 'dynamic' {
    const { EvokoreMCPServer } = require(indexJsPath);
    const fn = (EvokoreMCPServer as any).prototype.parseToolDiscoveryMode;
    return fn.call({}, value);
  }

  it('parseToolDiscoveryMode(undefined) -> "dynamic"', () => {
    expect(callParser(undefined)).toBe('dynamic');
  });

  it('parseToolDiscoveryMode("") -> "dynamic"', () => {
    expect(callParser('')).toBe('dynamic');
  });

  it('parseToolDiscoveryMode("legacy") -> "legacy"', () => {
    expect(callParser('legacy')).toBe('legacy');
  });

  it('parseToolDiscoveryMode("dynamic") -> "dynamic"', () => {
    expect(callParser('dynamic')).toBe('dynamic');
  });

  it('unknown values fall back to "dynamic"', () => {
    expect(callParser('hybrid')).toBe('dynamic');
    expect(callParser('not-a-mode')).toBe('dynamic');
  });

  it('unconfigured EvokoreMCPServer instance has discoveryMode === "dynamic"', () => {
    const { EvokoreMCPServer } = require(indexJsPath);
    const server = new EvokoreMCPServer();
    expect((server as any).discoveryMode).toBe('dynamic');
  });

  it('EVOKORE_TOOL_DISCOVERY_MODE=legacy pins instance discoveryMode to "legacy"', () => {
    process.env.EVOKORE_TOOL_DISCOVERY_MODE = 'legacy';
    const { EvokoreMCPServer } = require(indexJsPath);
    const server = new EvokoreMCPServer();
    expect((server as any).discoveryMode).toBe('legacy');
  });

  it('EVOKORE_TOOL_DISCOVERY_MODE=dynamic keeps instance discoveryMode === "dynamic"', () => {
    process.env.EVOKORE_TOOL_DISCOVERY_MODE = 'dynamic';
    const { EvokoreMCPServer } = require(indexJsPath);
    const server = new EvokoreMCPServer();
    expect((server as any).discoveryMode).toBe('dynamic');
  });
});
