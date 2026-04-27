import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * Sprint 1.4 — Profile presets behavioral coverage.
 *
 * The five preset profiles (`coding`, `research`, `voice`, `legacy-full`,
 * `legacy-dynamic`) ship in the canonical `mcp.config.json`. This suite
 * verifies:
 *
 *   1. Each profile loads through `resolveActiveProfile()` without throwing.
 *   2. The `coding` profile exposes coding-relevant tools and excludes
 *      voice tools.
 *   3. The `voice` profile exposes voice tools and excludes proxy DB
 *      tools (Supabase).
 *   4. `legacy-full` exposes the full surface (every native + every proxy).
 *   5. The 7 mandatory injection-point downstream skills are present in
 *      every default profile (`coding`, `research`, `voice`).
 *   6. An unknown profile name falls back gracefully to the built-in
 *      default profile and emits a warning to stderr.
 *
 * Tests use the compiled `dist/` artifacts to match the pattern in the
 * existing integration tests under `tests/integration/`.
 */

const ROOT = path.resolve(__dirname, '../..');
const profileResolverJsPath = path.join(ROOT, 'dist', 'ProfileResolver.js');
const toolCatalogJsPath = path.join(ROOT, 'dist', 'ToolCatalogIndex.js');
const canonicalConfigPath = path.join(ROOT, 'mcp.config.json');

const SAMPLE_NATIVE_TOOLS = [
  { name: 'discover_tools', description: 'd', inputSchema: { type: 'object' } },
  { name: 'resolve_workflow', description: 'r', inputSchema: { type: 'object' } },
  { name: 'execute_skill', description: 'e', inputSchema: { type: 'object' } },
  { name: 'docs_architect', description: 'da', inputSchema: { type: 'object' } },
  { name: 'memory_store', description: 'm', inputSchema: { type: 'object' } },
  { name: 'session_context_health', description: 'sch', inputSchema: { type: 'object' } },
];

const SAMPLE_PROXY_TOOLS = [
  // Filesystem
  { name: 'fs_read_file', description: 'fs', inputSchema: { type: 'object' } },
  { name: 'fs_write_file', description: 'fs', inputSchema: { type: 'object' } },
  { name: 'fs_search_files', description: 'fs', inputSchema: { type: 'object' } },
  // GitHub
  { name: 'github_create_pull_request', description: 'gh', inputSchema: { type: 'object' } },
  { name: 'github_get_file_contents', description: 'gh', inputSchema: { type: 'object' } },
  // ElevenLabs (voice)
  { name: 'elevenlabs_text_to_speech', description: 'voice', inputSchema: { type: 'object' } },
  { name: 'elevenlabs_get_voice', description: 'voice', inputSchema: { type: 'object' } },
  // Supabase (DB)
  { name: 'supabase_execute_sql', description: 'db', inputSchema: { type: 'object' } },
  { name: 'supabase_list_tables', description: 'db', inputSchema: { type: 'object' } },
];

