#!/usr/bin/env node
/**
 * validate-issue-metadata.js
 *
 * Enforce the triage state machine invariants from ADR-0006:
 *
 *   1. Every open GitHub issue carries exactly one `triage:*` label.
 *   2. Every issue at `triage:ready-for-agent` has an accompanying
 *      `docs/agent-briefs/<issue-number>.md` file.
 *
 * Exits 0 on clean, 1 on violation.
 *
 * Flags:
 *   --json        Emit machine-readable JSON instead of human text.
 *   --fixture P   Read open-issue list from JSON file at P instead of
 *                 calling `gh issue list`. Used by the test fixture.
 *   --quiet       Suppress informational stderr output.
 *   --briefs-dir  Override the default `docs/agent-briefs/` directory.
 *
 * Default behavior runs:
 *   gh issue list --state open --json number,labels,title --limit 200
 *
 * NOTE: This validator never *applies* labels — it only reports
 * drift. Damage-control DC-43 blocks `gh issue edit --add-label` from
 * agent worktrees unless `EVOKORE_AUTO_LABEL_ISSUES=true`.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_BRIEFS_DIR = path.join(REPO_ROOT, "docs", "agent-briefs");

const TRIAGE_LABEL_RE = /^triage:[a-z][a-z0-9-]*$/;
const READY_FOR_AGENT = "triage:ready-for-agent";

function parseArgs(argv) {
  const opts = {
    json: false,
    fixture: null,
    quiet: false,
    briefsDir: DEFAULT_BRIEFS_DIR
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--fixture") {
      opts.fixture = argv[++i];
    } else if (a.startsWith("--fixture=")) {
      opts.fixture = a.slice("--fixture=".length);
    } else if (a === "--briefs-dir") {
      opts.briefsDir = path.resolve(argv[++i]);
    } else if (a.startsWith("--briefs-dir=")) {
      opts.briefsDir = path.resolve(a.slice("--briefs-dir=".length));
    }
  }
  return opts;
}

/**
 * Fetch the open-issue list. Either reads from a fixture JSON file
 * (for test) or invokes `gh issue list`. Returns an array of
 * `{number, title, labels}` objects, where `labels` is an array of
 * label-name strings.
 */
function fetchIssues({ fixture }) {
  if (fixture) {
    const raw = fs.readFileSync(fixture, "utf-8");
    return normalizeIssues(JSON.parse(raw));
  }

  let stdout;
  try {
    stdout = execFileSync(
      "gh",
      [
        "issue",
        "list",
        "--state",
        "open",
        "--json",
        "number,labels,title",
        "--limit",
        "200"
      ],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (err) {
    const msg = err && err.stderr ? err.stderr.toString() : String(err);
    throw new Error("gh issue list failed: " + msg);
  }
  return normalizeIssues(JSON.parse(stdout));
}

function normalizeIssues(raw) {
  if (!Array.isArray(raw)) {
    throw new Error("issue list payload must be an array");
  }
  return raw.map((issue) => {
    const labels = Array.isArray(issue.labels)
      ? issue.labels.map((l) => (typeof l === "string" ? l : l.name))
      : [];
    return {
      number: issue.number,
      title: issue.title || "",
      labels
    };
  });
}

function validateIssues(issues, briefsDir) {
  const violations = [];
  for (const issue of issues) {
    const triageLabels = issue.labels.filter((l) => TRIAGE_LABEL_RE.test(l));
    if (triageLabels.length === 0) {
      violations.push({
        type: "missing-triage-label",
        issue: issue.number,
        title: issue.title,
        message:
          "Open issue has no `triage:*` label (ADR-0006 invariant 1)"
      });
    } else if (triageLabels.length > 1) {
      violations.push({
        type: "multiple-triage-labels",
        issue: issue.number,
        title: issue.title,
        labels: triageLabels,
        message:
          "Open issue has " +
          triageLabels.length +
          " `triage:*` labels; expected exactly 1"
      });
    }

    if (triageLabels.includes(READY_FOR_AGENT)) {
      const briefPath = path.join(briefsDir, `${issue.number}.md`);
      if (!fs.existsSync(briefPath)) {
        violations.push({
          type: "missing-agent-brief",
          issue: issue.number,
          title: issue.title,
          expectedPath: path.relative(REPO_ROOT, briefPath).replace(/\\/g, "/"),
          message:
            "Issue at `triage:ready-for-agent` is missing its agent brief at " +
            path.relative(REPO_ROOT, briefPath).replace(/\\/g, "/")
        });
      }
    }
  }
  return violations;
}

function formatHuman(issues, violations) {
  const lines = [];
  lines.push(`Inspected ${issues.length} open issue(s).`);
  if (violations.length === 0) {
    lines.push("All ADR-0006 invariants pass. ✓");
    return lines.join("\n");
  }
  lines.push(`Found ${violations.length} violation(s):`);
  for (const v of violations) {
    lines.push(`  - #${v.issue} [${v.type}]: ${v.message}`);
    if (v.title) lines.push(`      title: ${v.title}`);
    if (v.labels) lines.push(`      labels: ${v.labels.join(", ")}`);
  }
  return lines.join("\n");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let issues;
  try {
    issues = fetchIssues(opts);
  } catch (err) {
    process.stderr.write(String(err.message || err) + "\n");
    process.exit(2);
  }
  const violations = validateIssues(issues, opts.briefsDir);
  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        { ok: violations.length === 0, count: issues.length, violations },
        null,
        2
      ) + "\n"
    );
  } else {
    process.stdout.write(formatHuman(issues, violations) + "\n");
  }
  process.exit(violations.length === 0 ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  fetchIssues,
  normalizeIssues,
  validateIssues,
  TRIAGE_LABEL_RE,
  READY_FOR_AGENT,
  DEFAULT_BRIEFS_DIR
};
