"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const yaml_1 = __importDefault(require("yaml"));
const fuse_js_1 = __importDefault(require("fuse.js"));
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const SKILLS_DIR = path_1.default.resolve(__dirname, "../SKILLS");
const SKIP_DIRS = new Set([
    "node_modules", ".git", "__pycache__", "__tests__",
    ".claude", "themes", "assets", "scripts"
]);
const MAX_DEPTH = 5;
class SkillManager {
    skillsCache = new Map();
    fuseIndex = null;
    proxyManager;
    _loadTimeMs = 0;
    _lastSearchMs = 0;
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
            const categories = await promises_1.default.readdir(SKILLS_DIR).catch(() => []);
            for (const category of categories) {
                const categoryPath = path_1.default.join(SKILLS_DIR, category);
                const stat = await promises_1.default.stat(categoryPath).catch(() => null);
                if (!stat || !stat.isDirectory())
                    continue;
                await this.walkDirectory(categoryPath, category, "", 0);
            }
            this.fuseIndex = new fuse_js_1.default(Array.from(this.skillsCache.values()), {
                keys: [
                    { name: "name", weight: 0.3 },
                    { name: "description", weight: 0.3 },
                    { name: "category", weight: 0.05 },
                    { name: "subcategory", weight: 0.05 },
                    { name: "content", weight: 0.3 }
                ],
                threshold: 0.4,
                ignoreLocation: true
            });
            this._loadTimeMs = Date.now() - loadStart;
            console.error("[EVOKORE] Indexed " + this.skillsCache.size + " skills (recursive, max depth " + MAX_DEPTH + ") in " + this._loadTimeMs + "ms.");
        }
        catch (e) {
            this._loadTimeMs = Date.now() - loadStart;
            console.error("[EVOKORE] Error loading skills directory:", e);
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
            return {
                name: frontmatter.name || fallbackName,
                description: frontmatter.description || "No description provided.",
                category,
                subcategory,
                filePath,
                content: match[2].trim()
            };
        }
        catch (e) {
            return null;
        }
    }
    getTools() {
        return [
            {
                name: "docs_architect",
                description: "Execute a Gold Standard documentation overhaul by actively reading the project files and returning a comprehensive generation prompt.",
                inputSchema: {
                    type: "object",
                    properties: {
                        target_dir: { type: "string", description: "The root directory of the project to document" }
                    },
                    required: ["target_dir"]
                }
            },
            {
                name: "skill_creator",
                description: "Guide for creating effective skills. Actively generates the skill scaffolding, directories, and basic SKILL.md template.",
                inputSchema: {
                    type: "object",
                    properties: {
                        skill_name: { type: "string", description: "The name of the new skill" },
                        target_dir: { type: "string", description: "The target directory to create the skill in" },
                        description: { type: "string", description: "A brief description of what the skill does" }
                    },
                    required: ["skill_name", "target_dir", "description"]
                }
            },
            {
                name: "resolve_workflow",
                description: "Describe the task or objective you are trying to accomplish. EVOKORE-MCP will dynamically run a semantic search and instantly inject the 1-3 most relevant Agent Skills, prompts, and architectural guidelines directly into this tool's response so you can read and adopt them.",
                inputSchema: {
                    type: "object",
                    properties: {
                        objective: { type: "string", description: "What are you trying to do?" }
                    },
                    required: ["objective"]
                }
            },
            {
                name: "search_skills",
                description: "Search the EVOKORE-MCP library for available agent skills by keyword.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string" }
                    },
                    required: ["query"]
                }
            },
            {
                name: "get_skill_help",
                description: "Retrieve comprehensive documentation, internal instructions, and intended use-cases for a specific skill.",
                inputSchema: {
                    type: "object",
                    properties: {
                        skill_name: { type: "string" }
                    },
                    required: ["skill_name"]
                }
            },
            {
                name: "discover_tools",
                description: "Search the merged EVOKORE tool catalog. In dynamic discovery mode, matching proxied tools are activated for the current session.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "Describe the tools you need or provide an exact tool name." },
                        limit: { type: "integer", description: "Optional maximum number of matches to return (default: 8)." }
                    },
                    required: ["query"]
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
            const results = this.fuseIndex.search(objective, { limit: 3 });
            if (results.length === 0) {
                return { content: [{ type: "text", text: "No specific workflows found for '" + objective + "'. Proceed using your general knowledge." }] };
            }
            const injectedWorkflows = results.map(r => {
                const subcatLabel = r.item.subcategory ? " > " + r.item.subcategory : "";
                return "--- WORKFLOW: " + r.item.name + " [" + r.item.category + subcatLabel + "] ---\nDescription: " + r.item.description + "\n\n<activated_skill name=\"" + r.item.name + "\">\n" + r.item.content + "\n</activated_skill>\n";
            }).join("\n\n");
            return { content: [{ type: "text", text: "EVOKORE-MCP injected highly relevant workflows. Please adopt these instructions:\n\n" + injectedWorkflows }] };
        }
        if (name === "search_skills") {
            if (!this.fuseIndex)
                await this.loadSkills();
            const query = (args.query || "").toLowerCase();
            const results = this.fuseIndex.search(query, { limit: 15 }).map(r => r.item);
            return {
                content: [{
                        type: "text",
                        text: results.length > 0
                            ? results.map(r => {
                                const subcatLabel = r.subcategory ? " > " + r.subcategory : "";
                                return "- **" + r.name + "** [" + r.category + subcatLabel + "]: " + r.description;
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
            const helpText = "### Skill Overview: " + skill.name + "\n**Category:** " + skill.category + subcatLine + "\n**Description:** " + skill.description + "\n\n---\n\n### Internal Instructions:\n" + skill.content;
            return { content: [{ type: "text", text: helpText }] };
        }
        throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, "Unknown tool: " + name);
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
