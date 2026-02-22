import fs from "fs/promises";
import path from "path";
import yaml from "yaml";
import Fuse from "fuse.js";
import { Tool, Resource, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

const SKILLS_DIR = path.resolve(__dirname, "../../SKILLS");

export interface SkillMetadata {
  name: string;
  description: string;
  category: string;
  filePath: string;
  content: string;
}

export class SkillManager {
  private skillsCache: Map<string, SkillMetadata> = new Map();
  private fuseIndex: Fuse<SkillMetadata> | null = null;

  async loadSkills() {
    this.skillsCache.clear();
    try {
      const categories = await fs.readdir(SKILLS_DIR).catch(() => []);
      
      for (const category of categories) {
        const categoryPath = path.join(SKILLS_DIR, category);
        const stat = await fs.stat(categoryPath).catch(() => null);
        
        if (!stat || !stat.isDirectory()) continue;
        
        const skills = await fs.readdir(categoryPath).catch(() => []);
        for (const skillDir of skills) {
          const itemPath = path.join(categoryPath, skillDir);
          let skillPath = path.join(itemPath, "SKILL.md");
          let fallbackName = skillDir;

          const itemStat = await fs.stat(itemPath).catch(() => null);
          if (!itemStat) continue;

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
      
      this.fuseIndex = new Fuse(Array.from(this.skillsCache.values()), {
        keys: ["name", "description", "category", "content"],
        threshold: 0.4,
        ignoreLocation: true
      });

      console.error(`[EVOKORE] Indexed ${this.skillsCache.size} skills for Dynamic Retrieval.`);
    } catch (e) {
      console.error("[EVOKORE] Error loading skills directory:", e);
    }
  }

  private parseSkillMarkdown(content: string, category: string, filePath: string, fallbackName: string): SkillMetadata | null {
    const match = content.match(new RegExp("^---\\\\r?\\\\n([\\\\s\\\\S]*?)\\\\r?\\\\n---\\\\r?\\\\n([\\\\s\\\\S]*)$"));
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

  getTools(): Tool[] {
    return [
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
      }
    ];
  }

  async handleToolCall(name: string, args: any): Promise<any> {
    if (name === "resolve_workflow") {
        if (!this.fuseIndex) await this.loadSkills();
        const objective = (args.objective as string || "");
        
        const results = this.fuseIndex!.search(objective, { limit: 3 });
        
        if (results.length === 0) {
            return { content: [{ type: "text", text: `No specific workflows found for '${objective}'. Proceed using your general knowledge.` }] };
        }

        const injectedWorkflows = results.map(r => {
            return `--- WORKFLOW: ${r.item.name} [${r.item.category}] ---\nDescription: ${r.item.description}\n\n<activated_skill name="${r.item.name}">\n${r.item.content}\n</activated_skill>\n`;
        }).join("\n\n");

        return { content: [{ type: "text", text: `EVOKORE-MCP injected highly relevant workflows. Please adopt these instructions:\n\n${injectedWorkflows}` }] };
    }

    if (name === "search_skills") {
        if (!this.fuseIndex) await this.loadSkills();
        const query = (args.query as string || "").toLowerCase();
        const results = this.fuseIndex!.search(query, { limit: 15 }).map(r => r.item);

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
        if (!this.fuseIndex) await this.loadSkills();
        const skillName = (args.skill_name as string || "").toLowerCase();
        
        let skill = this.skillsCache.get(skillName);
        if (!skill && this.fuseIndex) {
            const matches = this.fuseIndex.search(skillName, { limit: 1 });
            if (matches.length > 0) skill = matches[0].item;
        }

        if (!skill) {
           return { content: [{ type: "text", text: `Could not find a skill named '${skillName}'.` }] };
        }

        const helpText = `### Skill Overview: ${skill.name}\n**Category:** ${skill.category}\n**Description:** ${skill.description}\n\n---\n\n### Internal Instructions:\n${skill.content}`;
        return { content: [{ type: "text", text: helpText }] };
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }

  getResources(): Resource[] {
      return Array.from(this.skillsCache.values()).map(skill => ({
        uri: `skill://${skill.category.replace(/[^a-zA-Z0-9-]/g, '-')}/${skill.name.replace(/[^a-zA-Z0-9-]/g, '-')}`,
        name: `Skill: ${skill.name}`,
        mimeType: "text/markdown",
        description: skill.description
      }));
  }

  readResource(uriStr: string) {
      const url = new URL(uriStr);
      const skillName = url.pathname.replace(/^\//, '').toLowerCase();
      
      const skill = Array.from(this.skillsCache.values()).find(s => s.name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase() === skillName || s.name.toLowerCase() === skillName);

      if (!skill) throw new McpError(ErrorCode.InvalidParams, `Skill not found: ${skillName}`);

      return {
        contents: [{
          uri: uriStr,
          mimeType: "text/markdown",
          text: skill.content
        }]
      };
  }
}
