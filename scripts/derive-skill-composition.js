#!/usr/bin/env node
/**
 * derive-skill-composition.js
 *
 * Build-time scanner that derives a skill composition graph from
 * SKILL.md files under SKILLS/. Outputs `skill-graph.json` describing
 * direct + transitive composition edges between skills, plus a parsed
 * "Mandatory Injection Points" allowlist scraped from
 * `SKILLS/ORCHESTRATION FRAMEWORK/panel-of-experts/SKILL.md`.
 *
 * The graph is consumed by SkillManager.execute_skill to populate a
 * `nextSteps[]` field that the index runtime auto-activates in the
 * caller's session.
 *
 * Flags:
 *   --validate   Exit non-zero when cycles are detected.
 *   --quiet      Suppress informational stderr output (CI mode).
 *   --out PATH   Override the output JSON path. Defaults to repo-root
 *                `skill-graph.json`.
 *
 * The implementation is read-only: it never modifies SKILL.md files,
 * never adds frontmatter, and never mutates the panel-of-experts
 * SKILL.md (per Sprint 2.x panel D guidance — `composes:` frontmatter
 * was an explicit context-rot trap and is not used).
 */

"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(REPO_ROOT, "SKILLS");
const PANEL_SKILL_REL = path.join(
  "SKILLS",
  "ORCHESTRATION FRAMEWORK",
  "panel-of-experts",
  "SKILL.md"
);

// Source skills whose nextSteps[] expansions follow transitive edges.
// Anything outside this allowlist stops at direct edges only.
//
// Wave 0d-f extension (2026-04-27): the ADAPT chain
// `to-prd -> to-issues -> tdd -> pr-manager` and the bug-triage flow
// `triage-bug -> ...` are now allowlisted source skills so their
// nextSteps[] expansions traverse the multi-hop chain instead of
// stopping at the first direct edge. Cycle-rejection-on-insert keeps
// these new sources from poisoning the graph if a future SKILL.md
// introduces a back-edge.
const TRANSITIVE_CLOSE_EXPAND = new Set([
  "release-readiness",
  "repo-ingestor",
  "docs-architect",
  "orch-review",
  "orch-plan",
  "tool-governance",
  "orch-refactor",
  // Wave 0d-f additions:
  "to-issues",
  "tdd",
  "pr-manager",
  "triage-bug"
]);

// Cap the BFS expansion depth even within the allowlist.
const MAX_DEPTH = 5;

// Wave 0d-f token-cost heuristic. Approximates token cost of a SKILL.md
// body using a 4-chars-per-token heuristic, capped at TOKEN_COST_MAX so
// single pathological skills cannot dominate the soft budget. Consumers
// (src/index.ts) use this to skip auto-activations that would blow the
// active discovery profile's token budget.
const TOKEN_COST_CHARS_PER_TOKEN = 4;
const TOKEN_COST_MAX = 50000;

// Skip scanning these directory names anywhere under SKILLS/.
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  "__tests__",
  ".claude",
  "themes",
  "assets",
  "scripts"
]);

// Common English words that follow `invoke|run|use|call ... skill`
// patterns but are not actual skill names. Filtered out before edge
// emission so we don't pollute the graph with grammatical noise.
const STOPWORD_TARGETS = new Set([
  "the",
  "a",
  "an",
  "this",
  "that",
  "these",
  "those",
  "it",
  "your",
  "our",
  "any",
  "some",
  "all",
  "every",
  "each",
  "no",
  "not",
  "and",
  "or",
  "with",
  "without",
  "via",
  "from",
  "to",
  "for",
  "of",
  "in",
  "on",
  "at",
  "by"
]);

function parseArgs(argv) {
  const opts = { validate: false, quiet: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--validate") opts.validate = true;
    else if (arg === "--quiet") opts.quiet = true;
    else if (arg === "--out") {
      opts.out = argv[++i];
    } else if (arg.startsWith("--out=")) {
      opts.out = arg.slice("--out=".length);
    }
  }
  return opts;
}

function logInfo(quiet, msg) {
  if (!quiet) {
    console.error(msg);
  }
}

/**
 * Recursively walk SKILLS/ collecting every SKILL.md file.
 * Returns an array of absolute file paths.
 */
function findSkillFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * Parse YAML frontmatter to extract the canonical skill `name` field.
 * Falls back to the parent directory name if frontmatter parsing fails
 * or no `name:` line is present.
 */
function getSkillName(filePath, content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const nameMatch = fm.match(/^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m);
    if (nameMatch) {
      return nameMatch[1].trim();
    }
  }
  return path.basename(path.dirname(filePath));
}

