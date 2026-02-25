import assert from "node:assert/strict";
import { resolveCommandForPlatform } from "./src/utils/resolveCommandForPlatform";

assert.equal(resolveCommandForPlatform("npx", "win32"), "npx.cmd");
assert.equal(resolveCommandForPlatform("npx", "linux"), "npx");

assert.equal(resolveCommandForPlatform("uv", "win32"), "uv");
assert.equal(resolveCommandForPlatform("uvx", "win32"), "uvx");
assert.equal(resolveCommandForPlatform("uv", "linux"), "uv");
assert.equal(resolveCommandForPlatform("uvx", "linux"), "uvx");

console.log("Windows command runtime validation passed.");
