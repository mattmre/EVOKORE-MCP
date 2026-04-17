#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MCP_SERVER_NAME = 'evokore-mcp';

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

// Parse --target <ide> flag for cross-IDE template-based sync
function parseTargetFlag(argv) {
  const idx = argv.indexOf('--target');
  if (idx === -1) return null;
  const value = argv[idx + 1];
  if (!value || value.startsWith('--')) {
    console.error('ERROR: --target requires a value (cursor, windsurf, or continue).');
    process.exit(1);
  }
  return value;
}

const TARGET_IDE = parseTargetFlag(process.argv);

const TARGETS = process.argv.slice(2).filter((a, i, arr) => {
  if (a === '--dry-run' || a === '--apply' || a === '--force' || a === '--preserve-existing') return false;
  if (a === '--target') return false;
  // Also exclude the value following --target
  if (i > 0 && arr[i - 1] === '--target') return false;
  return true;
});

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

function commandExists(command) {
  try {
    execSync(process.platform === 'win32' ? `where ${command}` : `which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getClaudeCodeConfigPath() {
  const nativeUserConfig = path.join(os.homedir(), '.claude.json');
  if (fs.existsSync(nativeUserConfig)) {
    return nativeUserConfig;
  }

  const legacyUserConfig = path.join(os.homedir(), '.claude', 'settings.json');
  if (fs.existsSync(legacyUserConfig)) {
    return legacyUserConfig;
  }

  return nativeUserConfig;
}

function getClaudeDesktopConfigPath() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  return path.join(os.homedir(), '.config', 'claude', 'claude_desktop_config.json');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function basicStdioEntry() {
  return {
    command: 'node',
    args: [ENTRY_POINT],
  };
}

function copilotEntry() {
  return {
    type: 'local',
    command: 'node',
    args: [ENTRY_POINT],
    tools: ['*'],
  };
}

// --- CLI Definitions ---

const CLI_DEFS = {
  'claude-code': {
    label: 'Claude Code',
    format: 'json',
    configPath: () => getClaudeCodeConfigPath(),
    detect: () => commandExists('claude')
      || fs.existsSync(path.join(os.homedir(), '.claude.json'))
      || fs.existsSync(path.join(os.homedir(), '.claude')),
    entry: () => basicStdioEntry(),
  },
  'claude-desktop': {
    label: 'Claude Desktop',
    format: 'json',
    configPath: () => getClaudeDesktopConfigPath(),
    detect: () => fs.existsSync(path.dirname(getClaudeDesktopConfigPath())),
    entry: () => basicStdioEntry(),
  },
  'cursor': {
    label: 'Cursor',
    format: 'json',
    configPath: () => {
      const userLevel = path.join(os.homedir(), '.cursor', 'mcp.json');
      if (fs.existsSync(userLevel)) return userLevel;
      return path.join(PROJECT_ROOT, '.cursor', 'mcp.json');
    },
    detect: () => commandExists('cursor') || fs.existsSync(path.join(os.homedir(), '.cursor')),
    entry: () => basicStdioEntry(),
  },
  'copilot': {
    label: 'Copilot CLI',
    format: 'json',
    configPath: () => path.join(os.homedir(), '.copilot', 'mcp-config.json'),
    detect: () => commandExists('copilot') || fs.existsSync(path.join(os.homedir(), '.copilot')),
    entry: () => copilotEntry(),
  },
  'codex': {
    label: 'Codex CLI',
    format: 'toml',
    configPath: () => path.join(os.homedir(), '.codex', 'config.toml'),
    detect: () => commandExists('codex') || fs.existsSync(path.join(os.homedir(), '.codex')),
    entry: () => basicStdioEntry(),
  },
  'gemini': {
    label: 'Gemini CLI',
    format: 'manual',
    configPath: () => null,
    detect: () => commandExists('gemini'),
    manualCommand: () => `gemini mcp add ${MCP_SERVER_NAME} node ${ENTRY_POINT} --scope user`,
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

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function writeTextSafe(filePath, text) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, text);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tomlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function extractTomlTableRange(text, tableName) {
  const headerPattern = new RegExp(`^\\[${escapeRegex(tableName)}\\]\\s*$`, 'm');
  const headerMatch = headerPattern.exec(text);
  if (!headerMatch) {
    return null;
  }

  const start = headerMatch.index;
  const afterHeader = start + headerMatch[0].length;
  const remainder = text.slice(afterHeader);
  const nextHeaderMatch = /^\[[^\n]+\]\s*$/m.exec(remainder);
  const end = nextHeaderMatch ? afterHeader + nextHeaderMatch.index : text.length;
  return { start, end };
}

function parseTomlArrayValues(arrayText) {
  const values = [];
  const tokenPattern = /'((?:[^']|'')*)'|"((?:[^"\\]|\\.)*)"/g;
  let match = tokenPattern.exec(arrayText);
  while (match) {
    if (match[1] !== undefined) {
      values.push(match[1].replace(/''/g, "'"));
    } else {
      values.push(match[2]);
    }
    match = tokenPattern.exec(arrayText);
  }
  return values;
}

function parseCodexEntry(text, name) {
  const tableName = `mcp_servers.${name}`;
  const range = extractTomlTableRange(text, tableName);
  if (!range) {
    return null;
  }

  const block = text.slice(range.start, range.end);
  const commandMatch = block.match(/^command\s*=\s*(['"])(.*)\1\s*$/m);
  const argsMatch = block.match(/^args\s*=\s*\[(.*)\]\s*$/m);
  return {
    command: commandMatch ? commandMatch[2] : null,
    args: argsMatch ? parseTomlArrayValues(argsMatch[1]) : [],
  };
}

function buildCodexEntryBlock(name, entry) {
  return [
    `[mcp_servers.${name}]`,
    `command = ${tomlLiteral(entry.command)}`,
    `args = [${entry.args.map(tomlLiteral).join(', ')}]`,
    '',
  ].join('\n');
}

function upsertCodexEntry(text, name, entry) {
  const block = buildCodexEntryBlock(name, entry);
  const tableName = `mcp_servers.${name}`;
  const range = extractTomlTableRange(text, tableName);

  if (!range) {
    const prefix = text.trimEnd();
    return `${prefix}${prefix ? '\n\n' : ''}${block}`;
  }

  const before = text.slice(0, range.start).replace(/\s*$/, '');
  const after = text.slice(range.end).replace(/^\s*/, '');
  const pieces = [];
  if (before) pieces.push(before);
  pieces.push(block.trimEnd());
  if (after) pieces.push(after);
  return `${pieces.join('\n\n')}\n`;
}

function readExistingEntry(def, configPath) {
  if (def.format === 'json') {
    const existing = fs.existsSync(configPath) ? readJsonSafe(configPath) : {};
    return {
      raw: existing,
      entry: existing?.mcpServers?.[MCP_SERVER_NAME] || null,
    };
  }

  if (def.format === 'toml') {
    const existingText = readTextSafe(configPath);
    return {
      raw: existingText,
      entry: parseCodexEntry(existingText, MCP_SERVER_NAME),
    };
  }

  return { raw: null, entry: null };
}

function writeUpdatedEntry(def, configPath, entry, existingRaw) {
  if (def.format === 'json') {
    const updated = clone(existingRaw || {});
    if (!updated.mcpServers) updated.mcpServers = {};
    updated.mcpServers[MCP_SERVER_NAME] = entry;
    writeJsonSafe(configPath, updated);
    return updated;
  }

  if (def.format === 'toml') {
    const updatedText = upsertCodexEntry(existingRaw || '', MCP_SERVER_NAME, entry);
    writeTextSafe(configPath, updatedText);
    return updatedText;
  }

  return existingRaw;
}

// --- Cross-IDE template targets (Cursor, Windsurf, Continue) ---

const CROSS_IDE_TARGETS = {
  cursor: {
    label: 'Cursor',
    templateFile: 'cursor.json',
    configPath: () => path.join(os.homedir(), '.cursor', 'mcp.json'),
    mergeKind: 'mcpServers-named',
  },
  windsurf: {
    label: 'Windsurf',
    templateFile: 'windsurf.json',
    configPath: () => path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    mergeKind: 'mcpServers-named',
  },
  continue: {
    label: 'Continue',
    templateFile: 'continue.json',
    configPath: () => path.join(os.homedir(), '.continue', 'config.json'),
    mergeKind: 'mcpServers-array',
  },
};

function substitutePlaceholders(obj, installDir) {
  const json = JSON.stringify(obj);
  const escapedDir = installDir.replace(/\\/g, '\\\\');
  const substituted = json.replace(/\$\{EVOKORE_INSTALL_DIR\}/g, escapedDir);
  return JSON.parse(substituted);
}

function runCrossIdeTarget(targetKey) {
  const def = CROSS_IDE_TARGETS[targetKey];
  if (!def) {
    const supported = Object.keys(CROSS_IDE_TARGETS).join(', ');
    console.error(`ERROR: Unknown --target '${targetKey}'. Supported: ${supported}`);
    process.exit(1);
  }

  const templatePath = path.join(PROJECT_ROOT, 'configs', 'cross-ide', def.templateFile);
  if (!fs.existsSync(templatePath)) {
    console.error(`ERROR: Template not found: ${templatePath}`);
    process.exit(1);
  }

  const rawTemplate = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
  const resolved = substitutePlaceholders(rawTemplate, CANONICAL_PROJECT_ROOT);
  const configPath = def.configPath();

  console.log('EVOKORE-MCP Cross-IDE Config Sync');
  console.log(`Target: ${def.label}`);
  console.log(`Install dir: ${CANONICAL_PROJECT_ROOT}`);
  console.log(`Config path: ${configPath}`);
  if (DRY_RUN) console.log('Mode: DRY RUN (no files will be written)\n');
  else console.log('Mode: APPLY (changes will be written)\n');

  let merged;
  if (def.mergeKind === 'mcpServers-named') {
    const existing = fs.existsSync(configPath) ? readJsonSafe(configPath) : {};
    if (!existing.mcpServers) existing.mcpServers = {};
    existing.mcpServers['evokore-mcp'] = resolved.mcpServers['evokore-mcp'];
    merged = existing;
  } else if (def.mergeKind === 'mcpServers-array') {
    const existing = fs.existsSync(configPath) ? readJsonSafe(configPath) : {};
    if (!Array.isArray(existing.mcpServers)) existing.mcpServers = [];
    const filtered = existing.mcpServers.filter(
      (entry) => entry && entry.name !== 'evokore-mcp'
    );
    filtered.push(resolved);
    existing.mcpServers = filtered;
    merged = existing;
  } else {
    merged = resolved;
  }

  if (DRY_RUN) {
    console.log('Resulting config:');
    console.log(JSON.stringify(merged, null, 2));
    console.log(`\nWould write to: ${configPath}`);
  } else {
    writeJsonSafe(configPath, merged);
    console.log(`Wrote: ${configPath}`);
  }
}

// --- Main ---

function main() {
  // Cross-IDE template path (--target <ide>) short-circuits the CLI sync flow.
  if (TARGET_IDE) {
    runCrossIdeTarget(TARGET_IDE);
    return;
  }

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

  const targetKeys = TARGETS.length > 0 ? TARGETS : supportedTargets;
  let synced = 0;

  for (const key of targetKeys) {
    const def = CLI_DEFS[key];
    const detected = def.detect();

    if (!detected) {
      console.log(`[${def.label}] Not detected, skipping.`);
      continue;
    }

    console.log(`[${def.label}] Detected.`);

    if (def.format === 'manual') {
      console.log('  → Run manually:');
      console.log(`    ${def.manualCommand()}`);
      synced++;
      continue;
    }

    const configPath = def.configPath();
    if (!configPath) {
      console.log(`  → No config path available.`);
      continue;
    }

    const desiredEntry = def.entry();
    const existingState = readExistingEntry(def, configPath);
    const existingEntry = existingState.entry;
    const hasExistingEntry = !!existingEntry;
    const shouldPreserve = PRESERVE_EXISTING && hasExistingEntry;
    const resultingEntry = shouldPreserve ? existingEntry : desiredEntry;
    const actionLabel = shouldPreserve
      ? 'Preserve existing entry (no overwrite)'
      : hasExistingEntry
        ? 'Overwrite existing entry (--force)'
        : 'Add new entry';

    if (DRY_RUN) {
      console.log(`  → Would write to: ${configPath}`);
      console.log(`  → Existing ${MCP_SERVER_NAME} entry:`);
      if (hasExistingEntry) {
        console.log(`    ${JSON.stringify(existingEntry, null, 2).replace(/\n/g, '\n    ')}`);
      } else {
        console.log('    (none)');
      }
      console.log(`  → Action: ${actionLabel}`);
      console.log(`  → Resulting ${MCP_SERVER_NAME} entry:`);
      console.log(`    ${JSON.stringify(resultingEntry, null, 2).replace(/\n/g, '\n    ')}`);
    } else if (shouldPreserve) {
      console.log(`  → Preserved existing entry in: ${configPath} (no changes written)`);
    } else {
      writeUpdatedEntry(def, configPath, desiredEntry, existingState.raw);
      console.log(`  → Updated: ${configPath}`);
    }
    synced++;
  }

  console.log(`\nDone. ${synced} CLI(s) ${DRY_RUN ? 'would be synced' : 'synced'}.`);
}

main();
