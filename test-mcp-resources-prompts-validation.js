const fs = require('fs');
const path = require('path');

describe('MCP Resources & Prompts (T31)', () => {
  const indexTs = fs.readFileSync(path.resolve(__dirname, 'src/index.ts'), 'utf8');
  const skillTs = fs.readFileSync(path.resolve(__dirname, 'src/SkillManager.ts'), 'utf8');
  const proxyTs = fs.readFileSync(path.resolve(__dirname, 'src/ProxyManager.ts'), 'utf8');

  describe('Expanded resources', () => {
    it('should define evokore://server/status resource', () => {
      expect(indexTs).toMatch(/evokore:\/\/server\/status/);
    });

    it('should define evokore://server/config resource', () => {
      expect(indexTs).toMatch(/evokore:\/\/server\/config/);
    });

    it('should define evokore://skills/categories resource', () => {
      expect(indexTs).toMatch(/evokore:\/\/skills\/categories/);
    });

    it('should merge server resources with skill resources in ListResources handler', () => {
      expect(indexTs).toMatch(/serverResources/);
      expect(indexTs).toMatch(/skillResources/);
      expect(indexTs).toMatch(/\.\.\.\s*serverResources/);
    });

    it('should route evokore:// URIs to readServerResource', () => {
      expect(indexTs).toMatch(/uri\.startsWith\("evokore:\/\/"\)/);
      expect(indexTs).toMatch(/readServerResource/);
    });

    it('should have getSanitizedConfig in ProxyManager', () => {
      expect(proxyTs).toMatch(/async getSanitizedConfig\(\)/);
      expect(proxyTs).toMatch(/\[REDACTED\]/);
    });
  });

  describe('Prompt implementations', () => {
    it('should define resolve-workflow prompt', () => {
      expect(indexTs).toMatch(/name:\s*"resolve-workflow"/);
      expect(indexTs).toMatch(/objective/);
    });

    it('should define skill-help prompt', () => {
      expect(indexTs).toMatch(/name:\s*"skill-help"/);
      expect(indexTs).toMatch(/skill_name/);
    });

    it('should define server-overview prompt', () => {
      expect(indexTs).toMatch(/name:\s*"server-overview"/);
    });

    it('should no longer return empty prompts array', () => {
      // The old empty prompts pattern should be gone
      expect(indexTs).not.toMatch(/prompts:\s*\[\s*\]\s*;?\s*\/\//);
    });

    it('should handle GetPrompt with a switch on name', () => {
      expect(indexTs).toMatch(/switch\s*\(name\)/);
      expect(indexTs).toMatch(/case "resolve-workflow"/);
      expect(indexTs).toMatch(/case "skill-help"/);
      expect(indexTs).toMatch(/case "server-overview"/);
    });

    it('should return messages with role and content', () => {
      expect(indexTs).toMatch(/role:\s*"user"\s*as\s*const/);
      expect(indexTs).toMatch(/role:\s*"assistant"\s*as\s*const/);
      expect(indexTs).toMatch(/content:\s*\{\s*type:\s*"text"\s*as\s*const/);
    });

    it('should throw on unknown prompt name', () => {
      expect(indexTs).toMatch(/Unknown prompt:/);
    });
  });

  describe('SkillManager helper methods', () => {
    it('should expose getSkillCount()', () => {
      expect(skillTs).toMatch(/getSkillCount\(\):\s*number/);
    });

    it('should expose getCategorySummary()', () => {
      expect(skillTs).toMatch(/getCategorySummary\(\)/);
    });

    it('should expose resolveWorkflowText()', () => {
      expect(skillTs).toMatch(/resolveWorkflowText\(objective:\s*string\)/);
    });

    it('should expose getSkillHelpText()', () => {
      expect(skillTs).toMatch(/getSkillHelpText\(name:\s*string\)/);
    });

    it('should expose findSkillByName()', () => {
      expect(skillTs).toMatch(/findSkillByName\(name:\s*string\)/);
    });
  });
});
