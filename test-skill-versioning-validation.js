'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// ---- load SkillManager from dist ----

const { SkillManager } = require('./dist/SkillManager');

// SkillManager requires a proxyManager in its constructor but loadSkills()
// does not use it. Provide a no-op stub.
const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

test('skill versioning and dependency declarations - source validation', () => {
  const skillMgr = fs.readFileSync(path.resolve(__dirname, 'src/SkillManager.ts'), 'utf8');

  // Check dependency types exist
  assert.match(skillMgr, /SkillDependency/,
    'Expected SkillDependency interface');
  assert.match(skillMgr, /requires\?/,
    'Expected optional requires field');
  assert.match(skillMgr, /conflicts\?/,
    'Expected optional conflicts field');
  assert.match(skillMgr, /version\?.*string/,
    'Expected optional version field of type string');

  // Check version parsing from frontmatter
  assert.match(skillMgr, /frontmatter\?\.version/,
    'Expected version parsing from frontmatter');
  assert.match(skillMgr, /metadata\?\.version/,
    'Expected version fallback from metadata');

  // Check validation method exists
  assert.match(skillMgr, /validateDependencies/,
    'Expected validateDependencies method');
  assert.match(skillMgr, /semverSatisfies/,
    'Expected semverSatisfies helper');

  // Check it reports meaningful errors
  assert.match(skillMgr, /Missing required skill/,
    'Expected missing-dependency error message');
  assert.match(skillMgr, /Conflicts with/,
    'Expected conflict error message');
});

