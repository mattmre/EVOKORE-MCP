import http from "http";
import https from "https";
import { URL } from "url";

export interface HttpGetOptions {
  userAgent?: string;
  maxSize?: number;
  maxRedirects?: number;
  timeoutMs?: number;
}

const DEFAULT_USER_AGENT = "EVOKORE-MCP";
// Exported constants for external validation and overrides
export const MAX_FETCH_SIZE = 1024 * 1024; // 1MB
export const MAX_REDIRECT_DEPTH = 5;
export const FETCH_TIMEOUT_MS = 30000;

const DEFAULT_MAX_SIZE = MAX_FETCH_SIZE;
const DEFAULT_MAX_REDIRECTS = MAX_REDIRECT_DEPTH;
const DEFAULT_TIMEOUT_MS = FETCH_TIMEOUT_MS;

/**
 * Check whether a hostname resolves to a private, loopback, or link-local
 * address that should not be reachable from server-side HTTP requests.
 *
 * This blocks SSRF attacks that attempt to reach cloud instance metadata
 * endpoints (e.g. 169.254.169.254), internal services on RFC 1918 ranges,
 * or localhost/loopback addresses.
 *
 * The check mirrors the logic in WebhookManager.isValidWebhookConfig().
 */
export function isPrivateAddress(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h === "[::1]" ||
    /^::ffff:/i.test(h) ||
    /^\[::ffff:/i.test(h) ||
    /^fc00:/i.test(h) ||
    /^fe80:/i.test(h)
  );
}

/**
 * Perform an HTTP(S) GET request and return the response body as a string.
 *
 * Security: Private, loopback, and link-local addresses are rejected (SSRF
 * protection). This applies to both the initial URL and any redirect targets.
 * The check can be bypassed for local development by setting the environment
 * variable `EVOKORE_HTTP_ALLOW_PRIVATE=true`.
 *
 * @throws {Error} If the URL points to a private address, is invalid, uses a
 *   non-HTTP(S) protocol, returns a non-200 status, exceeds the size limit,
 *   times out, or exceeds the redirect limit.
 */
export async function httpGet(url: string, options: HttpGetOptions = {}): Promise<string> {
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allowPrivate = process.env.EVOKORE_HTTP_ALLOW_PRIVATE === "true";

  function doGet(targetUrl: string, redirectDepth: number): Promise<string> {
    if (redirectDepth > maxRedirects) {
      return Promise.reject(new Error("Too many redirects (max " + maxRedirects + ")"));
    }

    return new Promise<string>((resolve, reject) => {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(targetUrl);
      } catch {
        reject(new Error("Invalid URL: " + targetUrl));
        return;
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        reject(new Error("Only HTTP/HTTPS URLs are supported, got: " + parsedUrl.protocol));
        return;
      }

      // SSRF protection: block private/loopback/link-local addresses
      if (!allowPrivate && isPrivateAddress(parsedUrl.hostname)) {
        reject(new Error("Requests to private/loopback addresses are blocked (SSRF protection): " + parsedUrl.hostname));
        return;
      }

      const mod = targetUrl.startsWith("https") ? https : http;
      const req = mod.get(targetUrl, { headers: { "User-Agent": userAgent } }, (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          doGet(res.headers.location, redirectDepth + 1).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error("HTTP " + res.statusCode + " from " + targetUrl));
          return;
        }

        let data = "";
        let byteCount = 0;

        res.on("data", (chunk: Buffer) => {
          byteCount += chunk.length;
          if (byteCount > maxSize) {
            res.destroy();
            reject(new Error("Response too large (exceeds " + (maxSize / 1024 / 1024) + "MB limit)"));
            return;
          }
          data += chunk.toString("utf-8");
        });

        res.on("end", () => resolve(data));
        res.on("error", reject);
      });

      req.on("error", reject);
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error("Request timed out after " + (timeoutMs / 1000) + "s"));
      });
    });
  }

  return doGet(url, 0);
}
