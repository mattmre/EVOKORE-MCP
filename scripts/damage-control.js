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

// ---------------------------------------------------------------------------
// W0g: Argv-aware matcher
//
// Tokenizes a Bash command into argv tokens (shell-quote semantics, lite)
// and evaluates per-rule `argv_match:` shapes. Returning null means the rule
// did not match; returning {severity} means the rule triggered. The legacy
// `pattern:` regex flow is unaffected — argv_match is purely additive.
// ---------------------------------------------------------------------------

/**
 * Tokenize a shell command into argv tokens.
 * Handles single quotes, double quotes, escaped chars, and operator splits
 * (`;`, `&&`, `||`, `|`). Returns the FIRST command segment's argv (for the
 * matcher's purpose; chained commands are also detected via DC-19/etc).
 */
function tokenizeCommand(cmd) {
  if (typeof cmd !== 'string' || cmd.length === 0) return [];
  const tokens = [];
  let buf = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let hasContent = false;

  function flush() {
    if (hasContent) {
      tokens.push(buf);
      buf = '';
      hasContent = false;
    }
  }

  while (i < cmd.length) {
    const c = cmd[i];
    if (!inSingle && !inDouble) {
      // Operator boundaries terminate the first command segment
      if (c === ';' || c === '|' || c === '&') {
        // `&&` `||` `|` `;` `&` all end this segment
        flush();
        break;
      }
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        flush();
        i++;
        continue;
      }
      if (c === "'") { inSingle = true; hasContent = true; i++; continue; }
      if (c === '"') { inDouble = true; hasContent = true; i++; continue; }
      if (c === '\\' && i + 1 < cmd.length) {
        buf += cmd[i + 1];
        hasContent = true;
        i += 2;
        continue;
      }
      buf += c;
      hasContent = true;
      i++;
      continue;
    }
    if (inSingle) {
      if (c === "'") { inSingle = false; i++; continue; }
      buf += c;
      i++;
      continue;
    }
    // inDouble
    if (c === '"') { inDouble = false; i++; continue; }
    if (c === '\\' && i + 1 < cmd.length) {
      buf += cmd[i + 1];
      i += 2;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return tokens;
}

/**
 * Glob-match a single token against a glob with `*` wildcards.
 * Anchored both ends.
 */
function globMatch(token, glob) {
  if (typeof token !== 'string' || typeof glob !== 'string') return false;
  // Escape regex metachars except `*`
  const escaped = glob.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*');
  const re = new RegExp('^' + escaped + '$');
  return re.test(token);
}

/**
 * Check if a token names a protected ref (with optional glob list).
 */
function isProtectedRef(token, exact, globs) {
  if (!token) return false;
  if (Array.isArray(exact) && exact.includes(token)) return true;
  if (Array.isArray(globs)) {
    for (const g of globs) {
      if (globMatch(token, g)) return true;
    }
  }
  return false;
}

/**
 * Evaluate a single argv_match clause against tokenized argv.
 * Returns true if the clause matches.
 */
function evaluateArgvClause(clause, argv) {
  if (!clause || typeof clause !== 'object') return false;
  if (!Array.isArray(argv) || argv.length === 0) return false;

  // 1. program (required) — argv[0] must equal it
  if (clause.program && argv[0] !== clause.program) return false;
  // 2. subcommand — argv[1] must equal it
  if (clause.subcommand && argv[1] !== clause.subcommand) return false;
  // 3. require_subverb — argv[2] must equal it (e.g. `gh issue create`)
  if (clause.require_subverb && argv[2] !== clause.require_subverb) return false;

  // 4. require_any_flag — at least one of the listed flags appears in argv
  if (Array.isArray(clause.require_any_flag)) {
    const hit = clause.require_any_flag.some((f) =>
      argv.includes(f) || argv.some((a) => a.startsWith(f + '='))
    );
    if (!hit) return false;
  }
  // 5. require_all_flags — every listed flag appears
  if (Array.isArray(clause.require_all_flags)) {
    const allHit = clause.require_all_flags.every((f) =>
      argv.includes(f) || argv.some((a) => a.startsWith(f + '='))
    );
    if (!allHit) return false;
  }
  // 6. forbid_any_flag — none of these may appear
  if (Array.isArray(clause.forbid_any_flag)) {
    const forbidden = clause.forbid_any_flag.some((f) =>
      argv.includes(f) || argv.some((a) => a.startsWith(f + '='))
    );
    if (forbidden) return false;
  }
  // 7. require_token — a specific positional token must appear in argv
  if (clause.require_token) {
    if (!argv.includes(clause.require_token)) return false;
  }
  // 8. require_sequence — argv contains the listed tokens contiguously
  if (Array.isArray(clause.require_sequence)) {
    const seq = clause.require_sequence;
    let found = false;
    for (let i = 0; i + seq.length <= argv.length; i++) {
      let ok = true;
      for (let j = 0; j < seq.length; j++) {
        if (argv[i + j] !== seq[j]) { ok = false; break; }
      }
      if (ok) { found = true; break; }
    }
    if (!found) return false;
  }
  // 9. require_token_glob — a token in argv matches the glob exactly
  if (clause.require_token_glob) {
    const hit = argv.some((a) => globMatch(a, clause.require_token_glob));
    if (!hit) return false;
  }
  // 10. require_compound_short_flags — argv has a token like `-fdx` containing all listed letters
  if (Array.isArray(clause.require_compound_short_flags)) {
    const letters = clause.require_compound_short_flags;
    const hit = argv.some((a) =>
      /^-[a-zA-Z]+$/.test(a) && letters.every((l) => a.includes(l))
    );
    if (!hit) return false;
    // 10a. allow_paths_after_flags=false: if non-flag positional args follow,
    // the rule should NOT match (legitimate `git clean -fd <path>` allowed).
    if (clause.allow_paths_after_flags === false) {
      // After argv[0] argv[1], any token that does NOT start with `-`
      // and is not a flag value would mean a target path is supplied.
      const trailing = argv.slice(2).filter((a) => !/^-/.test(a));
      if (trailing.length > 0) return false;
    }
  }
  // 11. require_long_flag_any — at least one of these long flags exists
  if (Array.isArray(clause.require_long_flag_any)) {
    const hit = clause.require_long_flag_any.some((f) => argv.includes(f));
    if (!hit) return false;
  }
  // 12. target_protected_refs / target_token_glob — the target ref following
  //     a flag like `--delete` or as the last positional is a protected ref.
  if (Array.isArray(clause.target_protected_refs)) {
    const tail = argv.slice(2);
    const hit = tail.some((t) => clause.target_protected_refs.includes(t));
    if (!hit) return false;
  }
  if (clause.target_token_glob) {
    const hit = argv.some((a) => globMatch(a, clause.target_token_glob));
    if (!hit) return false;
  }
  // 13. require_flag_with_value — `--add-label foo` or `--add-label=foo` with
  //     the value belonging to a sensitive set.
  if (clause.require_flag_with_value && typeof clause.require_flag_with_value === 'object') {
    const { flag, sensitive_values } = clause.require_flag_with_value;
    if (!flag || !Array.isArray(sensitive_values)) return false;
    let hit = false;
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === flag && i + 1 < argv.length && sensitive_values.includes(argv[i + 1])) {
        hit = true;
        break;
      }
      // Also support comma-separated --add-label=a,b,c
      if (a.startsWith(flag + '=')) {
        const v = a.slice(flag.length + 1);
        const parts = v.split(',').map((p) => p.trim());
        if (parts.some((p) => sensitive_values.includes(p))) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) return false;
  }
  return true;
}

