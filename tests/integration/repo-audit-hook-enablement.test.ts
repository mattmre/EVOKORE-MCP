import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const runtimePath = path.join(ROOT, 'scripts', 'repo-audit-hook-runtime.js');
const hookPath = path.join(ROOT, 'scripts', 'hooks', 'repo-audit-hook.js');
const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');

describe('Repo Audit Hook Default Enablement', () => {
  describe('source-level validation', () => {
    const runtimeSrc = fs.readFileSync(runtimePath, 'utf8');

    it('uses opt-out gate (=== "false") instead of opt-in gate (!== "true")', () => {
      expect(runtimeSrc).toMatch(/=== 'false'/);
      expect(runtimeSrc).not.toMatch(/!== 'true'/);
    });

    it('references EVOKORE_REPO_AUDIT_HOOK env var', () => {
      expect(runtimeSrc).toMatch(/EVOKORE_REPO_AUDIT_HOOK/);
    });

    it('comments indicate enabled by default', () => {
      expect(runtimeSrc).toMatch(/[Ee]nabled by default/);
    });

    it('comments indicate opt-out mechanism', () => {
      expect(runtimeSrc).toMatch(/opt-out/i);
    });
  });

  describe('runtime behavior', () => {
    it('exits silently when EVOKORE_REPO_AUDIT_HOOK=false', () => {
      const result = spawnSync(process.execPath, [hookPath], {
        input: JSON.stringify({ session_id: 'test-disabled-' + Date.now() }),
        encoding: 'utf8',
        env: Object.assign({}, process.env, { EVOKORE_REPO_AUDIT_HOOK: 'false' }),
        timeout: 10000,
      });

      expect(result.status).toBe(0);
      expect((result.stdout || '').trim()).toBe('');
    });

    it('runs audit when EVOKORE_REPO_AUDIT_HOOK is unset (default enabled)', () => {
      const sessionId = 'test-default-enabled-' + Date.now();
      const markerFile = path.join(SESSIONS_DIR, sessionId + '-audit-done');

      // Clean up any pre-existing marker
      try { fs.unlinkSync(markerFile); } catch { /* ignore */ }

      const env = Object.assign({}, process.env);
      delete env.EVOKORE_REPO_AUDIT_HOOK;

      const result = spawnSync(process.execPath, [hookPath], {
        input: JSON.stringify({ session_id: sessionId }),
        encoding: 'utf8',
        env,
        timeout: 15000,
      });

      expect(result.status).toBe(0);
      // Marker file should exist because the audit ran
      expect(fs.existsSync(markerFile)).toBe(true);

      // Clean up
      try { fs.unlinkSync(markerFile); } catch { /* ignore */ }
    });

    it('runs audit when EVOKORE_REPO_AUDIT_HOOK is empty string (not "false")', () => {
      const sessionId = 'test-empty-string-' + Date.now();
      const markerFile = path.join(SESSIONS_DIR, sessionId + '-audit-done');

      try { fs.unlinkSync(markerFile); } catch { /* ignore */ }

      const result = spawnSync(process.execPath, [hookPath], {
        input: JSON.stringify({ session_id: sessionId }),
        encoding: 'utf8',
        env: Object.assign({}, process.env, { EVOKORE_REPO_AUDIT_HOOK: '' }),
        timeout: 15000,
      });

      expect(result.status).toBe(0);
      // Empty string is NOT 'false', so audit should have run
      expect(fs.existsSync(markerFile)).toBe(true);

      try { fs.unlinkSync(markerFile); } catch { /* ignore */ }
    });

    it('runs audit when EVOKORE_REPO_AUDIT_HOOK=true (explicit enable)', () => {
      const sessionId = 'test-explicit-true-' + Date.now();
      const markerFile = path.join(SESSIONS_DIR, sessionId + '-audit-done');

      try { fs.unlinkSync(markerFile); } catch { /* ignore */ }

      const result = spawnSync(process.execPath, [hookPath], {
        input: JSON.stringify({ session_id: sessionId }),
        encoding: 'utf8',
        env: Object.assign({}, process.env, { EVOKORE_REPO_AUDIT_HOOK: 'true' }),
        timeout: 15000,
      });

      expect(result.status).toBe(0);
      expect(fs.existsSync(markerFile)).toBe(true);

      try { fs.unlinkSync(markerFile); } catch { /* ignore */ }
    });
  });
});
