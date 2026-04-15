#!/usr/bin/env node
'use strict';

/**
 * seed-nav-anchors.js
 *
 * Pre-seeds @AI:NAV anchor comments in key EVOKORE-MCP source files so that
 * downstream Claude sessions can use nav_get_map / nav_read_anchor to navigate
 * them without re-reading the whole file.
 *
 * Usage:
 *   node scripts/seed-nav-anchors.js            # write anchors in place
 *   node scripts/seed-nav-anchors.js --dry-run  # print planned edits only
 *   node scripts/seed-nav-anchors.js --file <abs-path>  # seed a single file
 *
 * Anchor syntax (from src/NavigationAnchorManager.ts):
 *   // @AI:NAV[SEC:id] description
 *   // @AI:NAV[END:id]
 *   // @AI:NAV[INS:id] description
 *
 * Idempotent: if a file already contains any @AI:NAV marker, it is skipped.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const NAV_MARKER = '@AI:NAV';

// -----------------------------------------------------------------------------
// Target files — kept short and intentional so the corpus stays auditable.
// -----------------------------------------------------------------------------
const TARGETS = [
  path.join(REPO_ROOT, 'src', 'SessionManifest.ts'),
  path.join(REPO_ROOT, 'src', 'ClaimsManager.ts'),
  path.join(REPO_ROOT, 'src', 'NavigationAnchorManager.ts'),
  path.join(REPO_ROOT, 'scripts', 'hooks', 'purpose-gate.js'),
  path.join(REPO_ROOT, 'scripts', 'hooks', 'damage-control.js'),
  // Extended stretch targets — included when they exist so operators can run a
  // broader seed pass without editing this script.
  path.join(REPO_ROOT, 'src', 'index.ts'),
  path.join(REPO_ROOT, 'src', 'ProxyManager.ts'),
  path.join(REPO_ROOT, 'src', 'SessionIsolation.ts'),
  path.join(REPO_ROOT, 'src', 'SkillManager.ts'),
  path.join(REPO_ROOT, 'src', 'HttpServer.ts'),
  path.join(REPO_ROOT, 'scripts', 'session-continuity.js'),
];

// -----------------------------------------------------------------------------
// Structural analysis — simple regex-based section detection. Good enough for
// the target corpus; we intentionally avoid TS compiler API to keep the script
// single-process and dependency-free.
// -----------------------------------------------------------------------------

function detectLineEnding(source) {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

function splitLines(source) {
  // Preserve line-ending style for rejoin.
  const eol = detectLineEnding(source);
  const lines = source.split(eol);
  return { lines, eol };
}

function hasExistingAnchors(source) {
  return source.indexOf(NAV_MARKER) !== -1;
}

function makeKebabId(raw) {
  return String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'section';
}

/**
 * Find contiguous import ranges at the top of a file (TS/JS ESM-ish).
 * Returns { start, end } 0-indexed line numbers, or null.
 */
function findImportBlock(lines) {
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*') ||
        trimmed.startsWith('*') || trimmed.startsWith('*/') || trimmed.startsWith('#!')) {
      continue;
    }
    const isImport =
      /^import\s/.test(trimmed) ||
      /^const\s+\{?[^=]+=\s*require\(/.test(trimmed) ||
      /^const\s+\w+\s*=\s*require\(/.test(trimmed) ||
      /^'use strict'/.test(trimmed) ||
      /^"use strict"/.test(trimmed);
    if (isImport) {
      if (start === -1) start = i;
      end = i;
    } else if (start !== -1) {
      // First non-blank/comment/import terminates the block.
      break;
    }
  }
  if (start === -1) return null;
  return { start, end };
}

/**
 * Find the first `export class|function|async function` declaration and
 * attempt to locate its matching closing brace by tracking brace depth.
 * Returns a list of sections: { id, description, start, end }.
 */
function findTopLevelDeclarations(lines) {
  const sections = [];
  const declRegex = /^(export\s+)?(?:default\s+)?(class|function|async\s+function|interface)\s+([A-Za-z0-9_]+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(declRegex);
    if (!m) continue;
    const kind = m[2].replace(/\s+/g, '-');
    const name = m[3];
    // Find opening brace (may be on same line or following line).
    let openLine = -1;
    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
      if (lines[j].includes('{')) {
        openLine = j;
        break;
      }
    }
    if (openLine === -1) continue;
    // Count braces from openLine forward until depth returns to 0.
    // We require `maxDepth >= 1` before accepting a 0 so that `{}` default
    // parameters on the signature line do not prematurely terminate.
    let depth = 0;
    let maxDepth = 0;
    let endLine = -1;
    for (let k = openLine; k < lines.length; k++) {
      const l = stripStringsAndComments(lines[k]);
      for (const ch of l) {
        if (ch === '{') {
          depth++;
          if (depth > maxDepth) maxDepth = depth;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && maxDepth >= 1 && k > openLine) { endLine = k; break; }
        }
      }
      if (endLine !== -1) break;
    }
    if (endLine === -1) continue;

    sections.push({
      id: makeKebabId(`${kind}-${name}`),
      description: `${m[2].trim()} ${name}`,
      start: i,
      end: endLine,
    });
    // Skip past this declaration to avoid nested accidents.
    i = endLine;
  }
  return sections;
}

