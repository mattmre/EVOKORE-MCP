#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const YAML = require('yaml');
const { writeHookEvent } = require('./hook-observability');

const RULES_PATH = path.resolve(__dirname, '..', 'damage-control-rules.yaml');
const LOGS_DIR = path.join(os.homedir(), '.evokore', 'logs');

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function logViolation(entry) {
  try {
    ensureLogsDir();
    const logPath = path.join(LOGS_DIR, 'damage-control.log');
    const line = `[${new Date().toISOString()}] ${JSON.stringify(entry)}\n`;
    fs.appendFileSync(logPath, line);
  } catch {
    // Best effort logging
  }
}

function normalizePath(p) {
  return (p || '').replace(/\\/g, '/');
}

function extractPaths(toolName, toolInput) {
  const paths = [];
  if (toolInput.file_path) paths.push(normalizePath(toolInput.file_path));
  if (toolInput.path) paths.push(normalizePath(toolInput.path));
  if (toolName === 'Bash' && toolInput.command) {
    // Extract paths from command — simple heuristic
    const cmd = toolInput.command;
    const pathMatches = cmd.match(/(?:["']([^"']+)["']|(\S+\.\w+))/g) || [];
    pathMatches.forEach(m => {
      const cleaned = m.replace(/^["']|["']$/g, '');
      if (cleaned.includes('/') || cleaned.includes('\\') || cleaned.includes('.')) {
        paths.push(normalizePath(cleaned));
      }
    });
  }
  return paths;
}

function checkPathList(filePaths, ruleList) {
  for (const fp of filePaths) {
    for (const rule of ruleList) {
      const normalized = normalizePath(rule);
      if (fp.includes(normalized) || fp.endsWith(normalized) || fp.endsWith(normalized.replace(/\/$/, ''))) {
        return { matched: true, rule: normalized, path: fp };
      }
    }
  }
  return { matched: false };
}

let input = '';
process.stdin.on('data', (chunk) => input += chunk);
process.stdin.on('end', () => {
  try {
    let payload;
    let toolName = '';
    let toolInput = {};
    let sessionId = 'unknown';

    function emit(event, details) {
      writeHookEvent(Object.assign({
        hook: 'damage-control',
        event,
        session_id: sessionId,
        tool: toolName
      }, details || {}));
    }

    // Load rules — fail open if missing
    let rules;
    try {
      const raw = fs.readFileSync(RULES_PATH, 'utf8');
      rules = YAML.parse(raw);
    } catch {
      emit('fail_open', { reason: 'rules_load_failed' });
      process.exit(0); // Fail open
    }

    payload = JSON.parse(input);
    toolName = payload.tool_name || '';
    toolInput = payload.tool_input || {};
    sessionId = payload.session_id || 'unknown';

    // 1. Check dangerous commands (Bash only)
    if (toolName === 'Bash' && toolInput.command && rules.dangerous_commands) {
      const cmd = toolInput.command;
      for (const rule of rules.dangerous_commands) {
        try {
          const re = new RegExp(rule.pattern, 'i');
          if (re.test(cmd)) {
            const reason = rule.reason || 'Dangerous command blocked';
            logViolation({ type: 'dangerous_command', tool: toolName, command: cmd.slice(0, 200), reason });

            if (rule.ask) {
              emit('ask', { reason, command: cmd.slice(0, 200) });
              console.log(JSON.stringify({ decision: 'ask', reason: `DAMAGE CONTROL: ${reason}` }));
              process.exit(0);
            } else {
              emit('block', { reason, command: cmd.slice(0, 200) });
              process.stderr.write(`DAMAGE CONTROL BLOCKED: ${reason}\nCommand: ${cmd.slice(0, 100)}\n`);
              process.exit(2);
            }
          }
        } catch {
          // Skip malformed regex
        }
      }
    }

    // 2. Check zero-access paths (all tools)
    const filePaths = extractPaths(toolName, toolInput);
    if (rules.zero_access_paths) {
      const check = checkPathList(filePaths, rules.zero_access_paths);
      if (check.matched) {
        const reason = `Access to sensitive path denied: ${check.rule}`;
        logViolation({ type: 'zero_access', tool: toolName, path: check.path, reason });
        emit('block', { reason, path: check.path, rule: check.rule, type: 'zero_access' });
        process.stderr.write(`DAMAGE CONTROL BLOCKED: ${reason}\n`);
        process.exit(2);
      }
    }

    // 3. Check read-only paths (Edit/Write only)
    if ((toolName === 'Edit' || toolName === 'Write') && rules.read_only_paths) {
      const check = checkPathList(filePaths, rules.read_only_paths);
      if (check.matched) {
        const reason = `Write to read-only path denied: ${check.rule}`;
        logViolation({ type: 'read_only', tool: toolName, path: check.path, reason });
        emit('block', { reason, path: check.path, rule: check.rule, type: 'read_only' });
        process.stderr.write(`DAMAGE CONTROL BLOCKED: ${reason}\n`);
        process.exit(2);
      }
    }

    // 4. Check no-delete paths (Bash with rm/del)
    if (toolName === 'Bash' && toolInput.command && rules.no_delete_paths) {
      const cmd = toolInput.command;
      if (/\b(rm|del|remove|unlink)\b/i.test(cmd)) {
        const check = checkPathList(filePaths, rules.no_delete_paths);
        if (check.matched) {
          const reason = `Deletion of protected file denied: ${check.rule}`;
          logViolation({ type: 'no_delete', tool: toolName, path: check.path, reason });
          emit('block', { reason, path: check.path, rule: check.rule, type: 'no_delete' });
          process.stderr.write(`DAMAGE CONTROL BLOCKED: ${reason}\n`);
          process.exit(2);
        }
      }
    }

    // All checks passed
    emit('allow');
    process.exit(0);
  } catch (error) {
    // Fail open on any error
    writeHookEvent({
      hook: 'damage-control',
      event: 'fail_open',
      reason: 'unexpected_error',
      error: String(error && error.message ? error.message : error)
    });
    process.exit(0);
  }
});
