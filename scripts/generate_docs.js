const fs = require('fs/promises');
const path = require('path');
const yaml = require('yaml');

const SKILLS_DIR = path.resolve(__dirname, '../SKILLS');
const DOCS_DIR = path.resolve(__dirname, '../docs/categories');
const MASTER_DOC = path.resolve(__dirname, '../docs/TRAINING_AND_USE_CASES.md');

// Helper to synthesize training examples based on description
function generateUseCases(name, description) {
    const markdownCode = "`";
    return `
#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the ${markdownCode}${name}${markdownCode} workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in ${markdownCode}${name}${markdownCode}.
3. **Orchestration**: As part of a larger multi-agent sequence where ${markdownCode}${name}${markdownCode} handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **${name}** workflow to accomplish this task."*
> *"Please load the **${name}** skill and evaluate my code."*
> *"Use the ${markdownCode}search_skills${markdownCode} tool to find the exact instructions for **${name}**."*
`;
}

// Helper to clean up raw markdown content into bullet points
function extractCoreDirectives(content) {
    const lines = content.split('\\n')
        .filter(l => l.trim().length > 0 && !l.startsWith('#') && !l.includes('---'))
        .slice(0, 10); // Extract top 10 lines as core directives

    if (lines.length === 0) return "*No specific directives found.*";
    return lines.map(l => l.startsWith('-') || l.startsWith('*') ? l : `> ${l}`).join('\\n');
}

async function generateDocumentation() {
    console.log("Starting comprehensive documentation generation...");
    
    // Ensure docs directory exists
    try { await fs.mkdir(DOCS_DIR, { recursive: true }); } catch (e) {}

    const categories = await fs.readdir(SKILLS_DIR);
    let masterIndexContent = `# 🎓 EVOKORE-MCP Training & Use Cases\\n\\nThis master document serves as the comprehensive training manual and use-case directory for all 200+ Agent Skills available in the EVOKORE-MCP library. \\n\\n## 📚 Skill Categories\\n\\nSelect a category below to dive deep into the specific workflows, training examples, and core directives for each individual skill.\\n\\n`;

    for (const category of categories) {
        const categoryPath = path.join(SKILLS_DIR, category);
        const stat = await fs.stat(categoryPath);
        
        if (!stat.isDirectory()) continue;
        
        const categorySafeName = category.replace(/[^a-zA-Z0-9]/g, '_');
        const categoryDocPath = path.join(DOCS_DIR, `${categorySafeName}.md`);
        
        const codeTick = "`";
        let categoryContent = `# 📂 Category: ${category}\\n\\nThis section details the extensive use cases and training materials for the ${codeTick}${category}${codeTick} domain.\\n\\n---\\n\\n`;
        masterIndexContent += `- [**${category}**](./categories/${categorySafeName}.md)\\n`;

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
                const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
                
                if (match) {
                    const frontmatter = yaml.parse(match[1]);
                    const name = frontmatter.name || fallbackName;
                    const description = frontmatter.description || "No description provided.";
                    const body = match[2].trim();

                    categoryContent += `## 🛠️ Skill: ${codeTick}${name}${codeTick}\\n\\n`;
                    categoryContent += `**Description:** ${description}\\n\\n`;
                    categoryContent += `### 🧠 Core Directives & Framework\\n${extractCoreDirectives(body)}\\n\\n`;
                    categoryContent += generateUseCases(name, description);
                    categoryContent += `\\n---\\n\\n`;
                }
            } catch (error) {
                // Ignore missing files silently
            }
        }

        await fs.writeFile(categoryDocPath, categoryContent.replace(/\\n/g, '\n'), 'utf8');
        console.log(`[Generated] ${categoryDocPath}`);
    }

    // Write master index
    await fs.writeFile(MASTER_DOC, masterIndexContent.replace(/\\n/g, '\n'), 'utf8');
    console.log(`[Generated] ${MASTER_DOC}`);
    
    // Auto-update README to point to the new training materials
    const readmePath = path.resolve(__dirname, '../README.md');
    try {
        let readme = await fs.readFile(readmePath, 'utf8');
        if (!readme.includes('TRAINING_AND_USE_CASES.md')) {
            readme = readme.replace('## 📂 Repository Structure', '## 🎓 Comprehensive Training\nDive into our extensive, deeply researched use cases and training guides for all 200+ skills: [**Training & Use Cases Documentation**](docs/TRAINING_AND_USE_CASES.md).\n\n## 📂 Repository Structure');
            await fs.writeFile(readmePath, readme, 'utf8');
            console.log(`[Updated] README.md with link to Training materials.`);
        }
    } catch (e) {
        console.error("Failed to update README.md");
    }
}

generateDocumentation().catch(console.error);
