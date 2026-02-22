const fs = require('fs');

const content = \const fs = require('fs/promises');
const path = require('path');
const yaml = require('yaml');

const SKILLS_DIR = path.resolve(__dirname, '../SKILLS');

async function processFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const match = content.match(new RegExp('^---\\\\\\\\r?\\\\\\\\n([\\\\\\\\s\\\\\\\\S]*?)\\\\\\\\r?\\\\\\\\n---\\\\\\\\r?\\\\\\\\n([\\\\\\\\s\\\\\\\\S]*)$'));
        
        let frontmatterObj = {};
        let body = content;

        if (!match) {
            console.log('[Adding Frontmatter] ' + filePath);
            const dirName = path.basename(path.dirname(filePath));
            const fileName = path.basename(filePath, '.md');

            const h1Match = content.match(/^#\\\\s+(.+)$/m);
            const name = h1Match ? h1Match[1].toLowerCase().replace(/[^a-z0-9]+/g, '-') : (fileName === 'SKILL' ? dirName : fileName);

            frontmatterObj = {
                name: name,
                description: 'Specialized skill for ' + name.replace(/-/g, ' ') + ' workflows.'
            };
        } else {
            try {
                frontmatterObj = yaml.parse(match[1]);
                body = match[2];
            } catch (e) {
                console.log('[Fixing Malformed Frontmatter] ' + filePath);
                const nameMatch = match[1].match(/name:\\\\s*(.+)/);
                const descMatch = match[1].match(/description:\\\\s*(.+)/);

                frontmatterObj = {
                    name: nameMatch ? nameMatch[1].replace(/['"]/g, '') : path.basename(path.dirname(filePath)),
                    description: descMatch ? descMatch[1].replace(/['"]/g, '') : "Specialized skill workflow."
                };
                body = match[2];
            }
        }

        body = body.trim();
        const newFrontmatterStr = yaml.stringify(frontmatterObj).trim();
        const newContent = '---\\n' + newFrontmatterStr + '\\n---\\n\\n' + body + '\\n';

        if (content !== newContent) {
            await fs.writeFile(filePath, newContent, 'utf8');
            console.log('[Updated] ' + filePath);
        }
    } catch (e) {
        console.error('[Error] Processing ' + filePath + ': ' + e.message);
    }
}

async function walkDir(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await walkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            await processFile(fullPath);
        }
    }
}

console.log("Starting EVOKORE-MCP Skill Cleanup Pass...");
walkDir(SKILLS_DIR).then(() => console.log("Cleanup complete!"));\

fs.writeFileSync('D:\\\\GITHUB\\\\EVOKORE-MCP\\\\scripts\\\\clean_skills.js', content, 'utf8');
