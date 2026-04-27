'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT_PATH = path.resolve(__dirname, 'scripts', 'validate-issue-metadata.js');
const ADR_PATH = path.resolve(__dirname, 'docs', 'adr', '0006-triage-state-machine.md');
const SKILL_PATH = path.resolve(
  __dirname,
  'SKILLS',
  'PROJECT MANAGEMENT',
  'github-triage',
  'SKILL.md'
);

function runValidator(args, opts = {}) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: 'utf-8',
    cwd: __dirname,
    env: { ...process.env, ...(opts.env || {}) }
  });
}

function withTempDir(label, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
  try {
    return body(dir);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

function writeFixture(dir, name, payload) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(payload), 'utf-8');
  return p;
}

test('validator script syntax-checks via node --check', () => {
  const result = spawnSync(process.execPath, ['--check', SCRIPT_PATH], {
    encoding: 'utf-8'
  });
  assert.strictEqual(
    result.status,
    0,
    `Validator failed --check.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
  );
});

test('clean fixture exits 0', () => {
  withTempDir('issue-meta-clean', (dir) => {
    const briefsDir = path.join(dir, 'briefs');
    fs.mkdirSync(briefsDir);
    fs.writeFileSync(
      path.join(briefsDir, '42.md'),
      '# Agent Brief: Issue #42\n',
      'utf-8'
    );

    const fixture = writeFixture(dir, 'issues.json', [
      { number: 1, title: 'fresh issue', labels: [{ name: 'triage:new' }] },
      {
        number: 42,
        title: 'ready for agent',
        labels: [{ name: 'triage:ready-for-agent' }]
      },
      {
        number: 99,
        title: 'closed-out',
        labels: [{ name: 'triage:wontfix' }]
      }
    ]);

    const result = runValidator([
      '--fixture',
      fixture,
      '--briefs-dir',
      briefsDir,
      '--json'
    ]);
    assert.strictEqual(
      result.status,
      0,
      `Expected clean fixture to exit 0.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
    );
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.violations.length, 0);
    assert.strictEqual(parsed.count, 3);
  });
});

test('missing triage label is flagged', () => {
  withTempDir('issue-meta-missing', (dir) => {
    const briefsDir = path.join(dir, 'briefs');
    fs.mkdirSync(briefsDir);
    const fixture = writeFixture(dir, 'issues.json', [
      { number: 7, title: 'no-label', labels: [{ name: 'bug' }] }
    ]);
    const result = runValidator([
      '--fixture',
      fixture,
      '--briefs-dir',
      briefsDir,
      '--json'
    ]);
    assert.strictEqual(result.status, 1);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.ok, false);
    assert.strictEqual(parsed.violations.length, 1);
    assert.strictEqual(parsed.violations[0].type, 'missing-triage-label');
    assert.strictEqual(parsed.violations[0].issue, 7);
  });
});

test('multiple triage labels are flagged', () => {
  withTempDir('issue-meta-multi', (dir) => {
    const briefsDir = path.join(dir, 'briefs');
    fs.mkdirSync(briefsDir);
    const fixture = writeFixture(dir, 'issues.json', [
      {
        number: 8,
        title: 'two-labels',
        labels: [{ name: 'triage:new' }, { name: 'triage:investigating' }]
      }
    ]);
    const result = runValidator([
      '--fixture',
      fixture,
      '--briefs-dir',
      briefsDir,
      '--json'
    ]);
    assert.strictEqual(result.status, 1);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.violations[0].type, 'multiple-triage-labels');
    assert.deepStrictEqual(
      parsed.violations[0].labels.sort(),
      ['triage:investigating', 'triage:new']
    );
  });
});

test('ready-for-agent without brief is flagged', () => {
  withTempDir('issue-meta-no-brief', (dir) => {
    const briefsDir = path.join(dir, 'briefs');
    fs.mkdirSync(briefsDir);
    const fixture = writeFixture(dir, 'issues.json', [
      {
        number: 55,
        title: 'agent-ready missing brief',
        labels: [{ name: 'triage:ready-for-agent' }]
      }
    ]);
    const result = runValidator([
      '--fixture',
      fixture,
      '--briefs-dir',
      briefsDir,
      '--json'
    ]);
    assert.strictEqual(result.status, 1);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.violations[0].type, 'missing-agent-brief');
    assert.strictEqual(parsed.violations[0].issue, 55);
  });
});

test('label string form (not object) is supported', () => {
  withTempDir('issue-meta-str-labels', (dir) => {
    const briefsDir = path.join(dir, 'briefs');
    fs.mkdirSync(briefsDir);
    const fixture = writeFixture(dir, 'issues.json', [
      { number: 9, title: 'string-labels', labels: ['triage:new'] }
    ]);
    const result = runValidator([
      '--fixture',
      fixture,
      '--briefs-dir',
      briefsDir,
      '--json'
    ]);
    assert.strictEqual(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.ok, true);
  });
});

test('ADR-0006 documents the 7-label state machine', () => {
  const text = fs.readFileSync(ADR_PATH, 'utf-8');
  const requiredLabels = [
    'triage:new',
    'triage:investigating',
    'triage:ready-for-agent',
    'triage:needs-architecture',
    'triage:human-review',
    'triage:wontfix',
    'triage:done'
  ];
  for (const label of requiredLabels) {
    assert.ok(
      text.includes(label),
      `ADR-0006 must reference label \`${label}\` (missing).`
    );
  }
  assert.ok(
    /Status:\*{0,2}\s*Accepted/i.test(text),
    'ADR-0006 must be Accepted.'
  );
  assert.ok(
    /transition table/i.test(text),
    'ADR-0006 must contain a transition table.'
  );
});

test('github-triage SKILL.md references the 7 labels and adapter frontmatter', () => {
  const text = fs.readFileSync(SKILL_PATH, 'utf-8');
  assert.ok(
    text.startsWith('---\n'),
    'github-triage SKILL.md must start with YAML frontmatter.'
  );
  assert.ok(
    /upstream:\s*mattpocock\/skills/.test(text),
    'github-triage SKILL.md must declare upstream provenance.'
  );
  assert.ok(
    /upstream-sha:\s*90ea8eec03d4ae8f43427aaf6fe4722653561a42/.test(text),
    'github-triage SKILL.md must pin upstream-sha to the vendored commit.'
  );
  const requiredLabels = [
    'triage:new',
    'triage:investigating',
    'triage:ready-for-agent',
    'triage:needs-architecture',
    'triage:human-review',
    'triage:wontfix',
    'triage:done'
  ];
  for (const label of requiredLabels) {
    assert.ok(
      text.includes(label),
      `github-triage SKILL.md must reference \`${label}\`.`
    );
  }
});
