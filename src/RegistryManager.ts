import crypto from "crypto";
import { httpGet } from "./httpUtils";

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * A single entry in a remote skill registry.
 */
export interface RegistryEntry {
  name: string;
  version: string;
  description: string;
  url: string; // download URL
  category?: string;
  author?: string;
  tags?: string[];
  checksum?: string; // SHA-256 of the content
  updatedAt?: string;
}

/**
 * The top-level structure of a remote registry index.
 */
export interface RegistryIndex {
  name: string;
  version: string;
  entries: RegistryEntry[];
}

/**
 * Internal cache record for a fetched registry.
 */
interface CachedRegistry {
  index: RegistryIndex;
  fetchedAt: number;
}

/**
 * RegistryManager handles fetching, caching, searching, and verifying
 * remote skill/plugin registries.
 *
 * Design principles:
 * - In-memory cache with configurable TTL to avoid redundant network requests.
 * - SHA-256 checksum verification for downloaded skill content.
 * - Fuzzy search across all loaded registries by name, description, and tags.
 * - Graceful degradation: unreachable registries are skipped, not fatal.
 */
export class RegistryManager {
  private cache: Map<string, CachedRegistry> = new Map();
  private cacheTtlMs: number;

  constructor(cacheTtlMs: number = DEFAULT_CACHE_TTL_MS) {
    this.cacheTtlMs = cacheTtlMs;
  }

  /**
   * Fetch and parse a remote registry index.
   * Uses the in-memory cache if the entry is still within TTL.
   */
  async fetchRegistry(url: string): Promise<RegistryIndex> {
    // Check cache first
    const cached = this.cache.get(url);
    if (cached && (Date.now() - cached.fetchedAt) < this.cacheTtlMs) {
      return cached.index;
    }

    const raw = await httpGet(url, { userAgent: "EVOKORE-MCP-Registry" });
    const parsed = JSON.parse(raw);

    const index = this.parseRegistryIndex(parsed);

    this.cache.set(url, { index, fetchedAt: Date.now() });

    return index;
  }

  /**
   * Search across all loaded registries for entries matching the query.
   * Matches against name, description, tags, and author fields.
   * Case-insensitive substring matching.
   */
  searchRegistry(query: string, registries: RegistryIndex[]): RegistryEntry[] {
    if (!query || query.trim().length === 0) {
      // Return all entries across all registries
      return registries.flatMap(r => r.entries);
    }

    const lowerQuery = query.toLowerCase().trim();
    const terms = lowerQuery.split(/\s+/);

    const scored: Array<{ entry: RegistryEntry; score: number }> = [];

    for (const registry of registries) {
      for (const entry of registry.entries) {
        const score = this.scoreEntry(entry, terms);
        if (score > 0) {
          scored.push({ entry, score });
        }
      }
    }

    // Sort by score descending, then by name alphabetically for ties
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.entry.name.localeCompare(b.entry.name);
    });

    return scored.map(s => s.entry);
  }

  /**
   * Verify the SHA-256 checksum of content against an expected hex digest.
   */
  verifyChecksum(content: string, expected: string): boolean {
    const actual = crypto
      .createHash("sha256")
      .update(content, "utf8")
      .digest("hex");
    return actual.toLowerCase() === expected.toLowerCase();
  }

  /**
   * Clear the entire cache or a single URL entry.
   */
  clearCache(url?: string): void {
    if (url) {
      this.cache.delete(url);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics for diagnostics.
   */
  getCacheStats(): { size: number; urls: string[] } {
    return {
      size: this.cache.size,
      urls: Array.from(this.cache.keys()),
    };
  }

  /**
   * Check if a cached registry entry is still fresh.
   */
  isCached(url: string): boolean {
    const cached = this.cache.get(url);
    if (!cached) return false;
    return (Date.now() - cached.fetchedAt) < this.cacheTtlMs;
  }

  // ---- Private ----

  private scoreEntry(entry: RegistryEntry, terms: string[]): number {
    let score = 0;
    const name = entry.name.toLowerCase();
    const desc = entry.description.toLowerCase();
    const author = (entry.author || "").toLowerCase();
    const tags = (entry.tags || []).map(t => t.toLowerCase());

    for (const term of terms) {
      // Name exact match is highest value
      if (name === term) {
        score += 10;
      } else if (name.includes(term)) {
        score += 5;
      }

      // Description match
      if (desc.includes(term)) {
        score += 3;
      }

      // Tag match
      for (const tag of tags) {
        if (tag === term) {
          score += 4;
        } else if (tag.includes(term)) {
          score += 2;
        }
      }

      // Author match
      if (author.includes(term)) {
        score += 1;
      }
    }

    return score;
  }

  private parseRegistryIndex(parsed: any): RegistryIndex {
    // Support both { name, version, entries: [...] } and flat array format
    if (Array.isArray(parsed)) {
      return {
        name: "unknown",
        version: "0.0.0",
        entries: parsed.map(e => this.parseEntry(e)).filter(Boolean) as RegistryEntry[],
      };
    }

    const name = typeof parsed.name === "string" ? parsed.name : "unknown";
    const version = typeof parsed.version === "string" ? parsed.version : "0.0.0";

    const rawEntries = Array.isArray(parsed.entries)
      ? parsed.entries
      : Array.isArray(parsed.skills)
        ? parsed.skills
        : [];

    const entries = rawEntries
      .map((e: any) => this.parseEntry(e))
      .filter(Boolean) as RegistryEntry[];

    return { name, version, entries };
  }

  private parseEntry(raw: any): RegistryEntry | null {
    if (!raw || typeof raw !== "object") return null;
    if (!raw.name || !raw.url) return null;

    return {
      name: String(raw.name),
      version: String(raw.version || "0.0.0"),
      description: String(raw.description || "No description"),
      url: String(raw.url),
      category: raw.category ? String(raw.category) : undefined,
      author: raw.author ? String(raw.author) : undefined,
      tags: Array.isArray(raw.tags)
        ? raw.tags.filter((t: any) => typeof t === "string")
        : undefined,
      checksum: raw.checksum ? String(raw.checksum) : undefined,
      updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
    };
  }

}
