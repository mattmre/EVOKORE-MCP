#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// EVOKORE-MCP Status Line Integration
// This script reads the JSON context payload provided by AI clients (like Claude Code or Gemini CLI) via stdin
// and formats it into a beautiful, cross-platform terminal status line.

function getTerminalWidth() {
  return process.stdout.columns || 80;
}

// Colors
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

function formatBytes(bytes) {
  if (bytes === 0) return '0B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}

function formatTokens(num) {
  if (num > 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num > 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

let inputData = '';

process.stdin.on('data', chunk => {
  inputData += chunk;
});

process.stdin.on('end', async () => {
  try {
    let payload = {};
    if (inputData.trim()) {
        try {
            payload = JSON.parse(inputData);
        } catch (e) {}
    }

    const width = getTerminalWidth();
    
    // Extract Client Context (Matches Claude/Gemini hook payloads)
    const modelName = payload?.model?.display_name || payload?.model || 'EVOKORE AI';
    const cwd = payload?.workspace?.current_dir || payload?.cwd || process.cwd();
    const dirName = path.basename(cwd);
    
    const inputTokens = payload?.context_window?.current_usage?.input_tokens || 0;
    const outputTokens = payload?.context_window?.current_usage?.output_tokens || 0;
    const maxTokens = payload?.context_window?.context_window_size || 200000;
    
    const contextPercent = Math.min(100, Math.round((inputTokens / maxTokens) * 100));

    // Try to get EVOKORE-MCP local skill count
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
    } catch (e) {
        // Ignore if run outside repo
    }

    // Build Status Line
    const prefix = \\⚡ EVOKORE\;
    const location = \▶ \\;
    const aiModel = \🤖 \\;
    const skills = \⚒�  \ Skills\;
    
    // Context Bar
    let contextColor = colors.green;
    if (contextPercent > 70) contextColor = colors.orange;
    if (contextPercent > 90) contextColor = colors.red;
    const contextStr = \○ Ctx: \%\ \(\/\)\;

    // Layout Logic (Responsive)
    let output = '';
    if (width < 60) {
        output = \ | \;
    } else if (width < 100) {
        output = \ | \ | \ | \;
    } else {
        output = \ \::\ \ \::\ \ \::\ \ \::\ \;
    }

    // Add top border line for aesthetic
    const border = colors.gray + '─'.repeat(Math.min(width, 120)) + colors.reset;
    
    process.stdout.write(\n\\n\\n);

  } catch (error) {
    process.stdout.write(\EVOKORE Status Error: \\\n);
  }
});
