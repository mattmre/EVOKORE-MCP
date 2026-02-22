"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const yaml_1 = __importDefault(require("yaml"));
const SKILLS_DIR = path_1.default.resolve(__dirname, "../SKILLS");
class EvokoreMCPServer {
    server;
    skillsCache = new Map();
    constructor() {
        this.server = new index_js_1.Server({
            name: "evokore-mcp",
            version: "1.0.0",
        }, {
            capabilities: {
                prompts: {},
                resources: {},
                tools: {},
            },
        });
        this.setupHandlers();
        this.server.onerror = (error) => console.error("[MCP Error]", error);
    }
    async loadSkills() {
        this.skillsCache.clear();
        try {
            const categories = await promises_1.default.readdir(SKILLS_DIR);
            for (const category of categories) {
                const categoryPath = path_1.default.join(SKILLS_DIR, category);
                const stat = await promises_1.default.stat(categoryPath);
                if (!stat.isDirectory())
                    continue;
                const skills = await promises_1.default.readdir(categoryPath);
                for (const skillDir of skills) {
                    const itemPath = path_1.default.join(categoryPath, skillDir);
                    let skillPath = path_1.default.join(itemPath, "SKILL.md");
                    let fallbackName = skillDir;
                    const itemStat = await promises_1.default.stat(itemPath);
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
            console.error(`Loaded ${this.skillsCache.size} skills into EVOKORE-MCP.`);
        }
        catch (e) {
            console.error("Error loading skills directory:", e);
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
    setupHandlers() {
        this.server.setRequestHandler(types_js_1.ListResourcesRequestSchema, async () => {
            await this.loadSkills();
            return {
                resources: Array.from(this.skillsCache.values()).map(skill => ({
                    uri: `skill://${skill.category}/${skill.name}`,
                    name: `Skill: ${skill.name}`,
                    mimeType: "text/markdown",
                    description: skill.description
                }))
            };
        });
        this.server.setRequestHandler(types_js_1.ReadResourceRequestSchema, async (request) => {
            const url = new URL(request.params.uri);
            const skillName = url.pathname.replace(/^\//, '').toLowerCase();
            const skill = this.skillsCache.get(skillName);
            if (!skill)
                throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, `Skill not found: ${skillName}`);
            return {
                contents: [{
                        uri: request.params.uri,
                        mimeType: "text/markdown",
                        text: skill.content
                    }]
            };
        });
        this.server.setRequestHandler(types_js_1.ListPromptsRequestSchema, async () => {
            await this.loadSkills();
            return {
                prompts: Array.from(this.skillsCache.values()).map(skill => ({
                    name: skill.name,
                    description: skill.description,
                    arguments: []
                }))
            };
        });
        this.server.setRequestHandler(types_js_1.GetPromptRequestSchema, async (request) => {
            const skill = this.skillsCache.get(request.params.name.toLowerCase());
            if (!skill)
                throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, `Prompt not found: ${request.params.name}`);
            return {
                description: skill.description,
                messages: [
                    {
                        role: "user",
                        content: {
                            type: "text",
                            text: `<activated_skill name="${skill.name}">\n${skill.content}\n</activated_skill>`
                        }
                    }
                ]
            };
        });
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "search_skills",
                        description: "Search the EVOKORE-MCP library for available agent skills.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: { type: "string" }
                            },
                            required: ["query"]
                        }
                    }
                ]
            };
        });
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            if (request.params.name === "search_skills") {
                await this.loadSkills();
                const query = (request.params.arguments?.query || "").toLowerCase();
                const results = Array.from(this.skillsCache.values()).filter(s => s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query));
                return {
                    content: [{
                            type: "text",
                            text: results.length > 0
                                ? results.map(r => `- **${r.name}** [${r.category}]: ${r.description}`).join("\n")
                                : "No skills found."
                        }]
                };
            }
            throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, `Unknown tool`);
        });
    }
    async run() {
        await this.loadSkills();
        const transport = new stdio_js_1.StdioServerTransport();
        await this.server.connect(transport);
        console.error("EVOKORE-MCP Server running on stdio");
    }
}
const server = new EvokoreMCPServer();
server.run().catch(console.error);
//# sourceMappingURL=index.js.map