/**
 * Strip string literals and line/block comments (lightweight) so brace
 * counting does not trip on `"}"` or `// }` style content.
 */
function stripStringsAndComments(line) {
  let out = '';
  let inStr = null; // '"' | "'" | '`'
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '/' && next === '/') break; // line comment — ignore rest
    if (ch === '/' && next === '*') {
      // Skip block comment inline.
      const close = line.indexOf('*/', i + 2);
      if (close === -1) return out; // runs to EOL
      i = close + 1;
      continue;
    }
    out += ch;
  }
  return out;
}

// -----------------------------------------------------------------------------
// Plan builder — produces an ordered list of {lineIndex, insertAbove, text}
// edits. Edits are applied bottom-up so earlier line indices stay valid.
// -----------------------------------------------------------------------------

function buildPlanForTS(lines) {
  const edits = [];
  const importBlock = findImportBlock(lines);
  if (importBlock && importBlock.end > importBlock.start) {
    edits.push({
      lineIndex: importBlock.start,
      insertBefore: true,
      text: `// @AI:NAV[SEC:imports] Import declarations`,
    });
    edits.push({
      lineIndex: importBlock.end,
      insertBefore: false,
      text: `// @AI:NAV[END:imports]`,
    });
  }

  const decls = findTopLevelDeclarations(lines);
  // Deduplicate ids.
  const usedIds = new Set(['imports']);
  for (const d of decls) {
    let id = d.id;
    let suffix = 1;
    while (usedIds.has(id)) {
      suffix++;
      id = `${d.id}-${suffix}`;
    }
    usedIds.add(id);
    edits.push({
      lineIndex: d.start,
      insertBefore: true,
      text: `// @AI:NAV[SEC:${id}] ${d.description}`,
    });
    edits.push({
      lineIndex: d.end,
      insertBefore: false,
      text: `// @AI:NAV[END:${id}]`,
    });
  }

  return edits;
}