/**
 * Locate the "## Injection Points" / "### Mandatory Injection Points"
 * section in panel-of-experts/SKILL.md by header search (NOT line
 * numbers). Returns the table region as a string, or null if no
 * heading containing the word "injection" is found.
 */
function extractInjectionSection(content) {
  const lines = content.split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,6}\s+.*injection/i.test(line)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return null;

  // Read until the next heading at the same or higher level, or EOF.
  const startHeading = lines[startIdx];
  const startLevelMatch = startHeading.match(/^(#{1,6})\s+/);
  const startLevel = startLevelMatch ? startLevelMatch[1].length : 2;

  const collected = [lines[startIdx]];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= startLevel) {
      break;
    }
    collected.push(lines[i]);
  }
  return collected.join("\n");
}

/**
 * Parse the Mandatory Injection Points table out of the section text.
 * The table's first column is a backtick-wrapped skill identifier.
 * Returns a deduped array of skill names.
 */
function parseMandatoryInjectionPoints(sectionText) {
  if (!sectionText) return [];
  const lines = sectionText.split(/\r?\n/);
  let inMandatory = false;
  const found = new Set();
  for (const line of lines) {
    if (/^#{1,6}\s+.*mandatory/i.test(line)) {
      inMandatory = true;
      continue;
    }
    // Stop the mandatory subsection at the next markdown heading.
    if (inMandatory && /^#{1,6}\s+/.test(line)) {
      break;
    }
    if (!inMandatory) continue;
    // Match the leading backticked skill name in a markdown table row.
    // Tolerate parenthetical qualifiers between the closing backtick
    // and the next pipe, e.g. "| `orch-review` (risk-triggered) |".
    const m = line.match(/^\|\s*`([^`]+)`[^|]*\|/);
    if (m) {
      const raw = m[1].trim();
      // Strip parenthetical qualifiers like "orch-review (risk-triggered)".
      const bareName = raw.replace(/\s*\(.*\)\s*$/, "").trim();
      // Allow underscores so snake_case native tool names
      // (e.g. `docs_architect`) are not silently dropped.
      if (bareName && /^[a-z0-9][a-z0-9_-]*$/i.test(bareName)) {
        found.add(bareName);
      }
    }
  }
  return Array.from(found);
}

/**
 * Tolerant invocation regex. Matches phrases like:
 *   "invoke release-readiness"
 *   "run the docs-architect skill"
 *   "use `orch-review` skill"
 *   "call **panel-foo** workflow"
 *   "run docs_architect skill"   (snake_case native tools)
 * Captures both kebab-case and snake_case identifiers.
 */
const INVOCATION_RE =
  /(?:invoke|run|use|call)\s+(?:the\s+)?[`*]?([a-z0-9][a-z0-9_-]{2,})[`*]?(?:\s+(?:skill|panel|workflow))/gi;

/**
 * Scan a skill body for invocation references. Returns one entry per
 * match: { target, line }. Line numbers are 1-based and refer to the
 * SKILL.md file as a whole (counting from the very first line, not
 * just the body).
 */
function scanInvocations(content) {
  const matches = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    INVOCATION_RE.lastIndex = 0;
    let m;
    while ((m = INVOCATION_RE.exec(line)) !== null) {
      const candidate = m[1].toLowerCase();
      if (STOPWORD_TARGETS.has(candidate)) continue;
      matches.push({ target: candidate, line: i + 1 });
    }
  }
  return matches;
}

/**
 * Wave 0d-f — DFS reachability check used for cycle-rejection-on-insert.
 * Returns true if `to` is reachable from `from` following the current
 * directed adjacency. Edges that would close a cycle (i.e. inserting
 * `from -> to` when `to` already reaches `from`) are recorded under
 * `_rejected_cycles` rather than emitted into the graph.
 */
function canReach(from, to, adj) {
  if (from === to) return true;
  const visited = new Set();
  const stack = [from];
  while (stack.length > 0) {
    const node = stack.pop();
    if (visited.has(node)) continue;
    visited.add(node);
    const neighbors = adj.get(node) || [];
    for (const n of neighbors) {
      if (n === to) return true;
      if (!visited.has(n)) stack.push(n);
    }
  }
  return false;
}

/**
 * Wave 0d-f — token-cost estimate for a SKILL.md body. Uses a simple
 * chars/4 heuristic and caps at TOKEN_COST_MAX. Returns 0 for empty or
 * non-string content.
 */
function estimateTokenCost(content) {
  if (typeof content !== "string" || content.length === 0) return 0;
  const raw = Math.ceil(content.length / TOKEN_COST_CHARS_PER_TOKEN);
  return Math.min(raw, TOKEN_COST_MAX);
}

/**
 * DFS cycle detector across the direct edge set.
 * Returns an array of cycles (each a `from -> ... -> from` path).
 */
function detectCycles(directAdj) {
  const cycles = [];
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  for (const node of directAdj.keys()) color.set(node, WHITE);

  function dfs(node, stack) {
    color.set(node, GRAY);
    stack.push(node);
    const next = directAdj.get(node) || [];
    for (const neighbor of next) {
      const c = color.get(neighbor) ?? WHITE;
      if (c === GRAY) {
        const cycleStart = stack.indexOf(neighbor);
        if (cycleStart !== -1) {
          cycles.push(stack.slice(cycleStart).concat(neighbor));
        }
      } else if (c === WHITE) {
        if (!color.has(neighbor)) color.set(neighbor, WHITE);
        dfs(neighbor, stack);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const node of directAdj.keys()) {
    if (color.get(node) === WHITE) {
      dfs(node, []);
    }
  }
  return cycles;
}

/**
 * Bounded BFS from a source skill following direct edges, capped at
 * MAX_DEPTH. Returns the set of transitive descendants (excluding the
 * source itself).
 */
function transitiveDescendants(source, directAdj, maxDepth) {
  const seen = new Set([source]);
  const out = new Set();
  let frontier = [source];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next = [];
    for (const node of frontier) {
      const neighbors = directAdj.get(node) || [];
      for (const n of neighbors) {
        if (!seen.has(n)) {
          seen.add(n);
          out.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return out;
}

function buildGraph(rootDir, options) {
  const skillFiles = findSkillFiles(rootDir);
  const knownSkills = new Map(); // skillName -> file
  const fileToSkill = new Map();
  // Wave 0d-f: source-skill token-cost lookup, used to stamp every
  // emitted edge with `tokenCostEstimate` so the runtime can apply soft
  // budget gating without re-reading SKILL.md bodies.
  const sourceTokenCost = new Map();
  for (const file of skillFiles) {
    let content;
    try {
      content = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const name = getSkillName(file, content).toLowerCase();
    if (!knownSkills.has(name)) knownSkills.set(name, file);
    fileToSkill.set(file, { name, content });
    if (!sourceTokenCost.has(name)) {
      sourceTokenCost.set(name, estimateTokenCost(content));
    }
  }

  // Parse the panel-of-experts injection section as a structural anchor.
  const panelPath = path.join(REPO_ROOT, PANEL_SKILL_REL);
  let mandatoryInjectionPoints = [];
  let injectionSectionFound = false;
  if (fs.existsSync(panelPath)) {
    const panelContent = fs.readFileSync(panelPath, "utf-8");
    const section = extractInjectionSection(panelContent);
    if (section) {
      injectionSectionFound = true;
      mandatoryInjectionPoints = parseMandatoryInjectionPoints(section);
    }
  }

  // Direct edges from invocation scanning.
  const directEdges = [];
  const directAdj = new Map();
  const warnings = [];
  const seenEdgeKey = new Set();
  // Wave 0d-f: cycle-rejection-on-insert log. When inserting `from -> to`
  // would close a cycle (i.e. `to` already reaches `from` in the
  // adjacency built so far), the edge is dropped here instead of
  // making it into `directEdges`. The dropped record is surfaced
  // under `_rejected_cycles` so operators can see why an expected edge
  // is missing.
  const rejectedCycles = [];

  for (const [file, info] of fileToSkill.entries()) {
    const sourceName = info.name;
    if (!directAdj.has(sourceName)) directAdj.set(sourceName, []);
    const matches = scanInvocations(info.content);
    for (const { target, line } of matches) {
      // Only keep edges whose target resolves to a known skill, to
      // avoid false-positive matches on prose. Self-edges are dropped.
      if (target === sourceName) continue;
      if (!knownSkills.has(target)) continue;
      const key = `${sourceName}->${target}`;
      if (seenEdgeKey.has(key)) continue;
      // Wave 0d-f: cycle-rejection-on-insert. If the target already
      // reaches the source via existing direct edges, accepting this
      // new edge would close a cycle. Record the rejection and skip.
      if (canReach(target, sourceName, directAdj)) {
        rejectedCycles.push({
          from: sourceName,
          to: target,
          file: path.relative(REPO_ROOT, file).replace(/\\/g, "/"),
          line,
          reason: "would_close_cycle"
        });
        continue;
      }
      seenEdgeKey.add(key);
      directEdges.push({
        from: sourceName,
        to: target,
        file: path.relative(REPO_ROOT, file).replace(/\\/g, "/"),
        line,
        kind: "direct",
        tokenCostEstimate: sourceTokenCost.get(sourceName) ?? 0
      });
      directAdj.get(sourceName).push(target);
    }
  }

  // Cycle detection on the direct adjacency.
  const cycles = detectCycles(directAdj);
  if (cycles.length > 0) {
    for (const c of cycles) {
      warnings.push("Cycle detected: " + c.join(" -> "));
    }
  }

  // Build transitive edges for allowlisted source skills.
  const transitiveEdges = [];
  const transitiveSeen = new Set();
  for (const source of TRANSITIVE_CLOSE_EXPAND) {
    if (!directAdj.has(source)) continue;
    const descendants = transitiveDescendants(source, directAdj, MAX_DEPTH);
    for (const d of descendants) {
      // Skip targets already covered by a direct edge from this source.
      const directKey = `${source}->${d}`;
      if (seenEdgeKey.has(directKey)) continue;
      const key = `t:${source}->${d}`;
      if (transitiveSeen.has(key)) continue;
      transitiveSeen.add(key);
      transitiveEdges.push({
        from: source,
        to: d,
        file: path
          .relative(REPO_ROOT, knownSkills.get(source) || "")
          .replace(/\\/g, "/"),
        line: 0,
        kind: "transitive",
        tokenCostEstimate: sourceTokenCost.get(source) ?? 0
      });
    }
  }

  if (!injectionSectionFound) {
    warnings.push(
      "Could not locate 'Injection Points' heading in " + PANEL_SKILL_REL.replace(/\\/g, "/")
    );
  }

  const graph = {
    generatedAt: new Date().toISOString(),
    sourceCount: knownSkills.size,
    edges: [...directEdges, ...transitiveEdges],
    cycles: cycles.map((c) => ({ path: c })),
    warnings,
    mandatoryInjectionPoints,
    transitiveCloseExpand: Array.from(TRANSITIVE_CLOSE_EXPAND),
    maxDepth: MAX_DEPTH,
    // Wave 0d-f: edges dropped because they would close a cycle on
    // insert. Empty array on a healthy graph.
    _rejected_cycles: rejectedCycles
  };

  return graph;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outPath = opts.out
    ? path.resolve(opts.out)
    : path.join(REPO_ROOT, "skill-graph.json");

  if (!fs.existsSync(SKILLS_DIR)) {
    console.error(
      "[derive-skill-composition] SKILLS/ directory not found at " + SKILLS_DIR
    );
    // Still emit an empty graph so consumers can lazy-load without crashing.
    const empty = {
      generatedAt: new Date().toISOString(),
      sourceCount: 0,
      edges: [],
      cycles: [],
      warnings: ["SKILLS/ directory not found"],
      mandatoryInjectionPoints: [],
      transitiveCloseExpand: Array.from(TRANSITIVE_CLOSE_EXPAND),
      maxDepth: MAX_DEPTH,
      _rejected_cycles: []
    };
    fs.writeFileSync(outPath, JSON.stringify(empty, null, 2) + "\n");
    process.exit(opts.validate ? 1 : 0);
  }

  const graph = buildGraph(SKILLS_DIR, opts);
  fs.writeFileSync(outPath, JSON.stringify(graph, null, 2) + "\n");

  logInfo(
    opts.quiet,
    `[derive-skill-composition] sources=${graph.sourceCount} edges=${graph.edges.length} cycles=${graph.cycles.length} warnings=${graph.warnings.length} -> ${path.relative(REPO_ROOT, outPath).replace(/\\/g, "/")}`
  );

  if (opts.validate && graph.cycles.length > 0) {
    console.error(
      "[derive-skill-composition] FAIL: " + graph.cycles.length + " cycle(s) detected. See skill-graph.json warnings."
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildGraph,
  findSkillFiles,
  extractInjectionSection,
  parseMandatoryInjectionPoints,
  scanInvocations,
  detectCycles,
  transitiveDescendants,
  canReach,
  estimateTokenCost,
  TRANSITIVE_CLOSE_EXPAND,
  MAX_DEPTH,
  TOKEN_COST_CHARS_PER_TOKEN,
  TOKEN_COST_MAX,
  INVOCATION_RE
};
