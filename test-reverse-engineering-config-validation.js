'use strict';

const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, 'mcp.config.json');
const envExamplePath = path.resolve(__dirname, '.env.example');
const setupPath = path.resolve(__dirname, 'docs', 'SETUP.md');
const usagePath = path.resolve(__dirname, 'docs', 'USAGE.md');
const troubleshootingPath = path.resolve(__dirname, 'docs', 'TROUBLESHOOTING.md');

describe('reverse-engineering child server config validation', () => {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const envExample = fs.readFileSync(envExamplePath, 'utf8');
  const setupDoc = fs.readFileSync(setupPath, 'utf8');
  const usageDoc = fs.readFileSync(usagePath, 'utf8');
  const troubleshootingDoc = fs.readFileSync(troubleshootingPath, 'utf8');

  test('ghidra_headless, reva, and binary_analysis entries exist and are opt-in', () => {
    expect(config.servers.ghidra_headless).toBeDefined();
    expect(config.servers.reva).toBeDefined();
    expect(config.servers.binary_analysis).toBeDefined();
    expect(config.servers.ghidra_headless.disabled).toBe(true);
    expect(config.servers.reva.disabled).toBe(true);
    expect(config.servers.binary_analysis.disabled).toBe(true);
  });

  test('ghidra_headless entry uses placeholder-backed stdio launch with cwd', () => {
    expect(config.servers.ghidra_headless.command).toBe('${EVOKORE_RE_GHIDRA_HEADLESS_PYTHON}');
    expect(config.servers.ghidra_headless.cwd).toBe('${EVOKORE_RE_GHIDRA_HEADLESS_REPO}');
    expect(config.servers.ghidra_headless.args).toEqual([
      '-m',
      'ghidra_headless_mcp',
      '--ghidra-install-dir',
      '${GHIDRA_INSTALL_DIR}',
    ]);
  });

  test('reva entry uses placeholder-backed stdio launch with cwd', () => {
    expect(config.servers.reva.command).toBe('${EVOKORE_RE_REVA_PYTHON}');
    expect(config.servers.reva.cwd).toBe('${EVOKORE_RE_REVA_REPO}');
    expect(config.servers.reva.args).toEqual(['-m', 'reva_cli']);
  });

  test('binary_analysis entry wires ghidra, x64dbg, and windbg env placeholders', () => {
    expect(config.servers.binary_analysis.command).toBe('${EVOKORE_RE_BINARY_MCP_PYTHON}');
    expect(config.servers.binary_analysis.cwd).toBe('${EVOKORE_RE_BINARY_MCP_REPO}');
    expect(config.servers.binary_analysis.args).toEqual(['-m', 'src.server']);
    expect(config.servers.binary_analysis.env).toEqual({
      GHIDRA_HOME: '${GHIDRA_INSTALL_DIR}',
      WINDBG_PATH: '${WINDBG_PATH}',
      X64DBG_BRIDGE_URL: '${X64DBG_BRIDGE_URL}',
    });
  });

  test('reverse-engineering env placeholders are documented', () => {
    for (const variableName of [
      'GHIDRA_INSTALL_DIR',
      'EVOKORE_RE_GHIDRA_HEADLESS_PYTHON',
      'EVOKORE_RE_GHIDRA_HEADLESS_REPO',
      'EVOKORE_RE_REVA_PYTHON',
      'EVOKORE_RE_REVA_REPO',
      'EVOKORE_RE_BINARY_MCP_PYTHON',
      'EVOKORE_RE_BINARY_MCP_REPO',
      'WINDBG_PATH',
      'X64DBG_BRIDGE_URL',
    ]) {
      expect(envExample).toMatch(new RegExp(`(?:^|\\n)#?\\s*${variableName}=`));
    }
  });

  test('operator docs explain disabled reverse-engineering child servers', () => {
    expect(setupDoc).toMatch(/reverse-engineering child servers/i);
    expect(setupDoc).toMatch(/disabled by default/i);
    expect(setupDoc).toMatch(/ghidra-live/i);
    expect(usageDoc).toMatch(/"disabled": true/);
    expect(troubleshootingDoc).toMatch(/Disabled child servers are skipped before placeholder resolution/i);
    expect(troubleshootingDoc).toMatch(/resolved Python interpreter path and repo working directory/i);
  });
});
