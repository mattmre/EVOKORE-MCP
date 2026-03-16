/**
 * OAuth JWKS Real-Provider Integration Tests
 *
 * Simulates a real JWKS identity provider (like Auth0, Keycloak, or Entra ID)
 * by running a local HTTP server that serves a JWK Set. Uses the jose library
 * to generate key pairs, sign JWTs, and export public keys as JWKs.
 *
 * Tests cover: valid JWT verification, expired tokens, wrong audience/issuer,
 * key rotation, unknown key rejection, and JWKS endpoint unavailability.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import http from 'http';
import * as jose from 'jose';

const ROOT = path.resolve(__dirname, '../..');
const authModulePath = path.join(ROOT, 'dist', 'auth', 'OAuthProvider.js');

// ---- Helpers ----

interface JwksServerState {
  server: http.Server;
  url: string;
  keys: jose.JWK[];
}

/**
 * Start a local HTTP server that serves a JWKS endpoint.
 * The `keys` array is read on each request, allowing dynamic key rotation.
 */
async function startJwksServer(keysRef: { keys: jose.JWK[] }): Promise<JwksServerState> {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys: keysRef.keys }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const url = `http://127.0.0.1:${addr.port}/.well-known/jwks.json`;

  return { server, url, keys: keysRef.keys };
}

async function stopServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

/**
 * Generate an RSA key pair and export the public key as a JWK with metadata.
 */
async function generateSigningKey(kid: string, alg: string = 'RS256') {
  const keyPair = await jose.generateKeyPair(alg as any);
  const publicJwk = await jose.exportJWK(keyPair.publicKey);
  publicJwk.kid = kid;
  publicJwk.alg = alg;
  publicJwk.use = 'sig';

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicJwk,
  };
}

/**
 * Build an AuthConfig object for JWT mode.
 */
function makeJwtConfig(jwksUrl: string, overrides?: Record<string, any>) {
  return {
    required: true,
    mode: 'jwt' as const,
    staticToken: null,
    issuer: 'https://idp.evokore-test.example.com',
    audience: 'evokore-mcp',
    jwksUri: jwksUrl,
    ...overrides,
  };
}

/**
 * Sign a JWT with the given private key and claims.
 */
async function signJwt(
  privateKey: jose.KeyLike,
  kid: string,
  claims: Record<string, unknown>,
  options?: {
    issuer?: string;
    audience?: string;
    expirationTime?: string;
    alg?: string;
  }
) {
  const builder = new jose.SignJWT(claims)
    .setProtectedHeader({ alg: options?.alg ?? 'RS256', kid })
    .setIssuedAt()
    .setIssuer(options?.issuer ?? 'https://idp.evokore-test.example.com')
    .setAudience(options?.audience ?? 'evokore-mcp')
    .setExpirationTime(options?.expirationTime ?? '1h');

  return builder.sign(privateKey);
}

// ---- Tests ----

