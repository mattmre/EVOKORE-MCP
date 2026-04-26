import { describe, it, expect } from 'vitest';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const toolCatalogJsPath = path.join(ROOT, 'dist', 'ToolCatalogIndex.js');

/**
 * Sprint 1.1 — ToolCatalogIndex profile-driven visibility.
 *
 * The catalog now consults the resolved DiscoveryProfile to decide
 * which tools are alwaysVisible. With no profile (or alwaysVisible:
 * "all-native"), behavior is bit-identical to legacy: every native
 * tool is visible, every proxied tool is dynamic.
 *
 * With an explicit string[] alwaysVisible list, only listed tools are
 * always visible; everything else (native or proxy) is gated.
 */
describe('ToolCatalogIndex profile visibility', () => {
  const { ToolCatalogIndex } = require(toolCatalogJsPath);

  const nativeTools = [
    { name: 'discover_tools', description: 'd', inputSchema: { type: 'object' } },
    { name: 'resolve_workflow', description: 'r', inputSchema: { type: 'object' } },
    { name: 'docs_architect', description: 'd', inputSchema: { type: 'object' } },
  ];
  const proxyTools = [
    { name: 'github_create_pull_request', description: 'p', inputSchema: { type: 'object' } },
    { name: 'fs_read_file', description: 'f', inputSchema: { type: 'object' } },
  ];

  it('without profile: all native tools visible, no proxy tools visible', () => {
    const catalog = new ToolCatalogIndex(nativeTools, proxyTools);
    const visible = catalog.getProjectedTools();
    const names = visible.map((t: any) => t.name).sort();
    expect(names).toEqual(['discover_tools', 'docs_architect', 'resolve_workflow']);
  });

  it('with all-native profile: identical to no-profile case', () => {
    const catalog = new ToolCatalogIndex(nativeTools, proxyTools, {
      alwaysVisible: 'all-native',
    });
    const visible = catalog.getProjectedTools();
    const names = visible.map((t: any) => t.name).sort();
    expect(names).toEqual(['discover_tools', 'docs_architect', 'resolve_workflow']);
  });

  it('with explicit allowlist: only listed tools visible (native AND proxy)', () => {
    const catalog = new ToolCatalogIndex(nativeTools, proxyTools, {
      alwaysVisible: ['discover_tools', 'fs_read_file'],
    });
    const visible = catalog.getProjectedTools();
    const names = visible.map((t: any) => t.name).sort();
    expect(names).toEqual(['discover_tools', 'fs_read_file']);
  });

  it('explicit allowlist excludes unlisted native tools', () => {
    const catalog = new ToolCatalogIndex(nativeTools, proxyTools, {
      alwaysVisible: ['resolve_workflow'],
    });
    const visible = catalog.getProjectedTools();
    const names = visible.map((t: any) => t.name);
    expect(names).toEqual(['resolve_workflow']);
    expect(names).not.toContain('discover_tools');
  });

  it('activatedTools still surface non-visible tools when activated', () => {
    const catalog = new ToolCatalogIndex(nativeTools, proxyTools, {
      alwaysVisible: ['resolve_workflow'],
    });
    const visible = catalog.getProjectedTools(['github_create_pull_request']);
    const names = visible.map((t: any) => t.name).sort();
    expect(names).toEqual(['github_create_pull_request', 'resolve_workflow']);
  });

  it('discover() still finds non-visible tools regardless of profile', () => {
    const catalog = new ToolCatalogIndex(nativeTools, proxyTools, {
      alwaysVisible: ['resolve_workflow'],
    });
    const matches = catalog.discover('docs_architect');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].entry.name).toBe('docs_architect');
    expect(matches[0].alreadyVisible).toBe(false);
  });

  it('empty allowlist: nothing visible by default', () => {
    const catalog = new ToolCatalogIndex(nativeTools, proxyTools, {
      alwaysVisible: [],
    });
    const visible = catalog.getProjectedTools();
    expect(visible).toEqual([]);
  });
});
