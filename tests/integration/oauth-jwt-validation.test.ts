import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import http from 'http';

const ROOT = path.resolve(__dirname, '../..');
const authModulePath = path.join(ROOT, 'dist', 'auth', 'OAuthProvider.js');
const srcPath = path.join(ROOT, 'src', 'auth', 'OAuthProvider.ts');

describe('OAuth JWT/JWKS Validation', () => {

  // ---- Source-level structural validation ----

  describe('source structure', () => {
    const src = fs.readFileSync(srcPath, 'utf8');

    it('OAuthProvider imports jose', () => {
      expect(src).toMatch(/import.*from\s+["']jose["']/);
    });

    it('AuthConfig has mode field', () => {
      expect(src).toMatch(/mode\s*:\s*["']static["']\s*\|\s*["']jwt["']/);
    });

    it('AuthConfig has jwksUri field', () => {
      expect(src).toMatch(/jwksUri\s*\?\s*:\s*string/);
    });

    it('AuthConfig has issuer field', () => {
      expect(src).toMatch(/issuer\s*\?\s*:\s*string/);
    });

    it('AuthConfig has audience field', () => {
      expect(src).toMatch(/audience\s*\?\s*:\s*string/);
    });

    it('JWTClaims interface exported', () => {
      expect(src).toMatch(/export interface JWTClaims/);
    });

    it('JWTClaims has sub field', () => {
      expect(src).toMatch(/sub\s*\?\s*:\s*string/);
    });

    it('JWTClaims has role field', () => {
      expect(src).toMatch(/role\s*\?\s*:\s*string/);
    });

    it('AuthResult has claims field', () => {
      expect(src).toMatch(/claims\s*\?\s*:\s*JWTClaims/);
    });

    it('validateJwt function exported', () => {
      expect(src).toMatch(/export async function validateJwt/);
    });

    it('clearJwksCache function exported', () => {
      expect(src).toMatch(/export function clearJwksCache/);
    });

    it('loadAuthConfig reads EVOKORE_AUTH_MODE', () => {
      expect(src).toMatch(/EVOKORE_AUTH_MODE/);
    });

    it('loadAuthConfig reads EVOKORE_OAUTH_ISSUER', () => {
      expect(src).toMatch(/EVOKORE_OAUTH_ISSUER/);
    });

    it('loadAuthConfig reads EVOKORE_OAUTH_AUDIENCE', () => {
      expect(src).toMatch(/EVOKORE_OAUTH_AUDIENCE/);
    });

    it('loadAuthConfig reads EVOKORE_OAUTH_JWKS_URI', () => {
      expect(src).toMatch(/EVOKORE_OAUTH_JWKS_URI/);
    });

    it('authenticateRequest is async', () => {
      expect(src).toMatch(/export async function authenticateRequest/);
    });

    it('authenticateRequest checks config.mode for jwt branch', () => {
      expect(src).toMatch(/config\.mode\s*===\s*["']jwt["']/);
    });
  });

  // ---- loadAuthConfig mode and JWT env vars ----

  describe('loadAuthConfig with JWT mode', () => {
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
      savedEnv = {
        EVOKORE_AUTH_REQUIRED: process.env.EVOKORE_AUTH_REQUIRED,
        EVOKORE_AUTH_MODE: process.env.EVOKORE_AUTH_MODE,
        EVOKORE_AUTH_TOKEN: process.env.EVOKORE_AUTH_TOKEN,
        EVOKORE_OAUTH_ISSUER: process.env.EVOKORE_OAUTH_ISSUER,
        EVOKORE_OAUTH_AUDIENCE: process.env.EVOKORE_OAUTH_AUDIENCE,
        EVOKORE_OAUTH_JWKS_URI: process.env.EVOKORE_OAUTH_JWKS_URI,
      };
    });

    afterEach(() => {
      for (const [key, val] of Object.entries(savedEnv)) {
        if (val !== undefined) process.env[key] = val;
        else delete process.env[key];
      }
    });

    it('defaults to static mode when EVOKORE_AUTH_MODE is not set', () => {
      delete process.env.EVOKORE_AUTH_MODE;
      const { loadAuthConfig } = require(authModulePath);
      const config = loadAuthConfig();
      expect(config.mode).toBe('static');
    });

    it('returns jwt mode when EVOKORE_AUTH_MODE=jwt', () => {
      process.env.EVOKORE_AUTH_MODE = 'jwt';
      const { loadAuthConfig } = require(authModulePath);
      const config = loadAuthConfig();
      expect(config.mode).toBe('jwt');
    });

    it('reads all JWT-related env vars', () => {
      process.env.EVOKORE_AUTH_REQUIRED = 'true';
      process.env.EVOKORE_AUTH_MODE = 'jwt';
      process.env.EVOKORE_OAUTH_ISSUER = 'https://issuer.example.com';
      process.env.EVOKORE_OAUTH_AUDIENCE = 'my-audience';
      process.env.EVOKORE_OAUTH_JWKS_URI = 'https://issuer.example.com/.well-known/jwks.json';

      const { loadAuthConfig } = require(authModulePath);
      const config = loadAuthConfig();

      expect(config.mode).toBe('jwt');
      expect(config.issuer).toBe('https://issuer.example.com');
      expect(config.audience).toBe('my-audience');
      expect(config.jwksUri).toBe('https://issuer.example.com/.well-known/jwks.json');
    });

    it('issuer/audience/jwksUri are undefined when env vars not set', () => {
      delete process.env.EVOKORE_OAUTH_ISSUER;
      delete process.env.EVOKORE_OAUTH_AUDIENCE;
      delete process.env.EVOKORE_OAUTH_JWKS_URI;

      const { loadAuthConfig } = require(authModulePath);
      const config = loadAuthConfig();

      expect(config.issuer).toBeUndefined();
      expect(config.audience).toBeUndefined();
      expect(config.jwksUri).toBeUndefined();
    });
  });

  // ---- JWT validation with real JWKS server ----

  describe('JWT validation with JWKS endpoint', () => {
    let jwksServer: http.Server;
    let jwksUrl: string;
    let privateKey: any;
    let jose: any;

    beforeEach(async () => {
      jose = await import('jose');

      const keyPair = await jose.generateKeyPair('RS256');
      privateKey = keyPair.privateKey;
      const publicJwk = await jose.exportJWK(keyPair.publicKey);
      publicJwk.kid = 'test-key-1';
      publicJwk.alg = 'RS256';
      publicJwk.use = 'sig';

      jwksServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ keys: [publicJwk] }));
      });

      await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
      const addr = jwksServer.address() as { port: number };
      jwksUrl = `http://127.0.0.1:${addr.port}/.well-known/jwks.json`;
    });

    afterEach(async () => {
      const { clearJwksCache } = require(authModulePath);
      clearJwksCache();
      await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
    });

    function makeConfig(overrides?: Record<string, any>) {
      return {
        required: true,
        mode: 'jwt' as const,
        staticToken: null,
        issuer: 'https://test-issuer.example.com',
        audience: 'evokore-mcp',
        jwksUri: jwksUrl,
        ...overrides,
      };
    }

    async function signToken(claims: Record<string, any>, overrides?: Record<string, any>) {
      let builder = new jose.SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
        .setIssuer(overrides?.issuer ?? 'https://test-issuer.example.com')
        .setAudience(overrides?.audience ?? 'evokore-mcp');

      if (overrides?.expSeconds !== undefined) {
        builder = builder.setExpirationTime(overrides.expSeconds + 's');
      } else if (overrides?.expired) {
        // Set to past (already expired)
        builder = builder.setExpirationTime('-1h');
      } else {
        builder = builder.setExpirationTime('1h');
      }

      return builder.sign(privateKey);
    }

    it('valid JWT passes validation with correct claims', async () => {
      const { validateJwt } = require(authModulePath);
      const token = await signToken({ sub: 'user1', role: 'admin' });
      const config = makeConfig();

      const result = await validateJwt(token, config);
      expect(result.valid).toBe(true);
      expect(result.claims).toBeDefined();
      expect(result.claims.sub).toBe('user1');
      expect(result.claims.role).toBe('admin');
      expect(result.claims.iss).toBe('https://test-issuer.example.com');
    });

    it('expired JWT fails validation', async () => {
      const { validateJwt } = require(authModulePath);
      const token = await signToken({ sub: 'user2' }, { expired: true });
      const config = makeConfig();

      const result = await validateJwt(token, config);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/exp/i);
    });

    it('JWT with wrong issuer fails validation', async () => {
      const { validateJwt } = require(authModulePath);
      const token = await signToken({ sub: 'user3' }, { issuer: 'https://wrong-issuer.example.com' });
      const config = makeConfig();

      const result = await validateJwt(token, config);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('JWT with wrong audience fails validation', async () => {
      const { validateJwt } = require(authModulePath);
      const token = await signToken({ sub: 'user4' }, { audience: 'wrong-audience' });
      const config = makeConfig();

      const result = await validateJwt(token, config);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('token signed by unknown key fails validation', async () => {
      const { validateJwt } = require(authModulePath);

      // Generate a different key pair
      const otherKeyPair = await jose.generateKeyPair('RS256');
      const token = await new jose.SignJWT({ sub: 'user5' })
        .setProtectedHeader({ alg: 'RS256', kid: 'unknown-key' })
        .setIssuer('https://test-issuer.example.com')
        .setAudience('evokore-mcp')
        .setExpirationTime('1h')
        .sign(otherKeyPair.privateKey);

      const config = makeConfig();

      const result = await validateJwt(token, config);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('no JWKS URI configured returns error', async () => {
      const { validateJwt } = require(authModulePath);
      const token = await signToken({ sub: 'user6' });
      const config = makeConfig({ jwksUri: undefined });

      const result = await validateJwt(token, config);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/JWKS URI/i);
    });

    it('clearJwksCache resets the cached JWKS client', async () => {
      const { validateJwt, clearJwksCache } = require(authModulePath);
      const token = await signToken({ sub: 'user7' });
      const config = makeConfig();

      // First call should succeed
      const result1 = await validateJwt(token, config);
      expect(result1.valid).toBe(true);

      // Clear cache
      clearJwksCache();

      // Second call should still succeed (cache rebuilt)
      const result2 = await validateJwt(token, config);
      expect(result2.valid).toBe(true);
    });

    it('JWKS cache is reused for same URI', async () => {
      const { validateJwt } = require(authModulePath);
      const token1 = await signToken({ sub: 'user8a' });
      const token2 = await signToken({ sub: 'user8b' });
      const config = makeConfig();

      const result1 = await validateJwt(token1, config);
      const result2 = await validateJwt(token2, config);

      expect(result1.valid).toBe(true);
      expect(result1.claims?.sub).toBe('user8a');
      expect(result2.valid).toBe(true);
      expect(result2.claims?.sub).toBe('user8b');
    });
  });

  // ---- authenticateRequest integration in JWT mode ----

  describe('authenticateRequest in JWT mode', () => {
    let jwksServer: http.Server;
    let jwksUrl: string;
    let privateKey: any;
    let jose: any;

    beforeEach(async () => {
      jose = await import('jose');

      const keyPair = await jose.generateKeyPair('RS256');
      privateKey = keyPair.privateKey;
      const publicJwk = await jose.exportJWK(keyPair.publicKey);
      publicJwk.kid = 'auth-test-key';
      publicJwk.alg = 'RS256';
      publicJwk.use = 'sig';

      jwksServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ keys: [publicJwk] }));
      });

      await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
      const addr = jwksServer.address() as { port: number };
      jwksUrl = `http://127.0.0.1:${addr.port}/.well-known/jwks.json`;
    });

    afterEach(async () => {
      const { clearJwksCache } = require(authModulePath);
      clearJwksCache();
      await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
    });

    it('valid JWT authorizes request with claims', async () => {
      const { authenticateRequest } = require(authModulePath);

      const token = await new jose.SignJWT({ sub: 'admin-user', role: 'admin' })
        .setProtectedHeader({ alg: 'RS256', kid: 'auth-test-key' })
        .setIssuer('https://auth.example.com')
        .setAudience('evokore-mcp')
        .setExpirationTime('1h')
        .sign(privateKey);

      const config = {
        required: true,
        mode: 'jwt' as const,
        staticToken: null,
        issuer: 'https://auth.example.com',
        audience: 'evokore-mcp',
        jwksUri: jwksUrl,
      };

      const req = {
        url: '/mcp',
        headers: { authorization: `Bearer ${token}` },
      };

      const result = await authenticateRequest(req, config);
      expect(result.authorized).toBe(true);
      expect(result.claims).toBeDefined();
      expect(result.claims.sub).toBe('admin-user');
      expect(result.claims.role).toBe('admin');
    });

    it('invalid JWT returns 401', async () => {
      const { authenticateRequest } = require(authModulePath);

      const config = {
        required: true,
        mode: 'jwt' as const,
        staticToken: null,
        issuer: 'https://auth.example.com',
        audience: 'evokore-mcp',
        jwksUri: jwksUrl,
      };

      const req = {
        url: '/mcp',
        headers: { authorization: 'Bearer not-a-valid-jwt' },
      };

      const result = await authenticateRequest(req, config);
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBeDefined();
    });

    it('static mode unchanged (backward compat)', async () => {
      const { authenticateRequest } = require(authModulePath);

      const config = {
        required: true,
        mode: 'static' as const,
        staticToken: 'my-static-token',
      };

      const req = {
        url: '/mcp',
        headers: { authorization: 'Bearer my-static-token' },
      };

      const result = await authenticateRequest(req, config);
      expect(result.authorized).toBe(true);
      expect(result.claims).toBeUndefined();
    });

    it('static mode rejects wrong token (backward compat)', async () => {
      const { authenticateRequest } = require(authModulePath);

      const config = {
        required: true,
        mode: 'static' as const,
        staticToken: 'my-static-token',
      };

      const req = {
        url: '/mcp',
        headers: { authorization: 'Bearer wrong' },
      };

      const result = await authenticateRequest(req, config);
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    it('default mode is static when EVOKORE_AUTH_MODE not set', async () => {
      const savedMode = process.env.EVOKORE_AUTH_MODE;
      delete process.env.EVOKORE_AUTH_MODE;

      try {
        const { loadAuthConfig, authenticateRequest } = require(authModulePath);
        const config = loadAuthConfig();
        expect(config.mode).toBe('static');
      } finally {
        if (savedMode !== undefined) process.env.EVOKORE_AUTH_MODE = savedMode;
        else delete process.env.EVOKORE_AUTH_MODE;
      }
    });

    it('missing bearer token in JWT mode returns 401', async () => {
      const { authenticateRequest } = require(authModulePath);

      const config = {
        required: true,
        mode: 'jwt' as const,
        staticToken: null,
        jwksUri: jwksUrl,
      };

      const req = {
        url: '/mcp',
        headers: {},
      };

      const result = await authenticateRequest(req, config);
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toMatch(/missing/i);
    });

    it('auth disabled still bypasses in JWT mode config', async () => {
      const { authenticateRequest } = require(authModulePath);

      const config = {
        required: false,
        mode: 'jwt' as const,
        staticToken: null,
        jwksUri: jwksUrl,
      };

      const req = {
        url: '/mcp',
        headers: {},
      };

      const result = await authenticateRequest(req, config);
      expect(result.authorized).toBe(true);
    });

    it('/health bypasses JWT validation when auth is required', async () => {
      const { authenticateRequest } = require(authModulePath);

      const config = {
        required: true,
        mode: 'jwt' as const,
        staticToken: null,
        jwksUri: jwksUrl,
      };

      const req = {
        url: '/health',
        headers: {},
      };

      const result = await authenticateRequest(req, config);
      expect(result.authorized).toBe(true);
    });
  });

  // ---- HttpServer role passthrough source structure ----

  describe('HttpServer JWT role passthrough', () => {
    const httpSrc = fs.readFileSync(path.join(ROOT, 'src', 'HttpServer.ts'), 'utf8');

    it('stores auth claims from authenticateRequest result', () => {
      expect(httpSrc).toMatch(/authClaims/);
    });

    it('extracts role from auth claims', () => {
      expect(httpSrc).toMatch(/authClaims\?\.\s*role/);
    });

    it('passes roleOverride to handleMcpRequest', () => {
      expect(httpSrc).toMatch(/handleMcpRequest\s*\(\s*req\s*,\s*res\s*,\s*roleOverride/);
    });

    it('handleMcpRequest accepts roleOverride parameter', () => {
      expect(httpSrc).toMatch(/handleMcpRequest\s*\([^)]*roleOverride\s*\?\s*:\s*string/);
    });

    it('uses roleOverride in session creation with fallback to env var', () => {
      expect(httpSrc).toMatch(/roleOverride\s*\?\?\s*process\.env\.EVOKORE_ROLE/);
    });
  });
});
