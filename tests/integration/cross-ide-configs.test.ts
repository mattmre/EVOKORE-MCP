import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SYNC_SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'sync-configs.js');
const CONFIGS_DIR = path.join(PROJECT_ROOT, 'configs', 'cross-ide');

function resolveCanonicalProjectRoot(): string {
  const overrideRoot = process.env.EVOKORE_SYNC_PROJECT_ROOT;
  if (overrideRoot) return path.resolve(overrideRoot);

  try {
    const commonDirRaw = execSync('git rev-parse --git-common-dir', {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();

    if (commonDirRaw) {
      const resolvedCommonDir = path.resolve(PROJECT_ROOT, commonDirRaw);
      if (path.basename(resolvedCommonDir).toLowerCase() === '.git') {
        return path.dirname(resolvedCommonDir);
      }
    }
  } catch {
    // fall through
  }
  return PROJECT_ROOT;
}

const CANONICAL_ROOT = resolveCanonicalProjectRoot();

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function runSync(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [SYNC_SCRIPT_PATH, ...args], {
    encoding: 'utf8',
    env: { ...process.env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('Cross-IDE config templates', () => {
  it('cursor.json is valid JSON and has required keys', () => {
    const cfg = readJson(path.join(CONFIGS_DIR, 'cursor.json'));
    expect(cfg.mcpServers).toBeDefined();
    expect(cfg.mcpServers['evokore-mcp']).toBeDefined();
    expect(cfg.mcpServers['evokore-mcp'].command).toBe('node');
    expect(Array.isArray(cfg.mcpServers['evokore-mcp'].args)).toBe(true);
    expect(cfg.mcpServers['evokore-mcp'].args[0]).toContain('${EVOKORE_INSTALL_DIR}');
    expect(cfg.mcpServers['evokore-mcp'].env).toBeDefined();
    expect(cfg.mcpServers['evokore-mcp'].env.EVOKORE_MCP_CONFIG_PATH).toContain('${EVOKORE_INSTALL_DIR}');
  });

  it('windsurf.json is valid JSON and has required keys', () => {
    const cfg = readJson(path.join(CONFIGS_DIR, 'windsurf.json'));
    expect(cfg.mcpServers).toBeDefined();
    expect(cfg.mcpServers['evokore-mcp']).toBeDefined();
    expect(cfg.mcpServers['evokore-mcp'].command).toBe('node');
    expect(Array.isArray(cfg.mcpServers['evokore-mcp'].args)).toBe(true);
    expect(cfg.mcpServers['evokore-mcp'].args[0]).toContain('${EVOKORE_INSTALL_DIR}');
    expect(cfg.mcpServers['evokore-mcp'].env).toBeDefined();
    expect(cfg.mcpServers['evokore-mcp'].env.EVOKORE_MCP_CONFIG_PATH).toContain('${EVOKORE_INSTALL_DIR}');
  });

  it('continue.json has required keys (array element schema)', () => {
    const cfg = readJson(path.join(CONFIGS_DIR, 'continue.json'));
    expect(cfg.name).toBe('evokore-mcp');
    expect(cfg.command).toBe('node');
    expect(Array.isArray(cfg.args)).toBe(true);
    expect(cfg.args[0]).toContain('${EVOKORE_INSTALL_DIR}');
    expect(cfg.env).toBeDefined();
    expect(cfg.env.EVOKORE_MCP_CONFIG_PATH).toContain('${EVOKORE_INSTALL_DIR}');
  });
});

describe('sync-configs.js --target <ide>', () => {
  it('cursor --dry-run prints target path and resolved config without writing', () => {
    const { status, stdout } = runSync(['--target', 'cursor', '--dry-run']);
    expect(status).toBe(0);
    expect(stdout).toContain('Target: Cursor');
    expect(stdout).toContain('.cursor');
    expect(stdout).toContain('Would write to:');
    expect(stdout).toContain('"evokore-mcp"');
    // Placeholder must be substituted — the raw literal must not appear in the resolved config output.
    expect(stdout).not.toContain('${EVOKORE_INSTALL_DIR}');
  });

  it('windsurf --dry-run prints target path and resolved config without writing', () => {
    const { status, stdout } = runSync(['--target', 'windsurf', '--dry-run']);
    expect(status).toBe(0);
    expect(stdout).toContain('Target: Windsurf');
    expect(stdout).toContain('windsurf');
    expect(stdout).toContain('mcp_config.json');
    expect(stdout).toContain('Would write to:');
    expect(stdout).not.toContain('${EVOKORE_INSTALL_DIR}');
  });

  it('continue --dry-run prints target path and resolved array entry without writing', () => {
    const { status, stdout } = runSync(['--target', 'continue', '--dry-run']);
    expect(status).toBe(0);
    expect(stdout).toContain('Target: Continue');
    expect(stdout).toContain('.continue');
    expect(stdout).toContain('config.json');
    expect(stdout).toContain('Would write to:');
    // Continue uses array schema; the resolved output should be under `mcpServers` as an array.
    expect(stdout).toMatch(/"mcpServers":\s*\[/);
    expect(stdout).not.toContain('${EVOKORE_INSTALL_DIR}');
  });

  it('${EVOKORE_INSTALL_DIR} placeholder is substituted with the canonical project root', () => {
    const { status, stdout } = runSync(['--target', 'cursor', '--dry-run']);
    expect(status).toBe(0);
    // The resolved dist/index.js path should appear with forward slashes after the canonical root.
    // On Windows the canonical root contains backslashes; JSON-escaped output doubles them.
    const escapedRoot = CANONICAL_ROOT.replace(/\\/g, '\\\\');
    expect(stdout).toContain(`${escapedRoot}/dist/index.js`);
  });

  it('invalid --target value prints a helpful error and exits 1', () => {
    const { status, stderr } = runSync(['--target', 'nonsense', '--dry-run']);
    expect(status).toBe(1);
    expect(stderr).toContain('Unknown --target');
    expect(stderr).toMatch(/cursor.*windsurf.*continue/);
  });
});
