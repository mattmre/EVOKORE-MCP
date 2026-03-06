"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolCatalogIndex = void 0;
const fuse_js_1 = __importDefault(require("fuse.js"));
class ToolCatalogIndex {
    entries;
    entriesByName;
    fuse;
    constructor(nativeTools, proxiedTools) {
        this.entries = [
            ...nativeTools.map((tool) => this.createEntry(tool, "native")),
            ...proxiedTools.map((tool) => this.createEntry(tool, "proxy"))
        ];
        this.entriesByName = new Map(this.entries.map((entry) => [entry.name, entry]));
        this.fuse = new fuse_js_1.default(this.entries, {
            keys: [
                { name: "name", weight: 0.45 },
                { name: "description", weight: 0.3 },
                { name: "keywords", weight: 0.25 }
            ],
            threshold: 0.35,
            ignoreLocation: true
        });
    }
    createEntry(tool, source) {
        const serverSplitIndex = source === "proxy" ? tool.name.indexOf("_") : -1;
        const serverId = serverSplitIndex > 0 ? tool.name.slice(0, serverSplitIndex) : undefined;
        const originalName = serverSplitIndex > 0 ? tool.name.slice(serverSplitIndex + 1) : undefined;
        const entry = {
            name: tool.name,
            description: tool.description || "No description provided.",
            tool,
            source,
            alwaysVisible: source === "native",
            serverId,
            originalName,
            keywords: []
        };
        entry.keywords = this.buildKeywords(entry);
        return entry;
    }
    buildKeywords(entry) {
        const tokens = new Set();
        const collect = (value) => {
            if (!value)
                return;
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
        }
        else {
            collect("native");
        }
        return Array.from(tokens);
    }
    getAllTools() {
        return this.entries.map((entry) => entry.tool);
    }
    getProjectedTools(activatedToolNames = []) {
        const activatedSet = new Set(activatedToolNames);
        return this.entries
            .filter((entry) => entry.alwaysVisible || activatedSet.has(entry.name))
            .map((entry) => entry.tool);
    }
    getEntry(toolName) {
        return this.entriesByName.get(toolName);
    }
    isNativeTool(toolName) {
        return this.entriesByName.get(toolName)?.source === "native";
    }
    discover(query, activatedToolNames = [], limit = 8) {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
            return [];
        }
        const activatedSet = new Set(activatedToolNames);
        const boundedLimit = Math.max(1, Math.min(25, Math.floor(limit)));
        const seen = new Set();
        const orderedEntries = [];
        const include = (entry) => {
            if (seen.has(entry.name))
                return;
            seen.add(entry.name);
            orderedEntries.push(entry);
        };
        for (const entry of this.entries) {
            if (entry.name.toLowerCase() === normalizedQuery ||
                entry.originalName?.toLowerCase() === normalizedQuery ||
                entry.keywords.includes(normalizedQuery)) {
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
exports.ToolCatalogIndex = ToolCatalogIndex;
