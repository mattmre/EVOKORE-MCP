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
class SkillManager {
    skillsCache = new Map();
    fuseIndex = null;
    proxyManager;
    constructor(proxyManager) {
        this.proxyManager = proxyManager;
    }
    async loadSkills() {
        this.skillsCache.clear();
        try {
            const categories = await promises_1.default.readdir(SKILLS_DIR).catch(() => []);
            for (const category of categories) {
                const categoryPath = path_1.default.join(SKILLS_DIR, category);
                const stat = await promises_1.default.stat(categoryPath).catch(() => null);
                if (!stat || !stat.isDirectory())
                    continue;
                const skills = await promises_1.default.readdir(categoryPath).catch(() => []);
                for (const skillDir of skills) {
                    const itemPath = path_1.default.join(categoryPath, skillDir);
                    let skillPath = path_1.default.join(itemPath, "SKILL.md");
                    let fallbackName = skillDir;
                    const itemStat = await promises_1.default.stat(itemPath).catch(() => null);
                    if (!itemStat)
                        continue;
                    if (!itemStat.isDirectory()) {
                        if (skillDir.endsWith(".md")) {
                            skillPath = itemPath;
                            fallbackName = skillDir.replace(".md", "");
                        }
                        else {
                            continue;
                        }
                    }
                    try {
                        const content = await promises_1.default.readFile(skillPath, "utf-8");
                        const metadata = this.parseSkillMarkdown(content, category, skillPath, fallbackName);
                        if (metadata) {
                            this.skillsCache.set(metadata.name.toLowerCase(), metadata);
                        }
                    }
                    catch (error) {
                        // File might not exist
                    }
                }
            }
            this.fuseIndex = new fuse_js_1.default(Array.from(this.skillsCache.values()), {
                keys: ["name", "description", "category", "content"],
                threshold: 0.4,
                ignoreLocation: true
            });
            console.error(`[EVOKORE] Indexed ${this.skillsCache.size} skills for Dynamic Retrieval.`);
        }
        catch (e) {
            console.error("[EVOKORE] Error loading skills directory:", e);
        }
    }
    parseSkillMarkdown(content, category, filePath, fallbackName) {
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
        if (!match)
            return null;
        try {
            const frontmatter = yaml_1.default.parse(match[1]);
            return {
                name: frontmatter.name || fallbackName,
                description: frontmatter.description || "No description provided.",
                category,
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
                // Actively harness the proxied child server to fetch data first
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
                        text: `You are the Documentation Architect. I have harnessed the filesystem tool to read the project context.
Project context (package.json):
${projectContext}

Please use this to generate a Gold Standard README.md and /docs directory for ${targetDir}.`
                    }]
            };
        }
        if (name === "skill_creator") {
            const skillName = args.skill_name;
            const targetDir = args.target_dir;
            const description = args.description;
            const skillPath = path_1.default.join(targetDir, skillName);
            const skillMdPath = path_1.default.join(skillPath, "SKILL.md");
            const skillTemplate = `---
name: ${skillName}
description: ${description}
---

# ${skillName}

This skill provides guidance for ${description}.

## Usage

(Add instructions here)
`;
            try {
                // Actively harness the proxied child server to write files
                // For directories, we might not have a proxy tool, so we rely on write_file creating parents or just instruct the AI
                await this.proxyManager.callProxiedTool("fs_write_file", { path: skillMdPath, content: skillTemplate });
                return {
                    content: [{
                            type: "text",
                            text: `Successfully actively harnessed child servers to initialize skill scaffolding at ${skillMdPath}. Please review and update it further.`
                        }]
                };
            }
            catch (error) {
                return {
                    content: [{ type: "text", text: `Failed to harness child server to create skill: ${error.message}` }],
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
                return { content: [{ type: "text", text: `No specific workflows found for '${objective}'. Proceed using your general knowledge.` }] };
            }
            const injectedWorkflows = results.map(r => {
                return `--- WORKFLOW: ${r.item.name} [${r.item.category}] ---\nDescription: ${r.item.description}\n\n<activated_skill name="${r.item.name}">\n${r.item.content}\n</activated_skill>\n`;
            }).join("\n\n");
            return { content: [{ type: "text", text: `EVOKORE-MCP injected highly relevant workflows. Please adopt these instructions:\n\n${injectedWorkflows}` }] };
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
                            ? results.map(r => `- **${r.name}** [${r.category}]: ${r.description}`).join("\n")
                            : "No skills found matching that query."
                    }]
            };
        }
        if (name === "get_skill_help") {
            if (!this.fuseIndex)
                await this.loadSkills();
            const skillName = (args.skill_name || "").toLowerCase();
            let skill = this.skillsCache.get(skillName);
            if (!skill && this.fuseIndex) {
                const matches = this.fuseIndex.search(skillName, { limit: 1 });
                if (matches.length > 0)
                    skill = matches[0].item;
            }
            if (!skill) {
                return { content: [{ type: "text", text: `Could not find a skill named '${skillName}'.` }] };
            }
            const helpText = `### Skill Overview: ${skill.name}\n**Category:** ${skill.category}\n**Description:** ${skill.description}\n\n---\n\n### Internal Instructions:\n${skill.content}`;
            return { content: [{ type: "text", text: helpText }] };
        }
        throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    getResources() {
        return Array.from(this.skillsCache.values()).map(skill => ({
            uri: `skill://${skill.category.replace(/[^a-zA-Z0-9-]/g, '-')}/${skill.name.replace(/[^a-zA-Z0-9-]/g, '-')}`,
            name: `Skill: ${skill.name}`,
            mimeType: "text/markdown",
            description: skill.description
        }));
    }
    readResource(uriStr) {
        const url = new URL(uriStr);
        const skillName = url.pathname.replace(/^\//, '').toLowerCase();
        const skill = Array.from(this.skillsCache.values()).find(s => s.name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase() === skillName || s.name.toLowerCase() === skillName);
        if (!skill)
            throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, `Skill not found: ${skillName}`);
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