test('skill versioning - semver comparison via validateDependencies', async () => {
  const sm = new SkillManager(mockProxyManager);

  // Inject synthetic skills directly into the cache to test versioning logic
  sm.skillsCache.set('test/base-skill', {
    name: 'base-skill',
    description: 'A base skill',
    category: 'test',
    subcategory: '',
    declaredCategory: 'test',
    tags: [],
    aliases: [],
    resolutionHints: [],
    metadata: {},
    metadataText: '',
    searchableText: '',
    pathDepth: 0,
    filePath: '/fake/base-skill/SKILL.md',
    content: 'Base skill content',
    version: '2.1.0'
  });

  sm.skillsCache.set('test/dependent-skill', {
    name: 'dependent-skill',
    description: 'Depends on base-skill >= 2.0.0',
    category: 'test',
    subcategory: '',
    declaredCategory: 'test',
    tags: [],
    aliases: [],
    resolutionHints: [],
    metadata: {},
    metadataText: '',
    searchableText: '',
    pathDepth: 0,
    filePath: '/fake/dependent-skill/SKILL.md',
    content: 'Dependent skill content',
    version: '1.0.0',
    requires: [{ name: 'base-skill', minVersion: '2.0.0' }]
  });

  sm.skillsCache.set('test/version-too-old', {
    name: 'version-too-old',
    description: 'Requires base-skill >= 3.0.0',
    category: 'test',
    subcategory: '',
    declaredCategory: 'test',
    tags: [],
    aliases: [],
    resolutionHints: [],
    metadata: {},
    metadataText: '',
    searchableText: '',
    pathDepth: 0,
    filePath: '/fake/version-too-old/SKILL.md',
    content: 'Version too old content',
    version: '1.0.0',
    requires: [{ name: 'base-skill', minVersion: '3.0.0' }]
  });

  sm.skillsCache.set('test/missing-dep', {
    name: 'missing-dep',
    description: 'Requires a skill that does not exist',
    category: 'test',
    subcategory: '',
    declaredCategory: 'test',
    tags: [],
    aliases: [],
    resolutionHints: [],
    metadata: {},
    metadataText: '',
    searchableText: '',
    pathDepth: 0,
    filePath: '/fake/missing-dep/SKILL.md',
    content: 'Missing dep content',
    version: '1.0.0',
    requires: [{ name: 'nonexistent-skill' }]
  });

  sm.skillsCache.set('test/conflict-skill', {
    name: 'conflict-skill',
    description: 'Conflicts with base-skill',
    category: 'test',
    subcategory: '',
    declaredCategory: 'test',
    tags: [],
    aliases: [],
    resolutionHints: [],
    metadata: {},
    metadataText: '',
    searchableText: '',
    pathDepth: 0,
    filePath: '/fake/conflict-skill/SKILL.md',
    content: 'Conflict skill content',
    version: '1.0.0',
    conflicts: ['base-skill']
  });

  sm.skillsCache.set('test/clean-skill', {
    name: 'clean-skill',
    description: 'No deps at all',
    category: 'test',
    subcategory: '',
    declaredCategory: 'test',
    tags: [],
    aliases: [],
    resolutionHints: [],
    metadata: {},
    metadataText: '',
    searchableText: '',
    pathDepth: 0,
    filePath: '/fake/clean-skill/SKILL.md',
    content: 'Clean skill content',
    version: '1.0.0'
  });

  // ----------------------------------------------------------------
  // Case 1: dependency satisfied (base-skill 2.1.0 >= 2.0.0)
  // ----------------------------------------------------------------
  const result1 = sm.validateDependencies('dependent-skill');
  assert.ok(result1.valid,
    'Expected dependent-skill to pass validation. Errors: ' + result1.errors.join(', '));
  assert.strictEqual(result1.errors.length, 0,
    'Expected no errors for satisfied dependency');

  // ----------------------------------------------------------------
  // Case 2: version too low (base-skill 2.1.0 < 3.0.0)
  // ----------------------------------------------------------------
  const result2 = sm.validateDependencies('version-too-old');
  assert.ok(!result2.valid,
    'Expected version-too-old to fail validation');
  assert.ok(result2.errors.some(e => e.includes('base-skill') && e.includes('< required')),
    'Expected version mismatch error. Got: ' + result2.errors.join(', '));

  // ----------------------------------------------------------------
  // Case 3: missing dependency
  // ----------------------------------------------------------------
  const result3 = sm.validateDependencies('missing-dep');
  assert.ok(!result3.valid,
    'Expected missing-dep to fail validation');
  assert.ok(result3.errors.some(e => e.includes('Missing required skill')),
    'Expected missing-skill error. Got: ' + result3.errors.join(', '));

  // ----------------------------------------------------------------
  // Case 4: conflict detected
  // ----------------------------------------------------------------
  const result4 = sm.validateDependencies('conflict-skill');
  assert.ok(!result4.valid,
    'Expected conflict-skill to fail validation');
  assert.ok(result4.errors.some(e => e.includes('Conflicts with')),
    'Expected conflict error. Got: ' + result4.errors.join(', '));

  // ----------------------------------------------------------------
  // Case 5: clean skill with no deps
  // ----------------------------------------------------------------
  const result5 = sm.validateDependencies('clean-skill');
  assert.ok(result5.valid,
    'Expected clean-skill to pass validation');
  assert.strictEqual(result5.errors.length, 0,
    'Expected no errors for skill without deps');

  // ----------------------------------------------------------------
  // Case 6: nonexistent skill
  // ----------------------------------------------------------------
  const result6 = sm.validateDependencies('totally-nonexistent');
  assert.ok(!result6.valid,
    'Expected nonexistent skill to fail validation');
  assert.ok(result6.errors.some(e => e.includes('Skill not found')),
    'Expected skill-not-found error. Got: ' + result6.errors.join(', '));
});

