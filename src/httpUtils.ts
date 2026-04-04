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

export async function httpGet(url: string, options: HttpGetOptions = {}): Promise<string> {
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

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