describe('OAuth JWKS Real-Provider Integration', () => {
  let keysRef: { keys: jose.JWK[] };
  let jwksState: JwksServerState;
  let key1: Awaited<ReturnType<typeof generateSigningKey>>;

  beforeAll(async () => {
    key1 = await generateSigningKey('provider-key-1');
    keysRef = { keys: [key1.publicJwk] };
    jwksState = await startJwksServer(keysRef);
  });

  afterAll(async () => {
    await stopServer(jwksState.server);
  });

  afterEach(() => {
    // Clear JWKS cache between tests so each test gets fresh state
    const { clearJwksCache } = require(authModulePath);
    clearJwksCache();
  });

  // ---- Scenario A: Valid JWT with JWKS verification ----

  describe('valid JWT with JWKS verification', () => {
    it('validates a correctly signed JWT and returns decoded claims', async () => {
      const { validateJwt } = require(authModulePath);

      const token = await signJwt(key1.privateKey, 'provider-key-1', {
        sub: 'user-alice',
        role: 'admin',
        email: 'alice@example.com',
      });

      const config = makeJwtConfig(jwksState.url);
      const result = await validateJwt(token, config);

      expect(result.valid).toBe(true);
      expect(result.claims).toBeDefined();
      expect(result.claims.sub).toBe('user-alice');
      expect(result.claims.role).toBe('admin');
      expect(result.claims.email).toBe('alice@example.com');
      expect(result.claims.iss).toBe('https://idp.evokore-test.example.com');
      expect(result.claims.aud).toBe('evokore-mcp');
      expect(result.claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('validates through authenticateRequest and returns claims', async () => {
      const { authenticateRequest } = require(authModulePath);

      const token = await signJwt(key1.privateKey, 'provider-key-1', {
        sub: 'service-account-1',
        role: 'developer',
      });

      const config = makeJwtConfig(jwksState.url);
      const req = {
        url: '/mcp',
        headers: { authorization: `Bearer ${token}` },
      };

      const result = await authenticateRequest(req, config);
      expect(result.authorized).toBe(true);
      expect(result.claims?.sub).toBe('service-account-1');
      expect(result.claims?.role).toBe('developer');
    });
  });

  // ---- Scenario B: Expired JWT rejection ----

  describe('expired JWT rejection', () => {
    it('rejects a JWT whose exp claim is in the past', async () => {
      const { validateJwt } = require(authModulePath);

      const token = await signJwt(key1.privateKey, 'provider-key-1', {
        sub: 'user-expired',
      }, {
        expirationTime: '-1h',  // expired 1 hour ago
      });

      const config = makeJwtConfig(jwksState.url);
      const result = await validateJwt(token, config);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.toLowerCase()).toMatch(/exp/);
    });

    it('rejects expired JWT through authenticateRequest with 401', async () => {
      const { authenticateRequest } = require(authModulePath);

      const token = await signJwt(key1.privateKey, 'provider-key-1', {
        sub: 'user-expired-auth',
      }, {
        expirationTime: '-30m',
      });

      const config = makeJwtConfig(jwksState.url);
      const req = {
        url: '/mcp',
        headers: { authorization: `Bearer ${token}` },
      };

      const result = await authenticateRequest(req, config);
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
    });
  });

  // ---- Scenario C: Wrong audience rejection ----

  describe('wrong audience rejection', () => {
    it('rejects a JWT with incorrect audience claim', async () => {
      const { validateJwt } = require(authModulePath);

      const token = await signJwt(key1.privateKey, 'provider-key-1', {
        sub: 'user-wrong-aud',
      }, {
        audience: 'some-other-service',
      });

      const config = makeJwtConfig(jwksState.url);
      const result = await validateJwt(token, config);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ---- Scenario D: Wrong issuer rejection ----

  describe('wrong issuer rejection', () => {
    it('rejects a JWT with incorrect issuer claim', async () => {
      const { validateJwt } = require(authModulePath);

      const token = await signJwt(key1.privateKey, 'provider-key-1', {
        sub: 'user-wrong-iss',
      }, {
        issuer: 'https://evil-idp.attacker.com',
      });

      const config = makeJwtConfig(jwksState.url);
      const result = await validateJwt(token, config);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ---- Scenario E: Key rotation simulation ----

  describe('key rotation simulation', () => {
    it('validates tokens signed by both old and new keys after rotation', async () => {
      const { validateJwt, clearJwksCache } = require(authModulePath);

      // Phase 1: Only key1 in JWKS - sign a token with key1
      const token1 = await signJwt(key1.privateKey, 'provider-key-1', {
        sub: 'user-prerotation',
      });

      const config = makeJwtConfig(jwksState.url);
      const result1 = await validateJwt(token1, config);
      expect(result1.valid).toBe(true);
      expect(result1.claims?.sub).toBe('user-prerotation');

      // Phase 2: Add key2 to JWKS (simulating key rotation)
      const key2 = await generateSigningKey('provider-key-2');
      keysRef.keys = [key1.publicJwk, key2.publicJwk];

      // Clear JWKS cache to force refetch with new key set
      clearJwksCache();

      // Sign a new token with key2
      const token2 = await signJwt(key2.privateKey, 'provider-key-2', {
        sub: 'user-postrotation',
      });

      const result2 = await validateJwt(token2, config);
      expect(result2.valid).toBe(true);
      expect(result2.claims?.sub).toBe('user-postrotation');

      // Verify token1 (signed with key1) still validates
      clearJwksCache();
      const result1Again = await validateJwt(token1, config);
      expect(result1Again.valid).toBe(true);
      expect(result1Again.claims?.sub).toBe('user-prerotation');

      // Restore original key set
      keysRef.keys = [key1.publicJwk];
    });

    it('rejects tokens signed with a retired key after removal', async () => {
      const { validateJwt, clearJwksCache } = require(authModulePath);

      // Generate a temporary key and add it
      const tempKey = await generateSigningKey('temp-key');
      keysRef.keys = [key1.publicJwk, tempKey.publicJwk];
      clearJwksCache();

      // Sign a token with the temp key
      const token = await signJwt(tempKey.privateKey, 'temp-key', {
        sub: 'user-temp-key',
      });

      const config = makeJwtConfig(jwksState.url);

      // Verify it works while the key is present
      const result1 = await validateJwt(token, config);
      expect(result1.valid).toBe(true);

      // Remove temp key (simulate key retirement)
      keysRef.keys = [key1.publicJwk];
      clearJwksCache();

      // Token should now fail validation
      const result2 = await validateJwt(token, config);
      expect(result2.valid).toBe(false);
      expect(result2.error).toBeDefined();
    });
  });

  // ---- Scenario F: Unknown key rejection ----

  describe('unknown key rejection', () => {
    it('rejects a JWT signed with a key not in the JWKS', async () => {
      const { validateJwt } = require(authModulePath);

      // Generate a completely separate key pair not in the JWKS
      const rogueKey = await generateSigningKey('rogue-key-unknown');

      const token = await signJwt(rogueKey.privateKey, 'rogue-key-unknown', {
        sub: 'user-rogue',
        role: 'admin',
      });

      const config = makeJwtConfig(jwksState.url);
      const result = await validateJwt(token, config);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects a JWT signed with a key whose kid matches but wrong key material', async () => {
      const { validateJwt } = require(authModulePath);

      // Generate a new key pair but use the same kid as key1
      const impersonatorKey = await generateSigningKey('provider-key-1');

      const token = await signJwt(impersonatorKey.privateKey, 'provider-key-1', {
        sub: 'user-impersonator',
      });

      const config = makeJwtConfig(jwksState.url);
      const result = await validateJwt(token, config);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ---- Scenario G: JWKS endpoint unavailability ----

  describe('JWKS endpoint unavailability', () => {
    it('handles JWKS endpoint returning 500 gracefully', async () => {
      const { validateJwt, clearJwksCache } = require(authModulePath);

      // Create a server that always returns 500
      const errorServer = http.createServer((req, res) => {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      });

      await new Promise<void>((resolve) => errorServer.listen(0, '127.0.0.1', resolve));
      const addr = errorServer.address() as { port: number };
      const errorUrl = `http://127.0.0.1:${addr.port}/.well-known/jwks.json`;

      try {
        const token = await signJwt(key1.privateKey, 'provider-key-1', {
          sub: 'user-error-server',
        });

        const config = makeJwtConfig(errorUrl);
        clearJwksCache();

        const result = await validateJwt(token, config);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      } finally {
        await stopServer(errorServer);
      }
    });

    it('handles JWKS endpoint that is unreachable', async () => {
      const { validateJwt, clearJwksCache } = require(authModulePath);

      // Use a port that is almost certainly not listening
      const deadUrl = 'http://127.0.0.1:19999/.well-known/jwks.json';

      const token = await signJwt(key1.privateKey, 'provider-key-1', {
        sub: 'user-unreachable',
      });

      const config = makeJwtConfig(deadUrl);
      clearJwksCache();

      const result = await validateJwt(token, config);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('handles JWKS endpoint returning invalid JSON', async () => {
      const { validateJwt, clearJwksCache } = require(authModulePath);

      const badJsonServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('not valid json {{{');
      });

      await new Promise<void>((resolve) => badJsonServer.listen(0, '127.0.0.1', resolve));
      const addr = badJsonServer.address() as { port: number };
      const badUrl = `http://127.0.0.1:${addr.port}/.well-known/jwks.json`;

      try {
        const token = await signJwt(key1.privateKey, 'provider-key-1', {
          sub: 'user-bad-json',
        });

        const config = makeJwtConfig(badUrl);
        clearJwksCache();

        const result = await validateJwt(token, config);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      } finally {
        await stopServer(badJsonServer);
      }
    });

    it('handles JWKS endpoint returning empty key set', async () => {
      const { validateJwt, clearJwksCache } = require(authModulePath);

      const emptyServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ keys: [] }));
      });

      await new Promise<void>((resolve) => emptyServer.listen(0, '127.0.0.1', resolve));
      const addr = emptyServer.address() as { port: number };
      const emptyUrl = `http://127.0.0.1:${addr.port}/.well-known/jwks.json`;

      try {
        const token = await signJwt(key1.privateKey, 'provider-key-1', {
          sub: 'user-empty-keyset',
        });

        const config = makeJwtConfig(emptyUrl);
        clearJwksCache();

        const result = await validateJwt(token, config);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      } finally {
        await stopServer(emptyServer);
      }
    });
  });

  // ---- Scenario H: No JWKS URI configured ----

  describe('no JWKS URI configured', () => {
    it('returns an error when jwksUri is undefined', async () => {
      const { validateJwt } = require(authModulePath);

      const token = await signJwt(key1.privateKey, 'provider-key-1', {
        sub: 'user-no-uri',
      });

      const config = makeJwtConfig(jwksState.url, { jwksUri: undefined });
      const result = await validateJwt(token, config);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/JWKS URI/i);
    });
  });

  // ---- Scenario I: Multiple valid tokens with different claims ----

  describe('multiple tokens with different claims', () => {
    it('correctly distinguishes claims across different tokens', async () => {
      const { validateJwt } = require(authModulePath);
      const config = makeJwtConfig(jwksState.url);

      const tokenAdmin = await signJwt(key1.privateKey, 'provider-key-1', {
        sub: 'admin-user',
        role: 'admin',
        permissions: ['read', 'write', 'delete'],
      });

      const tokenReadonly = await signJwt(key1.privateKey, 'provider-key-1', {
        sub: 'readonly-user',
        role: 'readonly',
        permissions: ['read'],
      });

      const resultAdmin = await validateJwt(tokenAdmin, config);
      const resultReadonly = await validateJwt(tokenReadonly, config);

      expect(resultAdmin.valid).toBe(true);
      expect(resultAdmin.claims?.role).toBe('admin');
      expect(resultAdmin.claims?.permissions).toEqual(['read', 'write', 'delete']);

      expect(resultReadonly.valid).toBe(true);
      expect(resultReadonly.claims?.role).toBe('readonly');
      expect(resultReadonly.claims?.permissions).toEqual(['read']);
    });
  });

  // ---- Scenario J: JWKS cache behavior ----

  describe('JWKS cache behavior', () => {
    it('cache is rebuilt after clearJwksCache', async () => {
      const { validateJwt, clearJwksCache } = require(authModulePath);
      const config = makeJwtConfig(jwksState.url);

      const token = await signJwt(key1.privateKey, 'provider-key-1', {
        sub: 'cache-test-user',
      });

      // First call: establishes cache
      const r1 = await validateJwt(token, config);
      expect(r1.valid).toBe(true);

      // Clear and re-validate: cache rebuilt
      clearJwksCache();
      const r2 = await validateJwt(token, config);
      expect(r2.valid).toBe(true);
    });

    it('cache is invalidated when JWKS URI changes', async () => {
      const { validateJwt, clearJwksCache } = require(authModulePath);

      // Set up a second JWKS server with a different key
      const key2 = await generateSigningKey('server2-key');
      const keysRef2 = { keys: [key2.publicJwk] };
      const jwks2 = await startJwksServer(keysRef2);

      try {
        // Sign with key1 and validate against server1 - should pass
        const token1 = await signJwt(key1.privateKey, 'provider-key-1', {
          sub: 'cache-uri-user-1',
        });
        const config1 = makeJwtConfig(jwksState.url);
        const r1 = await validateJwt(token1, config1);
        expect(r1.valid).toBe(true);

        // Sign with key2 and validate against server2 - should pass
        // (OAuthProvider detects URI change and rebuilds cache)
        const token2 = await signJwt(key2.privateKey, 'server2-key', {
          sub: 'cache-uri-user-2',
        });
        const config2 = makeJwtConfig(jwks2.url);
        const r2 = await validateJwt(token2, config2);
        expect(r2.valid).toBe(true);
      } finally {
        clearJwksCache();
        await stopServer(jwks2.server);
      }
    });
  });
});