test('skill versioning - frontmatter parsing with version and deps', async () => {
  const sm = new SkillManager(mockProxyManager);
  await sm.loadSkills();

  // Verify existing skills without versioning fields still load correctly
  const cache = sm.skillsCache;
  assert.ok(cache.size > 0,
    'Expected skills to be indexed after loadSkills()');

  // All skills should have name, description, category (backwards compatibility)
  for (const [key, skill] of cache) {
    assert.ok(skill.name && skill.name.length > 0,
      'Skill "' + key + '" has empty name after versioning changes');
    assert.ok(skill.description && skill.description.length > 0,
      'Skill "' + key + '" has empty description after versioning changes');
    assert.ok(skill.category && skill.category.length > 0,
      'Skill "' + key + '" has empty category after versioning changes');
  }

  // version, requires, conflicts should be undefined/missing for skills without them
  // (they are optional and only set when present in frontmatter)
  let withVersion = 0;
  let withRequires = 0;
  let withConflicts = 0;
  for (const skill of cache.values()) {
    if (skill.version) withVersion++;
    if (skill.requires && skill.requires.length > 0) withRequires++;
    if (skill.conflicts && skill.conflicts.length > 0) withConflicts++;
  }

  // Log counts for visibility (these are expected to be 0 for existing skills
  // since no skills currently use the new fields, but parsing should not break)
  console.log('Skills with version: ' + withVersion + '/' + cache.size);
  console.log('Skills with requires: ' + withRequires + '/' + cache.size);
  console.log('Skills with conflicts: ' + withConflicts + '/' + cache.size);
});

test('skill versioning - get_skill_help includes version info', async () => {
  const Fuse = require('fuse.js');
  const sm = new SkillManager(mockProxyManager);

  // Inject a synthetic skill with version and deps
  sm.skillsCache.set('test/versioned-skill', {
    name: 'versioned-skill',
    description: 'A skill with version info',
    category: 'test',
    subcategory: '',
    declaredCategory: 'test',
    tags: [],
    aliases: [],
    resolutionHints: [],
    metadata: {},
    metadataText: '',
    searchableText: '',
    pathDepth: 0,
    filePath: '/fake/versioned-skill/SKILL.md',
    content: 'Versioned skill content here.',
    version: '1.5.0',
    requires: [{ name: 'dep-skill', minVersion: '1.0.0' }],
    conflicts: ['old-skill']
  });

  // Build a minimal Fuse index so handleToolCall does not call loadSkills()
  // (which would wipe the synthetic cache)
  sm.fuseIndex = new Fuse(Array.from(sm.skillsCache.values()), {
    keys: [{ name: 'name', weight: 1 }],
    threshold: 0.4
  });

  const helpResult = await sm.handleToolCall('get_skill_help', { skill_name: 'versioned-skill' });
  const helpText = helpResult.content[0].text;

  assert.ok(helpText.includes('Version:') && helpText.includes('1.5.0'),
    'Expected get_skill_help to show version. Got: ' + helpText.substring(0, 300));
  assert.ok(helpText.includes('Requires:') && helpText.includes('dep-skill'),
    'Expected get_skill_help to show requires. Got: ' + helpText.substring(0, 300));
  assert.ok(helpText.includes('Conflicts:') && helpText.includes('old-skill'),
    'Expected get_skill_help to show conflicts. Got: ' + helpText.substring(0, 300));
  assert.ok(helpText.includes('Dependency Warnings'),
    'Expected dependency warnings for unmet dep. Got: ' + helpText.substring(0, 500));
});

test('skill versioning - getSkillHelpText includes version info', () => {
  const sm = new SkillManager(mockProxyManager);

  sm.skillsCache.set('test/v-skill', {
    name: 'v-skill',
    description: 'Versioned skill',
    category: 'test',
    subcategory: '',
    declaredCategory: 'test',
    tags: [],
    aliases: [],
    resolutionHints: [],
    metadata: {},
    metadataText: '',
    searchableText: '',
    pathDepth: 0,
    filePath: '/fake/v-skill/SKILL.md',
    content: 'V skill content.',
    version: '3.2.1',
    requires: [{ name: 'other' }],
    conflicts: ['legacy']
  });

  const text = sm.getSkillHelpText('v-skill');

  assert.ok(text.includes('Version: 3.2.1'),
    'Expected getSkillHelpText to include version');
  assert.ok(text.includes('Requires: other'),
    'Expected getSkillHelpText to include requires');
  assert.ok(text.includes('Conflicts: legacy'),
    'Expected getSkillHelpText to include conflicts');
});
