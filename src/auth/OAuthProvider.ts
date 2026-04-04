/**
 * OAuth Bearer Token Authentication for EVOKORE-MCP HTTP Transport
 *
 * Provides middleware-style token validation for HTTP endpoints.
 * Configured via environment variables:
 *   - EVOKORE_AUTH_REQUIRED: "true" to enforce auth (default: "false")
 *   - EVOKORE_AUTH_MODE: "static" (default) or "jwt" for JWKS-based validation
 *   - EVOKORE_AUTH_TOKEN: Static bearer token for simple setups
 *   - EVOKORE_OAUTH_ISSUER: Expected JWT issuer claim (jwt mode)
 *   - EVOKORE_OAUTH_AUDIENCE: Expected JWT audience claim (jwt mode)
 *   - EVOKORE_OAUTH_JWKS_URI: JWKS endpoint URL for key fetching (jwt mode)
 *
 * When auth is required, all /mcp requests must include:
 *   Authorization: Bearer <token>
 *
 * The /health endpoint always bypasses authentication.
 */

import { IncomingMessage, ServerResponse } from "http";
import crypto from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthConfig {
  /** Whether authentication is required for /mcp endpoints. */
  required: boolean;
  /** Authentication mode: "static" for simple token comparison, "jwt" for JWKS-based JWT validation. */
  mode: "static" | "jwt";
  /** Static bearer token for simple deployments. */
  staticToken: string | null;
  /** Expected JWT issuer claim (jwt mode only). */
  issuer?: string;
  /** Expected JWT audience claim (jwt mode only). */
  audience?: string;
  /** JWKS endpoint URL for key fetching (jwt mode only). */
  jwksUri?: string;
}

export interface JWTClaims {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  role?: string;
  [key: string]: unknown;
}

export interface AuthResult {
  /** Whether the request is authorized. */
  authorized: boolean;
  /** Error message if not authorized. */
  error?: string;
  /** HTTP status code to return if not authorized. */
  statusCode?: number;
  /** Validated JWT claims (only populated in jwt mode). */
  claims?: JWTClaims;
}

/**
 * Load auth configuration from environment variables.
 */
export function loadAuthConfig(): AuthConfig {
  const required = process.env.EVOKORE_AUTH_REQUIRED === "true";
  const mode = process.env.EVOKORE_AUTH_MODE === "jwt" ? "jwt" as const : "static" as const;
  const staticToken = process.env.EVOKORE_AUTH_TOKEN || null;
  const issuer = process.env.EVOKORE_OAUTH_ISSUER || undefined;
  const audience = process.env.EVOKORE_OAUTH_AUDIENCE || undefined;
  const jwksUri = process.env.EVOKORE_OAUTH_JWKS_URI || undefined;

  if (required && mode === "static" && !staticToken) {
    console.error(
      "[EVOKORE-AUTH] Warning: EVOKORE_AUTH_REQUIRED=true but no EVOKORE_AUTH_TOKEN set. " +
      "All authenticated requests will be rejected."
    );
  }

  if (required && mode === "jwt" && !jwksUri) {
    console.error(
      "[EVOKORE-AUTH] Warning: EVOKORE_AUTH_MODE=jwt but no EVOKORE_OAUTH_JWKS_URI set. " +
      "JWT validation will fail for all requests."
    );
  }

  if (required) {
    console.error(`[EVOKORE-AUTH] Bearer token authentication enabled (mode: ${mode}).`);
  }

  return { required, mode, staticToken, issuer, audience, jwksUri };
}

/**
 * Extract the Bearer token from an Authorization header value.
 * Returns null if the header is missing, empty, or not a Bearer scheme.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const trimmed = authHeader.trim();
  // RFC 6750: case-insensitive "Bearer" scheme
  if (!/^Bearer\s+/i.test(trimmed)) {
    return null;
  }

  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Validate a bearer token against the configured static token.
 * Uses HMAC digests for constant-time, constant-length comparison to prevent
 * both timing attacks and length-oracle attacks.
 */
