#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function resolveCanonicalProjectRoot() {
  const overrideRoot = process.env.EVOKORE_SYNC_PROJECT_ROOT;
  if (overrideRoot) {
    return path.resolve(overrideRoot);
  }

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
    // Fall back to the current project root outside of git worktree contexts.
  }

  return PROJECT_ROOT;
}

const CANONICAL_PROJECT_ROOT = resolveCanonicalProjectRoot();
const ENTRY_POINT = path.join(CANONICAL_PROJECT_ROOT, 'dist', 'index.js');
const HAS_DRY_RUN_FLAG = process.argv.includes('--dry-run');
const HAS_APPLY_FLAG = process.argv.includes('--apply');
const HAS_FORCE_FLAG = process.argv.includes('--force');
const HAS_PRESERVE_EXISTING_FLAG = process.argv.includes('--preserve-existing');
const TARGETS = process.argv.slice(2).filter(a =>
  a !== '--dry-run'
  && a !== '--apply'
  && a !== '--force'
  && a !== '--preserve-existing'
);

if (HAS_DRY_RUN_FLAG && HAS_APPLY_FLAG) {
  console.error('ERROR: --dry-run and --apply cannot be used together. Choose one mode.');
  process.exit(1);
}

if (HAS_FORCE_FLAG && HAS_PRESERVE_EXISTING_FLAG) {
  console.error('ERROR: --force and --preserve-existing cannot be used together. Choose one entry mode.');
  process.exit(1);
}

const DRY_RUN = !HAS_APPLY_FLAG;
const PRESERVE_EXISTING = !HAS_FORCE_FLAG;

// --- CLI Definitions ---

const CLI_DEFS = {
  'claude-code': {
    label: 'Claude Code',
    configPath: () => path.join(os.homedir(), '.claude', 'settings.json'),
    detect: () => {
      try {
        execSync(process.platform === 'win32' ? 'where claude' : 'which claude', { stdio: 'ignore' });
        return true;
      } catch { return false; }
    },
    merge: (config) => {
      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers['evokore-mcp'] = {
        command: 'node',
        args: [ENTRY_POINT],
      };
      return config;
    },
  },
  'claude-desktop': {
    label: 'Claude Desktop',
    configPath: () => {
      if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
      } else if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      }
      return path.join(os.homedir(), '.config', 'claude', 'claude_desktop_config.json');
    },
    detect: () => {
      const configPath = CLI_DEFS['claude-desktop'].configPath();
      return fs.existsSync(path.dirname(configPath));
    },
    merge: (config) => {
      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers['evokore-mcp'] = {
        command: 'node',
        args: [ENTRY_POINT],
      };
      return config;
    },
  },
  'cursor': {
    label: 'Cursor',
    configPath: () => {
      const userLevel = path.join(os.homedir(), '.cursor', 'mcp.json');
      if (fs.existsSync(userLevel)) return userLevel;
      return path.join(PROJECT_ROOT, '.cursor', 'mcp.json');
    },
    detect: () => {
      try {
        execSync(process.platform === 'win32' ? 'where cursor' : 'which cursor', { stdio: 'ignore' });
        return true;
      } catch {
        return fs.existsSync(path.join(os.homedir(), '.cursor'));
      }
    },
    merge: (config) => {
      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers['evokore-mcp'] = {
        command: 'node',
        args: [ENTRY_POINT],
      };
      return config;
    },
  },
  'gemini': {
    label: 'Gemini CLI',
    configPath: () => null, // Manual only
    detect: () => {
      try {
        execSync(process.platform === 'win32' ? 'where gemini' : 'which gemini', { stdio: 'ignore' });
        return true;
      } catch { return false; }
    },
    merge: null, // Print command instead
  },
};

// --- Helpers ---

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeJsonSafe(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// --- Main ---

function main() {
  console.log('EVOKORE-MCP Config Sync');
  if (CANONICAL_PROJECT_ROOT !== PROJECT_ROOT) {
    console.log(`Sync root: ${CANONICAL_PROJECT_ROOT}`);
  }
  console.log(`Entry point: ${ENTRY_POINT}`);
  if (DRY_RUN) console.log('Mode: DRY RUN (no files will be written)\n');
  else console.log('Mode: APPLY (changes will be written)\n');
  console.log(`Entry mode: ${PRESERVE_EXISTING ? 'PRESERVE EXISTING' : 'FORCE OVERWRITE'}\n`);

  const supportedTargets = Object.keys(CLI_DEFS);
  const invalidTargets = TARGETS.filter(target => !CLI_DEFS[target]);
  if (invalidTargets.length > 0) {
    console.error(
      `ERROR: Unknown target(s): ${invalidTargets.join(', ')}. Supported targets: ${supportedTargets.join(', ')}`
    );
    process.exit(1);
  }

  if (!fs.existsSync(ENTRY_POINT)) {
    console.error(`ERROR: ${ENTRY_POINT} not found. Run 'npx tsc' first.`);
    process.exit(1);
  }

  const targetKeys = TARGETS.length > 0
    ? TARGETS
    : supportedTargets;

  let synced = 0;

  for (const key of targetKeys) {
    const def = CLI_DEFS[key];
    const detected = def.detect();

    if (!detected) {
      console.log(`[${def.label}] Not detected, skipping.`);
      continue;
    }

    console.log(`[${def.label}] Detected.`);

    // Gemini CLI: manual command only
    if (!def.merge) {
      console.log(`  → Run manually:`);
      console.log(`    gemini mcp add evokore-mcp node ${ENTRY_POINT} --scope user`);
      synced++;
      continue;
    }

    const configPath = def.configPath();
    if (!configPath) {
      console.log(`  → No config path available.`);
      continue;
    }

    const existing = fs.existsSync(configPath) ? readJsonSafe(configPath) : {};
    const existingEntry = existing?.mcpServers?.['evokore-mcp'];
    const hasExistingEntry = !!existingEntry;
    const shouldPreserve = PRESERVE_EXISTING && hasExistingEntry;
    const updated = shouldPreserve
      ? existing
      : def.merge(JSON.parse(JSON.stringify(existing)));
    const resultingEntry = updated?.mcpServers?.['evokore-mcp'];
    const actionLabel = shouldPreserve
      ? 'Preserve existing entry (no overwrite)'
      : hasExistingEntry
        ? 'Overwrite existing entry (--force)'
        : 'Add new entry';

    if (DRY_RUN) {
      console.log(`  → Would write to: ${configPath}`);
      console.log('  → Existing evokore-mcp entry:');
      if (hasExistingEntry) {
        console.log(`    ${JSON.stringify(existingEntry, null, 2).replace(/\n/g, '\n    ')}`);
      } else {
        console.log('    (none)');
      }
      console.log(`  → Action: ${actionLabel}`);
      console.log('  → Resulting evokore-mcp entry:');
      console.log(`    ${JSON.stringify(resultingEntry, null, 2).replace(/\n/g, '\n    ')}`);
    } else {
      if (shouldPreserve) {
        console.log(`  → Preserved existing entry in: ${configPath} (no changes written)`);
      } else {
        writeJsonSafe(configPath, updated);
        console.log(`  → Updated: ${configPath}`);
      }
    }
    synced++;
  }

  console.log(`\nDone. ${synced} CLI(s) ${DRY_RUN ? 'would be synced' : 'synced'}.`);
}

main();
