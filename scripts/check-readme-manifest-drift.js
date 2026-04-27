#!/usr/bin/env node
/**
 * check-readme-manifest-drift.js
 *
 * CI gate that fails the build if the README's claimed package version or
 * native-tool count drifts from the source-of-truth in package.json and the
 * manager getTools() registrations.
 *
 * Exit codes:
 *   0 - README matches package.json + tool registry
 *   1 - drift detected
 *   2 - script failed to introspect a source file
 *
 * Usage:
 *   node scripts/check-readme-manifest-drift.js
 *
 * Tracking issue: https://github.com/mattmre/EVOKORE-MCP/issues/282
 */

"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const README_PATH = path.join(REPO_ROOT, "README.md");
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, "package.json");

// Source files whose getTools() blocks define the native tool surface.
// Each entry: { file, label }. The script counts top-level `name: "..."`
// entries inside each file's getTools() function body.
const TOOL_SOURCE_FILES = [
  { file: "src/SkillManager.ts", label: "SkillManager" },
  { file: "src/ClaimsManager.ts", label: "ClaimsManager" },
  { file: "src/FleetManager.ts", label: "FleetManager" },
  { file: "src/MemoryManager.ts", label: "MemoryManager" },
  { file: "src/OrchestrationRuntime.ts", label: "OrchestrationRuntime" },
  { file: "src/SessionAnalyticsManager.ts", label: "SessionAnalyticsManager" },
  { file: "src/TelemetryManager.ts", label: "TelemetryManager" },
  { file: "src/WorkerManager.ts", label: "WorkerManager" },
  { file: "src/NavigationAnchorManager.ts", label: "NavigationAnchorManager" },
  { file: "src/PluginManager.ts", label: "PluginManager" },
];

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    console.error(`[manifest-drift] Failed to read ${filePath}: ${err.message}`);
    process.exit(2);
  }
}

/**
 * Returns the substring of `source` that lies between the opening `{` of the
 * `getTools(): Tool[] {` declaration and its matching closing `}`. Returns
 * `null` if no such block exists.
 */
function extractGetToolsBody(source) {
  const declMatch = source.match(/getTools\s*\([^)]*\)\s*:\s*Tool\[\]\s*\{/);
  if (!declMatch) return null;
  const startIdx = declMatch.index + declMatch[0].length;
  let depth = 1;
  for (let i = startIdx; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIdx, i);
      }
    }
  }
  return null;
}

function countToolsInBody(body) {
  // Count entries shaped like `name: "tool_name",` — these are the tool
  // identifier fields. Excludes property descriptors with a "weight" sibling.
  const matches = body.match(/name:\s*["'][a-z][a-z0-9_]+["']/g) || [];
  // Filter out matches that appear adjacent to a `weight:` key (search field
  // weights inside Fuse.js configs use the same shape).
  return matches.filter((match) => {
    const idx = body.indexOf(match);
    const window = body.slice(Math.max(0, idx - 80), idx + 200);
    return !/weight\s*:/.test(window);
  }).length;
}

function loadPackageJson() {
  const raw = readFile(PACKAGE_JSON_PATH);
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[manifest-drift] package.json is not valid JSON: ${err.message}`);
    process.exit(2);
  }
}

function countNativeTools() {
  const perManager = [];
  let total = 0;
  for (const { file, label } of TOOL_SOURCE_FILES) {
    const fullPath = path.join(REPO_ROOT, file);
    const source = readFile(fullPath);
    const body = extractGetToolsBody(source);
    if (body == null) {
      console.error(`[manifest-drift] Could not locate getTools() body in ${file}`);
      process.exit(2);
    }
    const count = countToolsInBody(body);
    perManager.push({ label, count, file });
    total += count;
  }
  return { perManager, total };
}

function main() {
  const pkg = loadPackageJson();
  const expectedVersion = pkg.version;
  const { perManager, total: registryToolCount } = countNativeTools();

  const readme = readFile(README_PATH);
  const errors = [];

  // Version assertion: the README must contain the exact package.json version
  // wrapped in backticks at least once.
  const versionPattern = new RegExp(
    `\`${expectedVersion.replace(/\./g, "\\.")}\``
  );
  if (!versionPattern.test(readme)) {
    errors.push(
      `README does not mention package version \`${expectedVersion}\`. ` +
        `Update README.md to reflect the current package.json version.`
    );
  }

  // Tool-count assertion: the README must mention the registry's tool count
  // at least once. The expected phrasing is e.g. "36 native tools".
  const countPattern = new RegExp(
    `\\b${registryToolCount}\\s+native\\s+tools?\\b`,
    "i"
  );
  if (!countPattern.test(readme)) {
    errors.push(
      `README does not state the current native-tool count of ${registryToolCount}. ` +
        `Tool registry breakdown:\n` +
        perManager
          .map((m) => `    - ${m.label}: ${m.count}`)
          .join("\n") +
        `\nUpdate README.md to mention "${registryToolCount} native tools".`
    );
  }

  if (errors.length > 0) {
    console.error("");
    console.error("[manifest-drift] README is out of sync with the source of truth:");
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    console.error("");
    console.error(
      "[manifest-drift] Tracking issue: https://github.com/mattmre/EVOKORE-MCP/issues/282"
    );
    process.exit(1);
  }

  console.log(
    `[manifest-drift] OK — README claims version \`${expectedVersion}\` and ` +
      `${registryToolCount} native tools, both match source of truth.`
  );
}

main();
