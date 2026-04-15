#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const YAML = require('yaml');
const { writeHookEvent } = require('./hook-observability');
const { rotateIfNeeded } = require('./log-rotation');

const RULES_PATH = path.resolve(__dirname, '..', 'damage-control-rules.yaml');
const RULES_MD_PATH = path.resolve(__dirname, '..', 'RULES.md');
const LOGS_DIR = path.join(os.homedir(), '.evokore', 'logs');

// ---------------------------------------------------------------------------
// ECC Phase 1: RULES.md intent enrichment
// Loads the declarative RULES.md document and extracts per-section Intent
// paragraphs so damage-control reasons can cite the governing policy. Fail
// open on any read/parse error — never block the damage-control flow.
// ---------------------------------------------------------------------------
function loadRulesIntent() {
  try {
    const raw = fs.readFileSync(RULES_MD_PATH, 'utf8');
    const mapping = {};
    const sectionPatterns = [
      { key: 'file_access', header: '## 1. File Access Policies' },
      { key: 'tool_restrictions', header: '## 2. Tool Restrictions' },
      { key: 'commit_policies', header: '## 3. Commit Policies' },
      { key: 'session_policies', header: '## 4. Session Policies' },
      { key: 'escalation_policies', header: '## 5. Escalation Policies' },
    ];
    for (let i = 0; i < sectionPatterns.length; i++) {
      const { key, header } = sectionPatterns[i];
      const nextHeader = sectionPatterns[i + 1] ? sectionPatterns[i + 1].header : null;
      const escapedHeader = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedNext = nextHeader ? nextHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
      const pattern = escapedNext
        ? new RegExp(escapedHeader + '\\s*\\n([\\s\\S]*?)\\n' + escapedNext)
        : new RegExp(escapedHeader + '\\s*\\n([\\s\\S]*)$');
      const match = raw.match(pattern);
      if (match) {
        const intentMatch = match[1].match(/\*\*Intent:\*\*\s*([^\n]+)/);
        mapping[key] = intentMatch ? intentMatch[1].trim() : '';
      }
    }
    return mapping;
  } catch {
    return {}; // fail open — never block damage-control flow
  }
}

function enrichReasonWithRules(reason, ruleType, rulesIntent) {
  if (!rulesIntent || !reason) return reason;
  const sectionMap = {
    dangerous_commands: '§2 Tool Restrictions / §3 Commit Policies',
    zero_access_paths: '§1 File Access Policies',
    read_only_paths: '§1 File Access Policies',
    no_delete_paths: '§1 File Access Policies',
    scope_boundary: '§4 Session Policies',
  };
  const section = sectionMap[ruleType];
  if (!section) return reason;
  return `${reason} (See RULES.md ${section})`;
}

// @AI:NAV[SEC:irreversibility-classifier] IrreversibilityClassifier
// Classify action reversibility so destructive or external-facing commands
// can be gated behind an explicit _evokore_approval_token. This complements
// the YAML-driven rule set — it is a last-line catch for commands that look
// irreversible regardless of pattern-specific rules.
function classifyReversibility(toolName, toolInput) {
  const cmd = (toolInput && (toolInput.command || toolInput.cmd || '')) || '';
  const destructivePatterns = [
    /rm\s+-[rf]/i,
    /drop\s+table/i,
    /git\s+reset\s+--hard/i,
    /git\s+push\s+--force/i,
    /truncate\s+table/i,
    /format\s+[a-z]:/i,
    /mkfs/i,
    /del\s+\/[fqs]/i
  ];
  const externalPatterns = [
    /curl\b/i,
    /wget\b/i,
    /fetch\b/i,
    /http[s]?:\/\//i,
    /ssh\b/i,
    /scp\b/i,
    /ftp\b/i,
    /npm\s+publish/i,
    /git\s+push\b/i
  ];
  const isDestructive = destructivePatterns.some((p) => p.test(cmd));
  const isExternal = externalPatterns.some((p) => p.test(cmd));
  if (isDestructive) return 'destructive';
  if (isExternal) return 'external';
  return 'reversible';
}
// @AI:NAV[END:irreversibility-classifier]

module.exports = { loadRulesIntent, enrichReasonWithRules, classifyReversibility };

// The stdin hook loop only runs when invoked as a script — either directly
// (`node scripts/damage-control.js`) or through the canonical fail-safe
// wrapper (`node scripts/hooks/damage-control.js`). Tests `require()` this
// module to exercise the exported helpers and must not attach stdin
// listeners that could consume the worker's stdin and trigger a mid-test
// fail-open exit.
const __dcMainFilename = (require.main && require.main.filename) ? require.main.filename : '';
const __dcMainBase = path.basename(__dcMainFilename);
const __dcIsDirectInvocation =
  require.main === module ||
  (__dcMainBase === 'damage-control.js' && path.basename(path.dirname(__dcMainFilename)) === 'hooks');

