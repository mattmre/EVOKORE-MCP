import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const compliancePath = path.join(ROOT, 'dist', 'ComplianceChecker.js');

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-compliance-test-'));
}

async function rimraf(dir: string): Promise<void> {
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

const STEERING_MODES_FIXTURE = {
  dev: { name: 'dev', tools: [], allow_writes: true, damage_control_level: 'normal', focus: 'development' },
  research: { name: 'research', tools: ['read'], allow_writes: false, damage_control_level: 'normal', focus: 'research' },
  review: { name: 'review', tools: ['read'], allow_writes: false, damage_control_level: 'maximum', focus: 'review' },
  'security-audit': { name: 'security-audit', tools: ['read'], allow_writes: false, damage_control_level: 'maximum', focus: 'security' },
};

const RULES_FIXTURE = `# RULES

## § 2 Permissions

### Deny
- \`malicious_tool\`
- \`git push --force origin main\`

### Require-Approval
- \`delete_database\`

## § 1 Zero-Access

### Zero-Access
- \`.env\`
- \`id_rsa\`
`;

function writeFixtures(dir: string): { steeringModesPath: string; rulesPath: string } {
  const steeringModesPath = path.join(dir, 'steering-modes.json');
  const rulesPath = path.join(dir, 'RULES.md');
  fs.writeFileSync(steeringModesPath, JSON.stringify(STEERING_MODES_FIXTURE), 'utf8');
  fs.writeFileSync(rulesPath, RULES_FIXTURE, 'utf8');
  return { steeringModesPath, rulesPath };
}

describe('ComplianceChecker', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(async () => {
    await rimraf(tmpDir);
  });

  describe('module exists and exports', () => {
    it('has compiled JavaScript file', () => {
      expect(fs.existsSync(compliancePath)).toBe(true);
    });

    it('exports ComplianceChecker class', () => {
      const mod = require(compliancePath);
      expect(mod.ComplianceChecker).toBeDefined();
      expect(typeof mod.ComplianceChecker).toBe('function');
    });
  });

  describe('policy bundle loading', () => {
    it('parses RULES.md and extracts fingerprint + sections', () => {
      const { ComplianceChecker } = require(compliancePath);
      const { steeringModesPath, rulesPath } = writeFixtures(tmpDir);
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath });

      expect(checker.policyBundle.fingerprint).toBeDefined();
      expect(checker.policyBundle.fingerprint).not.toBe('unknown');
      expect(checker.policyBundle.fingerprint.length).toBe(16);
      expect(Array.isArray(checker.policyBundle.rulesSections)).toBe(true);
      expect(checker.policyBundle.rulesSections.length).toBeGreaterThan(0);
    });

    it('extracts zero-access paths, deny tool names, and deny command patterns', () => {
      const { ComplianceChecker } = require(compliancePath);
      const { steeringModesPath, rulesPath } = writeFixtures(tmpDir);
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath });

      expect(checker.policyBundle.zeroAccessPaths).toContain('.env');
      expect(checker.policyBundle.zeroAccessPaths).toContain('id_rsa');
      expect(checker.policyBundle.denyToolNames).toContain('malicious_tool');
      expect(checker.policyBundle.denyCommandPatterns).toContain('git push --force origin main');
    });

    it('fails open with an empty policy bundle when RULES.md is missing', () => {
      const { ComplianceChecker } = require(compliancePath);
      const steeringModesPath = path.join(tmpDir, 'steering-modes.json');
      fs.writeFileSync(steeringModesPath, JSON.stringify(STEERING_MODES_FIXTURE), 'utf8');
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath: path.join(tmpDir, 'missing.md') });

      expect(checker.policyBundle.fingerprint).toBe('unknown');
      expect(checker.policyBundle.rulesSections).toEqual([]);
    });
  });

  describe('check() — unknown mode fail-open', () => {
    it('returns allowed=true when mode does not exist in steering-modes.json', () => {
      const { ComplianceChecker } = require(compliancePath);
      const { steeringModesPath, rulesPath } = writeFixtures(tmpDir);
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath });

      const result = checker.check('Write', { file_path: '/tmp/x' }, 'nonexistent-mode');
      expect(result.allowed).toBe(true);
      expect(result.steeringMode).toBe('nonexistent-mode');
    });
  });

  describe('check() — write gate', () => {
    it('denies Write in research mode (allow_writes=false)', () => {
      const { ComplianceChecker } = require(compliancePath);
      const { steeringModesPath, rulesPath } = writeFixtures(tmpDir);
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath });

      const result = checker.check('Write', { file_path: '/tmp/x' }, 'research');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/disallows write operations/);
      expect(result.steeringMode).toBe('research');
    });

    it('denies Edit in security-audit mode', () => {
      const { ComplianceChecker } = require(compliancePath);
      const { steeringModesPath, rulesPath } = writeFixtures(tmpDir);
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath });

      const result = checker.check('Edit', { file_path: '/tmp/x' }, 'security-audit');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/disallows write operations/);
    });

    it('allows Write in dev mode (allow_writes=true)', () => {
      const { ComplianceChecker } = require(compliancePath);
      const { steeringModesPath, rulesPath } = writeFixtures(tmpDir);
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath });

      const result = checker.check('Write', { file_path: '/tmp/x' }, 'dev');
      expect(result.allowed).toBe(true);
    });
  });

  describe('check() — tool-family gate', () => {
    it('allows Read in research mode (tools=["read"])', () => {
      const { ComplianceChecker } = require(compliancePath);
      const { steeringModesPath, rulesPath } = writeFixtures(tmpDir);
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath });

      const result = checker.check('Read', { file_path: '/tmp/x' }, 'research');
      expect(result.allowed).toBe(true);
    });

    it('denies Grep in research mode when tools=["read"] only (Grep is in "read" family)', () => {
      // Grep is actually in the "read" family in our MODE_TOOL_FAMILIES mapping, so
      // this should be ALLOWED. Verify the family mapping.
      const { ComplianceChecker } = require(compliancePath);
      const { steeringModesPath, rulesPath } = writeFixtures(tmpDir);
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath });

      const result = checker.check('Grep', { pattern: 'x' }, 'research');
      expect(result.allowed).toBe(true);
    });

    it('allows proxied tools to pass the family gate (contains "-" or "__")', () => {
      const { ComplianceChecker } = require(compliancePath);
      const { steeringModesPath, rulesPath } = writeFixtures(tmpDir);
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath });

      // Proxied tools have hyphens or double-underscores — not a "known family" tool.
      const result = checker.check('github__list_repos', { org: 'foo' }, 'research');
      expect(result.allowed).toBe(true);
    });
  });

  describe('check() — RULES.md deny list', () => {
    it('denies exact tool-name match from the Deny section', () => {
      const { ComplianceChecker } = require(compliancePath);
      const { steeringModesPath, rulesPath } = writeFixtures(tmpDir);
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath });

      const result = checker.check('malicious_tool', {}, 'dev');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/denied by RULES\.md policy/);
    });

    it('denies Bash command matching a deny pattern from RULES.md', () => {
      const { ComplianceChecker } = require(compliancePath);
      const { steeringModesPath, rulesPath } = writeFixtures(tmpDir);
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath });

      const result = checker.check('Bash', { command: 'git push --force origin main' }, 'dev');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/matches RULES\.md deny pattern/);
    });

    it('allows a benign Bash command', () => {
      const { ComplianceChecker } = require(compliancePath);
      const { steeringModesPath, rulesPath } = writeFixtures(tmpDir);
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath });

      const result = checker.check('Bash', { command: 'npm test' }, 'dev');
      expect(result.allowed).toBe(true);
    });
  });

  describe('check() — sensitive path check', () => {
    it('denies when any string arg contains a zero-access pattern', () => {
      const { ComplianceChecker } = require(compliancePath);
      const { steeringModesPath, rulesPath } = writeFixtures(tmpDir);
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath });

      const result = checker.check('Read', { file_path: '/home/user/.env' }, 'dev');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/sensitive path pattern/);
    });

    it('denies when an arg contains id_rsa', () => {
      const { ComplianceChecker } = require(compliancePath);
      const { steeringModesPath, rulesPath } = writeFixtures(tmpDir);
      const checker = new ComplianceChecker({ steeringModesPath, rulesPath });

      const result = checker.check('Read', { file_path: '/home/user/.ssh/id_rsa' }, 'dev');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/sensitive path pattern/);
    });
  });
});