function buildPlanForJSHook(lines) {
  const edits = [];
  const importBlock = findImportBlock(lines);
  if (importBlock && importBlock.end > importBlock.start) {
    edits.push({
      lineIndex: importBlock.start,
      insertBefore: true,
      text: `// @AI:NAV[SEC:requires] Module requires and constants`,
    });
    edits.push({
      lineIndex: importBlock.end,
      insertBefore: false,
      text: `// @AI:NAV[END:requires]`,
    });
  }

  // For hook scripts we mark top-level `function NAME(` definitions too.
  const fnRegex = /^function\s+([A-Za-z0-9_]+)\s*\(/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(fnRegex);
    if (!m) continue;
    const name = m[1];
    // Find matching closing brace.
    let openLine = -1;
    for (let j = i; j < Math.min(i + 3, lines.length); j++) {
      if (lines[j].includes('{')) { openLine = j; break; }
    }
    if (openLine === -1) continue;
    let depth = 0;
    let maxDepth = 0;
    let endLine = -1;
    for (let k = openLine; k < lines.length; k++) {
      const l = stripStringsAndComments(lines[k]);
      for (const ch of l) {
        if (ch === '{') {
          depth++;
          if (depth > maxDepth) maxDepth = depth;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && maxDepth >= 1 && k > openLine) { endLine = k; break; }
        }
      }
      if (endLine !== -1) break;
    }
    if (endLine === -1) continue;
    const id = makeKebabId(`fn-${name}`);
    edits.push({
      lineIndex: i,
      insertBefore: true,
      text: `// @AI:NAV[SEC:${id}] function ${name}`,
    });
    edits.push({
      lineIndex: endLine,
      insertBefore: false,
      text: `// @AI:NAV[END:${id}]`,
    });
    i = endLine;
  }

  // Mark the stdin/main dispatch block if we can find it.
  const mainIdx = lines.findIndex((l) => /process\.stdin\.on\(\s*['"]data['"]/.test(l));
  if (mainIdx !== -1) {
    const endIdx = lines.findIndex((l, idx) => idx > mainIdx && /process\.exit\(/.test(l));
    if (endIdx !== -1 && endIdx > mainIdx) {
      edits.push({
        lineIndex: mainIdx,
        insertBefore: true,
        text: `// @AI:NAV[SEC:stdin-main] Stdin event loop — main hook dispatch`,
      });
      edits.push({
        lineIndex: endIdx,
        insertBefore: false,
        text: `// @AI:NAV[END:stdin-main]`,
      });
    }
  }

  return edits;
}

function buildPlan(filePath, lines) {
  if (filePath.endsWith('.ts')) return buildPlanForTS(lines);
  if (filePath.endsWith('.js')) return buildPlanForJSHook(lines);
  return [];
}

/**
 * Apply an edit plan to `lines`. Edits are applied bottom-up so that earlier
 * line indices remain valid as we splice in new rows.
 */
function applyPlan(lines, edits) {
  // Stable sort: by lineIndex desc, with `insertBefore=false` handled before
  // `insertBefore=true` at the same index so that END anchors land below the
  // closing brace and SEC anchors land above the opening line.
  const sorted = edits.slice().sort((a, b) => {
    if (b.lineIndex !== a.lineIndex) return b.lineIndex - a.lineIndex;
    // Same line: apply insertBefore=true edits LAST (higher priority, runs first in reversed iteration).
    return a.insertBefore === b.insertBefore ? 0 : (a.insertBefore ? 1 : -1);
  });
  const out = lines.slice();
  for (const edit of sorted) {
    const pos = edit.insertBefore ? edit.lineIndex : edit.lineIndex + 1;
    out.splice(pos, 0, edit.text);
  }
  return out;
}

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { dryRun: false, files: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') args.dryRun = true;
    else if (a === '--file' && argv[i + 1]) {
      args.files = args.files || [];
      args.files.push(argv[i + 1]);
      i++;
    }
  }
  return args;
}

function processFile(filePath, dryRun) {
  if (!fs.existsSync(filePath)) {
    return { filePath, status: 'missing', edits: 0 };
  }
  const source = fs.readFileSync(filePath, 'utf8');
  if (hasExistingAnchors(source)) {
    return { filePath, status: 'already-seeded', edits: 0 };
  }
  const { lines, eol } = splitLines(source);
  const plan = buildPlan(filePath, lines);
  if (plan.length === 0) {
    return { filePath, status: 'no-sections', edits: 0 };
  }
  const updated = applyPlan(lines, plan);
  const newSource = updated.join(eol);
  if (dryRun) {
    return { filePath, status: 'planned', edits: plan.length, plan };
  }
  fs.writeFileSync(filePath, newSource, 'utf8');
  return { filePath, status: 'seeded', edits: plan.length };
}

function main() {
  const args = parseArgs(process.argv);
  const targets = args.files && args.files.length > 0
    ? args.files.map((f) => path.resolve(f))
    : TARGETS;

  const results = [];
  for (const t of targets) {
    try {
      results.push(processFile(t, args.dryRun));
    } catch (err) {
      results.push({ filePath: t, status: 'error', error: String(err && err.message || err) });
    }
  }

  let seeded = 0;
  let planned = 0;
  let skipped = 0;
  let errors = 0;
  for (const r of results) {
    const rel = path.relative(REPO_ROOT, r.filePath);
    if (r.status === 'seeded') seeded++;
    else if (r.status === 'planned') planned++;
    else if (r.status === 'error') errors++;
    else skipped++;

    if (args.dryRun && r.status === 'planned') {
      console.log(`[plan] ${rel} — ${r.edits} edits`);
      for (const e of r.plan) {
        const where = e.insertBefore ? `before L${e.lineIndex + 1}` : `after L${e.lineIndex + 1}`;
        console.log(`  ${where}: ${e.text}`);
      }
    } else {
      console.log(`[${r.status}] ${rel}${r.edits ? ` — ${r.edits} anchors` : ''}${r.error ? ` — ${r.error}` : ''}`);
    }
  }
  console.log(`\nSummary: seeded=${seeded} planned=${planned} skipped=${skipped} errors=${errors} (dry-run=${args.dryRun})`);
  if (errors > 0) process.exit(1);
}

// Exports for unit tests
module.exports = {
  TARGETS,
  NAV_MARKER,
  hasExistingAnchors,
  makeKebabId,
  findImportBlock,
  findTopLevelDeclarations,
  buildPlan,
  applyPlan,
  processFile,
};

if (require.main === module) {
  main();
}
