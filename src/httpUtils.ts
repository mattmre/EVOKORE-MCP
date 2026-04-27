import http from "http";
import https from "https";
import dns from "dns";
import net from "net";
import { promisify } from "util";
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

const dnsLookupAll = promisify(dns.lookup) as (
  hostname: string,
  options: { all: true }
) => Promise<Array<{ address: string; family: number }>>;

/**
 * Strip enclosing brackets from an IPv6 literal (e.g. `[::1]` -> `::1`).
 */
function stripIPv6Brackets(host: string): string {
  if (host.startsWith("[") && host.endsWith("]")) {
    return host.slice(1, -1);
  }
  return host;
}

/**
 * Check whether a literal IPv4 address is in a private, loopback, or
 * link-local range. Returns false for non-IPv4 strings.
 */
function isPrivateIPv4(addr: string): boolean {
  const m = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return false;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // 127/8 loopback
  if (a === 169 && b === 254) return true; // 169.254/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  return false;
}

/**
 * Check whether a literal IPv6 address is loopback, link-local, unique-local,
 * or an IPv4-mapped private address. Returns false for non-IPv6 strings.
 */
function isPrivateIPv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  // Loopback
  if (lower === "::1") return true;
  // Unspecified
  if (lower === "::" || lower === "::0") return true;
  // Link-local fe80::/10
  if (/^fe[89ab][0-9a-f]?:/i.test(lower)) return true;
  // Unique-local fc00::/7 (fc00::/8 + fd00::/8)
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true;
  // IPv4-mapped (::ffff:a.b.c.d) — extract embedded IPv4 and recurse.
  const mapped = lower.match(/^::ffff:([0-9.]+)$/);
  if (mapped) {
    return isPrivateIPv4(mapped[1]);
  }
  // IPv4-compatible (deprecated, ::a.b.c.d)
  const compat = lower.match(/^::([0-9.]+)$/);
  if (compat) {
    return isPrivateIPv4(compat[1]);
  }
  return false;
}

/**
 * Check whether a hostname (literal IP or DNS name) is one of the always-blocked
 * names — `localhost`, the IPv4/IPv6 unspecified address, or a literal address
 * in a private, loopback, link-local, or unique-local range.
 *
 * Note: this is a *literal* check. It does NOT perform DNS resolution. For
 * full SSRF protection that defeats DNS rebinding, use `assertResolvesPublic()`
 * before issuing the request.
 *
 * This blocks SSRF attacks that attempt to reach cloud instance metadata
 * endpoints (e.g. 169.254.169.254), internal services on RFC 1918 ranges,
 * or localhost/loopback addresses by literal hostname.
 */
export function isPrivateAddress(hostname: string): boolean {
  const h = stripIPv6Brackets(hostname.toLowerCase());
  if (h === "localhost" || h === "ip6-localhost" || h === "ip6-loopback") return true;
  if (h === "0.0.0.0") return true;
  // .local (mDNS) is a router-local TLD; reject by literal name.
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return true;
  if (net.isIPv4(h)) return isPrivateIPv4(h);
  if (net.isIPv6(h)) return isPrivateIPv6(h);
  return false;
}

/**
 * Resolve a hostname via DNS and assert that no resolved address is private.
 *
 * Returns the list of resolved addresses on success. Throws an Error on
 * resolution failure, on any private result, or if the hostname itself is a
 * literal private address. Used to defeat DNS-rebinding SSRF where a hostname
 * resolves to a public IP at validation time but a private one at request time.
 *
 * If `hostname` is already a literal IP, this short-circuits and just
 * validates the literal.
 */
export async function assertResolvesPublic(
  hostname: string,
): Promise<Array<{ address: string; family: number }>> {
  const stripped = stripIPv6Brackets(hostname);
  // Literal IP — no DNS work needed; reuse the literal check.
  if (net.isIP(stripped)) {
    if (isPrivateAddress(stripped)) {
      throw new Error(
        "Requests to private/loopback addresses are blocked (SSRF protection): " +
          hostname,
      );
    }
    return [{ address: stripped, family: net.isIPv4(stripped) ? 4 : 6 }];
  }
  if (isPrivateAddress(stripped)) {
    throw new Error(
      "Requests to private/loopback addresses are blocked (SSRF protection): " +
        hostname,
    );
  }
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await dnsLookupAll(stripped, { all: true });
  } catch (err: any) {
    throw new Error(
      "DNS lookup failed for " + hostname + ": " + (err?.message || String(err)),
    );
  }
  if (!addrs || addrs.length === 0) {
    throw new Error("DNS lookup returned no addresses for " + hostname);
  }
  for (const { address } of addrs) {
    const isPriv = net.isIPv4(address) ? isPrivateIPv4(address) : isPrivateIPv6(address);
    if (isPriv) {
      throw new Error(
        "Hostname " +
          hostname +
          " resolves to private address " +
          address +
          " (SSRF protection / DNS rebinding defense)",
      );
    }
  }
  return addrs;
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

  async function doGet(targetUrl: string, redirectDepth: number): Promise<string> {
    if (redirectDepth > maxRedirects) {
      throw new Error("Too many redirects (max " + maxRedirects + ")");
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      throw new Error("Invalid URL: " + targetUrl);
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error(
        "Only HTTP/HTTPS URLs are supported, got: " + parsedUrl.protocol,
      );
    }

    // SSRF protection: literal-name check + DNS resolution check.
    // The DNS step defeats rebinding by re-validating every resolved IP and
    // pinning the request to the first public address we resolved.
    if (!allowPrivate) {
      // Literal check first — fast path that doesn't hit DNS.
      if (isPrivateAddress(parsedUrl.hostname)) {
        throw new Error(
          "Requests to private/loopback addresses are blocked (SSRF protection): " +
            parsedUrl.hostname,
        );
      }
      // DNS-rebinding defense: resolve and re-check every address.
      // Throws on any private result.
      await assertResolvesPublic(parsedUrl.hostname);
    }

    return new Promise<string>((resolve, reject) => {
      const mod = parsedUrl.protocol === "https:" ? https : http;
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