export function validateToken(token: string, config: AuthConfig): boolean {
  if (!config.staticToken) {
    return false;
  }

  // Use HMAC digests of fixed length to eliminate the length oracle.
  // A fixed dummy key is acceptable here -- the goal is constant-length
  // comparison, not secrecy of the key.
  const hmacKey = Buffer.alloc(32);
  const tokenDigest = crypto.createHmac("sha256", hmacKey).update(token).digest();
  const expectedDigest = crypto.createHmac("sha256", hmacKey).update(config.staticToken).digest();
  return crypto.timingSafeEqual(tokenDigest, expectedDigest);
}

/**
 * Check whether a request path should bypass authentication.
 * Currently only /health is unauthenticated.
 */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/health" || pathname === "/health/";
}

// ---- JWKS Cache for JWT mode ----

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Clear the cached JWKS client. Useful for tests or when the JWKS URI changes.
 */
export function clearJwksCache(): void {
  jwksCache.clear();
}

/**
 * Validate a JWT token against a remote JWKS endpoint.
 * Returns validation result with decoded claims on success.
 */
export async function validateJwt(
  token: string,
  config: AuthConfig
): Promise<{ valid: boolean; claims?: JWTClaims; error?: string }> {
  if (!config.jwksUri) {
    return { valid: false, error: "No JWKS URI configured" };
  }

  try {
    if (!jwksCache.has(config.jwksUri)) {
      jwksCache.set(config.jwksUri, createRemoteJWKSet(new URL(config.jwksUri)));
    }
    const jwks = jwksCache.get(config.jwksUri)!;

    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.issuer,
      audience: config.audience,
    });

    return { valid: true, claims: payload as JWTClaims };
  } catch (err: any) {
    return { valid: false, error: err.message || "JWT validation failed" };
  }
}

/**
 * Authenticate an incoming HTTP request.
 *
 * Returns a Promise<AuthResult> indicating whether the request should proceed.
 * When auth is disabled (EVOKORE_AUTH_REQUIRED !== "true"), all requests
 * are authorized.
 *
 * In jwt mode, the token is validated against the configured JWKS endpoint
 * and decoded claims are returned on success.
 *
 * In static mode (default), the token is compared against the configured
 * static token using timing-safe comparison.
 */
export async function authenticateRequest(
  req: IncomingMessage,
  config: AuthConfig
): Promise<AuthResult> {
  // Auth not required -- pass everything through
  if (!config.required) {
    return { authorized: true };
  }

  // Public paths always bypass auth
  const url = new URL(req.url || "/", "http://localhost");
  if (isPublicPath(url.pathname)) {
    return { authorized: true };
  }

  // Extract and validate the Bearer token
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return {
      authorized: false,
      error: "Missing or invalid Authorization header. Expected: Bearer <token>",
      statusCode: 401,
    };
  }

  // JWT mode: validate against JWKS endpoint
  if (config.mode === "jwt") {
    const result = await validateJwt(token, config);
    if (!result.valid) {
      return {
        authorized: false,
        error: result.error || "Invalid JWT",
        statusCode: 401,
      };
    }
    return { authorized: true, claims: result.claims };
  }

  // Static token mode (default): timing-safe comparison
  if (!validateToken(token, config)) {
    return {
      authorized: false,
      error: "Invalid bearer token.",
      statusCode: 401,
    };
  }

  return { authorized: true };
}

/**
 * Send a JSON-RPC-style 401 error response.
 * Follows the MCP error format for consistency.
 */
export function sendUnauthorizedResponse(
  res: ServerResponse,
  error: string
): void {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32001,
      message: "Unauthorized",
      data: { detail: error },
    },
    id: null,
  });

  res.writeHead(401, {
    "Content-Type": "application/json",
    "WWW-Authenticate": 'Bearer realm="evokore-mcp"',
  });
  res.end(body);
}
