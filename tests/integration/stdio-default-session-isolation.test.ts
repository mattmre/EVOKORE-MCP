import { describe, it, expect } from 'vitest';
import path from 'path';

/**
 * Phase 0 — stdio default session isolation
 *
 * Before this fix, EvokoreMCPServer used a single literal
 * "__stdio_default_session__" key for any request without a sessionId.
 * Two server instances in the same process therefore shared one
 * activation Map, leaking dynamic-discovery state across tenants.
 *
 * After the fix, each server instance generates a unique stdio default
 * session id at construction time. Distinct instances must never share
 * a default session key.
 */
describe('stdio default session isolation', () => {
  const ROOT = path.resolve(__dirname, '../..');
  const indexJsPath = path.join(ROOT, 'dist', 'index.js');

  it('two EvokoreMCPServer instances have distinct default session ids', () => {
    const { EvokoreMCPServer } = require(indexJsPath);
    const a = new EvokoreMCPServer();
    const b = new EvokoreMCPServer();

    // Field is private; access via bracket to avoid TS narrowing in tests.
    const idA: string = (a as any).defaultSessionId;
    const idB: string = (b as any).defaultSessionId;

    expect(typeof idA).toBe('string');
    expect(typeof idB).toBe('string');
    expect(idA.startsWith('stdio-')).toBe(true);
    expect(idB.startsWith('stdio-')).toBe(true);
    // Hyphen separator (not colon) keeps the id safe as a Windows filename
    // component for FileSessionStore.
    expect(idA).not.toMatch(/^stdio:/);
    expect(idB).not.toMatch(/^stdio:/);
    expect(idA).not.toBe(idB);
  });

  it('default session id is not the legacy shared literal', () => {
    const { EvokoreMCPServer } = require(indexJsPath);
    const server = new EvokoreMCPServer();
    const id: string = (server as any).defaultSessionId;
    expect(id).not.toBe('__stdio_default_session__');
  });

  it('source no longer defines the shared literal default session id', () => {
    const fs = require('fs');
    const indexTsPath = path.join(ROOT, 'src', 'index.ts');
    const src = fs.readFileSync(indexTsPath, 'utf8');
    expect(src).not.toMatch(
      /const\s+DEFAULT_SESSION_ID\s*=\s*["']__stdio_default_session__["']/
    );
  });
});
