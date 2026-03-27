import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const authModulePath = path.join(ROOT, 'dist', 'auth', 'OAuthProvider.js');

describe('T27: OAuth Bearer Token Authentication', () => {

  // ---- Source-level structural validation ----

  describe('source structure', () => {
    const fs = require('fs');
    const srcPath = path.join(ROOT, 'src', 'auth', 'OAuthProvider.ts');
    const src = fs.readFileSync(srcPath, 'utf8');

    it('exports loadAuthConfig function', () => {
      expect(src).toMatch(/export function loadAuthConfig/);
    });

    it('exports authenticateRequest function', () => {
      expect(src).toMatch(/export (async )?function authenticateRequest/);
    });

    it('exports extractBearerToken function', () => {
      expect(src).toMatch(/export function extractBearerToken/);
    });

    it('exports validateToken function', () => {
      expect(src).toMatch(/export function validateToken/);
    });

    it('exports sendUnauthorizedResponse function', () => {
      expect(src).toMatch(/export function sendUnauthorizedResponse/);
    });

    it('reads EVOKORE_AUTH_REQUIRED env var', () => {
      expect(src).toMatch(/EVOKORE_AUTH_REQUIRED/);
    });

    it('reads EVOKORE_AUTH_TOKEN env var', () => {
      expect(src).toMatch(/EVOKORE_AUTH_TOKEN/);
    });

    it('uses timing-safe comparison for token validation', () => {
      expect(src).toMatch(/timingSafeEqual/);
    });

    it('returns 401 for unauthorized requests', () => {
      expect(src).toMatch(/401/);
    });

    it('includes WWW-Authenticate header in error responses', () => {
      expect(src).toMatch(/WWW-Authenticate/);
    });
  });

  // ---- Auth disabled by default ----

  describe('auth disabled by default', () => {
    let savedRequired: string | undefined;
    let savedToken: string | undefined;

    beforeEach(() => {
      savedRequired = process.env.EVOKORE_AUTH_REQUIRED;
      savedToken = process.env.EVOKORE_AUTH_TOKEN;
      delete process.env.EVOKORE_AUTH_REQUIRED;
      delete process.env.EVOKORE_AUTH_TOKEN;
    });

    afterEach(() => {
      if (savedRequired !== undefined) process.env.EVOKORE_AUTH_REQUIRED = savedRequired;
      else delete process.env.EVOKORE_AUTH_REQUIRED;
      if (savedToken !== undefined) process.env.EVOKORE_AUTH_TOKEN = savedToken;
      else delete process.env.EVOKORE_AUTH_TOKEN;
    });

    it('loadAuthConfig returns required=false when env not set', () => {
      const { loadAuthConfig } = require(authModulePath);
      const config = loadAuthConfig();
      expect(config.required).toBe(false);
      expect(config.staticToken).toBeNull();
    });

    it('authenticateRequest passes all requests when auth disabled', async () => {
      const { loadAuthConfig, authenticateRequest } = require(authModulePath);
      const config = loadAuthConfig();

      // Simulate a request without any Authorization header
      const req = {
        url: '/mcp',
        headers: {},
      };

      const result = await authenticateRequest(req, config);
      expect(result.authorized).toBe(true);
    });

    it('authenticateRequest passes requests without token when auth disabled', async () => {
      const { loadAuthConfig, authenticateRequest } = require(authModulePath);
      const config = loadAuthConfig();

      const req = {
        url: '/mcp',
        headers: { authorization: 'Bearer some-token' },
      };

      const result = await authenticateRequest(req, config);
      expect(result.authorized).toBe(true);
    });
  });

  // ---- Auth enabled: rejection cases ----

  describe('auth enabled: rejection cases', () => {
    let savedRequired: string | undefined;
    let savedToken: string | undefined;

    beforeEach(() => {
      savedRequired = process.env.EVOKORE_AUTH_REQUIRED;
      savedToken = process.env.EVOKORE_AUTH_TOKEN;
      process.env.EVOKORE_AUTH_REQUIRED = 'true';
      process.env.EVOKORE_AUTH_TOKEN = 'test-secret-token-12345';
    });

    afterEach(() => {
      if (savedRequired !== undefined) process.env.EVOKORE_AUTH_REQUIRED = savedRequired;
      else delete process.env.EVOKORE_AUTH_REQUIRED;
      if (savedToken !== undefined) process.env.EVOKORE_AUTH_TOKEN = savedToken;
      else delete process.env.EVOKORE_AUTH_TOKEN;
    });

    it('rejects requests with no Authorization header', async () => {
      const { loadAuthConfig, authenticateRequest } = require(authModulePath);
      const config = loadAuthConfig();

      const req = { url: '/mcp', headers: {} };
      const result = await authenticateRequest(req, config);

      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBeDefined();
    });

    it('rejects requests with wrong token', async () => {
      const { loadAuthConfig, authenticateRequest } = require(authModulePath);
      const config = loadAuthConfig();

      const req = {
        url: '/mcp',
        headers: { authorization: 'Bearer wrong-token' },
      };
      const result = await authenticateRequest(req, config);

      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toMatch(/invalid/i);
    });

    it('rejects requests with non-Bearer scheme', async () => {
      const { loadAuthConfig, authenticateRequest } = require(authModulePath);
      const config = loadAuthConfig();

      const req = {
        url: '/mcp',
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      };
      const result = await authenticateRequest(req, config);

      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    it('rejects requests with empty Bearer token', async () => {
      const { loadAuthConfig, authenticateRequest } = require(authModulePath);
      const config = loadAuthConfig();

      const req = {
        url: '/mcp',
        headers: { authorization: 'Bearer ' },
      };
      const result = await authenticateRequest(req, config);

      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
    });
  });

  // ---- Auth enabled: valid token passes ----

  describe('auth enabled: valid token', () => {
    let savedRequired: string | undefined;
    let savedToken: string | undefined;

    beforeEach(() => {
      savedRequired = process.env.EVOKORE_AUTH_REQUIRED;
      savedToken = process.env.EVOKORE_AUTH_TOKEN;
      process.env.EVOKORE_AUTH_REQUIRED = 'true';
      process.env.EVOKORE_AUTH_TOKEN = 'valid-test-token-xyz';
    });

    afterEach(() => {
      if (savedRequired !== undefined) process.env.EVOKORE_AUTH_REQUIRED = savedRequired;
      else delete process.env.EVOKORE_AUTH_REQUIRED;
      if (savedToken !== undefined) process.env.EVOKORE_AUTH_TOKEN = savedToken;
      else delete process.env.EVOKORE_AUTH_TOKEN;
    });

    it('allows requests with correct Bearer token', async () => {
      const { loadAuthConfig, authenticateRequest } = require(authModulePath);
      const config = loadAuthConfig();

      const req = {
        url: '/mcp',
        headers: { authorization: 'Bearer valid-test-token-xyz' },
      };
      const result = await authenticateRequest(req, config);

      expect(result.authorized).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('handles case-insensitive Bearer scheme', async () => {
      const { loadAuthConfig, authenticateRequest } = require(authModulePath);
      const config = loadAuthConfig();

      const req = {
        url: '/mcp',
        headers: { authorization: 'bearer valid-test-token-xyz' },
      };
      const result = await authenticateRequest(req, config);

      expect(result.authorized).toBe(true);
    });
  });

  // ---- /health endpoint bypasses auth ----

  describe('/health endpoint bypasses auth', () => {
    let savedRequired: string | undefined;
    let savedToken: string | undefined;

    beforeEach(() => {
      savedRequired = process.env.EVOKORE_AUTH_REQUIRED;
      savedToken = process.env.EVOKORE_AUTH_TOKEN;
      process.env.EVOKORE_AUTH_REQUIRED = 'true';
      process.env.EVOKORE_AUTH_TOKEN = 'secret-token';
    });

    afterEach(() => {
      if (savedRequired !== undefined) process.env.EVOKORE_AUTH_REQUIRED = savedRequired;
      else delete process.env.EVOKORE_AUTH_REQUIRED;
      if (savedToken !== undefined) process.env.EVOKORE_AUTH_TOKEN = savedToken;
      else delete process.env.EVOKORE_AUTH_TOKEN;
    });

    it('/health passes without any token when auth is enabled', async () => {
      const { loadAuthConfig, authenticateRequest } = require(authModulePath);
      const config = loadAuthConfig();

      const req = { url: '/health', headers: {} };
      const result = await authenticateRequest(req, config);

      expect(result.authorized).toBe(true);
    });

    it('/health/ with trailing slash also passes', async () => {
      const { loadAuthConfig, authenticateRequest } = require(authModulePath);
      const config = loadAuthConfig();

      const req = { url: '/health/', headers: {} };
      const result = await authenticateRequest(req, config);

      expect(result.authorized).toBe(true);
    });

    it('/mcp is still protected when auth is enabled', async () => {
      const { loadAuthConfig, authenticateRequest } = require(authModulePath);
      const config = loadAuthConfig();

      const req = { url: '/mcp', headers: {} };
      const result = await authenticateRequest(req, config);

      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
    });
  });

  // ---- Error response format ----

  describe('error response format', () => {
    it('sendUnauthorizedResponse writes correct JSON-RPC error', () => {
      const { sendUnauthorizedResponse } = require(authModulePath);

      let writtenStatusCode: number | undefined;
      let writtenHeaders: Record<string, string> = {};
      let writtenBody = '';

      const mockRes = {
        writeHead(code: number, headers: Record<string, string>) {
          writtenStatusCode = code;
          writtenHeaders = headers;
        },
        end(body: string) {
          writtenBody = body;
        },
      };

      sendUnauthorizedResponse(mockRes as any, 'Test error message');

      expect(writtenStatusCode).toBe(401);
      expect(writtenHeaders['Content-Type']).toBe('application/json');
      expect(writtenHeaders['WWW-Authenticate']).toMatch(/Bearer/);

      const parsed = JSON.parse(writtenBody);
      expect(parsed.jsonrpc).toBe('2.0');
      expect(parsed.error.code).toBe(-32001);
      expect(parsed.error.message).toBe('Unauthorized');
      expect(parsed.error.data.detail).toBe('Test error message');
      expect(parsed.id).toBeNull();
    });
  });

  // ---- extractBearerToken unit tests ----

  describe('extractBearerToken', () => {
    it('returns null for undefined input', () => {
      const { extractBearerToken } = require(authModulePath);
      expect(extractBearerToken(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      const { extractBearerToken } = require(authModulePath);
      expect(extractBearerToken('')).toBeNull();
    });

    it('returns null for non-Bearer scheme', () => {
      const { extractBearerToken } = require(authModulePath);
      expect(extractBearerToken('Basic abc123')).toBeNull();
    });

    it('extracts token from valid Bearer header', () => {
      const { extractBearerToken } = require(authModulePath);
      expect(extractBearerToken('Bearer my-token-123')).toBe('my-token-123');
    });

    it('handles extra whitespace', () => {
      const { extractBearerToken } = require(authModulePath);
      expect(extractBearerToken('  Bearer   my-token  ')).toBe('my-token');
    });

    it('handles case-insensitive Bearer keyword', () => {
      const { extractBearerToken } = require(authModulePath);
      expect(extractBearerToken('BEARER my-token')).toBe('my-token');
      expect(extractBearerToken('bearer my-token')).toBe('my-token');
    });
  });

  // ---- validateToken unit tests ----

  describe('validateToken', () => {
    it('returns false when no static token is configured', () => {
      const { validateToken } = require(authModulePath);
      const config = { required: true, staticToken: null };
      expect(validateToken('any-token', config)).toBe(false);
    });

    it('returns false for mismatched token', () => {
      const { validateToken } = require(authModulePath);
      const config = { required: true, staticToken: 'correct-token' };
      expect(validateToken('wrong-token', config)).toBe(false);
    });

    it('returns true for matching token', () => {
      const { validateToken } = require(authModulePath);
      const config = { required: true, staticToken: 'correct-token' };
      expect(validateToken('correct-token', config)).toBe(true);
    });

    it('returns false for token with different length', () => {
      const { validateToken } = require(authModulePath);
      const config = { required: true, staticToken: 'short' };
      expect(validateToken('much-longer-token', config)).toBe(false);
    });
  });

  // ---- isPublicPath unit tests ----

  describe('isPublicPath', () => {
    it('returns true for /health', () => {
      const { isPublicPath } = require(authModulePath);
      expect(isPublicPath('/health')).toBe(true);
    });

    it('returns true for /health/', () => {
      const { isPublicPath } = require(authModulePath);
      expect(isPublicPath('/health/')).toBe(true);
    });

    it('returns false for /mcp', () => {
      const { isPublicPath } = require(authModulePath);
      expect(isPublicPath('/mcp')).toBe(false);
    });

    it('returns false for /metrics', () => {
      const { isPublicPath } = require(authModulePath);
      expect(isPublicPath('/metrics')).toBe(false);
      expect(isPublicPath('/metrics/')).toBe(false);
    });

    it('returns false for arbitrary paths', () => {
      const { isPublicPath } = require(authModulePath);
      expect(isPublicPath('/api/tools')).toBe(false);
      expect(isPublicPath('/')).toBe(false);
    });
  });

  // ---- Auth config with no token but required=true ----

  describe('auth required without token configured', () => {
    let savedRequired: string | undefined;
    let savedToken: string | undefined;

    beforeEach(() => {
      savedRequired = process.env.EVOKORE_AUTH_REQUIRED;
      savedToken = process.env.EVOKORE_AUTH_TOKEN;
      process.env.EVOKORE_AUTH_REQUIRED = 'true';
      delete process.env.EVOKORE_AUTH_TOKEN;
    });

    afterEach(() => {
      if (savedRequired !== undefined) process.env.EVOKORE_AUTH_REQUIRED = savedRequired;
      else delete process.env.EVOKORE_AUTH_REQUIRED;
      if (savedToken !== undefined) process.env.EVOKORE_AUTH_TOKEN = savedToken;
      else delete process.env.EVOKORE_AUTH_TOKEN;
    });

    it('rejects all authenticated requests when no token is configured', async () => {
      const { loadAuthConfig, authenticateRequest } = require(authModulePath);
      const config = loadAuthConfig();

      expect(config.required).toBe(true);
      expect(config.staticToken).toBeNull();

      const req = {
        url: '/mcp',
        headers: { authorization: 'Bearer any-token-at-all' },
      };
      const result = await authenticateRequest(req, config);

      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
    });
  });
});
