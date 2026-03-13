"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const yaml_1 = __importDefault(require("yaml"));
const fuse_js_1 = __importDefault(require("fuse.js"));
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const child_process_1 = require("child_process");
const SKILLS_DIR = path_1.default.resolve(__dirname, "../SKILLS");
const CONFIG_PATH = path_1.default.resolve(__dirname, "../mcp.config.json");
const MAX_FETCH_SIZE = 1 * 1024 * 1024; // 1MB limit for fetched skills
const MAX_REDIRECT_DEPTH = 5;
const SKIP_DIRS = new Set([
    "node_modules", ".git", "__pycache__", "__tests__",
    ".claude", "themes", "assets", "scripts"
]);
const MAX_DEPTH = 5;
const SEARCH_STOP_WORDS = new Set([
    "a", "an", "and", "as", "at", "by", "for", "from", "i", "in", "into", "it",
    "me", "my", "new", "of", "on", "or", "please", "the", "to", "up", "we", "with"
]);
class SkillManager {
    skillsCache = new Map();
    fuseIndex = null;
    proxyManager;
    _loadTimeMs = 0;
    _lastSearchMs = 0;
    watcher = null;
    onRefreshCallback = null;
    constructor(proxyManager) {
        this.proxyManager = proxyManager;
    }
    getStats() {
        const categories = new Set();
        for (const skill of this.skillsCache.values()) {
            categories.add(skill.category);
        }
        let fuseIndexSizeKb = 0;
        try {
            if (this.fuseIndex) {
                const serialized = JSON.stringify(this.fuseIndex);
                fuseIndexSizeKb = Math.round((Buffer.byteLength(serialized, "utf-8") / 1024) * 100) / 100;
            }
        }
        catch {
            // If serialization fails, leave as 0
        }
        return {
            totalSkills: this.skillsCache.size,
            categories: Array.from(categories).sort(),
            loadTimeMs: this._loadTimeMs,
            fuseIndexSizeKb,
            lastSearchMs: this._lastSearchMs
        };
    }
    async loadSkills() {
        this.skillsCache.clear();
        const loadStart = Date.now();
        try {
            const scanStart = Date.now();
            const categories = await promises_1.default.readdir(SKILLS_DIR).catch(() => []);
            for (const category of categories) {
                const categoryPath = path_1.default.join(SKILLS_DIR, category);
                const stat = await promises_1.default.stat(categoryPath).catch(() => null);
                if (!stat || !stat.isDirectory())
                    continue;
                await this.walkDirectory(categoryPath, category, "", 0);
            }
            const dirScanMs = Date.now() - scanStart;
            const fuseStart = Date.now();
            this.fuseIndex = new fuse_js_1.default(Array.from(this.skillsCache.values()), {
                keys: [
                    { name: "name", weight: 0.22 },
                    { name: "description", weight: 0.18 },
                    { name: "category", weight: 0.05 },
                    { name: "subcategory", weight: 0.05 },
                    { name: "declaredCategory", weight: 0.04 },
                    { name: "tags", weight: 0.08 },
                    { name: "aliases", weight: 0.12 },
                    { name: "resolutionHints", weight: 0.08 },
                    { name: "metadataText", weight: 0.06 },
                    { name: "searchableText", weight: 0.07 },
                    { name: "content", weight: 0.05 }
                ],
                threshold: 0.4,
                ignoreLocation: true,
                includeScore: true
            });
            const fuseMs = Date.now() - fuseStart;
            this._loadTimeMs = Date.now() - loadStart;
            console.error(`[EVOKORE] Skill indexing: ${dirScanMs}ms scan, ${fuseMs}ms index, ${this.skillsCache.size} skills`);
        }
        catch (e) {
            this._loadTimeMs = Date.now() - loadStart;
            console.error("[EVOKORE] Error loading skills directory:", e);
        }
    }
    async refreshSkills() {
        const oldKeys = new Set(this.skillsCache.keys());
        const refreshStart = Date.now();
        await this.loadSkills();
        const newKeys = new Set(this.skillsCache.keys());
        const refreshTimeMs = Date.now() - refreshStart;
        const added = [...newKeys].filter(k => !oldKeys.has(k)).length;
        const removed = [...oldKeys].filter(k => !newKeys.has(k)).length;
        const updated = this.skillsCache.size - added;
        console.error(`[EVOKORE] Skill refresh: +${added} -${removed} ~${updated} = ${this.skillsCache.size} total (${refreshTimeMs}ms)`);
        return { added, removed, updated, total: this.skillsCache.size, refreshTimeMs };
    }
    setOnRefreshCallback(cb) {
        this.onRefreshCallback = cb;
    }
    enableWatcher() {
        if (this.watcher)
            return;
        if (!fs_1.default.existsSync(SKILLS_DIR)) {
            console.error("[EVOKORE] Skill watcher: SKILLS directory not found, watcher not started.");
            return;
        }
        let debounceTimer = null;
        try {
            this.watcher = fs_1.default.watch(SKILLS_DIR, { recursive: true }, () => {
                if (debounceTimer)
                    clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    console.error("[EVOKORE] Skill watcher: filesystem change detected, refreshing...");
                    this.refreshSkills().then(() => {
                        this.onRefreshCallback?.();
                    }).catch((err) => {
                        console.error("[EVOKORE] Skill watcher: refresh failed:", err);
                    });
                }, 1000);
            });
            console.error("[EVOKORE] Skill watcher: watching SKILLS directory for changes.");
        }
        catch (err) {
            console.error("[EVOKORE] Skill watcher: failed to start:", err);
        }
    }
    disableWatcher() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            console.error("[EVOKORE] Skill watcher: stopped.");
        }
    }
    async walkDirectory(dirPath, category, subcategoryPath, depth) {
        if (depth > MAX_DEPTH)
            return;
        const entries = await promises_1.default.readdir(dirPath).catch(() => []);
        for (const entry of entries) {
            const entryPath = path_1.default.join(dirPath, entry);
            const entryStat = await promises_1.default.stat(entryPath).catch(() => null);
            if (!entryStat)
                continue;
            if (!entryStat.isDirectory()) {
                // Handle loose .md files at this level
                if (entry.endsWith(".md") && entry !== "SKILL.md") {
                    try {
                        const content = await promises_1.default.readFile(entryPath, "utf-8");
                        const fallbackName = entry.replace(".md", "");
                        const metadata = this.parseSkillMarkdown(content, category, entryPath, fallbackName, subcategoryPath);
                        if (metadata) {
                            const cacheKey = (category + "/" + metadata.name).toLowerCase();
                            this.skillsCache.set(cacheKey, metadata);
                        }
                    }
                    catch {
                        // skip unreadable files
                    }
                }
                continue;
            }
            // Skip excluded directories
            if (SKIP_DIRS.has(entry))
                continue;
            // Check for SKILL.md in this directory
            const skillMdPath = path_1.default.join(entryPath, "SKILL.md");
            try {
                const content = await promises_1.default.readFile(skillMdPath, "utf-8");
                const metadata = this.parseSkillMarkdown(content, category, skillMdPath, entry, subcategoryPath);
                if (metadata) {
                    const cacheKey = (category + "/" + metadata.name).toLowerCase();
                    this.skillsCache.set(cacheKey, metadata);
                }
            }
            catch {
                // No SKILL.md here - still recurse
            }
            // Build subcategory path for deeper levels
            const nextSubcategory = subcategoryPath ? subcategoryPath + "/" + entry : entry;
            await this.walkDirectory(entryPath, category, nextSubcategory, depth + 1);
        }
    }
    parseSkillMarkdown(content, category, filePath, fallbackName, subcategory = "") {
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
        if (!match)
            return null;
        try {
            const frontmatter = yaml_1.default.parse(match[1]);
            const metadata = this.normalizeMetadata(frontmatter?.metadata);
            const tags = this.collectTags(frontmatter, metadata);
            const aliases = this.collectAliases(frontmatter, metadata, fallbackName, subcategory, filePath);
            const resolutionHints = this.collectResolutionHints(frontmatter, content, metadata);
            // Parse optional versioning and dependency fields
            const version = frontmatter?.version || metadata?.version || undefined;
            const requires = Array.isArray(frontmatter?.requires)
                ? frontmatter.requires.map((r) => ({
                    name: typeof r === "string" ? r : String(r?.name || ""),
                    ...(typeof r === "object" && r?.minVersion ? { minVersion: String(r.minVersion) } : {})
                })).filter((r) => r.name)
                : [];
            const conflicts = Array.isArray(frontmatter?.conflicts)
                ? frontmatter.conflicts
                    .map((c) => typeof c === "string" ? c : (c?.name ? String(c.name) : ""))
                    .filter(Boolean)
                : [];
            return {
                name: frontmatter?.name || fallbackName,
                description: frontmatter?.description || "No description provided.",
                category,
                subcategory,
                declaredCategory: frontmatter?.category || category,
                tags,
                aliases,
                resolutionHints,
                metadata,
                metadataText: this.buildMetadataText(metadata, tags),
                searchableText: this.buildSearchableText(frontmatter?.name || fallbackName, frontmatter?.description || "No description provided.", category, subcategory, frontmatter?.category || category, tags, aliases, resolutionHints, this.buildMetadataText(metadata, tags), filePath),
                pathDepth: subcategory ? subcategory.split("/").filter(Boolean).length : 0,
                filePath,
                content: match[2].trim(),
                ...(version ? { version: String(version) } : {}),
                ...(requires.length > 0 ? { requires } : {}),
                ...(conflicts.length > 0 ? { conflicts } : {})
            };
        }
        catch (e) {
            return null;
        }
    }
    normalizeMetadata(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return {};
        }
        return value;
    }
    collectTags(frontmatter, metadata) {
        const collected = new Set();
        const addTags = (value) => {
            if (Array.isArray(value)) {
                for (const entry of value) {
                    if (typeof entry === "string" && entry.trim()) {
                        collected.add(entry.trim());
                    }
                }
                return;
            }
            if (typeof value === "string" && value.trim()) {
                collected.add(value.trim());
            }
        };
        addTags(frontmatter?.tags);
        addTags(metadata?.tags);
        return Array.from(collected);
    }
    collectAliases(frontmatter, metadata, fallbackName, subcategory, filePath) {
        const collected = new Set();
        const addAlias = (value) => {
            if (Array.isArray(value)) {
                for (const entry of value) {
                    addAlias(entry);
                }
                return;
            }
            if (typeof value === "string" && value.trim()) {
                collected.add(value.trim());
            }
        };
        addAlias(frontmatter?.alias);
        addAlias(frontmatter?.aliases);
        addAlias(metadata?.alias);
        addAlias(metadata?.aliases);
        addAlias(metadata?.original_command);
        addAlias(fallbackName);
        for (const segment of subcategory.split("/").filter(Boolean)) {
            addAlias(segment);
        }
        const relativePath = path_1.default.relative(SKILLS_DIR, filePath);
        for (const segment of relativePath.split(path_1.default.sep)) {
            const cleaned = segment.replace(/\.md$/i, "").trim();
            if (cleaned && cleaned !== "SKILL") {
                addAlias(cleaned);
            }
        }
        return Array.from(collected);
    }
    collectResolutionHints(frontmatter, rawContent, metadata) {
        const hints = new Set();
        const description = String(frontmatter?.description || "");
        const body = rawContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
        const candidates = [
            description,
            String(frontmatter?.summary || ""),
            String(metadata?.summary || ""),
            body.slice(0, 2500)
        ].filter(Boolean);
        const extractMatches = (text, regex) => {
            const matches = text.matchAll(regex);
            for (const match of matches) {
                const value = match[1]?.trim();
                if (value) {
                    hints.add(value.replace(/\s+/g, " "));
                }
            }
        };
        for (const candidate of candidates) {
            extractMatches(candidate, /Use when\s+([^.\n]+)/gi);
            extractMatches(candidate, /This skill should be used when\s+([^.\n]+)/gi);
            extractMatches(candidate, /Perfect for\s+([^.\n]+)/gi);
            extractMatches(candidate, /Triggers:\s*([^.\n]+)/gi);
            extractMatches(candidate, /Use this skill when\s+([^.\n]+)/gi);
        }
        return Array.from(hints);
    }
    buildMetadataText(metadata, tags) {
        const fragments = [];
        const visit = (value, keyPath = "") => {
            if (Array.isArray(value)) {
                for (const entry of value) {
                    visit(entry, keyPath);
                }
                return;
            }
            if (value && typeof value === "object") {
                for (const [key, nestedValue] of Object.entries(value)) {
                    const nextKeyPath = keyPath ? `${keyPath}.${key}` : key;
                    fragments.push(nextKeyPath);
                    visit(nestedValue, nextKeyPath);
                }
                return;
            }
            if (value !== null && value !== undefined) {
                if (keyPath) {
                    fragments.push(`${keyPath} ${String(value)}`);
                }
                fragments.push(String(value));
            }
        };
        visit(metadata);
        for (const tag of tags) {
            fragments.push(tag);
        }
        return fragments.join(" ");
    }
    buildSearchableText(name, description, category, subcategory, declaredCategory, tags, aliases, resolutionHints, metadataText, filePath) {
        return [
            name,
            description,
            category,
            subcategory,
            declaredCategory,
            metadataText,
            ...tags,
            ...aliases,
            ...resolutionHints,
            path_1.default.relative(SKILLS_DIR, filePath)
        ].filter(Boolean).join(" ");
    }
    tokenizeSearchQuery(query) {
        return query
            .toLowerCase()
            .split(/[^a-z0-9]+/i)
            .map((token) => token.trim())
            .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token));
    }
    buildFallbackSearchVariants(query) {
        const normalizedQuery = query.trim().toLowerCase();
        const tokens = this.tokenizeSearchQuery(query);
        const variants = new Set();
        if (tokens.length > 0) {
            variants.add(tokens.join(" "));
        }
        for (const token of tokens) {
            variants.add(token);
        }
        for (let index = 0; index < tokens.length - 1; index += 1) {
            variants.add(tokens.slice(index, index + 2).join(" "));
        }
        return Array.from(variants);
    }
    resolveSearchReasons(skill, tokens) {
        const reasons = new Set();
        const fields = [
            { label: "name", values: [skill.name] },
            { label: "aliases", values: skill.aliases },
            { label: "tags", values: skill.tags },
            { label: "hints", values: skill.resolutionHints },
            { label: "category", values: [skill.category, skill.declaredCategory, skill.subcategory] }
        ];
        for (const token of tokens) {
            for (const field of fields) {
                const matched = field.values.find((value) => value && value.toLowerCase().includes(token));
                if (matched) {
                    reasons.add(`${field.label}: ${matched}`);
                }
            }
        }
        if (reasons.size === 0 && skill.description) {
            reasons.add(`description: ${skill.description}`);
        }
        return Array.from(reasons).slice(0, 3);
    }
    searchSkills(query, limit) {
        if (!this.fuseIndex) {
            return [];
        }
        const normalizedQuery = query.trim().toLowerCase();
        const tokens = this.tokenizeSearchQuery(query);
        const candidateMap = new Map();
        const upsertCandidate = (skill, baseScore) => {
            const key = `${skill.category}/${skill.name}`.toLowerCase();
            const existing = candidateMap.get(key);
            const reasons = this.resolveSearchReasons(skill, tokens);
            if (!existing || baseScore < existing.score) {
                candidateMap.set(key, { skill, score: baseScore, reasons });
            }
        };
        const searchVariants = new Set();
        if (normalizedQuery) {
            searchVariants.add(normalizedQuery);
        }
        for (const variant of searchVariants) {
            for (const result of this.fuseIndex.search(variant, { limit: Math.max(limit * 4, 12) })) {
                upsertCandidate(result.item, typeof result.score === "number" ? result.score : 1);
            }
        }
        const shouldExpand = candidateMap.size === 0 ||
            (tokens.length > 1 && Array.from(candidateMap.values()).every((match) => this.resolveSearchReasons(match.skill, tokens).length === 0));
        if (shouldExpand) {
            for (const variant of this.buildFallbackSearchVariants(query)) {
                if (!variant || searchVariants.has(variant)) {
                    continue;
                }
                for (const result of this.fuseIndex.search(variant, { limit: Math.max(limit * 2, 8) })) {
                    upsertCandidate(result.item, typeof result.score === "number" ? result.score : 1);
                }
            }
        }
        else if (tokens.length > 1) {
            const tokenVariant = tokens.join(" ");
            if (tokenVariant && !searchVariants.has(tokenVariant)) {
                for (const result of this.fuseIndex.search(tokenVariant, { limit: Math.max(limit * 2, 8) })) {
                    upsertCandidate(result.item, typeof result.score === "number" ? result.score : 1);
                }
            }
        }
        const scoredMatches = Array.from(candidateMap.values()).map((match) => {
            const searchableText = match.skill.searchableText.toLowerCase();
            const matchedTokens = tokens.filter((token) => searchableText.includes(token));
            const overlapRatio = tokens.length > 0 ? matchedTokens.length / tokens.length : 0;
            const exactAliasMatch = match.skill.aliases.some((alias) => alias.toLowerCase() === query.trim().toLowerCase());
            const rootSkillBoost = match.skill.pathDepth === 0 ? 0.08 : 0;
            const referencePenalty = match.skill.subcategory.toLowerCase().includes("reference") ? 0.12 : 0;
            const overlapBoost = overlapRatio * 0.22;
            const aliasBoost = exactAliasMatch ? 0.18 : 0;
            return {
                ...match,
                score: match.score - overlapBoost - aliasBoost - rootSkillBoost + referencePenalty
            };
        });
        return scoredMatches
            .sort((left, right) => left.score - right.score)
            .slice(0, limit);
    }
    extractCodeBlocks(skillName) {
        const skill = this.findSkillByName(skillName);
        if (!skill)
            throw new Error("Skill not found: " + skillName);
        const blocks = [];
        const regex = /```(\w*)\n([\s\S]*?)```/g;
        let match;
        let index = 0;
        while ((match = regex.exec(skill.content)) !== null) {
            blocks.push({
                language: match[1] || "text",
                code: match[2].trim(),
                index: index++
            });
        }
        return blocks;
    }
    async executeCodeBlock(skillName, stepIndex, userEnv) {
        const blocks = this.extractCodeBlocks(skillName);
        if (stepIndex < 0 || stepIndex >= blocks.length) {
            throw new Error(`Step ${stepIndex} out of range (0-${blocks.length - 1})`);
        }
        const block = blocks[stepIndex];
        // Determine executor based on language
        const executors = {
            "bash": { command: "bash", args: ["-e"], ext: ".sh" },
            "sh": { command: "sh", args: ["-e"], ext: ".sh" },
            "javascript": { command: "node", args: [], ext: ".js" },
            "js": { command: "node", args: [], ext: ".js" },
            "python": { command: "python3", args: [], ext: ".py" },
            "py": { command: "python3", args: [], ext: ".py" },
            "typescript": { command: "npx", args: ["tsx"], ext: ".ts" },
            "ts": { command: "npx", args: ["tsx"], ext: ".ts" },
        };
        const executor = executors[block.language.toLowerCase()];
        if (!executor) {
            throw new Error("Unsupported language for execution: " + block.language);
        }
        // Write to temp file
        const tmpDir = os_1.default.tmpdir();
        const tmpFile = path_1.default.join(tmpDir, `evokore-sandbox-${Date.now()}${executor.ext}`);
        fs_1.default.writeFileSync(tmpFile, block.code);
        try {
            const env = {
                ...process.env,
                ...userEnv,
                EVOKORE_SANDBOX: "true" // Signal to code it's running in sandbox
            };
            const result = (0, child_process_1.execFileSync)(executor.command, [...executor.args, tmpFile], {
                encoding: "utf8",
                timeout: 30000, // 30s timeout
                maxBuffer: 1024 * 1024, // 1MB output limit
                env,
                stdio: ["pipe", "pipe", "pipe"]
            });
            return { stdout: result, stderr: "", exitCode: 0, timedOut: false };
        }
        catch (err) {
            if (err.killed) {
                return { stdout: err.stdout || "", stderr: err.stderr || "", exitCode: -1, timedOut: true };
            }
            return {
                stdout: err.stdout || "",
                stderr: err.stderr || err.message || "",
                exitCode: err.status || 1,
                timedOut: false
            };
        }
        finally {
            try {
                fs_1.default.unlinkSync(tmpFile);
            }
            catch { }
        }
    }
    getTools() {
        return [
            {
                name: "docs_architect",
                title: "Documentation Architect",
                description: "Execute a Gold Standard documentation overhaul by actively reading the project files and returning a comprehensive generation prompt.",
                inputSchema: {
                    type: "object",
                    properties: {
                        target_dir: { type: "string", description: "The root directory of the project to document" }
                    },
                    required: ["target_dir"]
                },
                annotations: {
                    title: "Documentation Architect",
                    readOnlyHint: false,
                    destructiveHint: false,
                    idempotentHint: false,
                    openWorldHint: false
                }
            },
            {
                name: "skill_creator",
                title: "Skill Creator",
                description: "Guide for creating effective skills. Actively generates the skill scaffolding, directories, and basic SKILL.md template.",
                inputSchema: {
                    type: "object",
                    properties: {
                        skill_name: { type: "string", description: "The name of the new skill" },
                        target_dir: { type: "string", description: "The target directory to create the skill in" },
                        description: { type: "string", description: "A brief description of what the skill does" }
                    },
                    required: ["skill_name", "target_dir", "description"]
                },
                annotations: {
                    title: "Skill Creator",
                    readOnlyHint: false,
                    destructiveHint: false,
                    idempotentHint: false,
                    openWorldHint: false
                }
            },
            {
                name: "resolve_workflow",
                title: "Resolve Workflow",
                description: "Describe the task or objective you are trying to accomplish. EVOKORE-MCP will dynamically run a semantic search and instantly inject the 1-3 most relevant Agent Skills, prompts, and architectural guidelines directly into this tool's response so you can read and adopt them.",
                inputSchema: {
                    type: "object",
                    properties: {
                        objective: { type: "string", description: "What are you trying to do?" }
                    },
                    required: ["objective"]
                },
                annotations: {
                    title: "Resolve Workflow",
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: false
                }
            },
            {
                name: "search_skills",
                title: "Search Skills",
                description: "Search the EVOKORE-MCP library for available agent skills by keyword.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string" }
                    },
                    required: ["query"]
                },
                annotations: {
                    title: "Search Skills",
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: false
                }
            },
            {
                name: "get_skill_help",
                title: "Get Skill Help",
                description: "Retrieve comprehensive documentation, internal instructions, and intended use-cases for a specific skill.",
                inputSchema: {
                    type: "object",
                    properties: {
                        skill_name: { type: "string" }
                    },
                    required: ["skill_name"]
                },
                annotations: {
                    title: "Get Skill Help",
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: false
                }
            },
            {
                name: "discover_tools",
                title: "Discover Tools",
                description: "Search the merged EVOKORE tool catalog. In dynamic discovery mode, matching proxied tools are activated for the current session.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "Describe the tools you need or provide an exact tool name." },
                        limit: { type: "integer", description: "Optional maximum number of matches to return (default: 8)." }
                    },
                    required: ["query"]
                },
                annotations: {
                    title: "Discover Tools",
                    readOnlyHint: false,
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: false
                }
            },
            {
                name: "proxy_server_status",
                title: "Proxy Server Status",
                description: "Inspect the aggregated child-server registry, including server status, tool counts, and recent health metadata.",
                inputSchema: {
                    type: "object",
                    properties: {
                        server_id: { type: "string", description: "Optional specific child server id to inspect." }
                    }
                },
                annotations: {
                    title: "Proxy Server Status",
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: false
                }
            },
            {
                name: "refresh_skills",
                title: "Refresh Skills Index",
                description: "Refresh the skill index by rescanning the SKILLS/ directory. Use this after adding, removing, or modifying skill files during a live session.",
                inputSchema: {
                    type: "object",
                    properties: {},
                    required: []
                },
                annotations: {
                    title: "Refresh Skills Index",
                    readOnlyHint: false,
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: false
                }
            },
            {
                name: "fetch_skill",
                title: "Fetch Remote Skill",
                description: "Fetch a skill from a remote URL (GitHub raw content, HTTP endpoint) and install it locally in the SKILLS directory.",
                inputSchema: {
                    type: "object",
                    properties: {
                        url: { type: "string", description: "URL to fetch the skill from (must be a raw markdown file)" },
                        category: { type: "string", description: "Category directory to install into (e.g., 'Remote Skills')" },
                        name: { type: "string", description: "Optional name override for the skill file" },
                        overwrite: { type: "boolean", description: "Allow overwriting an existing skill (default: false)" }
                    },
                    required: ["url"]
                },
                annotations: {
                    title: "Fetch Remote Skill",
                    readOnlyHint: false,
                    destructiveHint: false,
                    idempotentHint: false,
                    openWorldHint: true
                }
            },
            {
                name: "list_registry",
                title: "List Registry Skills",
                description: "List available skills from configured remote skill registries. Registries are defined in mcp.config.json under skillRegistries.",
                inputSchema: {
                    type: "object",
                    properties: {
                        registry: { type: "string", description: "Optional registry name to query. If omitted, queries all configured registries." }
                    }
                },
                annotations: {
                    title: "List Registry Skills",
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: true
                }
            },
            {
                name: "execute_skill",
                title: "Execute Skill Steps",
                description: "Execute code blocks from a skill file in a sandboxed subprocess with output capture, timeout, and resource limits.",
                inputSchema: {
                    type: "object",
                    properties: {
                        skill_name: { type: "string", description: "Name of the skill to execute" },
                        step: { type: "number", description: "Index of the code block to execute (0-based). Omit to list available blocks." },
                        env: { type: "object", description: "Optional environment variables to pass to the subprocess" }
                    },
                    required: ["skill_name"]
                },
                annotations: {
                    title: "Execute Skill Steps",
                    readOnlyHint: false,
                    destructiveHint: true,
                    idempotentHint: false,
                    openWorldHint: true
                }
            }
        ];
    }
    async handleToolCall(name, args) {
        if (name === "docs_architect") {
            const targetDir = args.target_dir;
            let projectContext = "";
            try {
                const pkgPath = path_1.default.join(targetDir, "package.json");
                const result = await this.proxyManager.callProxiedTool("fs_read_file", { path: pkgPath });
                projectContext = result.content[0].text;
            }
            catch (e) {
                projectContext = "No package.json found or could not be read.";
            }
            return {
                content: [{
                        type: "text",
                        text: "You are the Documentation Architect. I have harnessed the filesystem tool to read the project context.\nProject context (package.json):\n" + projectContext + "\n\nPlease use this to generate a Gold Standard README.md and /docs directory for " + targetDir + "."
                    }]
            };
        }
        if (name === "skill_creator") {
            const skillName = args.skill_name;
            const targetDir = args.target_dir;
            const description = args.description;
            const skillPath = path_1.default.join(targetDir, skillName);
            const skillMdPath = path_1.default.join(skillPath, "SKILL.md");
            const skillTemplate = "---\nname: " + skillName + "\ndescription: " + description + "\n---\n\n# " + skillName + "\n\nThis skill provides guidance for " + description + ".\n\n## Usage\n\n(Add instructions here)\n";
            try {
                await this.proxyManager.callProxiedTool("fs_write_file", { path: skillMdPath, content: skillTemplate });
                return {
                    content: [{
                            type: "text",
                            text: "Successfully actively harnessed child servers to initialize skill scaffolding at " + skillMdPath + ". Please review and update it further."
                        }]
                };
            }
            catch (error) {
                return {
                    content: [{ type: "text", text: "Failed to harness child server to create skill: " + error.message }],
                    isError: true
                };
            }
        }
        if (name === "resolve_workflow") {
            if (!this.fuseIndex)
                await this.loadSkills();
            const objective = (args.objective || "");
            const results = this.searchSkills(objective, 3);
            if (results.length === 0) {
                return { content: [{ type: "text", text: "No specific workflows found for '" + objective + "'. Proceed using your general knowledge." }] };
            }
            const injectedWorkflows = results.map(r => {
                const subcatLabel = r.skill.subcategory ? " > " + r.skill.subcategory : "";
                const whyMatched = r.reasons.length > 0
                    ? "Why matched: " + r.reasons.join("; ")
                    : "Why matched: description/content similarity";
                return "--- WORKFLOW: " + r.skill.name + " [" + r.skill.category + subcatLabel + "] ---\nDescription: " + r.skill.description + "\n" + whyMatched + "\n\n<activated_skill name=\"" + r.skill.name + "\" category=\"" + r.skill.category + "\">\n" + r.skill.content + "\n</activated_skill>\n";
            }).join("\n\n");
            // Append dependency warnings if any matched skill has unmet deps or conflicts
            const depWarnings = results.map(r => {
                const validation = this.validateDependencies(r.skill.name);
                return validation.valid ? null : "[" + r.skill.name + "]: " + validation.errors.join(", ");
            }).filter(Boolean);
            let resultText = "EVOKORE-MCP injected highly relevant workflows. Please adopt these instructions:\n\n" + injectedWorkflows;
            if (depWarnings.length > 0) {
                resultText += "\n\nDependency warnings:\n" + depWarnings.join("\n");
            }
            return { content: [{ type: "text", text: resultText }] };
        }
        if (name === "search_skills") {
            if (!this.fuseIndex)
                await this.loadSkills();
            const query = (args.query || "").toLowerCase();
            const searchStart = Date.now();
            const results = this.searchSkills(query, 15);
            this._lastSearchMs = Date.now() - searchStart;
            if (this._lastSearchMs > 250) {
                console.error(`[EVOKORE] Slow skill search: "${query}" took ${this._lastSearchMs}ms`);
            }
            return {
                content: [{
                        type: "text",
                        text: results.length > 0
                            ? results.map(r => {
                                const subcatLabel = r.skill.subcategory ? " > " + r.skill.subcategory : "";
                                const reasonSuffix = r.reasons.length > 0 ? " | matched on " + r.reasons.join(", ") : "";
                                return "- **" + r.skill.name + "** [" + r.skill.category + subcatLabel + "]: " + r.skill.description + reasonSuffix;
                            }).join("\n")
                            : "No skills found matching that query."
                    }]
            };
        }
        if (name === "get_skill_help") {
            if (!this.fuseIndex)
                await this.loadSkills();
            const skillName = (args.skill_name || "").toLowerCase();
            // Try composite key first, then scan cache values for bare name match
            let skill = this.skillsCache.get(skillName);
            if (!skill) {
                for (const s of this.skillsCache.values()) {
                    if (s.name.toLowerCase() === skillName) {
                        skill = s;
                        break;
                    }
                }
            }
            if (!skill && this.fuseIndex) {
                const matches = this.fuseIndex.search(skillName, { limit: 1 });
                if (matches.length > 0)
                    skill = matches[0].item;
            }
            if (!skill) {
                return { content: [{ type: "text", text: "Could not find a skill named '" + skillName + "'." }] };
            }
            const subcatLine = skill.subcategory ? "\n**Subcategory:** " + skill.subcategory : "";
            const versionLine = skill.version ? "\n**Version:** " + skill.version : "";
            const requiresLine = skill.requires && skill.requires.length > 0
                ? "\n**Requires:** " + skill.requires.map(r => r.name + (r.minVersion ? " >= " + r.minVersion : "")).join(", ")
                : "";
            const conflictsLine = skill.conflicts && skill.conflicts.length > 0
                ? "\n**Conflicts:** " + skill.conflicts.join(", ")
                : "";
            let helpText = "### Skill Overview: " + skill.name + "\n**Category:** " + skill.category + subcatLine + versionLine + "\n**Description:** " + skill.description + requiresLine + conflictsLine + "\n\n---\n\n### Internal Instructions:\n" + skill.content;
            // Append dependency validation if the skill declares deps
            if (skill.requires?.length || skill.conflicts?.length) {
                const validation = this.validateDependencies(skill.name);
                if (!validation.valid) {
                    helpText += "\n\n---\n\n### Dependency Warnings:\n" + validation.errors.map(e => "- " + e).join("\n");
                }
            }
            return { content: [{ type: "text", text: helpText }] };
        }
        if (name === "proxy_server_status") {
            const requestedServerId = typeof args.server_id === "string" ? args.server_id.trim() : "";
            const states = this.proxyManager.getServerStatusSnapshot(requestedServerId || undefined);
            if (states.length === 0) {
                return {
                    content: [{
                            type: "text",
                            text: requestedServerId
                                ? "No proxied child server found for '" + requestedServerId + "'."
                                : "No proxied child servers are currently registered."
                        }],
                    isError: Boolean(requestedServerId)
                };
            }
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            totalServers: states.length,
                            servers: states
                        }, null, 2)
                    }]
            };
        }
        if (name === "fetch_skill") {
            const url = typeof args.url === "string" ? args.url.trim() : "";
            if (!url) {
                return {
                    content: [{ type: "text", text: "The 'url' argument is required." }],
                    isError: true
                };
            }
            const category = typeof args.category === "string" ? args.category.trim() : undefined;
            const nameOverride = typeof args.name === "string" ? args.name.trim() : undefined;
            const overwrite = args.overwrite === true;
            try {
                const result = await this.fetchRemoteSkill(url, category, nameOverride, overwrite);
                return {
                    content: [{
                            type: "text",
                            text: 'Skill "' + result.name + '" ' + (result.isNew ? "installed" : "updated") + " at " + result.path + ". Use refresh_skills to update the index."
                        }]
                };
            }
            catch (error) {
                return {
                    content: [{ type: "text", text: "Failed to fetch skill: " + error.message }],
                    isError: true
                };
            }
        }
        if (name === "list_registry") {
            const registryName = typeof args.registry === "string" ? args.registry.trim() : undefined;
            try {
                const entries = await this.listRegistrySkills(registryName);
                if (entries.length === 0) {
                    return {
                        content: [{
                                type: "text",
                                text: registryName
                                    ? "No skills found in registry '" + registryName + "', or registry is not configured."
                                    : "No skill registries are configured in mcp.config.json, or no skills were found."
                            }]
                    };
                }
                const lines = entries.map(e => {
                    const verSuffix = e.version ? " (v" + e.version + ")" : "";
                    const catSuffix = e.category ? " [" + e.category + "]" : "";
                    return "- **" + e.name + "**" + verSuffix + catSuffix + ": " + e.description + "\n  URL: " + e.url;
                });
                return {
                    content: [{
                            type: "text",
                            text: "Available skills from registries (" + entries.length + " total):\n\n" + lines.join("\n")
                        }]
                };
            }
            catch (error) {
                return {
                    content: [{ type: "text", text: "Failed to list registry skills: " + error.message }],
                    isError: true
                };
            }
        }
        if (name === "execute_skill") {
            const skillName = typeof args.skill_name === "string" ? args.skill_name.trim() : "";
            if (!skillName) {
                return {
                    content: [{ type: "text", text: "The 'skill_name' argument is required." }],
                    isError: true
                };
            }
            // If no step specified, list available code blocks
            if (args.step === undefined || args.step === null) {
                try {
                    if (!this.fuseIndex)
                        await this.loadSkills();
                    const blocks = this.extractCodeBlocks(skillName);
                    if (blocks.length === 0) {
                        return {
                            content: [{
                                    type: "text",
                                    text: "Skill '" + skillName + "' has no executable code blocks."
                                }]
                        };
                    }
                    const listing = blocks.map(b => "  [" + b.index + "] " + b.language + " (" + b.code.split("\n").length + " lines): " + b.code.split("\n")[0].slice(0, 80)).join("\n");
                    return {
                        content: [{
                                type: "text",
                                text: "Skill '" + skillName + "' has " + blocks.length + " code block(s):\n" + listing + "\n\nUse the 'step' parameter to execute a specific block."
                            }]
                    };
                }
                catch (error) {
                    return {
                        content: [{ type: "text", text: "Failed to extract code blocks: " + error.message }],
                        isError: true
                    };
                }
            }
            // Execute the specified step
            const stepIndex = typeof args.step === "number" ? args.step : parseInt(String(args.step), 10);
            if (isNaN(stepIndex)) {
                return {
                    content: [{ type: "text", text: "The 'step' parameter must be a number." }],
                    isError: true
                };
            }
            const userEnv = (args.env && typeof args.env === "object") ? args.env : undefined;
            try {
                if (!this.fuseIndex)
                    await this.loadSkills();
                const result = await this.executeCodeBlock(skillName, stepIndex, userEnv);
                const parts = [];
                if (result.timedOut) {
                    parts.push("[TIMED OUT after 30s]");
                }
                parts.push("Exit code: " + result.exitCode);
                if (result.stdout) {
                    parts.push("--- stdout ---\n" + result.stdout);
                }
                if (result.stderr) {
                    parts.push("--- stderr ---\n" + result.stderr);
                }
                return {
                    content: [{ type: "text", text: parts.join("\n") }],
                    isError: result.exitCode !== 0
                };
            }
            catch (error) {
                return {
                    content: [{ type: "text", text: "Execution failed: " + error.message }],
                    isError: true
                };
            }
        }
        throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, "Unknown tool: " + name);
    }
    async fetchRemoteSkill(url, category, nameOverride, overwrite = false) {
        // Validate URL
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        }
        catch {
            throw new Error("Invalid URL: " + url);
        }
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            throw new Error("Only HTTP/HTTPS URLs are supported, got: " + parsedUrl.protocol);
        }
        // Fetch content
        const content = await this.httpGet(url);
        // Validate it looks like a skill (must have frontmatter)
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
        if (!fmMatch) {
            throw new Error("Invalid skill format: fetched content does not contain valid YAML frontmatter.");
        }
        let frontmatter;
        try {
            frontmatter = yaml_1.default.parse(fmMatch[1]);
        }
        catch {
            throw new Error("Invalid skill format: frontmatter YAML could not be parsed.");
        }
        const skillName = nameOverride || frontmatter?.name || path_1.default.basename(parsedUrl.pathname, ".md");
        const targetCategory = category || frontmatter?.category || "Remote Skills";
        // Sanitize directory/file names to prevent path traversal
        const sanitized = (input) => input.replace(/[<>:"|?*\x00-\x1f]/g, "_").replace(/\.\./g, "_");
        const safeCategory = sanitized(targetCategory);
        const safeName = sanitized(skillName);
        const categoryDir = path_1.default.join(SKILLS_DIR, safeCategory);
        const skillDir = path_1.default.join(categoryDir, safeName);
        // Validate the resulting path is still within SKILLS_DIR
        const resolvedSkillDir = path_1.default.resolve(skillDir);
        if (!resolvedSkillDir.startsWith(path_1.default.resolve(SKILLS_DIR))) {
            throw new Error("Path traversal detected: resolved path escapes SKILLS directory.");
        }
        const targetPath = path_1.default.join(skillDir, "SKILL.md");
        const isNew = !fs_1.default.existsSync(targetPath);
        if (!isNew && !overwrite) {
            throw new Error('Skill "' + safeName + '" already exists at ' + targetPath + '. Pass overwrite: true to replace it.');
        }
        if (!fs_1.default.existsSync(skillDir)) {
            fs_1.default.mkdirSync(skillDir, { recursive: true });
        }
        fs_1.default.writeFileSync(targetPath, content, "utf-8");
        console.error("[EVOKORE] Fetched remote skill '" + safeName + "' -> " + targetPath);
        return { name: safeName, path: targetPath, isNew };
    }
    async listRegistrySkills(registryName) {
        const registries = this.loadRegistriesFromConfig();
        if (registries.length === 0)
            return [];
        const targets = registryName
            ? registries.filter(r => r.name.toLowerCase() === registryName.toLowerCase())
            : registries;
        const allEntries = [];
        for (const registry of targets) {
            try {
                const indexUrl = registry.baseUrl.replace(/\/$/, "") + "/" + registry.index;
                const raw = await this.httpGet(indexUrl);
                const parsed = JSON.parse(raw);
                const skills = Array.isArray(parsed) ? parsed : (parsed?.skills || []);
                for (const entry of skills) {
                    if (!entry.name || !entry.url)
                        continue;
                    allEntries.push({
                        name: String(entry.name),
                        description: String(entry.description || "No description"),
                        url: String(entry.url).startsWith("http")
                            ? String(entry.url)
                            : registry.baseUrl.replace(/\/$/, "") + "/" + String(entry.url),
                        category: entry.category ? String(entry.category) : undefined,
                        version: entry.version ? String(entry.version) : undefined
                    });
                }
            }
            catch (err) {
                console.error("[EVOKORE] Failed to fetch registry '" + registry.name + "': " + err.message);
            }
        }
        return allEntries;
    }
    loadRegistriesFromConfig() {
        try {
            const raw = fs_1.default.readFileSync(CONFIG_PATH, "utf-8");
            const config = JSON.parse(raw);
            const registries = config?.skillRegistries;
            if (!Array.isArray(registries))
                return [];
            return registries
                .filter((r) => r && typeof r.name === "string" && typeof r.baseUrl === "string" && typeof r.index === "string")
                .map((r) => ({
                name: String(r.name),
                baseUrl: String(r.baseUrl),
                index: String(r.index)
            }));
        }
        catch {
            return [];
        }
    }
    httpGet(url, redirectDepth = 0) {
        if (redirectDepth > MAX_REDIRECT_DEPTH) {
            return Promise.reject(new Error("Too many redirects (max " + MAX_REDIRECT_DEPTH + ")"));
        }
        return new Promise((resolve, reject) => {
            const mod = url.startsWith("https") ? https_1.default : http_1.default;
            const req = mod.get(url, { headers: { "User-Agent": "EVOKORE-MCP" } }, (res) => {
                // Follow redirects
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    this.httpGet(res.headers.location, redirectDepth + 1).then(resolve).catch(reject);
                    return;
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    reject(new Error("HTTP " + res.statusCode + " from " + url));
                    return;
                }
                let data = "";
                let byteCount = 0;
                res.on("data", (chunk) => {
                    byteCount += chunk.length;
                    if (byteCount > MAX_FETCH_SIZE) {
                        res.destroy();
                        reject(new Error("Response too large (exceeds " + (MAX_FETCH_SIZE / 1024 / 1024) + "MB limit)"));
                        return;
                    }
                    data += chunk.toString("utf-8");
                });
                res.on("end", () => resolve(data));
                res.on("error", reject);
            });
            req.on("error", reject);
            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error("Request timed out after 30s"));
            });
        });
    }
    getSkillCount() {
        return this.skillsCache.size;
    }
    getCategorySummary() {
        const summary = {};
        for (const skill of this.skillsCache.values()) {
            summary[skill.category] = (summary[skill.category] || 0) + 1;
        }
        return summary;
    }
    findSkillByName(name) {
        const normalizedName = name.toLowerCase();
        // Try composite key first
        const byKey = this.skillsCache.get(normalizedName);
        if (byKey)
            return byKey;
        // Scan for bare name match
        for (const skill of this.skillsCache.values()) {
            if (skill.name.toLowerCase() === normalizedName) {
                return skill;
            }
        }
        // Fuzzy fallback via fuse
        if (this.fuseIndex) {
            const matches = this.fuseIndex.search(normalizedName, { limit: 1 });
            if (matches.length > 0)
                return matches[0].item;
        }
        return null;
    }
    validateDependencies(skillName) {
        const skill = this.findSkillByName(skillName);
        if (!skill)
            return { valid: false, errors: ["Skill not found: " + skillName] };
        const errors = [];
        // Check requires
        if (skill.requires) {
            for (const dep of skill.requires) {
                const depSkill = this.findSkillByName(dep.name);
                if (!depSkill) {
                    errors.push("Missing required skill: " + dep.name);
                }
                else if (dep.minVersion && depSkill.version) {
                    if (!this.semverSatisfies(depSkill.version, dep.minVersion)) {
                        errors.push(dep.name + " version " + depSkill.version + " < required " + dep.minVersion);
                    }
                }
            }
        }
        // Check conflicts
        if (skill.conflicts) {
            for (const conflictName of skill.conflicts) {
                if (this.findSkillByName(conflictName)) {
                    errors.push("Conflicts with installed skill: " + conflictName);
                }
            }
        }
        return { valid: errors.length === 0, errors };
    }
    semverSatisfies(actual, minimum) {
        const parse = (v) => v.split(".").map(Number);
        const a = parse(actual);
        const m = parse(minimum);
        for (let i = 0; i < 3; i++) {
            if ((a[i] || 0) > (m[i] || 0))
                return true;
            if ((a[i] || 0) < (m[i] || 0))
                return false;
        }
        return true; // equal
    }
    resolveWorkflowText(objective) {
        if (!this.fuseIndex)
            return "Skills not loaded. Call loadSkills() first.";
        const results = this.searchSkills(objective, 3);
        if (results.length === 0) {
            return "No specific workflows found for '" + objective + "'. Proceed using your general knowledge.";
        }
        return results.map(r => {
            const subcatLabel = r.skill.subcategory ? " > " + r.skill.subcategory : "";
            const whyMatched = r.reasons.length > 0
                ? "Why matched: " + r.reasons.join("; ")
                : "Why matched: description/content similarity";
            return "--- WORKFLOW: " + r.skill.name + " [" + r.skill.category + subcatLabel + "] ---\nDescription: " + r.skill.description + "\n" + whyMatched + "\n\n" + r.skill.content.slice(0, 2000);
        }).join("\n\n");
    }
    getSkillHelpText(name) {
        const skill = this.findSkillByName(name);
        if (!skill) {
            return "Could not find a skill named '" + name + "'.";
        }
        const subcatLine = skill.subcategory ? "\nSubcategory: " + skill.subcategory : "";
        const versionLine = skill.version ? "\nVersion: " + skill.version : "";
        const requiresLine = skill.requires && skill.requires.length > 0
            ? "\nRequires: " + skill.requires.map(r => r.name + (r.minVersion ? " >= " + r.minVersion : "")).join(", ")
            : "";
        const conflictsLine = skill.conflicts && skill.conflicts.length > 0
            ? "\nConflicts: " + skill.conflicts.join(", ")
            : "";
        return "Skill: " + skill.name + "\nCategory: " + skill.category + subcatLine + versionLine + "\nDescription: " + skill.description + requiresLine + conflictsLine + "\n\n" + skill.content;
    }
    getResources() {
        return Array.from(this.skillsCache.values()).map(skill => {
            const subcatSegment = skill.subcategory
                ? "/" + skill.subcategory.replace(/[^a-zA-Z0-9-/]/g, '-')
                : "";
            return {
                uri: "skill://" + skill.category.replace(/[^a-zA-Z0-9-]/g, '-') + subcatSegment + "/" + skill.name.replace(/[^a-zA-Z0-9-]/g, '-'),
                name: "Skill: " + skill.name,
                mimeType: "text/markdown",
                description: skill.description
            };
        });
    }
    readResource(uriStr) {
        const url = new URL(uriStr);
        const skillName = url.pathname.replace(/^\//, '').toLowerCase();
        const skill = Array.from(this.skillsCache.values()).find(s => s.name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase() === skillName || s.name.toLowerCase() === skillName);
        if (!skill)
            throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, "Skill not found: " + skillName);
        return {
            contents: [{
                    uri: uriStr,
                    mimeType: "text/markdown",
                    text: skill.content
                }]
        };
    }
}
exports.SkillManager = SkillManager;
