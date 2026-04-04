import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { httpGet, isPrivateAddress } from '../../src/httpUtils';

/**
 * SEC-03 / TST-04: SSRF protection tests for httpGet() and isPrivateAddress().
 *
 * These tests verify that httpGet() rejects requests to private, loopback,
 * and link-local addresses before any network request is made. No actual
 * HTTP calls are needed — the rejection is synchronous within the promise.
 */

describe('SEC-03: SSRF protection in httpUtils', () => {
  // Ensure SSRF protection is active (default state)
  const savedAllowPrivate = process.env.EVOKORE_HTTP_ALLOW_PRIVATE;
  beforeAll(() => {
    delete process.env.EVOKORE_HTTP_ALLOW_PRIVATE;
  });
  afterAll(() => {
    if (savedAllowPrivate !== undefined) {
      process.env.EVOKORE_HTTP_ALLOW_PRIVATE = savedAllowPrivate;
    } else {
      delete process.env.EVOKORE_HTTP_ALLOW_PRIVATE;
    }
  });

  describe('isPrivateAddress()', () => {
    it('detects localhost', () => {
      expect(isPrivateAddress('localhost')).toBe(true);
    });

    it('detects 127.0.0.1 (IPv4 loopback)', () => {
      expect(isPrivateAddress('127.0.0.1')).toBe(true);
    });

    it('detects 127.x.x.x range', () => {
      expect(isPrivateAddress('127.0.0.2')).toBe(true);
      expect(isPrivateAddress('127.255.255.255')).toBe(true);
    });

    it('detects 10.x.x.x (RFC 1918)', () => {
      expect(isPrivateAddress('10.0.0.1')).toBe(true);
      expect(isPrivateAddress('10.255.255.255')).toBe(true);
    });

    it('detects 172.16-31.x.x (RFC 1918)', () => {
      expect(isPrivateAddress('172.16.0.1')).toBe(true);
      expect(isPrivateAddress('172.31.255.255')).toBe(true);
    });

    it('does not flag 172.15.x.x or 172.32.x.x', () => {
      expect(isPrivateAddress('172.15.0.1')).toBe(false);
      expect(isPrivateAddress('172.32.0.1')).toBe(false);
    });

    it('detects 192.168.x.x (RFC 1918)', () => {
      expect(isPrivateAddress('192.168.1.1')).toBe(true);
      expect(isPrivateAddress('192.168.0.0')).toBe(true);
    });

    it('detects 169.254.x.x (link-local / AWS metadata)', () => {
      expect(isPrivateAddress('169.254.169.254')).toBe(true);
      expect(isPrivateAddress('169.254.0.1')).toBe(true);
    });

    it('detects 0.0.0.0', () => {
      expect(isPrivateAddress('0.0.0.0')).toBe(true);
    });

    it('detects ::1 (IPv6 loopback)', () => {
      expect(isPrivateAddress('::1')).toBe(true);
    });

    it('detects [::1] (bracketed IPv6 loopback)', () => {
      expect(isPrivateAddress('[::1]')).toBe(true);
    });

    it('detects ::ffff: mapped addresses', () => {
      expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    });

    it('detects fc00: (IPv6 unique local)', () => {
      expect(isPrivateAddress('fc00::1')).toBe(true);
    });

    it('detects fe80: (IPv6 link-local)', () => {
      expect(isPrivateAddress('fe80::1')).toBe(true);
    });

    it('allows public addresses', () => {
      expect(isPrivateAddress('8.8.8.8')).toBe(false);
      expect(isPrivateAddress('1.1.1.1')).toBe(false);
      expect(isPrivateAddress('github.com')).toBe(false);
      expect(isPrivateAddress('example.com')).toBe(false);
      expect(isPrivateAddress('203.0.113.1')).toBe(false);
    });
  });

  describe('httpGet() SSRF rejection', () => {
    it('rejects http://127.0.0.1/', async () => {
      await expect(httpGet('http://127.0.0.1/')).rejects.toThrow(/private.*loopback.*SSRF/i);
    });

    it('rejects http://localhost/', async () => {
      await expect(httpGet('http://localhost/')).rejects.toThrow(/private.*loopback.*SSRF/i);
    });

    it('rejects http://10.0.0.1/', async () => {
      await expect(httpGet('http://10.0.0.1/')).rejects.toThrow(/private.*loopback.*SSRF/i);
    });

    it('rejects http://169.254.169.254/ (AWS metadata)', async () => {
      await expect(httpGet('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/private.*loopback.*SSRF/i);
    });

    it('rejects http://[::1]/ (IPv6 loopback)', async () => {
      await expect(httpGet('http://[::1]/')).rejects.toThrow(/private.*loopback.*SSRF/i);
    });

    it('rejects http://192.168.1.1/ (private range)', async () => {
      await expect(httpGet('http://192.168.1.1/')).rejects.toThrow(/private.*loopback.*SSRF/i);
    });

    it('rejects http://172.16.0.1/ (private range)', async () => {
      await expect(httpGet('http://172.16.0.1/')).rejects.toThrow(/private.*loopback.*SSRF/i);
    });

    it('rejects http://0.0.0.0/', async () => {
      await expect(httpGet('http://0.0.0.0/')).rejects.toThrow(/private.*loopback.*SSRF/i);
    });

    it('does not reject public URLs (rejection is before network, so it would fail with network error instead)', async () => {
      // A public URL should NOT be rejected by SSRF checks.
      // It will fail with a network error (ENOTFOUND, ECONNREFUSED, etc.) but NOT
      // with the SSRF protection message. We verify the error is NOT the SSRF one.
      try {
        await httpGet('http://203.0.113.1/', { timeoutMs: 1000 });
        // If it somehow succeeds, that's fine too (unlikely in tests)
      } catch (err: any) {
        expect(err.message).not.toMatch(/private.*loopback.*SSRF/i);
      }
    });
  });

  describe('EVOKORE_HTTP_ALLOW_PRIVATE bypass', () => {
    it('allows private addresses when EVOKORE_HTTP_ALLOW_PRIVATE=true', async () => {
      process.env.EVOKORE_HTTP_ALLOW_PRIVATE = 'true';
      try {
        // Should NOT throw SSRF error; will throw a network error instead
        try {
          await httpGet('http://127.0.0.1:1/', { timeoutMs: 500 });
        } catch (err: any) {
          // Expect a network error, NOT the SSRF protection error
          expect(err.message).not.toMatch(/private.*loopback.*SSRF/i);
        }
      } finally {
        delete process.env.EVOKORE_HTTP_ALLOW_PRIVATE;
      }
    });
  });
});
