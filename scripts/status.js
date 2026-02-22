#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function getTerminalWidth() {
  return process.stdout.columns || 80;
}

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  blue: '\x1b[38;5;39m',
  green: '\x1b[38;5;40m',
  purple: '\x1b[38;5;135m',
  orange: '\x1b[38;5;208m',
  red: '\x1b[38;5;196m',
  gray: '\x1b[38;5;240m'
};

function formatTokens(num) {
  if (num > 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num > 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

let inputData = '';
process.stdin.on('data', chunk => { inputData += chunk; });

process.stdin.on('end', async () => {
  try {
    let payload = {};
    if (inputData.trim()) {
        try { payload = JSON.parse(inputData); } catch (e) {}
    }

    const width = getTerminalWidth();
    const modelName = payload?.model?.display_name || payload?.model || 'EVOKORE AI';
    const cwd = payload?.workspace?.current_dir || payload?.cwd || process.cwd();
    const dirName = path.basename(cwd);
    
    const inputTokens = payload?.context_window?.current_usage?.input_tokens || 0;
    const maxTokens = payload?.context_window?.context_window_size || 200000;
    const contextPercent = Math.min(100, Math.round((inputTokens / maxTokens) * 100));

    let skillCount = '200+';
    try {
        const skillsDir = path.resolve(__dirname, '../SKILLS');
        const categories = await fs.promises.readdir(skillsDir);
        let count = 0;
        for (const cat of categories) {
            const stat = await fs.promises.stat(path.join(skillsDir, cat));
            if (stat.isDirectory()) {
                const skills = await fs.promises.readdir(path.join(skillsDir, cat));
                count += skills.length;
            }
        }
        if (count > 0) skillCount = count;
    } catch (e) {}

    const prefix = `${colors.bold}${colors.purple}? EVOKORE${colors.reset}`;
    const location = `${colors.blue}? ${dirName}${colors.reset}`;
    const aiModel = `${colors.orange}?? ${modelName}${colors.reset}`;
    const skills = `${colors.green}?? ${skillCount} Skills${colors.reset}`;
    
    let contextColor = colors.green;
    if (contextPercent > 70) contextColor = colors.orange;
    if (contextPercent > 90) contextColor = colors.red;
    const contextStr = `${contextColor}? Ctx: ${contextPercent}%${colors.reset} ${colors.dim}(${formatTokens(inputTokens)}/${formatTokens(maxTokens)})${colors.reset}`;

    let output = '';
    if (width < 60) {
        output = `${prefix} | ${contextStr}`;
    } else if (width < 100) {
        output = `${prefix} | ${aiModel} | ${skills} | ${contextStr}`;
    } else {
        output = `${prefix} ${colors.dim}::${colors.reset} ${location} ${colors.dim}::${colors.reset} ${aiModel} ${colors.dim}::${colors.reset} ${skills} ${colors.dim}::${colors.reset} ${contextStr}`;
    }

    process.stdout.write(`\n${output}\n`);
  } catch (error) {
    process.stdout.write(`${colors.red}EVOKORE Status Error: ${error.message}${colors.reset}\n`);
  }
});

