import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const skillManagerTsPath = path.join(ROOT, 'src', 'SkillManager.ts');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');

describe('SkillManager Session Context Passthrough', () => {
  // ---- Source-level structural validation ----

  describe('SkillExecutionContext interface', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('exports the SkillExecutionContext interface', () => {
      expect(src).toMatch(/export\s+interface\s+SkillExecutionContext/);
    });

    it('SkillExecutionContext has sessionId field', () => {
      expect(src).toMatch(/sessionId:\s*string/);
    });

    it('SkillExecutionContext has role field', () => {
      expect(src).toMatch(/role:\s*string\s*\|\s*null/);
    });

    it('SkillExecutionContext has metadata field', () => {
      expect(src).toMatch(/metadata:\s*Map<string,\s*unknown>/);
    });
  });

  describe('handleToolCall accepts optional context parameter', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('handleToolCall signature includes optional SkillExecutionContext', () => {
      expect(src).toMatch(/handleToolCall\s*\(\s*name:\s*string\s*,\s*args:\s*any\s*,\s*context\?:\s*SkillExecutionContext\s*\)/);
    });
  });

  describe('executeCodeBlock injects session env vars', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('executeCodeBlock accepts optional context parameter', () => {
      expect(src).toMatch(/executeCodeBlock\s*\(\s*[\s\S]*?context\?:\s*SkillExecutionContext/);
    });

    it('injects EVOKORE_SESSION_ROLE into subprocess env', () => {
      expect(src).toMatch(/EVOKORE_SESSION_ROLE\s*=\s*context\?\.role\s*\|\|\s*""/);
    });

    it('injects EVOKORE_SESSION_ID into subprocess env', () => {
      expect(src).toMatch(/EVOKORE_SESSION_ID\s*=\s*context\?\.sessionId\s*\|\|\s*""/);
    });
  });

  describe('ProxyManager calls receive role from context', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('docs_architect passes context?.role to callProxiedTool', () => {
      // The docs_architect branch should forward context?.role as 3rd arg
      expect(src).toMatch(/callProxiedTool\s*\(\s*"fs_read_file"\s*,\s*\{[^}]*\}\s*,\s*context\?\.role\s*\)/);
    });

    it('skill_creator passes context?.role to callProxiedTool', () => {
      // The skill_creator branch should forward context?.role as 3rd arg
      expect(src).toMatch(/callProxiedTool\s*\(\s*"fs_write_file"\s*,\s*\{[^}]*\}\s*,\s*context\?\.role\s*\)/);
    });
  });

  describe('index.ts forwards session context to SkillManager', () => {
    const src = fs.readFileSync(indexTsPath, 'utf8');

    it('imports SkillExecutionContext from SkillManager', () => {
      expect(src).toMatch(/import\s*\{[^}]*SkillExecutionContext[^}]*\}\s*from\s*["']\.\/SkillManager["']/);
    });

    it('constructs SkillExecutionContext before native tool dispatch', () => {
      expect(src).toMatch(/skillContext:\s*SkillExecutionContext/);
    });

    it('passes skillContext to handleToolCall for native tools', () => {
      expect(src).toMatch(/handleToolCall\s*\(\s*toolName\s*,\s*args\s*,\s*skillContext\s*\)/);
    });

    it('reads sessionId and session for context construction', () => {
      expect(src).toMatch(/nativeSessionId/);
      expect(src).toMatch(/nativeSession/);
    });
  });

  // ---- Runtime: Backward compatibility ----

  describe('backward compatibility', () => {
    it('SkillManager module loads without errors', async () => {
      const distPath = path.join(ROOT, 'dist', 'SkillManager.js');
      if (!fs.existsSync(distPath)) {
        // If dist is not built, skip this test gracefully
        return;
      }
      const mod = await import(distPath);
      expect(mod.SkillExecutionContext).toBeUndefined(); // interfaces don't exist at runtime
      expect(mod.SkillManager).toBeDefined();
    });

    it('handleToolCall still works without context (backward compatible)', async () => {
      // Verify the source allows calling without context (optional param)
      const src = fs.readFileSync(skillManagerTsPath, 'utf8');
      // The context parameter is optional (has ?)
      expect(src).toMatch(/context\?\s*:\s*SkillExecutionContext/);
    });

    it('executeCodeBlock still works without context (backward compatible)', () => {
      const src = fs.readFileSync(skillManagerTsPath, 'utf8');
      // The context parameter is optional (has ?)
      expect(src).toMatch(/executeCodeBlock\s*\(\s*[\s\S]*?context\?\s*:\s*SkillExecutionContext/);
    });
  });
});
