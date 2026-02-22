import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  GetPromptRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import yaml from "yaml";

const SKILLS_DIR = path.resolve(process.cwd(), "SKILLS");

interface SkillMetadata {
  name: string;
  description: string;
  category: string;
  filePath: string;
  content: string;
}

class EvokoreMCPServer {
  private server: Server;
  private skillsCache: Map<string, SkillMetadata> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: "evokore-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.server.onerror = (error) => console.error("[MCP Error]", error);
  }

  private async loadSkills() {
    this.skillsCache.clear();
    try {
      const categories = await fs.readdir(SKILLS_DIR);
      
      for (const category of categories) {
        const categoryPath = path.join(SKILLS_DIR, category);
        const stat = await fs.stat(categoryPath);
        
        if (!stat.isDirectory()) continue;
        
        const skills = await fs.readdir(categoryPath);
        for (const skillDir of skills) {
          const itemPath = path.join(categoryPath, skillDir);
          let skillPath = path.join(itemPath, "SKILL.md");
          let fallbackName = skillDir;

          const itemStat = await fs.stat(itemPath);
          if (!itemStat.isDirectory()) {
              if (skillDir.endsWith(".md")) {
                  skillPath = itemPath;
                  fallbackName = skillDir.replace(".md", "");
              } else {
                  continue;
              }
          }

          try {
            const content = await fs.readFile(skillPath, "utf-8");
            const metadata = this.parseSkillMarkdown(content, category, skillPath, fallbackName);
            if (metadata) {
              this.skillsCache.set(metadata.name.toLowerCase(), metadata);
            }
          } catch (error) {
            // File might not exist
          }
        }
      }
      console.error(`Loaded ${this.skillsCache.size} skills into EVOKORE-MCP.`);
    } catch (e) {
      console.error("Error loading skills directory:", e);
    }
  }

  private parseSkillMarkdown(content: string, category: string, filePath: string, fallbackName: string): SkillMetadata | null {
    const match = content.match(/^---
([\s\S]*?)
---
([\s\S]*)$/);
    if (!match) return null;

    try {
      const frontmatter = yaml.parse(match[1]);
      return {
        name: frontmatter.name || fallbackName,
        description: frontmatter.description || "No description provided.",
        category,
        filePath,
        content: match[2].trim()
      };
    } catch (e) {
      return null;
    }
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
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

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const url = new URL(request.params.uri);
      const skillName = url.pathname.replace(/^\//, '').toLowerCase();
      const skill = this.skillsCache.get(skillName);

      if (!skill) throw new McpError(ErrorCode.InvalidParams, `Skill not found: ${skillName}`);

      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "text/markdown",
          text: skill.content
        }]
      };
    });

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      await this.loadSkills();
      return {
        prompts: Array.from(this.skillsCache.values()).map(skill => ({
          name: skill.name,
          description: skill.description,
          arguments: []
        }))
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const skill = this.skillsCache.get(request.params.name.toLowerCase());
      if (!skill) throw new McpError(ErrorCode.InvalidParams, `Prompt not found: ${request.params.name}`);

      return {
        description: skill.description,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `<activated_skill name="${skill.name}">
${skill.content}
</activated_skill>`
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
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

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === "search_skills") {
        await this.loadSkills();
        const query = (request.params.arguments?.query as string || "").toLowerCase();
        const results = Array.from(this.skillsCache.values()).filter(s => 
          s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query)
        );

        return {
          content: [{ 
            type: "text", 
            text: results.length > 0 
                ? results.map(r => `- **${r.name}** [${r.category}]: ${r.description}`).join("
") 
                : "No skills found."
          }]
        };
      }
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool`);
    });
  }

  async run() {
    await this.loadSkills();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("EVOKORE-MCP Server running on stdio");
  }
}

const server = new EvokoreMCPServer();
server.run().catch(console.error);
