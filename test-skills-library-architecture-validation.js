const assert = require("assert");
const { SkillManager } = require("./dist/SkillManager.js");

function findSkill(skills, skillName) {
  return skills.find((skill) => skill.name === skillName);
}

function searchSkills(skillManager, query, limit = 10) {
  return skillManager.fuseIndex.search(query, { limit }).map((result) => result.item.name);
}

test('skills library architecture validation', async () => {
  console.log("Running skills library architecture validation...");

  const skillManager = new SkillManager({});
  await skillManager.loadSkills();

  const skills = Array.from(skillManager.skillsCache.values());
  const requiredSkillNames = [
    "hive",
    "hive-create",
    "hive-test",
    "repo-ingestor",
    "mcp-builder",
    "planning-with-files",
    "docs-architect",
    "pr-manager",
    "webapp-testing",
    "skill-creator"
  ];

  for (const skillName of requiredSkillNames) {
    assert(findSkill(skills, skillName), `Expected imported skill '${skillName}' to exist in the indexed library.`);
  }

  const wshobsonCount = skills.filter((skill) => skill.category === "WSHOBSON PLUGINS").length;
  assert(wshobsonCount >= 100, `Expected WSHOBSON PLUGINS library to contain at least 100 indexed skills, found ${wshobsonCount}.`);

  const securityReview = findSkill(skills, "security-review");
  assert(securityReview, "security-review should be present.");
  assert.strictEqual(securityReview.declaredCategory, "General Coding Workflows", "Declared category should be parsed from frontmatter.");
  assert(securityReview.tags.includes("OWASP"), "Nested metadata tags should be promoted into the skill index.");
  assert.strictEqual(securityReview.metadata.source, "Agent33", "Nested metadata fields should be preserved.");

  const orchTdd = findSkill(skills, "orch-tdd");
  assert(orchTdd, "orch-tdd should be present.");
  assert.strictEqual(orchTdd.metadata.original_command, "/tdd", "Metadata should retain original command aliases.");
  assert(orchTdd.tags.includes("red-green-refactor"), "Nested command tags should be parsed.");

  const hiveCreate = findSkill(skills, "hive-create");
  assert(hiveCreate, "hive-create should be present.");
  assert.strictEqual(hiveCreate.metadata.part_of, "hive", "Metadata should retain framework membership.");
  assert.strictEqual(hiveCreate.metadata.requires, "hive-concepts", "Metadata should retain dependency references.");

  assert(searchSkills(skillManager, "OWASP").includes("security-review"), "Tag-based discovery should find security-review by OWASP.");
  assert(searchSkills(skillManager, "/tdd").includes("orch-tdd"), "Metadata-based discovery should find orch-tdd by original command.");
  assert(searchSkills(skillManager, "part_of hive").includes("hive-create"), "Metadata-based discovery should find hive-create by framework membership.");
});
