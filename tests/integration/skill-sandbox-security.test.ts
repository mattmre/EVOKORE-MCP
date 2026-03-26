import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const skillManagerTsPath = path.join(ROOT, 'src', 'SkillManager.ts');
const containerSandboxTsPath = path.join(ROOT, 'src', 'ContainerSandbox.ts');
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
    const smSrc = fs.readFileSync(skillManagerTsPath, 'utf8');
    const csSrc = fs.readFileSync(containerSandboxTsPath, 'utf8');

    it('sets timeout to 30000ms in sandbox options', () => {
      // Timeout may be specified in SkillManager (sandbox options) or ContainerSandbox
      const combined = smSrc + csSrc;
      expect(combined).toMatch(/timeout:\s*30000/);
    });

    it('detects timed-out processes via err.killed', () => {
      // The killed flag detection lives in ContainerSandbox (ProcessSandbox/ContainerSandbox)
      expect(csSrc).toMatch(/err\.killed/);
    });

    it('returns timedOut flag in result', () => {
      expect(csSrc).toMatch(/timedOut/);
    });

    it('includes TIMED OUT marker in handleToolCall output', () => {
      expect(smSrc).toMatch(/TIMED OUT after 30s/);
    });
  });

  // ---- Output limit enforcement ----

  describe('1MB output limit enforcement', () => {
    it('sets maxOutputSize to 1MB (1024 * 1024) and passes it as maxBuffer', () => {
      // SkillManager sets maxOutputSize: 1024 * 1024 in sandbox options
      const smSrc = fs.readFileSync(skillManagerTsPath, 'utf8');
      expect(smSrc).toMatch(/maxOutputSize:\s*1024\s*\*\s*1024/);
      // ContainerSandbox uses options.maxOutputSize as maxBuffer
      const csSrc = fs.readFileSync(containerSandboxTsPath, 'utf8');
      expect(csSrc).toMatch(/maxBuffer:\s*options\.maxOutputSize/);
    });
  });

  // ---- Supported languages ----

  describe('supported languages', () => {
    // Executor mappings are now in ContainerSandbox.ts (ProcessSandbox class)
    const src = fs.readFileSync(containerSandboxTsPath, 'utf8');
    const smSrc = fs.readFileSync(skillManagerTsPath, 'utf8');

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
      const combined = smSrc + src;
      expect(combined).toMatch(/Unsupported language/);
    });

    it('bash uses -e flag for fail-on-error', () => {
      expect(src).toMatch(/"bash":\s*\{\s*command:\s*"bash",\s*args:\s*\["-e"\]/);
    });

    it('typescript uses npx tsx as executor', () => {
      expect(src).toMatch(/"typescript":\s*\{\s*command:\s*"npx",\s*args:\s*\["tsx"/);
    });
  });

  // ---- Sandbox isolation ----

  describe('sandbox isolation mechanisms', () => {
    // Sandbox implementation is now in ContainerSandbox.ts
    const csSrc = fs.readFileSync(containerSandboxTsPath, 'utf8');
    const smSrc = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('writes code to OS temp directory', () => {
      expect(csSrc).toMatch(/os\.tmpdir\(\)/);
    });

    it('uses evokore-sandbox prefix for temp files', () => {
      expect(csSrc).toMatch(/evokore-sandbox-/);
    });

    it('cleans up sandbox directory after execution', () => {
      expect(csSrc).toMatch(/rmSync\(sandboxDir/);
    });

    it('cleanup is in a finally block', () => {
      // The finally block ensures cleanup even on error
      expect(csSrc).toMatch(/finally\s*\{[\s\S]*?rmSync/);
    });

    it('sets EVOKORE_SANDBOX env variable', () => {
      expect(csSrc).toMatch(/EVOKORE_SANDBOX.*true/);
    });

    it('uses execFileAsync (not exec/spawn shell) for safer execution', () => {
      expect(csSrc).toMatch(/execFileAsync\(/);
    });

    it('does not use shell:true for output capture', () => {
      expect(csSrc).not.toMatch(/shell:\s*true/);
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
    const smSrc = fs.readFileSync(skillManagerTsPath, 'utf8');
    const csSrc = fs.readFileSync(containerSandboxTsPath, 'utf8');

    it('does not use shell: true in child_process (prevents shell injection)', () => {
      // execFileAsync does not support shell option by default
      // The code uses execFileAsync, not exec or execSync
      expect(csSrc).toMatch(/execFileAsync\(/);
      expect(csSrc).not.toMatch(/shell:\s*true/);
    });

    it('builds env from filtered process.env with userEnv merge', () => {
      // Filtered env uses SAFE_ENV_KEYS allowlist, then merges userEnv
      expect(smSrc).toMatch(/SAFE_ENV_KEYS/);
      expect(smSrc).toMatch(/Object\.assign\(env,\s*userEnv\)/);
    });

    it('uses mkdtempSync for unique private temp directories', () => {
      expect(csSrc).toMatch(/mkdtempSync/);
    });

    it('temp file uses correct extension for each language', () => {
      expect(csSrc).toMatch(/ext:\s*"\.sh"/);
      expect(csSrc).toMatch(/ext:\s*"\.js"/);
      expect(csSrc).toMatch(/ext:\s*"\.py"/);
      expect(csSrc).toMatch(/ext:\s*"\.ts"/);
    });
  });

  // ---- Security audit: what is NOT sandboxed ----

  describe('security boundaries: container isolation available', () => {
    const smSrc = fs.readFileSync(skillManagerTsPath, 'utf8');
    const csSrc = fs.readFileSync(containerSandboxTsPath, 'utf8');

    it('uses container sandbox via ContainerSandbox module', () => {
      // SkillManager imports and delegates to ContainerSandbox
      expect(smSrc).toMatch(/from\s+["']\.\/ContainerSandbox["']/);
      expect(smSrc).toMatch(/createSandbox/);
    });

    it('container sandbox enforces network isolation', () => {
      // ContainerSandbox applies --network=none
      expect(csSrc).toMatch(/--network=none/);
    });

    it('container sandbox enforces read-only filesystem', () => {
      expect(csSrc).toMatch(/--read-only/);
    });

    it('container sandbox enforces no-new-privileges', () => {
      expect(csSrc).toMatch(/no-new-privileges/);
    });

    it('filters process.env through SAFE_ENV_KEYS allowlist (secrets stripped)', () => {
      // The env is now filtered - only safe keys are passed through
      expect(smSrc).toMatch(/SAFE_ENV_KEYS\.has\(key\)/);
      expect(smSrc).not.toMatch(/\.\.\.process\.env/);
    });
  });

  // ---- Live execution tests (safe code only) ----
  // Force process sandbox mode so tests can check process-sandbox-specific
  // behaviors (cwd, EVOKORE_SANDBOX_DIR, env key filtering).

  describe('live execution of safe code blocks', () => {
    const savedSandboxMode = process.env.EVOKORE_SANDBOX_MODE;
    beforeAll(() => { process.env.EVOKORE_SANDBOX_MODE = 'process'; });
    afterAll(() => {
      if (savedSandboxMode === undefined) delete process.env.EVOKORE_SANDBOX_MODE;
      else process.env.EVOKORE_SANDBOX_MODE = savedSandboxMode;
    });

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

  // ---- Sandbox hardening ----

  describe('sandbox hardening', () => {
    const smSrc = fs.readFileSync(skillManagerTsPath, 'utf8');
    const csSrc = fs.readFileSync(containerSandboxTsPath, 'utf8');

    // Force process sandbox mode for runtime tests that check process-sandbox-specific behavior
    const savedSandboxMode = process.env.EVOKORE_SANDBOX_MODE;
    beforeAll(() => { process.env.EVOKORE_SANDBOX_MODE = 'process'; });
    afterAll(() => {
      if (savedSandboxMode === undefined) delete process.env.EVOKORE_SANDBOX_MODE;
      else process.env.EVOKORE_SANDBOX_MODE = savedSandboxMode;
    });

    function createSkillManager() {
      const { SkillManager } = require(skillManagerJsPath);
      return new SkillManager(mockProxyManager);
    }

    // --- Environment filtering ---

    it('filters secrets from subprocess environment (runtime)', async () => {
      // Set some fake secret env vars in the current process for the test
      const originalGHToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      const originalELKey = process.env.ELEVENLABS_API_KEY;
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'ghp_test_secret_value';
      process.env.ELEVENLABS_API_KEY = 'el_test_secret_value';

      try {
        const sm = createSkillManager();
        sm['skillsCache'] = new Map([['test/env-filter', {
          name: 'env-filter',
          description: 'Env filter test',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake',
          content: '# Test\n\n```js\nconsole.log(JSON.stringify(Object.keys(process.env)))\n```',
        }]]);

        const result = await sm.executeCodeBlock('env-filter', 0);
        const envKeys = JSON.parse(result.stdout.trim());

        // Secret-pattern keys must NOT be present
        expect(envKeys).not.toContain('GITHUB_PERSONAL_ACCESS_TOKEN');
        expect(envKeys).not.toContain('ELEVENLABS_API_KEY');

        // Safe keys MUST be present
        expect(envKeys).toContain('PATH');
        expect(envKeys).toContain('EVOKORE_SANDBOX');
      } finally {
        // Restore original env
        if (originalGHToken === undefined) delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
        else process.env.GITHUB_PERSONAL_ACCESS_TOKEN = originalGHToken;
        if (originalELKey === undefined) delete process.env.ELEVENLABS_API_KEY;
        else process.env.ELEVENLABS_API_KEY = originalELKey;
      }
    });

    it('defines SAFE_ENV_KEYS allowlist (source check)', () => {
      expect(smSrc).toMatch(/SAFE_ENV_KEYS\s*=\s*new Set\(/);
      expect(smSrc).toMatch(/'PATH'/);
      expect(smSrc).toMatch(/'HOME'/);
      expect(smSrc).toMatch(/'EVOKORE_SANDBOX'/);
    });

    // --- UserEnv blocklist ---

    it('rejects blocked env overrides like NODE_OPTIONS', async () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/blocked-env', {
        name: 'blocked-env',
        description: 'Blocked env test',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```js\nconsole.log("should not run")\n```',
      }]]);

      await expect(sm.executeCodeBlock('blocked-env', 0, { NODE_OPTIONS: '--inspect' }))
        .rejects.toThrow(/Blocked environment variable override.*NODE_OPTIONS/);
    });

    it('rejects blocked PATH override', async () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/blocked-path', {
        name: 'blocked-path',
        description: 'Blocked PATH test',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```js\nconsole.log("nope")\n```',
      }]]);

      await expect(sm.executeCodeBlock('blocked-path', 0, { PATH: '/malicious/bin' }))
        .rejects.toThrow(/Blocked environment variable override.*PATH/);
    });

    it('defines BLOCKED_ENV_OVERRIDES set (source check)', () => {
      expect(smSrc).toMatch(/BLOCKED_ENV_OVERRIDES\s*=\s*new Set\(/);
      expect(smSrc).toMatch(/'NODE_OPTIONS'/);
      expect(smSrc).toMatch(/'LD_PRELOAD'/);
    });

    // --- Private temp directory ---

    it('uses mkdtempSync for private temp directories (source check)', () => {
      // mkdtempSync is now in ContainerSandbox.ts (ProcessSandbox class)
      expect(csSrc).toMatch(/mkdtempSync\(/);
    });

    it('executes code with cwd set to sandbox directory (runtime)', async () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/cwd-check', {
        name: 'cwd-check',
        description: 'CWD check test',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```js\nconsole.log(process.cwd())\n```',
      }]]);

      const result = await sm.executeCodeBlock('cwd-check', 0);
      expect(result.stdout.trim()).toMatch(/evokore-sandbox-/);
    });

    it('sets EVOKORE_SANDBOX_DIR in subprocess env (runtime)', async () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/sandbox-dir-env', {
        name: 'sandbox-dir-env',
        description: 'Sandbox dir env test',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```js\nconsole.log("DIR=" + process.env.EVOKORE_SANDBOX_DIR)\n```',
      }]]);

      const result = await sm.executeCodeBlock('sandbox-dir-env', 0);
      expect(result.stdout).toMatch(/DIR=.*evokore-sandbox-/);
    });

    // --- Cleanup verification ---

    it('cleans up sandbox directory after successful execution', async () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/cleanup-check', {
        name: 'cleanup-check',
        description: 'Cleanup check test',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```js\nconsole.log(process.env.EVOKORE_SANDBOX_DIR)\n```',
      }]]);

      const result = await sm.executeCodeBlock('cleanup-check', 0);
      const sandboxDir = result.stdout.trim();
      // The directory should have been removed in the finally block
      expect(fs.existsSync(sandboxDir)).toBe(false);
    });

    it('cleans up sandbox directory after failed execution', async () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/cleanup-fail', {
        name: 'cleanup-fail',
        description: 'Cleanup fail test',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```js\nconsole.log(process.env.EVOKORE_SANDBOX_DIR); process.exit(1)\n```',
      }]]);

      const result = await sm.executeCodeBlock('cleanup-fail', 0);
      expect(result.exitCode).not.toBe(0);
      const sandboxDir = result.stdout.trim();
      expect(fs.existsSync(sandboxDir)).toBe(false);
    });

    // --- Memory limit ---

    it('passes --max-old-space-size=128 for JS execution (source check)', () => {
      // JS executor in ProcessSandbox (ContainerSandbox.ts) must include memory limit flag
      expect(csSrc).toMatch(/"js":\s*\{[^}]*--max-old-space-size=128/);
      expect(csSrc).toMatch(/"javascript":\s*\{[^}]*--max-old-space-size=128/);
    });

    it('passes --max-old-space-size=128 for TS execution (source check)', () => {
      // TS executor in ProcessSandbox (ContainerSandbox.ts) must include memory limit flag
      expect(csSrc).toMatch(/"ts":\s*\{[^}]*--max-old-space-size=128/);
      expect(csSrc).toMatch(/"typescript":\s*\{[^}]*--max-old-space-size=128/);
    });

    // --- Backward compatibility ---

    it('still executes simple JS code blocks correctly after hardening', async () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/compat', {
        name: 'compat',
        description: 'Backward compat test',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake',
        content: '# Test\n\n```js\nconsole.log("hello")\n```',
      }]]);

      const result = await sm.executeCodeBlock('compat', 0);
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.stdout.trim()).toBe('hello');
    });

    it('sets cwd to sandboxDir in ProcessSandbox (source check)', () => {
      expect(csSrc).toMatch(/cwd:\s*sandboxDir/);
    });

    it('uses recursive rmSync for cleanup (source check)', () => {
      expect(csSrc).toMatch(/rmSync\(sandboxDir,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}/);
    });
  });
});
