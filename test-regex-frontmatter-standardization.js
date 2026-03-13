'use strict';


const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('frontmatter regex standardization validation', () => {
  const cleanPath = path.resolve(__dirname, 'scripts', 'clean_skills.js');
  const generatePath = path.resolve(__dirname, 'scripts', 'generate_docs.js');
  const skillManagerPath = path.resolve(__dirname, 'src', 'SkillManager.ts');
  const canonicalPattern = '/^---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n([\\s\\S]*)$/';

  const cleanScript = fs.readFileSync(cleanPath, 'utf8');
  const generateScript = fs.readFileSync(generatePath, 'utf8');
  const skillManagerScript = fs.readFileSync(skillManagerPath, 'utf8');

  assert.ok(cleanScript.includes(canonicalPattern), 'clean_skills.js should use canonical regex literal');
  assert.ok(generateScript.includes(canonicalPattern), 'generate_docs.js should use canonical regex literal');
  assert.ok(skillManagerScript.includes(canonicalPattern), 'SkillManager.ts should use canonical regex literal');
  assert.doesNotMatch(cleanScript, /new RegExp\('\^---/);
});
