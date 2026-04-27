import Fuse from "fuse.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DiscoveryProfile } from "./ProfileResolver";

export type ToolCatalogSource = "native" | "proxy";

export interface ToolCatalogEntry {
  name: string;
  description: string;
  tool: Tool;
  source: ToolCatalogSource;
  alwaysVisible: boolean;
  serverId?: string;
  originalName?: string;
  keywords: string[];
}

export interface ToolDiscoveryMatch {
  entry: ToolCatalogEntry;
  alreadyVisible: boolean;
}

export class ToolCatalogIndex {
  private readonly entries: ToolCatalogEntry[];
  private readonly entriesByName: Map<string, ToolCatalogEntry>;
  private readonly fuse: Fuse<ToolCatalogEntry>;

  constructor(nativeTools: Tool[], proxiedTools: Tool[], profile?: DiscoveryProfile) {
    const visibilitySet =
      profile && Array.isArray(profile.alwaysVisible)
        ? new Set(profile.alwaysVisible)
        : null;
    const allVisible =
      profile && profile.alwaysVisible === "all";
    const isAlwaysVisible = (tool: Tool, source: ToolCatalogSource): boolean => {
      // Sprint 3.x — describe_tool is the bootstrap path for
      // schema-deferred tools/list responses. Operators must always be
      // able to call it to fetch full schemas, so it is force-visible
      // across every profile/discovery mode regardless of allowlist
      // shape.
      if (tool.name === "describe_tool") {
        return true;
      }
      // Profile-driven visibility: explicit list of tool names.
      if (visibilitySet) {
        return visibilitySet.has(tool.name);
      }
      // "all" sentinel: every native AND every proxy tool ships in the
      // initial tools/list. Used by the `legacy-full` preset to restore
      // the pre-v3.1 unrestricted surface for operators who want it.
      if (allVisible) {
        return true;
      }
      // Default ("all-native" or no profile supplied): preserve the
      // v3.0 dynamic-mode behavior (now also called `legacy-dynamic`)
      // — every native tool is always visible, proxied tools are
      // dynamic. NOTE: pre-v3.1 "legacy" mode is the broader
      // unrestricted surface and is selected via the `legacy-full`
      // preset (handled by the `allVisible` branch above).
      return source === "native";
    };

    this.entries = [
      ...nativeTools.map((tool) => this.createEntry(tool, "native", isAlwaysVisible(tool, "native"))),
      ...proxiedTools.map((tool) => this.createEntry(tool, "proxy", isAlwaysVisible(tool, "proxy")))
    ];

    this.entriesByName = new Map(this.entries.map((entry) => [entry.name, entry]));
    this.fuse = new Fuse(this.entries, {
      keys: [
        { name: "name", weight: 0.45 },
        { name: "description", weight: 0.3 },
        { name: "keywords", weight: 0.25 }
      ],
      threshold: 0.35,
      ignoreLocation: true
    });
  }

  private createEntry(tool: Tool, source: ToolCatalogSource, alwaysVisible: boolean): ToolCatalogEntry {
    const serverSplitIndex = source === "proxy" ? tool.name.indexOf("_") : -1;
    const serverId = serverSplitIndex > 0 ? tool.name.slice(0, serverSplitIndex) : undefined;
    const originalName = serverSplitIndex > 0 ? tool.name.slice(serverSplitIndex + 1) : undefined;

    const entry: ToolCatalogEntry = {
      name: tool.name,
      description: tool.description || "No description provided.",
      tool,
      source,
      alwaysVisible,
      serverId,
      originalName,
      keywords: []
    };

    entry.keywords = this.buildKeywords(entry);
    return entry;
  }

  private buildKeywords(entry: ToolCatalogEntry): string[] {
    const tokens = new Set<string>();
    const collect = (value?: string) => {
      if (!value) return;
      tokens.add(value.toLowerCase());

      for (const part of value.toLowerCase().split(/[^a-z0-9]+/i)) {
        if (part) {
          tokens.add(part);
        }
      }
    };

    collect(entry.name);
    collect(entry.description);
    collect(entry.serverId);
    collect(entry.originalName);

    if (entry.source === "proxy") {
      collect("proxy");
      collect("proxied");
    } else {
      collect("native");
    }

    return Array.from(tokens);
  }

  getAllTools(): Tool[] {
    return this.entries.map((entry) => entry.tool);
  }

  getProjectedTools(activatedToolNames: Iterable<string> = []): Tool[] {
    const activatedSet = new Set(activatedToolNames);

    return this.entries
      .filter((entry) => entry.alwaysVisible || activatedSet.has(entry.name))
      .map((entry) => entry.tool);
  }

  getEntry(toolName: string): ToolCatalogEntry | undefined {
    return this.entriesByName.get(toolName);
  }

  isNativeTool(toolName: string): boolean {
    return this.entriesByName.get(toolName)?.source === "native";
  }

  discover(query: string, activatedToolNames: Iterable<string> = [], limit = 8): ToolDiscoveryMatch[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    const activatedSet = new Set(activatedToolNames);
    const boundedLimit = Math.max(1, Math.min(25, Math.floor(limit)));
    const seen = new Set<string>();
    const orderedEntries: ToolCatalogEntry[] = [];

    const include = (entry: ToolCatalogEntry) => {
      if (seen.has(entry.name)) return;
      seen.add(entry.name);
      orderedEntries.push(entry);
    };

    for (const entry of this.entries) {
      if (
        entry.name.toLowerCase() === normalizedQuery ||
        entry.originalName?.toLowerCase() === normalizedQuery ||
        entry.keywords.includes(normalizedQuery)
      ) {
        include(entry);
      }
    }

    for (const result of this.fuse.search(query, { limit: Math.max(boundedLimit * 4, boundedLimit) })) {
      include(result.item);
    }

    return orderedEntries.slice(0, boundedLimit).map((entry) => ({
      entry,
      alreadyVisible: entry.alwaysVisible || activatedSet.has(entry.name)
    }));
  }
}
