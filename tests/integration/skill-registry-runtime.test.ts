import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const skillManagerJsPath = path.join(ROOT, "dist", "SkillManager.js");

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: "text", text: "" }] })
};

describe("T21: Remote Skill Registry Runtime", () => {
  let server: http.Server;
  let baseUrl: string;
  let requestCounts: Record<string, number>;
  let tempDir: string;
  let tempConfigPath: string;
  let originalConfigPath: string | undefined;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const reqPath = req.url || "/";
      requestCounts[reqPath] = (requestCounts[reqPath] || 0) + 1;

      if (reqPath === "/registry-a.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          name: "entries-registry",
          version: "1.0.0",
          entries: [
            {
              name: "registry-entry-skill",
              version: "1.2.3",
              description: "Uses canonical entries format",
              url: "skills/entries-skill.md",
              category: "Runtime",
              author: "alice",
              tags: ["entries", "testing"],
              checksum: "abc123"
            }
          ]
        }));
        return;
      }

      if (reqPath === "/registry-b.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          name: "skills-registry",
          version: "1.0.0",
          skills: [
            {
              name: "skills-format-skill",
              version: "0.5.0",
              description: "Uses legacy skills format",
              url: "/downloads/skills-format.md",
              author: "bob",
              tags: ["skills", "testing"]
            }
          ]
        }));
        return;
      }

      if (reqPath === "/registry-fail.json") {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("boom");
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to start registry test server");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    requestCounts = {};
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "evokore-registry-runtime-"));
    tempConfigPath = path.join(tempDir, "mcp.config.json");
    originalConfigPath = process.env.EVOKORE_MCP_CONFIG_PATH;
  });

  afterEach(() => {
    if (originalConfigPath !== undefined) {
      process.env.EVOKORE_MCP_CONFIG_PATH = originalConfigPath;
    } else {
      delete process.env.EVOKORE_MCP_CONFIG_PATH;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  afterAll(async () => {
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

  function writeConfig(registries: Array<{ name: string; baseUrl: string; index: string }>): void {
    fs.writeFileSync(tempConfigPath, JSON.stringify({ skillRegistries: registries }, null, 2));
    process.env.EVOKORE_MCP_CONFIG_PATH = tempConfigPath;
  }

  it("loads non-empty registries from EVOKORE_MCP_CONFIG_PATH and normalizes entry URLs", async () => {
    writeConfig([
      { name: "entries", baseUrl, index: "registry-a.json" },
      { name: "skills", baseUrl, index: "registry-b.json" },
      { name: "broken", baseUrl, index: "registry-fail.json" }
    ]);

    const { SkillManager } = require(skillManagerJsPath);
    const sm = new SkillManager(mockProxyManager);

    const entries = await sm.listRegistrySkills();
    expect(entries).toHaveLength(2);

    const byName = new Map(entries.map((entry: any) => [entry.name, entry]));
    expect(byName.get("registry-entry-skill")).toMatchObject({
      description: "Uses canonical entries format",
      category: "Runtime",
      author: "alice",
      tags: ["entries", "testing"],
      checksum: "abc123",
      url: `${baseUrl}/skills/entries-skill.md`
    });
    expect(byName.get("skills-format-skill")).toMatchObject({
      description: "Uses legacy skills format",
      author: "bob",
      tags: ["skills", "testing"],
      url: `${baseUrl}/downloads/skills-format.md`
    });
  });

  it("list_registry continues after a registry fetch failure and reports normalized URLs", async () => {
    writeConfig([
      { name: "entries", baseUrl, index: "registry-a.json" },
      { name: "broken", baseUrl, index: "registry-fail.json" }
    ]);

    const { SkillManager } = require(skillManagerJsPath);
    const sm = new SkillManager(mockProxyManager);

    const result = await sm.handleToolCall("list_registry", {});
    const text = result.content[0].text;

    expect(result.isError).not.toBe(true);
    expect(text).toContain("registry-entry-skill");
    expect(text).toContain(`${baseUrl}/skills/entries-skill.md`);
    expect(text).toContain("Registry errors:");
    expect(text).toContain("broken: HTTP 500");
  });

  it("searches across fetched registries using the shared fetch path", async () => {
    writeConfig([
      { name: "entries", baseUrl, index: "registry-a.json" },
      { name: "skills", baseUrl, index: "registry-b.json" }
    ]);

    const { SkillManager } = require(skillManagerJsPath);
    const sm = new SkillManager(mockProxyManager);

    const result = await sm.handleToolCall("list_registry", { query: "entries" });
    const text = result.content[0].text;

    expect(text).toContain("registry-entry-skill");
    expect(text).not.toContain("skills-format-skill");
  });

  it("reuses RegistryManager cache for repeated listRegistrySkills calls", async () => {
    writeConfig([
      { name: "entries", baseUrl, index: "registry-a.json" }
    ]);

    const { SkillManager } = require(skillManagerJsPath);
    const sm = new SkillManager(mockProxyManager);

    const first = await sm.listRegistrySkills();
    const second = await sm.listRegistrySkills();

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(requestCounts["/registry-a.json"]).toBe(1);
  });
});