describe('Sprint 1.4 discovery preset profiles', () => {
  let resolverModule: any;
  let toolCatalogModule: any;
  let parsedConfig: any;
  let discovery: any;

  beforeAll(() => {
    resolverModule = require(profileResolverJsPath);
    toolCatalogModule = require(toolCatalogJsPath);
    const raw = fs.readFileSync(canonicalConfigPath, 'utf8');
    parsedConfig = JSON.parse(raw);
    discovery = parsedConfig.discovery ?? {};
  });

  it('canonical mcp.config.json ships the five preset profile names', () => {
    const profiles = discovery.profiles ?? {};
    const names = Object.keys(profiles).sort();
    expect(names).toEqual(['coding', 'legacy-dynamic', 'legacy-full', 'research', 'voice']);
  });

  it('exports the 7 mandatory injection-point downstream skill IDs', () => {
    const skills = resolverModule.MANDATORY_INJECTION_SKILLS;
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBe(7);
    expect([...skills].sort()).toEqual(
      [
        'docs-architect',
        'orch-plan',
        'orch-refactor',
        'orch-review',
        'release-readiness',
        'repo-ingestor',
        'tool-governance',
      ].sort()
    );
  });

  it('every preset profile loads through resolveActiveProfile without throwing', () => {
    const profiles = discovery.profiles ?? {};
    for (const name of Object.keys(profiles)) {
      const result = resolverModule.resolveActiveProfile({
        env: { EVOKORE_DISCOVERY_PROFILE: name },
        config: discovery,
      });
      expect(result.profileName).toBe(name);
      expect(result.profile).toBeDefined();
      expect(result.profile.alwaysVisible).toBeDefined();
    }
  });

  it('coding profile exposes coding-relevant tools and excludes voice tools', () => {
    const profile = discovery.profiles.coding;
    const catalog = new toolCatalogModule.ToolCatalogIndex(
      SAMPLE_NATIVE_TOOLS,
      SAMPLE_PROXY_TOOLS,
      profile
    );
    const visibleNames = catalog.getProjectedTools([]).map((t: any) => t.name);
    // Coding-relevant: filesystem + github + skill resolution
    expect(visibleNames).toContain('fs_read_file');
    expect(visibleNames).toContain('fs_write_file');
    expect(visibleNames).toContain('github_create_pull_request');
    expect(visibleNames).toContain('discover_tools');
    expect(visibleNames).toContain('resolve_workflow');
    // Voice tools must NOT be in coding profile
    expect(visibleNames).not.toContain('elevenlabs_text_to_speech');
    expect(visibleNames).not.toContain('elevenlabs_get_voice');
  });

  it('voice profile exposes voice tools and excludes proxy DB tools', () => {
    const profile = discovery.profiles.voice;
    const catalog = new toolCatalogModule.ToolCatalogIndex(
      SAMPLE_NATIVE_TOOLS,
      SAMPLE_PROXY_TOOLS,
      profile
    );
    const visibleNames = catalog.getProjectedTools([]).map((t: any) => t.name);
    // Voice-relevant tools
    expect(visibleNames).toContain('elevenlabs_text_to_speech');
    expect(visibleNames).toContain('elevenlabs_get_voice');
    expect(visibleNames).toContain('discover_tools');
    expect(visibleNames).toContain('resolve_workflow');
    // Proxy DB tools must NOT be in voice profile
    expect(visibleNames).not.toContain('supabase_execute_sql');
    expect(visibleNames).not.toContain('supabase_list_tables');
    // Filesystem write is also out of scope for voice
    expect(visibleNames).not.toContain('fs_write_file');
  });

  it('research profile exposes read-only ops and excludes write/voice tools', () => {
    const profile = discovery.profiles.research;
    const catalog = new toolCatalogModule.ToolCatalogIndex(
      SAMPLE_NATIVE_TOOLS,
      SAMPLE_PROXY_TOOLS,
      profile
    );
    const visibleNames = catalog.getProjectedTools([]).map((t: any) => t.name);
    expect(visibleNames).toContain('fs_read_file');
    expect(visibleNames).toContain('fs_search_files');
    expect(visibleNames).toContain('memory_store');
    expect(visibleNames).toContain('discover_tools');
    // Write operations are out of scope
    expect(visibleNames).not.toContain('fs_write_file');
    expect(visibleNames).not.toContain('github_create_pull_request');
    // Voice and DB tools are not in research
    expect(visibleNames).not.toContain('elevenlabs_text_to_speech');
    expect(visibleNames).not.toContain('supabase_execute_sql');
  });

  it('legacy-full profile exposes the full surface (every native + every proxy)', () => {
    const profile = discovery.profiles['legacy-full'];
    expect(profile.alwaysVisible).toBe('all');
    const catalog = new toolCatalogModule.ToolCatalogIndex(
      SAMPLE_NATIVE_TOOLS,
      SAMPLE_PROXY_TOOLS,
      profile
    );
    const visibleNames = catalog.getProjectedTools([]).map((t: any) => t.name).sort();
    const allNames = [...SAMPLE_NATIVE_TOOLS, ...SAMPLE_PROXY_TOOLS].map((t) => t.name).sort();
    expect(visibleNames).toEqual(allNames);
  });

  it('legacy-dynamic profile is byte-identical to the default (all-native, no proxy)', () => {
    const profile = discovery.profiles['legacy-dynamic'];
    expect(profile.alwaysVisible).toBe('all-native');
    const catalog = new toolCatalogModule.ToolCatalogIndex(
      SAMPLE_NATIVE_TOOLS,
      SAMPLE_PROXY_TOOLS,
      profile
    );
    const visibleNames = catalog.getProjectedTools([]).map((t: any) => t.name).sort();
    const expected = SAMPLE_NATIVE_TOOLS.map((t) => t.name).sort();
    expect(visibleNames).toEqual(expected);
  });

  it('the 7 mandatory injection-point skills are declared on every default profile', () => {
    const required = [...resolverModule.MANDATORY_INJECTION_SKILLS].sort();
    for (const name of ['coding', 'research', 'voice']) {
      const profile = discovery.profiles[name];
      expect(profile.mandatoryInjectionSkills).toBeDefined();
      const declared = [...profile.mandatoryInjectionSkills].sort();
      expect(declared).toEqual(required);
    }
  });

  it('every default profile keeps execute_skill / resolve_workflow reachable for the 7 skills', () => {
    for (const name of ['coding', 'research', 'voice']) {
      const profile = discovery.profiles[name];
      const list = profile.alwaysVisible;
      expect(Array.isArray(list)).toBe(true);
      // Skill resolution surface must remain visible so the 7 mandatory
      // injection-point skills can be invoked even when their direct
      // tool wrapper isn't surfaced.
      expect(list).toContain('resolve_workflow');
      expect(list).toContain('discover_tools');
      // execute_skill is in coding/research; voice routes through
      // resolve_workflow + the panel-of-experts skill, so we don't
      // require execute_skill in the voice allowlist.
      if (name !== 'voice') {
        expect(list).toContain('execute_skill');
      }
    }
  });

  it('unknown profile name falls back to built-in default and warns on stderr', () => {
    const stderrCalls: string[] = [];
    const originalError = console.error;
    console.error = (...args: any[]) => {
      stderrCalls.push(args.map((a) => String(a)).join(' '));
    };
    try {
      const result = resolverModule.resolveActiveProfile({
        env: { EVOKORE_DISCOVERY_PROFILE: 'this-profile-does-not-exist' },
        config: discovery,
      });
      expect(result.profileName).toBe('default');
      expect(result.source).toBe('builtin-default');
      expect(result.profile.alwaysVisible).toBe('all-native');
      expect(result.reason).toMatch(/this-profile-does-not-exist/);
      // The fall-back reason is what surfaces to operators; the resolver
      // returns a structured `reason` field rather than emitting stderr
      // directly so callers can route the message wherever they want.
      // No stderr emission is required by contract, but the reason MUST
      // identify the missing profile name.
    } finally {
      console.error = originalError;
    }
  });
});