if (!__dcIsDirectInvocation) {
  return;
}

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

    // ECC Phase 1: enrich reasons with RULES.md section citations (fail open)
    const rulesIntent = loadRulesIntent();

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
            const reason = enrichReasonWithRules(rule.reason || 'Dangerous command blocked', 'dangerous_commands', rulesIntent);
            logViolation({ type: 'dangerous_command', tool: toolName, command: cmd.slice(0, 200), reason, rule_id: rule.id });

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
        const reason = enrichReasonWithRules(`Access to sensitive path denied: ${check.rule}`, 'zero_access_paths', rulesIntent);
        logViolation({ type: 'zero_access', tool: toolName, path: check.path, reason, rule_id: 'zero_access' });
        emit('block', { reason, path: check.path, rule: check.rule, type: 'zero_access' });
        process.stderr.write(`DAMAGE CONTROL BLOCKED: ${reason}\n`);
        process.exit(2);
      }
    }

    // 3. Check read-only paths (Edit/Write only)
    if ((toolName === 'Edit' || toolName === 'Write') && rules.read_only_paths) {
      const check = checkPathList(filePaths, rules.read_only_paths);
      if (check.matched) {
        const reason = enrichReasonWithRules(`Write to read-only path denied: ${check.rule}`, 'read_only_paths', rulesIntent);
        logViolation({ type: 'read_only', tool: toolName, path: check.path, reason, rule_id: 'read_only' });
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
          const reason = enrichReasonWithRules(`Deletion of protected file denied: ${check.rule}`, 'no_delete_paths', rulesIntent);
          logViolation({ type: 'no_delete', tool: toolName, path: check.path, reason, rule_id: 'no_delete' });
          emit('block', { reason, path: check.path, rule: check.rule, type: 'no_delete' });
          process.stderr.write(`DAMAGE CONTROL BLOCKED: ${reason}\n`);
          process.exit(2);
        }
      }
    }

    // 4.5 Irreversibility classifier — gate destructive/external actions behind
    // an explicit _evokore_approval_token so the user confirms before execution.
    if (toolName === 'Bash' && toolInput && toolInput.command) {
      const reversibility = classifyReversibility(toolName, toolInput);
      if (reversibility === 'destructive' || reversibility === 'external') {
        const hasToken = Boolean(toolInput._evokore_approval_token);
        if (!hasToken) {
          const reason = `Action classified as ${reversibility}. Approval token required. Set _evokore_approval_token in tool arguments to proceed.`;
          logViolation({ type: 'irreversibility_classifier', tool: toolName, classification: reversibility, reason, rule_id: 'irreversibility_classifier' });
          emit('ask', { reason, classification: reversibility, type: 'irreversibility_classifier' });
          console.log(JSON.stringify({ decision: 'ask', reason: `IRREVERSIBILITY: ${reason}` }));
          process.exit(0);
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
            // Per-session rate limit: max 3 scope boundary asks
            const scopeAsks = purposeState.scope_boundary_asks || 0;
            if (scopeAsks >= 3) {
              // Rate limit exceeded — skip scope boundary check
            } else {
              // Extract project-like keywords from purpose (min 5 chars to reduce noise)
              const projectHints = purpose.match(/\b[a-z][\w-]{4,}\b/g) || [];
              const cwdNormalized = normalizePath(process.cwd()).toLowerCase();
              // Check if any file paths reference completely different project directories
              for (const fp of filePaths) {
                const normalized = fp.toLowerCase().replace(/\\/g, '/');
                // Skip paths within the current project root — always in scope
                if (normalized.startsWith(cwdNormalized)) {
                  continue;
                }
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
                    // Require at least 2 keyword matches to consider path in scope
                    const matchCount = projectHints.filter(hint =>
                      normalized.includes(hint) || dirName.includes(hint)
                    ).length;
                    if (matchCount < 2) {
                      // Increment rate limit counter and save
                      purposeState.scope_boundary_asks = scopeAsks + 1;
                      fs.writeFileSync(purposeFile, JSON.stringify(purposeState, null, 2));
                      const reason = enrichReasonWithRules(`File "${fp}" appears outside session scope ("${purposeState.purpose.slice(0, 80)}")`, 'scope_boundary', rulesIntent);
                      logViolation({ type: 'scope_boundary', tool: toolName, path: fp, reason, rule_id: 'scope_boundary' });
                      emit('ask', { reason, path: fp, type: 'scope_boundary' });
                      console.log(JSON.stringify({ decision: 'ask', reason: `SCOPE WARNING: ${reason}` }));
                      process.exit(0);
                    }
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
