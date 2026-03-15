import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'gh-actions-quota.js');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const quota = require(SCRIPT_PATH);

describe('GitHub Actions Quota Monitor', () => {
  describe('script file', () => {
    it('exists at scripts/gh-actions-quota.js', () => {
      expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
    });

    it('is valid JavaScript (can be required without error)', () => {
      expect(typeof quota).toBe('object');
      expect(quota).not.toBeNull();
    });

    it('exports expected functions and constants', () => {
      expect(typeof quota.parseBillingData).toBe('function');
      expect(typeof quota.determineExitCode).toBe('function');
      expect(typeof quota.formatReport).toBe('function');
      expect(typeof quota.detectOwner).toBe('function');
      expect(typeof quota.fetchBillingData).toBe('function');
      expect(typeof quota.WARNING_THRESHOLD).toBe('number');
      expect(typeof quota.CRITICAL_THRESHOLD).toBe('number');
    });
  });

  describe('thresholds', () => {
    it('WARNING_THRESHOLD is 0.80', () => {
      expect(quota.WARNING_THRESHOLD).toBe(0.80);
    });

    it('CRITICAL_THRESHOLD is 0.95', () => {
      expect(quota.CRITICAL_THRESHOLD).toBe(0.95);
    });
  });

  describe('parseBillingData', () => {
    it('parses a typical billing response', () => {
      const data = {
        total_minutes_used: 1200,
        total_paid_minutes_used: 0,
        included_minutes: 2000,
        minutes_used_breakdown: { UBUNTU: 1000, MACOS: 100, WINDOWS: 100 },
      };

      const report = quota.parseBillingData(data);

      expect(report.totalMinutesUsed).toBe(1200);
      expect(report.totalPaidMinutesUsed).toBe(0);
      expect(report.includedMinutes).toBe(2000);
      expect(report.remainingMinutes).toBe(800);
      expect(report.percentUsed).toBeCloseTo(0.6, 5);
      expect(report.breakdown.UBUNTU).toBe(1000);
    });

    it('handles zero included minutes without division by zero', () => {
      const data = {
        total_minutes_used: 0,
        included_minutes: 0,
        minutes_used_breakdown: {},
      };

      const report = quota.parseBillingData(data);

      expect(report.percentUsed).toBe(0);
      expect(report.remainingMinutes).toBe(0);
    });

    it('handles missing fields gracefully', () => {
      const report = quota.parseBillingData({});

      expect(report.totalMinutesUsed).toBe(0);
      expect(report.includedMinutes).toBe(0);
      expect(report.remainingMinutes).toBe(0);
      expect(report.percentUsed).toBe(0);
      expect(report.breakdown).toEqual({});
    });

    it('clamps remaining minutes to zero when overage', () => {
      const data = {
        total_minutes_used: 2500,
        included_minutes: 2000,
        minutes_used_breakdown: {},
      };

      const report = quota.parseBillingData(data);

      expect(report.remainingMinutes).toBe(0);
      expect(report.percentUsed).toBeCloseTo(1.25, 5);
    });
  });

  describe('determineExitCode', () => {
    it('returns 0 for usage below 80%', () => {
      expect(quota.determineExitCode(0)).toBe(0);
      expect(quota.determineExitCode(0.5)).toBe(0);
      expect(quota.determineExitCode(0.79)).toBe(0);
    });

    it('returns 1 for usage at or above 80% but below 95%', () => {
      expect(quota.determineExitCode(0.80)).toBe(1);
      expect(quota.determineExitCode(0.85)).toBe(1);
      expect(quota.determineExitCode(0.94)).toBe(1);
    });

    it('returns 2 for usage at or above 95%', () => {
      expect(quota.determineExitCode(0.95)).toBe(2);
      expect(quota.determineExitCode(1.0)).toBe(2);
      expect(quota.determineExitCode(1.25)).toBe(2);
    });
  });

  describe('formatReport', () => {
    it('produces a human-readable report', () => {
      const report = {
        totalMinutesUsed: 500,
        totalPaidMinutesUsed: 0,
        includedMinutes: 2000,
        remainingMinutes: 1500,
        percentUsed: 0.25,
        breakdown: { UBUNTU: 400, WINDOWS: 100 },
      };

      const output = quota.formatReport(report);

      expect(output).toContain('GitHub Actions Quota');
      expect(output).toContain('500 / 2000');
      expect(output).toContain('1500');
      expect(output).toContain('25.0%');
      expect(output).toContain('UBUNTU: 400 min');
      expect(output).toContain('WINDOWS: 100 min');
      expect(output).not.toContain('WARNING');
      expect(output).not.toContain('CRITICAL');
    });

    it('includes WARNING for 80%+ usage', () => {
      const report = {
        totalMinutesUsed: 1700,
        totalPaidMinutesUsed: 0,
        includedMinutes: 2000,
        remainingMinutes: 300,
        percentUsed: 0.85,
        breakdown: {},
      };

      const output = quota.formatReport(report);

      expect(output).toContain('WARNING');
      expect(output).toContain('85.0%');
    });

    it('includes CRITICAL for 95%+ usage', () => {
      const report = {
        totalMinutesUsed: 1950,
        totalPaidMinutesUsed: 0,
        includedMinutes: 2000,
        remainingMinutes: 50,
        percentUsed: 0.975,
        breakdown: {},
      };

      const output = quota.formatReport(report);

      expect(output).toContain('CRITICAL');
      expect(output).toContain('npx vitest run');
    });

    it('shows paid minutes when nonzero', () => {
      const report = {
        totalMinutesUsed: 2100,
        totalPaidMinutesUsed: 100,
        includedMinutes: 2000,
        remainingMinutes: 0,
        percentUsed: 1.05,
        breakdown: {},
      };

      const output = quota.formatReport(report);

      expect(output).toContain('Paid minutes used: 100');
    });

    it('omits breakdown section when all runners are zero', () => {
      const report = {
        totalMinutesUsed: 0,
        totalPaidMinutesUsed: 0,
        includedMinutes: 2000,
        remainingMinutes: 2000,
        percentUsed: 0,
        breakdown: { UBUNTU: 0, WINDOWS: 0 },
      };

      const output = quota.formatReport(report);

      expect(output).not.toContain('Breakdown by runner');
    });
  });

  describe('detectOwner', () => {
    it('returns a non-empty string', () => {
      const owner = quota.detectOwner();
      expect(typeof owner).toBe('string');
      expect(owner.length).toBeGreaterThan(0);
    });
  });
});
