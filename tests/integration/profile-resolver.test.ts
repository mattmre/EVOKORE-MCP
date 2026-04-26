import { describe, it, expect } from 'vitest';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const profileResolverJsPath = path.join(ROOT, 'dist', 'ProfileResolver.js');

/**
 * Sprint 1.1 — ProfileResolver behavioral coverage.
 *
 * Documented resolution precedence
 * (`docs/plans/tool-discovery-tiering-2026-04-26.md` §6):
 *
 *   1. EVOKORE_TOOL_DISCOVERY_MODE=legacy hard safety-pin
 *   2. EVOKORE_DISCOVERY_PROFILE env override
 *   3. discovery.activeProfile from mcp.config.json
 *   4. Built-in "default" profile (legacy-equivalent)
 */
describe('ProfileResolver', () => {
  const resolverModule = require(profileResolverJsPath);
  const { resolveActiveProfile } = resolverModule;

  it('returns built-in default when no env and no config', () => {
    const result = resolveActiveProfile({ env: {}, config: {} });
    expect(result.profileName).toBe('default');
    expect(result.source).toBe('builtin-default');
    expect(result.profile.alwaysVisible).toBe('all-native');
  });

  it('honors EVOKORE_DISCOVERY_PROFILE env override when profile exists', () => {
    const result = resolveActiveProfile({
      env: { EVOKORE_DISCOVERY_PROFILE: 'minimal' },
      config: {
        profiles: {
          minimal: { alwaysVisible: ['resolve_workflow', 'discover_tools'] },
        },
      },
    });
    expect(result.profileName).toBe('minimal');
    expect(result.source).toBe('env');
    expect(result.profile.alwaysVisible).toEqual([
      'resolve_workflow',
      'discover_tools',
    ]);
  });

  it('falls back to built-in default when env-named profile is missing', () => {
    const result = resolveActiveProfile({
      env: { EVOKORE_DISCOVERY_PROFILE: 'does-not-exist' },
      config: { profiles: { other: { alwaysVisible: 'all-native' } } },
    });
    expect(result.profileName).toBe('default');
    expect(result.source).toBe('builtin-default');
    expect(result.reason).toMatch(/does-not-exist/);
  });

  it('uses discovery.activeProfile when set and present in profiles', () => {
    const result = resolveActiveProfile({
      env: {},
      config: {
        activeProfile: 'minimal',
        profiles: {
          minimal: { alwaysVisible: ['discover_tools'] },
        },
      },
    });
    expect(result.profileName).toBe('minimal');
    expect(result.source).toBe('config');
    expect(result.profile.alwaysVisible).toEqual(['discover_tools']);
  });

  it('safety-pin: EVOKORE_TOOL_DISCOVERY_MODE=legacy overrides env profile', () => {
    const result = resolveActiveProfile({
      env: {
        EVOKORE_TOOL_DISCOVERY_MODE: 'legacy',
        EVOKORE_DISCOVERY_PROFILE: 'minimal',
      },
      config: { profiles: { minimal: { alwaysVisible: ['x'] } } },
    });
    expect(result.profileName).toBe('default');
    expect(result.source).toBe('safety-pin-legacy');
    expect(result.profile.alwaysVisible).toBe('all-native');
  });

  it('safety-pin: EVOKORE_TOOL_DISCOVERY_MODE=legacy overrides config activeProfile', () => {
    const result = resolveActiveProfile({
      env: { EVOKORE_TOOL_DISCOVERY_MODE: 'legacy' },
      config: {
        activeProfile: 'minimal',
        profiles: { minimal: { alwaysVisible: ['x'] } },
      },
    });
    expect(result.profileName).toBe('default');
    expect(result.source).toBe('safety-pin-legacy');
  });

  it('EVOKORE_TOOL_DISCOVERY_MODE=dynamic does NOT block profile selection', () => {
    const result = resolveActiveProfile({
      env: {
        EVOKORE_TOOL_DISCOVERY_MODE: 'dynamic',
        EVOKORE_DISCOVERY_PROFILE: 'minimal',
      },
      config: { profiles: { minimal: { alwaysVisible: ['discover_tools'] } } },
    });
    expect(result.profileName).toBe('minimal');
    expect(result.source).toBe('env');
  });

  it('env override beats config activeProfile when both are set', () => {
    const result = resolveActiveProfile({
      env: { EVOKORE_DISCOVERY_PROFILE: 'a' },
      config: {
        activeProfile: 'b',
        profiles: {
          a: { alwaysVisible: ['x'] },
          b: { alwaysVisible: ['y'] },
        },
      },
    });
    expect(result.profileName).toBe('a');
    expect(result.source).toBe('env');
    expect(result.profile.alwaysVisible).toEqual(['x']);
  });
});
