#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const YAML = require('yaml');
const { writeHookEvent } = require('./hook-observability');
const { rotateIfNeeded } = require('./log-rotation');

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
    try { rotateIfNeeded(logPath); } catch { /* best effort */ }
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
    // Extract paths from command using layered heuristics so path-based
    // protections still work when users rely on shell redirection or
    // bare filenames instead of fully quoted paths.
    const cmd = toolInput.command;

    const quotedMatches = cmd.match(/(?:["'][^"']+["'])/g) || [];
    quotedMatches.forEach((m) => {
      const cleaned = m.replace(/^["']|["']$/g, '');
      if (cleaned.includes('/') || cleaned.includes('\\') || cleaned.includes('.')) {
        paths.push(normalizePath(cleaned));
      }
    });

    const unquotedPathRe = /(?:^|\s)(\/\S+|~\/\S+|\$HOME\/\S+|\.\.\/\S+|\.\/\S+)/g;
    let match;
    while ((match = unquotedPathRe.exec(cmd)) !== null) {
      paths.push(normalizePath(match[1]));
    }

    const redirectRe = /(?:>>?|<)\s*["']?([^"'\s|;&]+)["']?/g;
    while ((match = redirectRe.exec(cmd)) !== null) {
      const target = match[1];
      if (target.includes('/') || target.includes('\\') || target.includes('.')) {
        paths.push(normalizePath(target));
      }
    }

    const bareFileRe = /(?:^|\s)(\S+\.\w+)(?=\s|$)/g;
    while ((match = bareFileRe.exec(cmd)) !== null) {
      const cleaned = match[1];
      if (!cleaned.startsWith('-') && (cleaned.includes('/') || cleaned.includes('\\') || cleaned.includes('.'))) {
        paths.push(normalizePath(cleaned));
      }
    }

    const deleteArgRe = /\b(?:rm|del|unlink)\s+(?:-\S+\s+)*([^|;&<>"'\s]+)/g;
    while ((match = deleteArgRe.exec(cmd)) !== null) {
      const arg = match[1];
      if (arg && !arg.startsWith('-')) {
        paths.push(normalizePath(arg));
      }
    }

    const dotfileRe = /(?:^|\s)(\.[a-zA-Z][\w.-]*\/?)/g;
    while ((match = dotfileRe.exec(cmd)) !== null) {
      paths.push(normalizePath(match[1]));
    }
  }
  return [...new Set(paths)];
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

    // 5. Scope boundary warning — light heuristic based on session purpose
    if (filePaths.length > 0) {
      try {
        const purposeDir = path.join(os.homedir(), '.evokore', 'sessions');
        const purposeFile = path.join(purposeDir, `${sessionId}.json`);
        if (fs.existsSync(purposeFile)) {
          const purposeState = JSON.parse(fs.readFileSync(purposeFile, 'utf8'));
          const purpose = (purposeState.purpose || '').toLowerCase();
          if (purpose) {
            // Extract project-like keywords from purpose (simple heuristic)
            const projectHints = purpose.match(/\b[a-z][\w-]{2,}\b/g) || [];
            // Check if any file paths reference completely different project directories
            for (const fp of filePaths) {
              const normalized = fp.toLowerCase().replace(/\\/g, '/');
              // Only flag if the path looks like an absolute path in a different project
              const projectDirMatch = normalized.match(/^[a-z]:\/[^/]+\/([^/]+)/i) ||
                                      normalized.match(/^\/[^/]+\/[^/]+\/([^/]+)/);
              if (projectDirMatch) {
                const dirName = projectDirMatch[1].toLowerCase();
                // If purpose mentions a specific project and this path is in a different one
                const purposeMentionsProject = projectHints.some(hint =>
                  hint.length > 3 && !['this', 'that', 'with', 'from', 'have', 'what', 'will', 'work', 'working'].includes(hint)
                );
                if (purposeMentionsProject) {
                  const pathMatchesPurpose = projectHints.some(hint =>
                    normalized.includes(hint) || dirName.includes(hint)
                  );
                  if (!pathMatchesPurpose) {
                    const reason = `File "${fp}" appears outside session scope ("${purposeState.purpose.slice(0, 80)}")`;
                    logViolation({ type: 'scope_boundary', tool: toolName, path: fp, reason });
                    emit('ask', { reason, path: fp, type: 'scope_boundary' });
                    console.log(JSON.stringify({ decision: 'ask', reason: `SCOPE WARNING: ${reason}` }));
                    process.exit(0);
                  }
                }
              }
            }
          }
        }
      } catch {
        // Scope check is best-effort — never block on failure
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