/**
 * Evaluate a top-level argv_match shape (which may contain `any_of:` list of
 * sub-clauses or be a single clause itself). Returns true on match.
 */
function evaluateArgvMatch(argvMatch, argv) {
  if (!argvMatch || typeof argvMatch !== 'object') return false;
  if (Array.isArray(argvMatch.any_of)) {
    return argvMatch.any_of.some((c) => evaluateArgvClause(c, argv));
  }
  return evaluateArgvClause(argvMatch, argv);
}

/**
 * High-level argv-aware rule evaluator. Returns:
 *   null — rule did not match
 *   { severity, reason } — rule fired with the given severity ('block' or 'warn')
 *
 * Honors:
 *  - rule.argv_match (required)
 *  - rule.severity ('block' | 'warn'; default 'block')
 *  - rule.warn_severity — fallback severity when the *_force_with_lease*
 *    branch matched a lease flag against a protected ref (DC-33-style).
 *  - rule.env_override — env var name whose 'true' value bypasses the rule.
 *  - rule.argv_match.allow_branch_globs — branch globs that bypass even when
 *    the rest of the clause matches (used by DC-33 for chore/control-plane-*).
 *  - rule.argv_match.lease_flags — flags considered the safer "lease" form;
 *    when matched alongside a protected ref, severity downgrades to warn.
 *  - rule.argv_match.cwd_match_glob — only fires when process.cwd() matches
 *    one of the listed globs (used by DC-42 for worktree-context PR creation).
 */
