# OAuth JWKS Real-Provider Integration Test

**Date:** 2026-03-15
**Status:** Complete
**Scope:** `tests/integration/oauth-jwks-integration.test.ts`

## Test Architecture

The integration test simulates a real JWKS-based identity provider (Auth0, Keycloak, Entra ID) by:

1. **Local JWKS HTTP server** - A Node.js `http.createServer` instance serves a `/.well-known/jwks.json` endpoint returning a JWK Set. The key set is mutable (referenced by pointer), enabling key rotation tests without restarting the server.

2. **jose library for key operations** - RSA key pairs are generated via `jose.generateKeyPair('RS256')`, exported to JWK format with `jose.exportJWK()`, and JWTs are signed with `jose.SignJWT`. This matches real-world provider behavior exactly since jose implements the same JOSE RFCs (7515-7519) that Auth0/Keycloak use.

3. **OAuthProvider under test** - The test imports `validateJwt`, `authenticateRequest`, and `clearJwksCache` from the compiled `dist/auth/OAuthProvider.js` module, exercising the actual production code path including the internal `createRemoteJWKSet` caching.

### Test Flow

```
[jose.generateKeyPair] --> [private key] --> [jose.SignJWT] --> JWT token
                       --> [public JWK]  --> [local JWKS server]
                                                   |
                                                   v
                          [OAuthProvider.validateJwt(token, config)]
                                    |
                                    v
                         [createRemoteJWKSet(jwksUrl)] --> HTTP GET to local server
                                    |
                                    v
                          [jwtVerify(token, jwks, {issuer, audience})]
```

## Test Scenarios (18 tests)

| Scenario | Count | Description |
|---|---|---|
| Valid JWT with JWKS | 2 | Correct signature, claims extraction, authenticateRequest integration |
| Expired JWT | 2 | Past `exp` claim rejected by both validateJwt and authenticateRequest |
| Wrong audience | 1 | Mismatched `aud` claim rejected |
| Wrong issuer | 1 | Mismatched `iss` claim rejected |
| Key rotation | 2 | Add key2 to JWKS, verify both old and new tokens work; retire a key and verify rejection |
| Unknown key | 2 | Token signed by key not in JWKS; token with matching kid but wrong key material |
| JWKS unavailability | 4 | HTTP 500, unreachable endpoint, invalid JSON, empty key set |
| No JWKS URI | 1 | Config with undefined jwksUri returns descriptive error |
| Multiple claims | 1 | Different role/permission claims distinguished across tokens |
| Cache behavior | 2 | Cache rebuilt after clear; cache invalidated when URI changes |

## Key Findings

### OAuthProvider Behavior

1. **JWKS caching works correctly.** The `createRemoteJWKSet` from jose handles caching internally. OAuthProvider adds a layer on top: it caches the JWKS client instance and only recreates it when the JWKS URI changes or `clearJwksCache()` is called. This means key rotation is transparent as long as `createRemoteJWKSet` re-fetches on cache miss (which it does by default).

2. **Error handling is graceful.** All failure modes (network errors, HTTP 500, invalid JSON, empty key sets, wrong keys) are caught by the try/catch in `validateJwt` and returned as `{ valid: false, error: "..." }` rather than throwing. This prevents unhandled exceptions from crashing the HTTP server.

3. **Claim validation is strict.** Both `issuer` and `audience` are validated by `jose.jwtVerify` when configured. Missing or mismatched claims result in immediate rejection. The `exp` claim is checked automatically by jose.

4. **Key impersonation is correctly rejected.** Even when an attacker uses the same `kid` as a legitimate key but different key material, the RSA signature verification fails because the public key in the JWKS does not match the private key used for signing.

5. **Cache URI change detection works.** When `validateJwt` is called with a different JWKS URI than the cached one, the cache is invalidated and a new `createRemoteJWKSet` client is created. This supports configuration changes without requiring a server restart.

### Gaps and Considerations

1. **No automatic JWKS refresh on unknown kid.** If a new key is added to the provider but the JWKS cache has not expired, tokens signed with the new key will fail until the jose library's internal cache refreshes. The `clearJwksCache()` function provides a manual escape hatch. In production, providers typically overlap old and new keys during rotation windows.

2. **No token revocation support.** The current implementation has no concept of token revocation lists or introspection endpoints. Tokens are valid until their `exp` claim passes. This is standard for JWT-based auth but means compromised tokens cannot be invalidated before expiry.

3. **Single-algorithm assumption.** The tests use RS256 exclusively. The OAuthProvider does not restrict algorithms, so it would accept tokens signed with any algorithm supported by the JWKS key's `alg` field. This is correct behavior per the JOSE spec.

4. **No rate limiting on JWKS fetches.** If `clearJwksCache()` is called frequently, each subsequent `validateJwt` call triggers a fresh HTTP request to the JWKS endpoint. In production, this is mitigated by jose's built-in caching (cooldown period between fetches).

## Relation to Existing Tests

- `oauth-authentication.test.ts` - Tests static token mode, extractBearerToken, isPublicPath, and basic auth flow. No JWKS.
- `oauth-jwt-validation.test.ts` - Tests JWT mode with a simple JWKS server per test (beforeEach). Covers basic valid/expired/wrong-issuer/audience cases.
- `oauth-httpserver-middleware.test.ts` - Tests the HttpServer middleware wiring with both static and JWT auth.
- **This file** (`oauth-jwks-integration.test.ts`) - Comprehensive real-provider simulation with key rotation, cache behavior, multiple failure modes, and impersonation resistance. Uses a shared JWKS server with mutable key set for realistic provider lifecycle testing.
