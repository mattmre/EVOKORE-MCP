import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const skillManagerTsPath = path.join(ROOT, 'src', 'SkillManager.ts');
const skillManagerJsPath = path.join(ROOT, 'dist', 'SkillManager.js');

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

describe('T22: Skill Execution Sandbox Security Audit', () => {
  // ---- Tool definition validation ----

  describe('execute_skill tool definition exists with correct schema', () => {
    it('exists in getTools output', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const execTool = tools.find((t: any) => t.name === 'execute_skill');
      expect(execTool).toBeDefined();
    });

    it('has skill_name as required property', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const execTool = tools.find((t: any) => t.name === 'execute_skill');

      expect(execTool.inputSchema.properties.skill_name).toBeDefined();
      expect(execTool.inputSchema.properties.skill_name.type).toBe('string');
      expect(execTool.inputSchema.required).toContain('skill_name');
    });

    it('has step as optional number property', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const execTool = tools.find((t: any) => t.name === 'execute_skill');

      expect(execTool.inputSchema.properties.step).toBeDefined();
      expect(execTool.inputSchema.properties.step.type).toBe('number');
      expect(execTool.inputSchema.required).not.toContain('step');
    });

    it('has env as optional object property', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const execTool = tools.find((t: any) => t.name === 'execute_skill');

      expect(execTool.inputSchema.properties.env).toBeDefined();
      expect(execTool.inputSchema.properties.env.type).toBe('object');
    });

    it('has destructiveHint annotation set to true', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const execTool = tools.find((t: any) => t.name === 'execute_skill');

      expect(execTool.annotations).toBeDefined();
      expect(execTool.annotations.destructiveHint).toBe(true);
    });

    it('has readOnlyHint set to false', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const execTool = tools.find((t: any) => t.name === 'execute_skill');

      expect(execTool.annotations.readOnlyHint).toBe(false);
    });

    it('has title field set', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const execTool = tools.find((t: any) => t.name === 'execute_skill');

      expect(execTool.title).toBe('Execute Skill Steps');
    });
  });

  // ---- Timeout enforcement ----

  describe('30-second timeout enforcement', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('sets timeout to 30000ms in execFileSync', () => {
      expect(src).toMatch(/timeout:\s*30000/);
    });

    it('detects timed-out processes via err.killed', () => {
      expect(src).toMatch(/err\.killed/);
    });

    it('returns timedOut flag in result', () => {
      expect(src).toMatch(/timedOut:\s*true/);
    });

    it('includes TIMED OUT marker in handleToolCall output', () => {
      expect(src).toMatch(/TIMED OUT after 30s/);
    });
  });

  // ---- Output limit enforcement ----

  describe('1MB output limit enforcement', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('sets maxBuffer to 1MB (1024 * 1024)', () => {
      expect(src).toMatch(/maxBuffer:\s*1024\s*\*\s*1024/);
    });
  });

  // ---- Supported languages ----

  describe('supported languages', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('supports bash', () => {
      expect(src).toMatch(/"bash":\s*\{/);
    });

    it('supports sh', () => {
      expect(src).toMatch(/"sh":\s*\{/);
    });

    it('supports javascript and js', () => {
      expect(src).toMatch(/"javascript":\s*\{/);
      expect(src).toMatch(/"js":\s*\{/);
    });

    it('supports python and py', () => {
      expect(src).toMatch(/"python":\s*\{/);
      expect(src).toMatch(/"py":\s*\{/);
    });

    it('supports typescript and ts', () => {
      expect(src).toMatch(/"typescript":\s*\{/);
      expect(src).toMatch(/"ts":\s*\{/);
    });

    it('rejects unsupported languages', () => {
      expect(src).toMatch(/Unsupported language for execution/);
    });

    it('bash uses -e flag for fail-on-error', () => {
      expect(src).toMatch(/"bash":\s*\{\s*command:\s*"bash",\s*args:\s*\["-e"\]/);
    });

    it('typescript uses npx tsx as executor', () => {
      expect(src).toMatch(/"typescript":\s*\{\s*command:\s*"npx",\s*args:\s*\["tsx"\]/);
    });
  });

  // ---- Sandbox isolation ----

  describe('sandbox isolation mechanisms', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('writes code to OS temp directory', () => {
      expect(src).toMatch(/os\.tmpdir\(\)/);
    });

    it('uses evokore-sandbox prefix for temp files', () => {
      expect(src).toMatch(/evokore-sandbox-/);
    });

    it('cleans up temp file after execution', () => {
      expect(src).toMatch(/unlinkSync\(tmpFile\)/);
    });

    it('cleanup is in a finally block', () => {
      // The finally block ensures cleanup even on error
      expect(src).toMatch(/finally\s*\{[\s\S]*?unlinkSync/);
    });

    it('sets EVOKORE_SANDBOX env variable', () => {
      expect(src).toMatch(/EVOKORE_SANDBOX.*true/);
    });

    it('uses execFileSync (not exec/spawn shell) for safer execution', () => {
      expect(src).toMatch(/execFileSync\(/);
    });

    it('uses stdio pipes to capture output', () => {
      expect(src).toMatch(/stdio:\s*\["pipe",\s*"pipe",\s*"pipe"\]/);
    });
  });

  // ---- Error handling for failed executions ----

  describe('error output for failed executions', () => {
    function createSkillManager() {
      const { SkillManager } = require(skillManagerJsPath);
      return new SkillManager(mockProxyManager);
    }

    it('returns isError true for missing skill_name', async () => {
      const sm = createSkillManager();
      const result = await sm.handleToolCall('execute_skill', { skill_name: '' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/skill_name.*required/i);
    });

    it('returns isError true for invalid step type', async () => {
      const sm = createSkillManager();
      // Inject a skill so it gets past the skill lookup
      sm['skillsCache'] = new Map([['test/test-skill', {
        name: 'test-skill',
        description: 'Test',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake', content: '# test\n\n```js\nconsole.log("hi")\n```',
      }]]);
      // Force the fuseIndex to be truthy so loadSkills is not called
      sm['fuseIndex'] = { search: () => [] };

      const result = await sm.handleToolCall('execute_skill', {
        skill_name: 'test-skill',
        step: 'not-a-number'
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/step.*must be a number/i);
    });

    it('lists code blocks when step is omitted', async () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/list-blocks', {
        name: 'list-blocks',
        description: 'List blocks test',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```js\nconsole.log("hello")\n```\n\n```python\nprint("world")\n```',
      }]]);
      sm['fuseIndex'] = { search: () => [] };

      const result = await sm.handleToolCall('execute_skill', { skill_name: 'list-blocks' });
      expect(result.content[0].text).toMatch(/2 code block/);
      expect(result.content[0].text).toMatch(/js/);
      expect(result.content[0].text).toMatch(/python/);
    });

    it('reports no code blocks for a skill without code blocks', async () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/no-code', {
        name: 'no-code',
        description: 'No code blocks',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\nNo code here.',
      }]]);
      sm['fuseIndex'] = { search: () => [] };

      const result = await sm.handleToolCall('execute_skill', { skill_name: 'no-code' });
      expect(result.content[0].text).toMatch(/no executable code blocks/i);
    });

    it('includes exit code in execution output', () => {
      const src = fs.readFileSync(skillManagerTsPath, 'utf8');
      expect(src).toMatch(/Exit code:/);
    });

    it('includes stdout and stderr sections in output', () => {
      const src = fs.readFileSync(skillManagerTsPath, 'utf8');
      expect(src).toMatch(/--- stdout ---/);
      expect(src).toMatch(/--- stderr ---/);
    });
  });

  // ---- Code block extraction ----

  describe('extractCodeBlocks', () => {
    function createSkillManager() {
      const { SkillManager } = require(skillManagerJsPath);
      return new SkillManager(mockProxyManager);
    }

    it('extracts code blocks from skill content', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/multi-block', {
        name: 'multi-block',
        description: 'Multiple blocks',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```bash\necho hello\n```\n\n```js\nconsole.log(42)\n```',
      }]]);

      const blocks = sm.extractCodeBlocks('multi-block');
      expect(blocks).toHaveLength(2);
      expect(blocks[0].language).toBe('bash');
      expect(blocks[0].code).toBe('echo hello');
      expect(blocks[0].index).toBe(0);
      expect(blocks[1].language).toBe('js');
      expect(blocks[1].code).toBe('console.log(42)');
      expect(blocks[1].index).toBe(1);
    });

    it('defaults to text language when not specified', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/no-lang', {
        name: 'no-lang',
        description: 'No language',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```\nplain text\n```',
      }]]);

      const blocks = sm.extractCodeBlocks('no-lang');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].language).toBe('text');
    });

    it('throws for nonexistent skill', () => {
      const sm = createSkillManager();
      expect(() => sm.extractCodeBlocks('nonexistent')).toThrow(/Skill not found/);
    });
  });

  // ---- executeCodeBlock step bounds ----

  describe('executeCodeBlock step bounds checking', () => {
    function createSkillManager() {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      sm['skillsCache'] = new Map([['test/bounded', {
        name: 'bounded',
        description: 'Bounded',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```js\nconsole.log("only block")\n```',
      }]]);
      return sm;
    }

    it('throws for negative step index', async () => {
      const sm = createSkillManager();
      await expect(sm.executeCodeBlock('bounded', -1)).rejects.toThrow(/out of range/);
    });

    it('throws for step index exceeding block count', async () => {
      const sm = createSkillManager();
      await expect(sm.executeCodeBlock('bounded', 5)).rejects.toThrow(/out of range/);
    });
  });

  // ---- Security audit: dangerous patterns handled ----

  describe('dangerous code patterns are handled safely', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('does not use shell: true in child_process (prevents shell injection)', () => {
      // execFileSync does not support shell option by default
      // The code uses execFileSync, not exec or execSync
      expect(src).toMatch(/execFileSync\(/);
      expect(src).not.toMatch(/shell:\s*true/);
    });

    it('passes user env as merge, not replacement', () => {
      // Env is spread: { ...process.env, ...userEnv }
      expect(src).toMatch(/\.\.\.process\.env/);
      expect(src).toMatch(/\.\.\.userEnv/);
    });

    it('temp file includes timestamp for uniqueness', () => {
      expect(src).toMatch(/Date\.now\(\)/);
    });

    it('temp file uses correct extension for each language', () => {
      expect(src).toMatch(/ext:\s*"\.sh"/);
      expect(src).toMatch(/ext:\s*"\.js"/);
      expect(src).toMatch(/ext:\s*"\.py"/);
      expect(src).toMatch(/ext:\s*"\.ts"/);
    });
  });

  // ---- Security audit: what is NOT sandboxed ----

  describe('security boundaries: known limitations (audit findings)', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('does not use chroot or container isolation', () => {
      expect(src).not.toMatch(/chroot/);
      expect(src).not.toMatch(/docker/i);
      expect(src).not.toMatch(/container/i);
    });

    it('does not restrict network access in sandbox', () => {
      // There is no network sandboxing - the process inherits host networking
      // This is a known limitation documented in the security audit
      expect(src).not.toMatch(/seccomp/i);
      expect(src).not.toMatch(/network.*restrict/i);
    });

    it('does not restrict filesystem access beyond temp file location', () => {
      // The executed code runs with the same filesystem permissions as the parent
      // This is a known limitation documented in the security audit
      expect(src).not.toMatch(/chdir.*sandbox/i);
    });

    it('inherits full process.env from parent (potential secret exposure)', () => {
      // The env spread includes all of process.env
      expect(src).toMatch(/\.\.\.process\.env/);
    });
  });

  // ---- Live execution tests (safe code only) ----

  describe('live execution of safe code blocks', () => {
    function createSkillManager() {
      const { SkillManager } = require(skillManagerJsPath);
      return new SkillManager(mockProxyManager);
    }

    it('executes a simple JavaScript code block', async () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/js-exec', {
        name: 'js-exec',
        description: 'JS exec test',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```js\nconsole.log("sandbox-test-output")\n```',
      }]]);

      const result = await sm.executeCodeBlock('js-exec', 0);
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.stdout).toContain('sandbox-test-output');
    });

    it('captures stderr from a failing JavaScript block', async () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/js-fail', {
        name: 'js-fail',
        description: 'JS fail test',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```js\nprocess.exit(1)\n```',
      }]]);

      const result = await sm.executeCodeBlock('js-fail', 0);
      expect(result.exitCode).not.toBe(0);
      expect(result.timedOut).toBe(false);
    });

    it('reports EVOKORE_SANDBOX env var is set during execution', async () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/env-check', {
        name: 'env-check',
        description: 'Env check test',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```js\nconsole.log("SANDBOX=" + process.env.EVOKORE_SANDBOX)\n```',
      }]]);

      const result = await sm.executeCodeBlock('env-check', 0);
      expect(result.stdout).toContain('SANDBOX=true');
    });

    it('passes custom env variables to executed code', async () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/custom-env', {
        name: 'custom-env',
        description: 'Custom env test',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```js\nconsole.log("CUSTOM=" + process.env.MY_TEST_VAR)\n```',
      }]]);

      const result = await sm.executeCodeBlock('custom-env', 0, { MY_TEST_VAR: 'hello123' });
      expect(result.stdout).toContain('CUSTOM=hello123');
    });

    it('rejects unsupported language at runtime', async () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/unsupported', {
        name: 'unsupported',
        description: 'Unsupported lang',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```ruby\nputs "hello"\n```',
      }]]);

      await expect(sm.executeCodeBlock('unsupported', 0))
        .rejects.toThrow(/Unsupported language/);
    });
  });
});