function evaluateArgvRule(rule, argv, env, cwd) {
  if (rule.inert === true || rule.pattern_alias_of) return null;
  if (!rule.argv_match) return null;
  if (!Array.isArray(argv) || argv.length === 0) return null;

  const am = rule.argv_match;
  const baseEnv = env || process.env || {};
  const baseCwd = (cwd || process.cwd() || '').replace(/\\/g, '/');

  // env_override: when the env var is the literal string 'true', bypass the rule entirely
  if (rule.env_override) {
    const v = baseEnv[rule.env_override];
    if (typeof v === 'string' && v.toLowerCase() === 'true') return null;
  }

  // cwd_match_glob (top-level argv_match): rule only fires when cwd matches one of the globs
  if (Array.isArray(am.cwd_match_glob)) {
    const cwdHit = am.cwd_match_glob.some((g) => globMatch(baseCwd, g));
    if (!cwdHit) return null;
  }

  // ----------------------------------------------------------------
  // DC-33-style force-push handling
  //
  // When the rule declares `lease_flags`, the matcher accepts EITHER a
  // raw force flag (require_any_flag) OR a lease flag, then disambiguates
  // severity:
  //   - raw force flag matched + protected ref          → block
  //   - lease flag matched + protected ref + no force   → warn
  //   - chore/control-plane-* in argv (allow_branch_globs) → bypass
  // ----------------------------------------------------------------
  let severity = rule.severity || 'block';
  let matched;

  if (Array.isArray(am.lease_flags)) {
    // Path A: try raw force (require_any_flag)
    const rawForceHit = Array.isArray(am.require_any_flag) &&
      am.require_any_flag.some((f) =>
        argv.includes(f) || argv.some((a) => a.startsWith(f + '='))
      );
    const leaseHit = am.lease_flags.some((f) =>
      argv.includes(f) || argv.some((a) => a.startsWith(f + '='))
    );
    if (!rawForceHit && !leaseHit) return null;
    // Skeleton clause check (program/subcommand) without require_any_flag,
    // since we already validated force-or-lease above.
    const skeleton = Object.assign({}, am);
    delete skeleton.require_any_flag;
    delete skeleton.lease_flags;
    delete skeleton.protected_refs;
    delete skeleton.protected_ref_globs;
    delete skeleton.allow_branch_globs;
    delete skeleton.any_of;
    if (!evaluateArgvClause(skeleton, argv)) return null;

    if (Array.isArray(am.allow_branch_globs)) {
      const allowed = argv.some((a) =>
        am.allow_branch_globs.some((g) => globMatch(a, g))
      );
      if (allowed) return null;
    }
    if (Array.isArray(am.protected_refs) || Array.isArray(am.protected_ref_globs)) {
      const refHit = argv.some((a) => isProtectedRef(a, am.protected_refs, am.protected_ref_globs));
      if (!refHit) return null;
    }
    severity = rawForceHit ? (rule.severity || 'block') : (rule.warn_severity || 'warn');
    matched = true;
  } else {
    // Standard path
    matched = evaluateArgvMatch(am, argv);
    if (!matched) return null;

    if (Array.isArray(am.allow_branch_globs)) {
      const allowed = argv.some((a) =>
        am.allow_branch_globs.some((g) => globMatch(a, g))
      );
      if (allowed) return null;
    }
    if (Array.isArray(am.protected_refs) || Array.isArray(am.protected_ref_globs)) {
      const refHit = argv.some((a) => isProtectedRef(a, am.protected_refs, am.protected_ref_globs));
      if (!refHit) return null;
    }
  }

  // Sub-clause severity_override (DC-37 gc --aggressive case)
  if (Array.isArray(am.any_of)) {
    for (const sub of am.any_of) {
      if (sub.severity_override && evaluateArgvClause(sub, argv)) {
        // require_any_flag_alt is an explicit pairing — only override if both
        // require_any_flag (in sub) AND require_any_flag_alt are present.
        if (Array.isArray(sub.require_any_flag_alt)) {
          const altHit = sub.require_any_flag_alt.some((f) => argv.includes(f));
          if (altHit) {
            severity = sub.severity_override;
          }
        } else {
          severity = sub.severity_override;
        }
      }
    }
  }

  const reason = rule.reason || `Rule ${rule.id} matched`;
  return { severity, reason };
}

module.exports = {
  loadRulesIntent,
  enrichReasonWithRules,
  classifyReversibility,
  tokenizeCommand,
  globMatch,
  evaluateArgvRule,
  evaluateArgvMatch,
  evaluateArgvClause,
};

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
      const argv = tokenizeCommand(cmd);
      for (const rule of rules.dangerous_commands) {
        try {
          // ----------------------------------------------------------------
          // W0g argv-aware path: if the rule declares `argv_match`, evaluate
          // it against the parsed argv tokens. argv_match is opt-in per rule
          // — legacy `pattern:` rules are dispatched below unchanged.
          // ----------------------------------------------------------------
          if (rule.argv_match) {
            const result = evaluateArgvRule(rule, argv, process.env, process.cwd());
            if (result) {
              const reason = enrichReasonWithRules(result.reason, 'dangerous_commands', rulesIntent);
              logViolation({ type: 'dangerous_command', tool: toolName, command: cmd.slice(0, 200), reason, rule_id: rule.id });
              if (result.severity === 'warn') {
                emit('ask', { reason, command: cmd.slice(0, 200) });
                console.log(JSON.stringify({ decision: 'ask', reason: `DAMAGE CONTROL: ${reason}` }));
                process.exit(0);
              }
              emit('block', { reason, command: cmd.slice(0, 200) });
              process.stderr.write(`DAMAGE CONTROL BLOCKED: ${reason}\nCommand: ${cmd.slice(0, 100)}\n`);
              process.exit(2);
            }
            continue;
          }

          // Skip rules without a pattern (e.g. inert/alias-only rules) so an
          // undefined regex never matches everything (`new RegExp(undefined)`
          // matches the empty string at every position).
          if (!rule.pattern || rule.inert === true || rule.pattern_alias_of) continue;

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
