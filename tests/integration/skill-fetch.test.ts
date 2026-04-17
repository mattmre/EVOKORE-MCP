import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SKILLS_ROOT = path.join(ROOT, 'SKILLS');
const skillManagerJsPath = path.join(ROOT, 'dist', 'SkillManager.js');

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

type FixtureResponse = {
  status: number;
  body: string;
  contentType?: string;
};

function getSkillManager() {
  const { SkillManager } = require(skillManagerJsPath);
  return new SkillManager(mockProxyManager);
}

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

describe('T10: Remote Skill Fetch (runtime)', () => {
  const originalAllowPrivate = process.env.EVOKORE_HTTP_ALLOW_PRIVATE;
  const createdFiles = new Set<string>();
  let server: http.Server;
  let baseUrl: string;
  let responses: Record<string, FixtureResponse>;

  function rememberCreatedFile(filePath: string): string {
    createdFiles.add(filePath);
    return filePath;
  }

  function cleanupCreatedFile(filePath: string): void {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }

    let currentDir = path.dirname(filePath);
    while (currentDir.startsWith(SKILLS_ROOT) && currentDir !== SKILLS_ROOT) {
      if (!fs.existsSync(currentDir)) {
        currentDir = path.dirname(currentDir);
        continue;
      }

      if (fs.readdirSync(currentDir).length > 0) {
        break;
      }

      fs.rmdirSync(currentDir);
      currentDir = path.dirname(currentDir);
    }
  }

  function registerFixture(pathname: string, body: string, status = 200, contentType = 'text/markdown'): string {
    responses[pathname] = { status, body, contentType };
    return `${baseUrl}${pathname}`;
  }

  beforeAll(async () => {
    process.env.EVOKORE_HTTP_ALLOW_PRIVATE = 'true';
    server = http.createServer((req, res) => {
      const pathname = req.url || '/';
      const response = responses[pathname];
      if (!response) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
        return;
      }

      res.writeHead(response.status, { 'Content-Type': response.contentType || 'text/plain' });
      res.end(response.body);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to start fetch-skill fixture server');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    responses = {};
  });

  afterEach(() => {
    for (const filePath of createdFiles) {
      cleanupCreatedFile(filePath);
    }
    createdFiles.clear();
  });

  afterAll(async () => {
    if (originalAllowPrivate !== undefined) {
      process.env.EVOKORE_HTTP_ALLOW_PRIVATE = originalAllowPrivate;
    } else {
      delete process.env.EVOKORE_HTTP_ALLOW_PRIVATE;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  describe('fetch_skill tool schema', () => {
    it('exposes fetch_skill with the expected schema and network hint', () => {
      const sm = getSkillManager();
      const tools = sm.getTools();
      const fetchTool = tools.find((t: any) => t.name === 'fetch_skill');

      expect(fetchTool).toBeDefined();
      expect(fetchTool.inputSchema.properties.url).toBeDefined();
      expect(fetchTool.inputSchema.required).toContain('url');
      expect(fetchTool.inputSchema.properties.category.type).toBe('string');
      expect(fetchTool.inputSchema.properties.name.type).toBe('string');
      expect(fetchTool.inputSchema.properties.overwrite.type).toBe('boolean');
      expect(fetchTool.inputSchema.properties.checksum.type).toBe('string');
      expect(fetchTool.annotations.openWorldHint).toBe(true);
    });
  });

  describe('fetch_skill validation', () => {
    it('returns a structured error when url is missing or empty', async () => {
      const sm = getSkillManager();

      const missing = await sm.handleToolCall('fetch_skill', {});
      expect(missing.isError).toBe(true);
      expect(missing.content[0].text).toMatch(/url/i);

      const empty = await sm.handleToolCall('fetch_skill', { url: '   ' });
      expect(empty.isError).toBe(true);
      expect(empty.content[0].text).toMatch(/url/i);
    });

    it('rejects invalid and non-http protocols', async () => {
      const sm = getSkillManager();

      await expect(sm.fetchRemoteSkill('not-a-valid-url')).rejects.toThrow(/Invalid URL/);
      await expect(sm.fetchRemoteSkill('ftp://example.com/skill.md')).rejects.toThrow(/Only HTTP\/HTTPS/);
      await expect(sm.fetchRemoteSkill('file:///etc/passwd')).rejects.toThrow(/Only HTTP\/HTTPS/);
    });

    it('returns a structured fetch error for HTTP failures', async () => {
      const sm = getSkillManager();
      const url = registerFixture('/missing-skill.md', 'missing', 404, 'text/plain');

      const result = await sm.handleToolCall('fetch_skill', { url });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to fetch skill: HTTP 404');
      expect(result.content[0].text).toContain('raw.githubusercontent.com');
    });

    it('rejects fetched content that is not a valid skill document', async () => {
      const sm = getSkillManager();
      const url = registerFixture('/invalid-skill.md', '# not a skill');

      await expect(sm.fetchRemoteSkill(url)).rejects.toThrow(/Invalid skill format/);
    });
  });

  describe('fetch_skill runtime behavior', () => {
    it('installs fetched markdown under the requested category and name', async () => {
      const sm = getSkillManager();
      const category = uniqueId('Runtime Category');
      const name = uniqueId('runtime-fetch');
      const content = `---\nname: fixture-skill\ncategory: Runtime\n---\n# Installed\n\nbehavioral fetch fixture\n`;
      const url = registerFixture('/install-skill.md', content);

      const result = await sm.fetchRemoteSkill(url, category, name);
      const storedPath = rememberCreatedFile(result.path);

      expect(result.isNew).toBe(true);
      expect(result.name).toBe(name);
      expect(path.resolve(storedPath).startsWith(path.resolve(SKILLS_ROOT))).toBe(true);
      expect(storedPath).toBe(path.join(SKILLS_ROOT, category, name, 'SKILL.md'));
      expect(fs.readFileSync(storedPath, 'utf8')).toBe(content);
    });

    it('keeps traversal-like category and name overrides inside the SKILLS root', async () => {
      const sm = getSkillManager();
      const content = `---\nname: traversal-skill\ncategory: Runtime\n---\n# Traversal\n`;
      const url = registerFixture('/traversal-skill.md', content);

      const result = await sm.fetchRemoteSkill(
        url,
        `../${uniqueId('escape-category')}`,
        `../../${uniqueId('escape-name')}`
      );
      const storedPath = rememberCreatedFile(result.path);

      expect(path.resolve(storedPath).startsWith(path.resolve(SKILLS_ROOT))).toBe(true);
      expect(path.relative(SKILLS_ROOT, storedPath)).not.toContain('..');
      expect(fs.readFileSync(storedPath, 'utf8')).toBe(content);
    });

    it('returns duplicate-exists errors and supports overwrite through handleToolCall', async () => {
      const sm = getSkillManager();
      const category = uniqueId('Overwrite Category');
      const name = uniqueId('overwrite-fetch');
      const initial = `---\nname: overwrite-skill\ncategory: Runtime\n---\n# First\n`;
      const updated = `---\nname: overwrite-skill\ncategory: Runtime\n---\n# Second\n`;
      const urlPath = '/overwrite-skill.md';
      const url = registerFixture(urlPath, initial);

      const initialResult = await sm.fetchRemoteSkill(url, category, name);
      const storedPath = rememberCreatedFile(initialResult.path);

      const duplicate = await sm.handleToolCall('fetch_skill', { url, category, name });
      expect(duplicate.isError).toBe(true);
      expect(duplicate.content[0].text).toContain('already exists');

      responses[urlPath] = { status: 200, body: updated, contentType: 'text/markdown' };
      const overwriteResult = await sm.handleToolCall('fetch_skill', { url, category, name, overwrite: true });
      expect(overwriteResult.isError).not.toBe(true);
      expect(overwriteResult.content[0].text).toContain(`Skill "${name}" updated`);
      expect(fs.readFileSync(storedPath, 'utf8')).toBe(updated);
    });

    it('verifies checksum when provided', async () => {
      const sm = getSkillManager();
      const category = uniqueId('Checksum Category');
      const name = uniqueId('checksum-fetch');
      const content = `---\nname: checksum-skill\ncategory: Runtime\n---\n# Checksum\n`;
      const url = registerFixture('/checksum-skill.md', content);

      const result = await sm.fetchRemoteSkill(url, category, name, false, sha256(content));
      rememberCreatedFile(result.path);
      expect(result.checksumVerified).toBe(true);

      await expect(
        sm.fetchRemoteSkill(url, uniqueId('Checksum Category'), uniqueId('checksum-fetch'), false, 'deadbeef')
      ).rejects.toThrow(/Checksum verification failed/);
    });
  });
});
