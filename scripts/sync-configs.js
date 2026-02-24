#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENTRY_POINT = path.join(PROJECT_ROOT, 'dist', 'index.js');
const HAS_DRY_RUN_FLAG = process.argv.includes('--dry-run');
const HAS_APPLY_FLAG = process.argv.includes('--apply');
const TARGETS = process.argv.slice(2).filter(a => a !== '--dry-run' && a !== '--apply');

if (HAS_DRY_RUN_FLAG && HAS_APPLY_FLAG) {
  console.error('ERROR: --dry-run and --apply cannot be used together. Choose one mode.');
  process.exit(1);
}

const DRY_RUN = !HAS_APPLY_FLAG;

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
  console.log(`Entry point: ${ENTRY_POINT}`);
  if (DRY_RUN) console.log('Mode: DRY RUN (no files will be written)\n');
  else console.log('Mode: APPLY (changes will be written)\n');

  if (!fs.existsSync(ENTRY_POINT)) {
    console.error(`ERROR: ${ENTRY_POINT} not found. Run 'npx tsc' first.`);
    process.exit(1);
  }

  const targetKeys = TARGETS.length > 0
    ? TARGETS.filter(t => CLI_DEFS[t])
    : Object.keys(CLI_DEFS);

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
    const updated = def.merge(JSON.parse(JSON.stringify(existing)));

    if (DRY_RUN) {
      console.log(`  → Would write to: ${configPath}`);
      console.log(`  → evokore-mcp entry:`);
      console.log(`    ${JSON.stringify(updated.mcpServers['evokore-mcp'], null, 2).replace(/\n/g, '\n    ')}`);
    } else {
      writeJsonSafe(configPath, updated);
      console.log(`  → Updated: ${configPath}`);
    }
    synced++;
  }

  console.log(`\nDone. ${synced} CLI(s) ${DRY_RUN ? 'would be synced' : 'synced'}.`);
}

main();
