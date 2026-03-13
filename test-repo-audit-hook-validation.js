'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

function check(label, fn) {
  fn(); // Let vitest catch assertion failures directly
}

test('repo audit hook validation', () => {

check('hook entrypoint exists', () => {
  const hookPath = path.resolve(__dirname, 'scripts', 'hooks', 'repo-audit-hook.js');
  assert.ok(fs.existsSync(hookPath), 'scripts/hooks/repo-audit-hook.js should exist');
});

check('hook runtime exists', () => {
  const runtimePath = path.resolve(__dirname, 'scripts', 'repo-audit-hook-runtime.js');
  assert.ok(fs.existsSync(runtimePath), 'scripts/repo-audit-hook-runtime.js should exist');
});

check('entrypoint uses fail-safe-loader pattern', () => {
  const hook = fs.readFileSync(path.resolve(__dirname, 'scripts', 'hooks', 'repo-audit-hook.js'), 'utf8');
  assert.match(hook, /fail-safe-loader/, 'entrypoint should import fail-safe-loader');
  assert.match(hook, /requireHookSafely/, 'entrypoint should use requireHookSafely');
  assert.match(hook, /repo-audit-hook-runtime/, 'entrypoint should delegate to runtime module');
});

check('runtime integrates with repo-state-audit', () => {
  const runtime = fs.readFileSync(path.resolve(__dirname, 'scripts', 'repo-audit-hook-runtime.js'), 'utf8');
  assert.match(runtime, /repo-state-audit/, 'runtime should import repo-state-audit');
  assert.match(runtime, /collectAudit/, 'runtime should call collectAudit');
});

check('runtime is opt-in via EVOKORE_REPO_AUDIT_HOOK', () => {
  const runtime = fs.readFileSync(path.resolve(__dirname, 'scripts', 'repo-audit-hook-runtime.js'), 'utf8');
  assert.match(runtime, /EVOKORE_REPO_AUDIT_HOOK/, 'runtime should check EVOKORE_REPO_AUDIT_HOOK env var');
  assert.match(runtime, /!== 'true'/, 'runtime should require explicit true value');
});

check('runtime only runs once per session via marker file', () => {
  const runtime = fs.readFileSync(path.resolve(__dirname, 'scripts', 'repo-audit-hook-runtime.js'), 'utf8');
  assert.match(runtime, /audit-done/, 'runtime should use audit-done marker file');
  assert.match(runtime, /fs\.existsSync\(markerFile\)/, 'runtime should check marker existence');
  assert.match(runtime, /fs\.writeFileSync\(markerFile/, 'runtime should write marker after audit');
});

check('runtime injects warnings via additionalContext', () => {
  const runtime = fs.readFileSync(path.resolve(__dirname, 'scripts', 'repo-audit-hook-runtime.js'), 'utf8');
  assert.match(runtime, /additionalContext/, 'runtime should use additionalContext for injection');
  assert.match(runtime, /divergenceFromMain/, 'runtime should check branch divergence');
  assert.match(runtime, /staleLocalBranches/, 'runtime should check stale branches');
  assert.match(runtime, /controlPlane/, 'runtime should check control-plane drift');
  assert.match(runtime, /worktrees/, 'runtime should check worktree count');
});

check('runtime exits 0 on all code paths (fail-safe)', () => {
  const runtime = fs.readFileSync(path.resolve(__dirname, 'scripts', 'repo-audit-hook-runtime.js'), 'utf8');
  // All process.exit calls should be exit(0)
  const exitCalls = runtime.match(/process\.exit\(\d+\)/g) || [];
  for (const call of exitCalls) {
    assert.strictEqual(call, 'process.exit(0)', `All exit calls should be exit(0), found: ${call}`);
  }
  // Catch block should not re-throw
  assert.match(runtime, /catch\s*\{/, 'runtime should have a catch block that swallows errors');
});

check('settings.json includes repo-audit-hook in UserPromptSubmit', () => {
  const settings = JSON.parse(fs.readFileSync(path.resolve(__dirname, '.claude', 'settings.json'), 'utf8'));
  const userPromptGroups = settings.hooks && settings.hooks.UserPromptSubmit;
  assert.ok(Array.isArray(userPromptGroups), 'UserPromptSubmit should be an array');

  let found = false;
  for (const group of userPromptGroups) {
    const hooks = group.hooks || [];
    for (const hook of hooks) {
      if (hook.command && hook.command.includes('repo-audit-hook')) {
        found = true;
      }
    }
  }
  assert.ok(found, 'repo-audit-hook should be registered in UserPromptSubmit hooks');
});

check('hook exits silently when EVOKORE_REPO_AUDIT_HOOK is not set', () => {
  const hookPath = path.resolve(__dirname, 'scripts', 'hooks', 'repo-audit-hook.js');
  const result = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ session_id: 'test-audit-disabled' }),
    encoding: 'utf8',
    env: Object.assign({}, process.env, { EVOKORE_REPO_AUDIT_HOOK: '' }),
    timeout: 10000
  });
  assert.strictEqual(result.status, 0, 'hook should exit 0 when disabled');
  assert.strictEqual((result.stdout || '').trim(), '', 'hook should produce no stdout when disabled');
});

check('hook produces warnings when enabled and audit finds issues', () => {
  const hookPath = path.resolve(__dirname, 'scripts', 'hooks', 'repo-audit-hook.js');
  const sessionId = 'test-audit-enabled-' + Date.now();
  const markerFile = path.join(os.homedir(), '.evokore', 'sessions', sessionId + '-audit-done');

  // Clean up any pre-existing marker
  try { fs.unlinkSync(markerFile); } catch { /* ignore */ }

  const result = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ session_id: sessionId }),
    encoding: 'utf8',
    env: Object.assign({}, process.env, { EVOKORE_REPO_AUDIT_HOOK: 'true' }),
    timeout: 15000
  });

  assert.strictEqual(result.status, 0, 'hook should exit 0 when enabled');

  // Marker file should exist after run
  assert.ok(fs.existsSync(markerFile), 'marker file should be created after audit run');

  // If there was output, it should be valid JSON with additionalContext
  const stdout = (result.stdout || '').trim();
  if (stdout) {
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.additionalContext, 'output should contain additionalContext');
    assert.match(parsed.additionalContext, /Repo Audit/, 'context should identify as Repo Audit');
  }

  // Clean up marker
  try { fs.unlinkSync(markerFile); } catch { /* ignore */ }
});

check('hook does not re-run when marker file exists', () => {
  const hookPath = path.resolve(__dirname, 'scripts', 'hooks', 'repo-audit-hook.js');
  const sessionId = 'test-audit-marker-' + Date.now();
  const sessionsDir = path.join(os.homedir(), '.evokore', 'sessions');
  const markerFile = path.join(sessionsDir, sessionId + '-audit-done');

  // Create marker file
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(markerFile, new Date().toISOString());

  const result = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ session_id: sessionId }),
    encoding: 'utf8',
    env: Object.assign({}, process.env, { EVOKORE_REPO_AUDIT_HOOK: 'true' }),
    timeout: 10000
  });

  assert.strictEqual(result.status, 0, 'hook should exit 0 with existing marker');
  assert.strictEqual((result.stdout || '').trim(), '', 'hook should produce no output when marker exists');

  // Clean up marker
  try { fs.unlinkSync(markerFile); } catch { /* ignore */ }
});

});
