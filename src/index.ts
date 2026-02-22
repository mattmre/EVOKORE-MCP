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

const SKILLS_DIR = path.resolve(__dirname, "../SKILLS");

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
        version: "1.1.0",
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
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
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
          uri: `skill://${skill.category.replace(/[^a-zA-Z0-9-]/g, '-')}/${skill.name.replace(/[^a-zA-Z0-9-]/g, '-')}`,
          name: `Skill: ${skill.name}`,
          mimeType: "text/markdown",
          description: skill.description
        }))
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const url = new URL(request.params.uri);
      const skillName = url.pathname.replace(/^\//, '').toLowerCase();
      
      // Fuzzy match name
      const skill = Array.from(this.skillsCache.values()).find(s => s.name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase() === skillName || s.name.toLowerCase() === skillName);

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
              text: `<activated_skill name="${skill.name}">\n${skill.content}\n</activated_skill>`
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
            description: "Search the EVOKORE-MCP library for available agent skills by keyword (e.g. 'react', 'pr-manager').",
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
            description: "Retrieve comprehensive documentation, instructions, and intended use-cases for a specific skill. Use this to help users understand what a skill does.",
            inputSchema: {
              type: "object",
              properties: {
                skill_name: { type: "string", description: "The exact name of the skill to inspect." }
              },
              required: ["skill_name"]
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
          s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query) || s.category.toLowerCase().includes(query)
        );

        return {
          content: [{ 
            type: "text", 
            text: results.length > 0 
                ? results.map(r => `- **${r.name}** [${r.category}]: ${r.description}`).join("\n") 
                : "No skills found matching that query."
          }]
        };
      }

      if (request.params.name === "get_skill_help") {
        await this.loadSkills();
        const skillName = (request.params.arguments?.skill_name as string || "").toLowerCase();
        const skill = this.skillsCache.get(skillName) || Array.from(this.skillsCache.values()).find(s => s.name.toLowerCase().includes(skillName));

        if (!skill) {
           return {
             content: [{ type: "text", text: `Could not find a skill named '${skillName}'. Please use the search_skills tool to find the exact name.` }]
           };
        }

        const helpText = `
### Skill Overview: ${skill.name}
**Category:** ${skill.category}
**Description:** ${skill.description}

---

### Internal Instructions (How this skill works):
The following are the exact instructions the agent executes when this skill is invoked. You can use this to explain to the user what the skill is capable of and provide concrete examples of when they should invoke it:

${skill.content}
        `.trim();

        return {
          content: [{ type: "text", text: helpText }]
        };
      }

      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
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
