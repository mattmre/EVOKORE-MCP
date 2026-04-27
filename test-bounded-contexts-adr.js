'use strict';

/**
 * Drift-catcher for ADR 0005 — Bounded Contexts of EVOKORE-MCP.
 *
 * The ADR claims a set of "primary modules" (file paths under `src/`) for
 * each bounded context. If any of those modules are renamed or removed
 * without a corresponding ADR update, this test fails.
 *
 * The test parses the ADR's "## Decision" section, extracts every named
 * context heading, and for every back-ticked path that begins with `src/`
 * asserts the file exists.
 *
 * Vitest discovery: this file is at repo root and matches the
 * `test-*.{js,ts}` glob from `vitest.config.ts`. A sibling location at
 * `tests/test-bounded-contexts-adr.js` would NOT be picked up by the
 * current vitest include patterns, so this lives at the root next to the
 * other structural validation scripts.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = __dirname;
const ADR_PATH = path.join(REPO_ROOT, 'docs', 'adr', '0005-bounded-contexts.md');
const ADR_INDEX_PATH = path.join(REPO_ROOT, 'docs', 'adr', 'README.md');

const REQUIRED_SECTIONS = [
  '## Context',
  '## Decision',
  '## Context Map / Relationships',
  '## Consequences',
];

/**
 * Extract the body of the "## Decision" section: everything from the
 * Decision heading up to (but not including) the next top-level heading.
 */
function extractDecisionSection(markdown) {
  const decisionStart = markdown.indexOf('\n## Decision');
  if (decisionStart === -1) {
    throw new Error('ADR is missing a "## Decision" section.');
  }
  const after = markdown.slice(decisionStart + 1);
  // Find the next "## " heading at column 0 after "Decision".
  // Skip the Decision header itself.
  const newlineAfterHeading = after.indexOf('\n');
  const rest = after.slice(newlineAfterHeading + 1);
  const nextHeadingRel = rest.search(/\n## /);
  if (nextHeadingRel === -1) {
    return rest; // Decision is the last section
  }
  return rest.slice(0, nextHeadingRel);
}

/**
 * Pull out every context heading from the Decision section. Contexts use
 * level-3 headings ("### N. Name"). The "Out-of-context" heading is
 * tolerated (and intentionally ignored) since it documents the explicit
 * non-membership of the voice subsystem.
 */
function extractContextHeadings(decisionBody) {
  const headings = [];
  const re = /^###\s+(.+?)\s*$/gm;
  let match;
  while ((match = re.exec(decisionBody)) !== null) {
    headings.push(match[1].trim());
  }
  return headings;
}

/**
 * Walk the Decision body and collect every back-ticked `src/...` path.
 * These are the module-level claims this ADR makes about the codebase.
 */
function extractSrcPaths(decisionBody) {
  const paths = new Set();
  // Allow letters, digits, underscore, hyphen, dot, slash, and asterisk.
  // Asterisks are filtered out below (they document patterns like
  // `src/stt/*.ts`, not concrete files).
  const re = /`(src\/[A-Za-z0-9_./\-*]+)`/g;
  let match;
  while ((match = re.exec(decisionBody)) !== null) {
    const candidate = match[1];
    if (candidate.includes('*')) {
      continue; // glob pattern, not a single-file claim
    }
    paths.add(candidate);
  }
  return Array.from(paths).sort();
}

test('ADR 0005 (bounded contexts) exists', () => {
  assert.ok(
    fs.existsSync(ADR_PATH),
    `Expected ADR at ${ADR_PATH}. Wave 0c requires this ADR to ship.`
  );
});

test('ADR 0005 declares the required structural sections', () => {
  const adr = fs.readFileSync(ADR_PATH, 'utf8');
  for (const heading of REQUIRED_SECTIONS) {
    assert.ok(
      adr.includes(`\n${heading}`),
      `ADR is missing required heading: ${heading}`
    );
  }
  // Status must be Accepted, not Proposed/TBD.
  assert.match(
    adr,
    /\*\*Status:\*\*\s*Accepted/,
    'ADR 0005 must be marked "Status: Accepted".'
  );
});

test('ADR 0005 names at least five distinct bounded contexts', () => {
  const adr = fs.readFileSync(ADR_PATH, 'utf8');
  const decisionBody = extractDecisionSection(adr);
  const headings = extractContextHeadings(decisionBody);

  // A panel-recommended decomposition is usually 5-8 contexts.
  // Filter out the "Out-of-context" disclosure heading.
  const contexts = headings.filter(
    (h) => !/^out-of-context/i.test(h)
  );
  assert.ok(
    contexts.length >= 5,
    `Expected at least 5 named bounded contexts in "## Decision", found ${contexts.length}: ${JSON.stringify(contexts)}`
  );
});

test('every src/ module path the ADR claims actually exists', () => {
  const adr = fs.readFileSync(ADR_PATH, 'utf8');
  const decisionBody = extractDecisionSection(adr);
  const claimedPaths = extractSrcPaths(decisionBody);

  // Sanity check: a non-trivial ADR should claim at least 10 modules.
  assert.ok(
    claimedPaths.length >= 10,
    `ADR claims only ${claimedPaths.length} src/ modules — expected at least 10. Did the parser break?`
  );

  const missing = [];
  for (const claimed of claimedPaths) {
    const abs = path.join(REPO_ROOT, claimed);
    if (!fs.existsSync(abs)) {
      missing.push(claimed);
    }
  }
  assert.deepStrictEqual(
    missing,
    [],
    `ADR 0005 claims modules that do not exist on disk. Update the ADR or restore the modules:\n  ${missing.join('\n  ')}`
  );
});

test('docs/adr/README.md indexes ADR 0005', () => {
  assert.ok(
    fs.existsSync(ADR_INDEX_PATH),
    `Expected ADR index at ${ADR_INDEX_PATH}.`
  );
  const index = fs.readFileSync(ADR_INDEX_PATH, 'utf8');
  assert.match(
    index,
    /0005-bounded-contexts\.md/,
    'docs/adr/README.md must link to 0005-bounded-contexts.md.'
  );
});
