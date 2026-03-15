/**
 * OAuth Bearer Token Authentication for EVOKORE-MCP HTTP Transport
 *
 * Provides middleware-style token validation for HTTP endpoints.
 * Configured via environment variables:
 *   - EVOKORE_AUTH_REQUIRED: "true" to enforce auth (default: "false")
 *   - EVOKORE_AUTH_TOKEN: Static bearer token for simple setups
 *
 * When auth is required, all /mcp requests must include:
 *   Authorization: Bearer <token>
 *
 * The /health endpoint always bypasses authentication.
 */

import { IncomingMessage, ServerResponse } from "http";
import crypto from "crypto";

export interface AuthConfig {
  /** Whether authentication is required for /mcp endpoints. */
  required: boolean;
  /** Static bearer token for simple deployments. */
  staticToken: string | null;
}

export interface AuthResult {
  /** Whether the request is authorized. */
  authorized: boolean;
  /** Error message if not authorized. */
  error?: string;
  /** HTTP status code to return if not authorized. */
  statusCode?: number;
}

/**
 * Load auth configuration from environment variables.
 */
export function loadAuthConfig(): AuthConfig {
  const required = process.env.EVOKORE_AUTH_REQUIRED === "true";
  const staticToken = process.env.EVOKORE_AUTH_TOKEN || null;

  if (required && !staticToken) {
    console.error(
      "[EVOKORE-AUTH] Warning: EVOKORE_AUTH_REQUIRED=true but no EVOKORE_AUTH_TOKEN set. " +
      "All authenticated requests will be rejected."
    );
  }

  if (required) {
    console.error("[EVOKORE-AUTH] Bearer token authentication enabled.");
  }

  return { required, staticToken };
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
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function validateToken(token: string, config: AuthConfig): boolean {
  if (!config.staticToken) {
    return false;
  }

  // Timing-safe comparison to prevent timing attacks
  const tokenBuffer = Buffer.from(token, "utf8");
  const expectedBuffer = Buffer.from(config.staticToken, "utf8");

  if (tokenBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
}

/**
 * Check whether a request path should bypass authentication.
 * Currently only /health is unauthenticated.
 */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/health" || pathname === "/health/";
}

/**
 * Authenticate an incoming HTTP request.
 *
 * Returns an AuthResult indicating whether the request should proceed.
 * When auth is disabled (EVOKORE_AUTH_REQUIRED !== "true"), all requests
 * are authorized.
 */
export function authenticateRequest(
  req: IncomingMessage,
  config: AuthConfig
): AuthResult {
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
