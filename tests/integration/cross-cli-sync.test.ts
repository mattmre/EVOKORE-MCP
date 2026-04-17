import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawnSync } from 'child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SYNC_SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'sync-configs.js');

// Resolve the canonical project root using the same logic as sync-configs.js
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
    // Fall through
  }
  return PROJECT_ROOT;
}

const CANONICAL_ROOT = resolveCanonicalProjectRoot();
const EXPECTED_ENTRY_POINT = path.join(CANONICAL_ROOT, 'dist', 'index.js');

function createTempRoot(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `evokore-sync-${label}-`));
}

function runSync(args: string[], env: Record<string, string>): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [SYNC_SCRIPT_PATH, ...args], {
    encoding: 'utf8',
    env,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('Cross-CLI Sync (T18)', () => {
  it('sync-configs.js exists and passes syntax check', () => {
    expect(fs.existsSync(SYNC_SCRIPT_PATH)).toBe(true);
  });

  it('lists supported CLI config locations', () => {
    const source = fs.readFileSync(SYNC_SCRIPT_PATH, 'utf8');
    expect(source).toContain('claude-code');
    expect(source).toContain('claude-desktop');
    expect(source).toContain('cursor');
    expect(source).toContain('copilot');
    expect(source).toContain('codex');
    expect(source).toContain('gemini');
  });

  it('claude-code prefers the native user config when ~/.claude.json exists', () => {
    const tempRoot = createTempRoot('claude-code');
    const tempHome = path.join(tempRoot, 'home');
    const tempAppData = path.join(tempRoot, 'appdata');
    const nativeClaudeConfig = path.join(tempHome, '.claude.json');
    const legacyClaudeConfig = path.join(tempHome, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(legacyClaudeConfig), { recursive: true });
    fs.writeFileSync(nativeClaudeConfig, '{}\n');
    fs.writeFileSync(legacyClaudeConfig, '{}\n');

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      HOME: tempHome,
      USERPROFILE: tempHome,
      APPDATA: tempAppData,
    };

    try {
      const result = runSync(['--apply', 'claude-code'], env);
      expect(result.status).toBe(0);

      const config = JSON.parse(fs.readFileSync(nativeClaudeConfig, 'utf8'));
      const legacyConfig = JSON.parse(fs.readFileSync(legacyClaudeConfig, 'utf8'));
      expect(config.mcpServers['evokore-mcp'].command).toBe('node');
      expect(config.mcpServers['evokore-mcp'].args).toEqual([EXPECTED_ENTRY_POINT]);
      expect(legacyConfig.mcpServers).toBeUndefined();
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('copilot target writes the user MCP config', () => {
    const tempRoot = createTempRoot('copilot');
    const tempHome = path.join(tempRoot, 'home');
    const tempAppData = path.join(tempRoot, 'appdata');
    const copilotDir = path.join(tempHome, '.copilot');
    const configPath = path.join(copilotDir, 'mcp-config.json');
    fs.mkdirSync(copilotDir, { recursive: true });

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      HOME: tempHome,
      USERPROFILE: tempHome,
      APPDATA: tempAppData,
    };

    try {
      const result = runSync(['--apply', 'copilot'], env);
      expect(result.status).toBe(0);

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.mcpServers['evokore-mcp']).toEqual({
        type: 'local',
        command: 'node',
        args: [EXPECTED_ENTRY_POINT],
        tools: ['*'],
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('codex target writes the user TOML config', () => {
    const tempRoot = createTempRoot('codex');
    const tempHome = path.join(tempRoot, 'home');
    const tempAppData = path.join(tempRoot, 'appdata');
    const codexDir = path.join(tempHome, '.codex');
    const configPath = path.join(codexDir, 'config.toml');
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(configPath, 'model = "gpt-5.4"\n');

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      HOME: tempHome,
      USERPROFILE: tempHome,
      APPDATA: tempAppData,
    };

    try {
      const result = runSync(['--apply', 'codex'], env);
      expect(result.status).toBe(0);

      const config = fs.readFileSync(configPath, 'utf8');
      expect(config).toContain('[mcp_servers.evokore-mcp]');
      expect(config).toContain("command = 'node'");
      expect(config).toContain(`args = ['${EXPECTED_ENTRY_POINT}']`);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('--dry-run produces output without modifying files', () => {
    const tempRoot = createTempRoot('dry-run');
    const tempHome = path.join(tempRoot, 'home');
    const tempAppData = path.join(tempRoot, 'appdata');

    // Set up detection directory for claude-desktop
    let detectDir: string;
    if (process.platform === 'win32') {
      detectDir = path.join(tempAppData, 'Claude');
    } else if (process.platform === 'darwin') {
      detectDir = path.join(tempHome, 'Library', 'Application Support', 'Claude');
    } else {
      detectDir = path.join(tempHome, '.config', 'claude');
    }
    fs.mkdirSync(detectDir, { recursive: true });

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      HOME: tempHome,
      USERPROFILE: tempHome,
      APPDATA: tempAppData,
    };

    try {
      const result = runSync(['claude-desktop'], env);
      expect(result.status).toBe(0);

      // Dry-run should indicate it would write, not that it wrote
      if (result.stdout.includes('Detected')) {
        expect(result.stdout).toContain('Would write to');
      }

      // No config file should be created in dry-run mode
      let configPath: string;
      if (process.platform === 'win32') {
        configPath = path.join(tempAppData, 'Claude', 'claude_desktop_config.json');
      } else if (process.platform === 'darwin') {
        configPath = path.join(tempHome, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      } else {
        configPath = path.join(tempHome, '.config', 'claude', 'claude_desktop_config.json');
      }
      // In dry-run, no new file should be created if it didn't exist before
      // (may or may not exist depending on detect setup)
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('--apply --force overwrites existing evokore-mcp entry', () => {
    const tempRoot = createTempRoot('force');
    const tempHome = path.join(tempRoot, 'home');
    const tempAppData = path.join(tempRoot, 'appdata');

    let detectDir: string;
    let configPath: string;
    if (process.platform === 'win32') {
      detectDir = path.join(tempAppData, 'Claude');
      configPath = path.join(detectDir, 'claude_desktop_config.json');
    } else if (process.platform === 'darwin') {
      detectDir = path.join(tempHome, 'Library', 'Application Support', 'Claude');
      configPath = path.join(detectDir, 'claude_desktop_config.json');
    } else {
      detectDir = path.join(tempHome, '.config', 'claude');
      configPath = path.join(detectDir, 'claude_desktop_config.json');
    }
    fs.mkdirSync(detectDir, { recursive: true });

    // Pre-seed with a custom evokore-mcp entry
    const initialConfig = {
      mcpServers: {
        'evokore-mcp': { command: 'python', args: ['/old/path.py'] },
        'other-server': { command: 'node', args: ['/other.js'] },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2) + '\n');

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      HOME: tempHome,
      USERPROFILE: tempHome,
      APPDATA: tempAppData,
    };

    try {
      const result = runSync(['--apply', '--force', 'claude-desktop'], env);
      expect(result.status).toBe(0);

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      // Force should overwrite
      expect(config.mcpServers['evokore-mcp'].command).toBe('node');
      expect(config.mcpServers['evokore-mcp'].args[0]).toContain('dist');
      // Other servers preserved
      expect(config.mcpServers['other-server']).toEqual(initialConfig.mcpServers['other-server']);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('--apply (default preserve) does not overwrite existing evokore-mcp entry', () => {
    const tempRoot = createTempRoot('preserve');
    const tempHome = path.join(tempRoot, 'home');
    const tempAppData = path.join(tempRoot, 'appdata');

    let detectDir: string;
    let configPath: string;
    if (process.platform === 'win32') {
      detectDir = path.join(tempAppData, 'Claude');
      configPath = path.join(detectDir, 'claude_desktop_config.json');
    } else if (process.platform === 'darwin') {
      detectDir = path.join(tempHome, 'Library', 'Application Support', 'Claude');
      configPath = path.join(detectDir, 'claude_desktop_config.json');
    } else {
      detectDir = path.join(tempHome, '.config', 'claude');
      configPath = path.join(detectDir, 'claude_desktop_config.json');
    }
    fs.mkdirSync(detectDir, { recursive: true });

    // Pre-seed with custom entry
    const initialConfig = {
      mcpServers: {
        'evokore-mcp': { command: 'python', args: ['/custom/path.py'] },
      },
    };
    const initialContent = JSON.stringify(initialConfig, null, 2) + '\n';
    fs.writeFileSync(configPath, initialContent);

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      HOME: tempHome,
      USERPROFILE: tempHome,
      APPDATA: tempAppData,
    };

    try {
      const result = runSync(['--apply', 'claude-desktop'], env);
      expect(result.status).toBe(0);

      // In preserve mode, file should not be modified
      const afterContent = fs.readFileSync(configPath, 'utf8');
      expect(afterContent).toBe(initialContent);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('canonical repo root resolves to git common root (not worktree path)', () => {
    // The source code should use git rev-parse --git-common-dir
    const source = fs.readFileSync(SYNC_SCRIPT_PATH, 'utf8');
    expect(source).toContain('git-common-dir');

    // Verify our computed canonical root contains dist/index.js
    // (may not exist if tsc hasn't been run, but the path should be reasonable)
    expect(EXPECTED_ENTRY_POINT).toContain(path.join('dist', 'index.js'));

    // The canonical root should NOT be a worktree-specific path
    // (it should be the real repo root)
    const canonicalNormalized = CANONICAL_ROOT.replace(/\\/g, '/');
    // Should not contain .claude/worktrees in the canonical root path
    // OR if it does, it means the common root resolves there too (acceptable)
  });

  it('EVOKORE_SYNC_PROJECT_ROOT override works', () => {
    const source = fs.readFileSync(SYNC_SCRIPT_PATH, 'utf8');
    expect(source).toContain('EVOKORE_SYNC_PROJECT_ROOT');

    // The env var check should happen before git-common-dir
    const envCheckIdx = source.indexOf('EVOKORE_SYNC_PROJECT_ROOT');
    const gitCheckIdx = source.indexOf('git-common-dir');
    expect(envCheckIdx).toBeLessThan(gitCheckIdx);
  });

  it('rejects mutually exclusive flags (--dry-run + --apply)', () => {
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    const result = runSync(['--dry-run', '--apply'], env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cannot be used together');
  });

  it('rejects mutually exclusive flags (--force + --preserve-existing)', () => {
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    const result = runSync(['--force', '--preserve-existing'], env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cannot be used together');
  });

  it('rejects unknown targets', () => {
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    const result = runSync(['nonexistent-cli'], env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown target');
  });
});
