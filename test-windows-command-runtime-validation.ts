import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolveCommandForPlatform } from "./src/utils/resolveCommandForPlatform";


test('Windows command runtime validation', () => {
assert.equal(resolveCommandForPlatform("npx", "win32"), "npx.cmd");
assert.equal(resolveCommandForPlatform("npx", "linux"), "npx");

assert.equal(resolveCommandForPlatform("uv", "win32"), "uv");
assert.equal(resolveCommandForPlatform("uvx", "win32"), "uvx");
assert.equal(resolveCommandForPlatform("uv", "linux"), "uv");
assert.equal(resolveCommandForPlatform("uvx", "linux"), "uvx");

if (process.platform === "win32") {
  const result = spawnSync(resolveCommandForPlatform("npx"), ["--version"], {
    encoding: "utf8",
    shell: true,
  });

  assert.equal(result.status, 0, result.stderr || "npx --version failed");
} else {
  console.log("Skipping Windows runtime probe on non-win32 platform.");
}

});
