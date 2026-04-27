#!/usr/bin/env node
'use strict';

/**
 * validate-context-and-adrs.js
 *
 * Wave 3 fold of the mattpocock/skills/domain-model discipline into AEP
 * Phase 1. This validator enforces:
 *
 *   1. Every `docs/adr/NNNN-*.md` (excluding TEMPLATE.md) declares a `Status:`
 *      field with one of {Proposed, Accepted, Deprecated, Superseded}.
 *   2. Every Accepted ADR also declares a `Date:` field (any non-empty value
 *      is accepted; format isn't policed here).
 *   3. The bounded-context source ADR (`0005-bounded-contexts.md`) exists and
 *      its `### N. <Name>` headings are the canonical context list.
 *   4. There is NO repo-root `CONTEXT.md` (anti-pattern: repo-wide glossary).
 *   5. Any `docs/contexts/<slug>/CONTEXT.md` references a context name
 *      present in ADR-0005. Slug-to-name mapping is permissive — we accept
 *      any of: kebab-case slug match against the heading, or the heading
 *      text appearing as the first H1 of the CONTEXT.md.
 *
 * Exit code 0 on success, 1 on any failure. Prints a human-readable
 * summary on success and a numbered failure list on failure.
 *
 * Discipline source: mattpocock/skills (MIT, commit `90ea8eec`). Folded into
 * `SKILLS/ORCHESTRATION FRAMEWORK/aep-framework/phase-1-context-and-decisions.md`.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ADR_DIR = path.join(REPO_ROOT, 'docs', 'adr');
const CONTEXTS_DIR = path.join(REPO_ROOT, 'docs', 'contexts');
const ROOT_CONTEXT = path.join(REPO_ROOT, 'CONTEXT.md');
const BOUNDED_ADR = path.join(ADR_DIR, '0005-bounded-contexts.md');

const ALLOWED_STATUSES = new Set(['Proposed', 'Accepted', 'Deprecated', 'Superseded']);

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

function listAdrFiles() {
  if (!fs.existsSync(ADR_DIR)) {
    return [];
  }
  return fs.readdirSync(ADR_DIR)
    .filter((name) => /^\d{4}-.+\.md$/.test(name))
    .map((name) => path.join(ADR_DIR, name))
    .sort();
}

function listContextFiles() {
  if (!fs.existsSync(CONTEXTS_DIR)) {
    return [];
  }
  const out = [];
  const entries = fs.readdirSync(CONTEXTS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const contextFile = path.join(CONTEXTS_DIR, entry.name, 'CONTEXT.md');
    if (fs.existsSync(contextFile)) {
      out.push({ slug: entry.name, file: contextFile });
    }
  }
  return out;
}

function parseAdrFields(contents) {
  const fields = {};
  // Match either a markdown bold field (**Status:** Accepted) or a plain
  // line (Status: Accepted). Be permissive about leading whitespace.
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*(?:\*\*)?(Status|Date|Deciders|Supersedes)(?:\*\*)?\s*:\s*(.+?)\s*$/);
    if (m) {
      const key = m[1];
      let value = m[2];
      // Strip trailing markdown bolding if any
      value = value.replace(/^\*\*|\*\*$/g, '').trim();
      // Don't overwrite once set (first occurrence wins, matches reader intuition)
      if (!(key in fields)) {
        fields[key] = value;
      }
    }
  }
  return fields;
}

function extractBoundedContextNames(adrContents) {
  if (!adrContents) {
    return [];
  }
  const names = [];
  const re = /^###\s+\d+\.\s+(.+?)\s*$/gm;
  let m;
  while ((m = re.exec(adrContents)) !== null) {
    names.push(m[1].trim());
  }
  return names;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractFirstH1(contents) {
  if (!contents) {
    return null;
  }
  const m = contents.match(/^\s*#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

function main() {
  const failures = [];
  const summary = {
    adrChecked: 0,
    contextsChecked: 0,
    boundedContexts: []
  };

  // (3) Bounded-context source — soft check
  //
  // Wave 3 references but does not depend on PR #301 (ADR-0005). When this
  // PR is merged before #301, ADR-0005 is intentionally absent. We record
  // a warning and skip downstream CONTEXT.md ↔ ADR-0005 alignment checks.
  // Once #301 lands, this branch becomes a hard requirement.
  const boundedContents = readFileSafe(BOUNDED_ADR);
  let boundedNames = [];
  let boundedSlugs = new Set();
  let boundedNameSet = new Set();
  let boundedAdrPresent = boundedContents != null;

  if (!boundedAdrPresent) {
    summary.warnings = summary.warnings || [];
    summary.warnings.push(`Bounded-context ADR not yet present at ${path.relative(REPO_ROOT, BOUNDED_ADR)} (expected from PR #301). Skipping CONTEXT.md ↔ ADR-0005 alignment checks.`);
  } else {
    boundedNames = extractBoundedContextNames(boundedContents);
    if (boundedNames.length === 0) {
      failures.push(`ADR-0005 (${path.relative(REPO_ROOT, BOUNDED_ADR)}) does not declare any "### N. <Name>" bounded-context headings.`);
    }
    boundedSlugs = new Set(boundedNames.map(slugify));
    boundedNameSet = new Set(boundedNames);
  }
  summary.boundedContexts = boundedNames.slice();

  // (1) and (2) ADR Status / Date checks
  const adrFiles = listAdrFiles();
  for (const file of adrFiles) {
    summary.adrChecked += 1;
    const contents = readFileSafe(file);
    const fields = parseAdrFields(contents || '');
    const rel = path.relative(REPO_ROOT, file);

    if (!fields.Status) {
      failures.push(`${rel}: missing "Status:" field.`);
    } else if (!ALLOWED_STATUSES.has(fields.Status)) {
      failures.push(`${rel}: Status "${fields.Status}" is not one of {Proposed, Accepted, Deprecated, Superseded}.`);
    }

    if (fields.Status === 'Accepted' && !fields.Date) {
      failures.push(`${rel}: Status is Accepted but no "Date:" field is present.`);
    }
  }

  // (4) No repo-root CONTEXT.md
  if (fs.existsSync(ROOT_CONTEXT)) {
    failures.push(`A repo-root CONTEXT.md exists at ${path.relative(REPO_ROOT, ROOT_CONTEXT)}. Anti-pattern per phase-1-context-and-decisions.md — use docs/contexts/<slug>/CONTEXT.md instead.`);
  }

  // (5) Per-context CONTEXT.md must reference an ADR-0005 context
  // (only enforceable when ADR-0005 is present)
  const contextFiles = listContextFiles();
  for (const ctx of contextFiles) {
    summary.contextsChecked += 1;
    if (!boundedAdrPresent) {
      continue;
    }
    const contents = readFileSafe(ctx.file);
    const rel = path.relative(REPO_ROOT, ctx.file);
    const heading = extractFirstH1(contents);

    const slugMatches = boundedSlugs.has(ctx.slug);
    const headingMatches = heading != null && (boundedNameSet.has(heading) || boundedSlugs.has(slugify(heading)));

    if (!slugMatches && !headingMatches) {
      failures.push(`${rel}: directory slug "${ctx.slug}" and H1 "${heading || '(missing)'}" do not match any bounded context named in ADR-0005. Allowed contexts: ${boundedNames.join(', ')}.`);
    }
  }

  printResult(failures, summary);
  process.exit(failures.length === 0 ? 0 : 1);
}

function printResult(failures, summary) {
  if (failures.length === 0) {
    console.log('validate-context-and-adrs: OK');
    console.log(`  ADRs checked:           ${summary.adrChecked}`);
    console.log(`  CONTEXT.md files checked: ${summary.contextsChecked}`);
    console.log(`  Bounded contexts (ADR-0005): ${summary.boundedContexts.length}`);
    for (const name of summary.boundedContexts) {
      console.log(`    - ${name}`);
    }
    if (Array.isArray(summary.warnings) && summary.warnings.length > 0) {
      console.log('  Warnings:');
      for (const w of summary.warnings) {
        console.log(`    - ${w}`);
      }
    }
    return;
  }
  console.error('validate-context-and-adrs: FAILED');
  failures.forEach((msg, idx) => {
    console.error(`  ${idx + 1}. ${msg}`);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  parseAdrFields,
  extractBoundedContextNames,
  slugify,
  extractFirstH1,
  ALLOWED_STATUSES
};
