import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const trustLedgerJsPath = path.join(ROOT, 'dist', 'TrustLedger.js');

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-trust-ledger-test-'));
}

async function rimraf(dir: string): Promise<void> {
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe('TrustLedger', () => {
  let tmpDir: string;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TrustLedger } = require(trustLedgerJsPath);

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rimraf(tmpDir);
  });

  describe('module shape', () => {
    it('has compiled JavaScript file', () => {
      expect(fs.existsSync(trustLedgerJsPath)).toBe(true);
    });

    it('exports TrustLedger class', () => {
      expect(TrustLedger).toBeDefined();
      expect(typeof TrustLedger).toBe('function');
    });
  });

  describe('initialization', () => {
    it('creates entry with default score 0.5 and Standard tier on first record', () => {
      const ledger = new TrustLedger('sess-init', tmpDir);
      const entry = ledger.record('agent-a', 'success');
      // 0.5 + 0.01 = 0.51 after first success
      expect(entry.score).toBeCloseTo(0.51, 5);
      expect(entry.tier).toBe('Standard');
      expect(entry.agentId).toBe('agent-a');
      expect(entry.events).toBe(1);
    });
  });

  describe('score updates', () => {
    it('success event increases score by 0.01', () => {
      const ledger = new TrustLedger('sess-success', tmpDir);
      const entry = ledger.record('a', 'success');
      expect(entry.score).toBeCloseTo(0.51, 5);
    });

    it('failure event decreases score by 0.05', () => {
      const ledger = new TrustLedger('sess-fail', tmpDir);
      const entry = ledger.record('a', 'failure');
      expect(entry.score).toBeCloseTo(0.45, 5);
    });

    it('gate_violation event decreases score by 0.10', () => {
      const ledger = new TrustLedger('sess-gate', tmpDir);
      const entry = ledger.record('a', 'gate_violation');
      expect(entry.score).toBeCloseTo(0.40, 5);
    });

    it('clamps score to 0 on repeated gate violations', () => {
      const ledger = new TrustLedger('sess-clamp-low', tmpDir);
      for (let i = 0; i < 20; i++) {
        ledger.record('a', 'gate_violation');
      }
      const entry = ledger.getEntry('a');
      expect(entry.score).toBe(0);
      expect(entry.tier).toBe('Untrusted');
    });

    it('clamps score to 1 on many successes', () => {
      const ledger = new TrustLedger('sess-clamp-high', tmpDir);
      for (let i = 0; i < 200; i++) {
        ledger.record('a', 'success');
      }
      const entry = ledger.getEntry('a');
      expect(entry.score).toBe(1);
      expect(entry.tier).toBe('Trusted');
    });
  });

  describe('tier thresholds', () => {
    it('Trusted tier at score >= 0.8', () => {
      const ledger = new TrustLedger('sess-trusted', tmpDir);
      // Start at 0.5, +0.01 * 31 = +0.31 → ~0.81 (above threshold with float slack)
      for (let i = 0; i < 31; i++) ledger.record('a', 'success');
      const entry = ledger.getEntry('a');
      expect(entry.score).toBeGreaterThanOrEqual(0.8);
      expect(entry.tier).toBe('Trusted');
    });

    it('Standard tier for 0.5 <= score < 0.8', () => {
      const ledger = new TrustLedger('sess-std', tmpDir);
      ledger.record('a', 'success'); // 0.51
      expect(ledger.getEntry('a').tier).toBe('Standard');
    });

    it('Probation tier for 0.3 <= score < 0.5', () => {
      const ledger = new TrustLedger('sess-prob', tmpDir);
      // 0.5 - 0.05 * 5 = 0.25 → Untrusted; use fewer failures
      // 0.5 - 0.05 * 3 = 0.35 → Probation
      for (let i = 0; i < 3; i++) ledger.record('a', 'failure');
      const entry = ledger.getEntry('a');
      expect(entry.score).toBeCloseTo(0.35, 5);
      expect(entry.tier).toBe('Probation');
    });

    it('Untrusted tier for score < 0.3', () => {
      const ledger = new TrustLedger('sess-untrusted', tmpDir);
      // 0.5 - 0.10 * 3 = 0.20
      for (let i = 0; i < 3; i++) ledger.record('a', 'gate_violation');
      const entry = ledger.getEntry('a');
      expect(entry.score).toBeCloseTo(0.20, 5);
      expect(entry.tier).toBe('Untrusted');
    });
  });

  describe('getMultiplier', () => {
    it('returns 1x (Standard) for unknown agents', () => {
      const ledger = new TrustLedger('sess-mult-unknown', tmpDir);
      expect(ledger.getMultiplier('nobody')).toBe(1);
    });

    it('returns correct multipliers per tier', () => {
      const ledger = new TrustLedger('sess-mult', tmpDir);
      // Trusted (31 successes lands above the 0.8 threshold)
      for (let i = 0; i < 31; i++) ledger.record('trusted', 'success');
      // Standard
      ledger.record('standard', 'success');
      // Probation
      for (let i = 0; i < 3; i++) ledger.record('prob', 'failure');
      // Untrusted
      for (let i = 0; i < 3; i++) ledger.record('un', 'gate_violation');

      expect(ledger.getMultiplier('trusted')).toBe(2);
      expect(ledger.getMultiplier('standard')).toBe(1);
      expect(ledger.getMultiplier('prob')).toBe(0.5);
      expect(ledger.getMultiplier('un')).toBe(0.1);
    });
  });

  describe('requiresApproval', () => {
    it('returns false for Standard tier', () => {
      const ledger = new TrustLedger('sess-req-std', tmpDir);
      ledger.record('a', 'success');
      expect(ledger.requiresApproval('a')).toBe(false);
    });

    it('returns true only for Untrusted tier', () => {
      const ledger = new TrustLedger('sess-req-un', tmpDir);
      for (let i = 0; i < 3; i++) ledger.record('a', 'gate_violation');
      expect(ledger.requiresApproval('a')).toBe(true);
    });

    it('returns false for unknown agents', () => {
      const ledger = new TrustLedger('sess-req-unknown', tmpDir);
      expect(ledger.requiresApproval('nobody')).toBe(false);
    });
  });

  describe('getTrustReport', () => {
    it('returns correct summary shape and counts', () => {
      const ledger = new TrustLedger('sess-report', tmpDir);
      for (let i = 0; i < 31; i++) ledger.record('trusted', 'success');
      ledger.record('standard', 'success');
      for (let i = 0; i < 3; i++) ledger.record('prob', 'failure');
      for (let i = 0; i < 3; i++) ledger.record('un', 'gate_violation');

      const report = ledger.getTrustReport();
      expect(report.agents).toHaveLength(4);
      expect(report.summary).toEqual({
        trusted: 1,
        standard: 1,
        probation: 1,
        untrusted: 1,
      });
    });

    it('returns empty summary on fresh ledger', () => {
      const ledger = new TrustLedger('sess-empty', tmpDir);
      const report = ledger.getTrustReport();
      expect(report.agents).toEqual([]);
      expect(report.summary).toEqual({
        trusted: 0,
        standard: 0,
        probation: 0,
        untrusted: 0,
      });
    });
  });

  describe('persistence', () => {
    it('writes state to disk and reloads on new instance', () => {
      const ledger1 = new TrustLedger('sess-persist', tmpDir);
      ledger1.record('a', 'success');
      ledger1.record('a', 'success');

      const filePath = path.join(tmpDir, 'sess-persist-trust.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const ledger2 = new TrustLedger('sess-persist', tmpDir);
      const entry = ledger2.getEntry('a');
      expect(entry).toBeDefined();
      expect(entry.score).toBeCloseTo(0.52, 5);
      expect(entry.events).toBe(2);
    });

    it('fails silently on corrupt persistence file', () => {
      const filePath = path.join(tmpDir, 'sess-corrupt-trust.json');
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(filePath, '{not valid json', 'utf8');
      // Should not throw — should start with fresh state
      const ledger = new TrustLedger('sess-corrupt', tmpDir);
      expect(ledger.getAll()).toEqual([]);
    });
  });

  describe('idle decay', () => {
    it('applies -0.005/hr decay on subsequent record after idle period', () => {
      const ledger = new TrustLedger('sess-decay', tmpDir);
      ledger.record('a', 'success'); // score 0.51
      // Simulate 2 hours passing by rewriting lastUpdated
      const filePath = path.join(tmpDir, 'sess-decay-trust.json');
      const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      state.agents['a'].lastUpdated = twoHoursAgo;
      fs.writeFileSync(filePath, JSON.stringify(state), 'utf8');

      const ledger2 = new TrustLedger('sess-decay', tmpDir);
      // Next record: 2h decay = -0.01, then success +0.01 → stays 0.51 (minus tiny rounding)
      const entry = ledger2.record('a', 'success');
      // Decay: 0.51 - 0.01 = 0.50, then +0.01 = 0.51
      expect(entry.score).toBeCloseTo(0.51, 3);
    });
  });

  describe('getAll', () => {
    it('returns all tracked agents', () => {
      const ledger = new TrustLedger('sess-getall', tmpDir);
      ledger.record('agent-1', 'success');
      ledger.record('agent-2', 'failure');
      ledger.record('agent-3', 'gate_violation');
      const all = ledger.getAll();
      expect(all).toHaveLength(3);
      const ids = all.map((e: any) => e.agentId).sort();
      expect(ids).toEqual(['agent-1', 'agent-2', 'agent-3']);
    });
  });
});
