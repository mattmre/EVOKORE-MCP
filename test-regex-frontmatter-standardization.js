'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const cleanPath = path.resolve(__dirname, 'scripts', 'clean_skills.js');
  const generatePath = path.resolve(__dirname, 'scripts', 'generate_docs.js');
  const canonicalPattern = '/^---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n([\\s\\S]*)$/';

  const cleanScript = fs.readFileSync(cleanPath, 'utf8');
  const generateScript = fs.readFileSync(generatePath, 'utf8');

  assert.ok(cleanScript.includes(canonicalPattern), 'clean_skills.js should use canonical regex literal');
  assert.ok(generateScript.includes(canonicalPattern), 'generate_docs.js should use canonical regex literal');
  assert.doesNotMatch(cleanScript, /new RegExp\('\^---/);

  console.log('Frontmatter regex standardization validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Frontmatter regex standardization validation failed:', error);
  process.exit(1);
}
