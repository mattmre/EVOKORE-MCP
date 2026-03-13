const fs = require('fs');
const path = require('path');

describe('MCP SDK Feature Adoption (T30)', () => {
  const indexTs = fs.readFileSync(path.resolve(__dirname, 'src/index.ts'), 'utf8');
  const proxyTs = fs.readFileSync(path.resolve(__dirname, 'src/ProxyManager.ts'), 'utf8');
  const skillTs = fs.readFileSync(path.resolve(__dirname, 'src/SkillManager.ts'), 'utf8');

  describe('Server instructions', () => {
    it('should include instructions in Server constructor options', () => {
      expect(indexTs).toMatch(/instructions:\s/);
      expect(indexTs).toMatch(/multi-server MCP aggregator/);
    });
  });

  describe('Tool annotations on native tools', () => {
    it('should include annotations objects in SkillManager tool definitions', () => {
      expect(skillTs).toMatch(/annotations:\s*\{/);
      expect(skillTs).toMatch(/readOnlyHint:/);
      expect(skillTs).toMatch(/destructiveHint:/);
      expect(skillTs).toMatch(/idempotentHint:/);
      expect(skillTs).toMatch(/openWorldHint:/);
    });

    it('should include title on native tool definitions', () => {
      expect(skillTs).toMatch(/title:\s*"Documentation Architect"/);
      expect(skillTs).toMatch(/title:\s*"Skill Creator"/);
      expect(skillTs).toMatch(/title:\s*"Resolve Workflow"/);
      expect(skillTs).toMatch(/title:\s*"Search Skills"/);
      expect(skillTs).toMatch(/title:\s*"Get Skill Help"/);
      expect(skillTs).toMatch(/title:\s*"Discover Tools"/);
      expect(skillTs).toMatch(/title:\s*"Proxy Server Status"/);
    });

    it('should mark read-only tools correctly', () => {
      // resolve_workflow, search_skills, get_skill_help, proxy_server_status should be readOnly
      const toolBlocks = skillTs.split(/\{\s*name:\s*"/);
      for (const block of toolBlocks) {
        if (block.startsWith('resolve_workflow') ||
            block.startsWith('search_skills') ||
            block.startsWith('get_skill_help') ||
            block.startsWith('proxy_server_status')) {
          expect(block).toMatch(/readOnlyHint:\s*true/);
        }
      }
    });

    it('should mark non-read-only tools correctly', () => {
      const toolBlocks = skillTs.split(/\{\s*name:\s*"/);
      for (const block of toolBlocks) {
        if (block.startsWith('docs_architect') || block.startsWith('skill_creator')) {
          expect(block).toMatch(/readOnlyHint:\s*false/);
        }
      }
    });
  });

  describe('HTTP transport support', () => {
    it('should import StreamableHTTPClientTransport in ProxyManager', () => {
      expect(proxyTs).toMatch(/StreamableHTTPClientTransport/);
      expect(proxyTs).toMatch(/streamableHttp/);
    });

    it('should support transport === "http" branching in loadServers', () => {
      expect(proxyTs).toMatch(/transport.*===.*["']http["']/);
    });

    it('should support url field in ServerConfig interface', () => {
      expect(proxyTs).toMatch(/url\?:\s*string/);
    });

    it('should construct StreamableHTTPClientTransport with URL', () => {
      expect(proxyTs).toMatch(/new StreamableHTTPClientTransport\(new URL\(/);
    });
  });

  describe('Proxied tool field forwarding', () => {
    it('should deep-clone tool objects to preserve all fields', () => {
      expect(proxyTs).toMatch(/JSON\.parse\(JSON\.stringify\(tool\)\)/);
    });
  });

  describe('Research documentation', () => {
    it('should have the research document', () => {
      const docPath = path.resolve(__dirname, 'docs/research/mcp-sdk-upgrade-research-2026-03-13.md');
      expect(fs.existsSync(docPath)).toBe(true);
    });
  });
});
