'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const LOGS_DIR = path.join(os.homedir(), '.evokore', 'logs');
const HOOKS_LOG_PATH = path.join(LOGS_DIR, 'hooks.jsonl');

function writeBootstrapFailSafeEvent(entry) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const payload = Object.assign({
      ts: new Date().toISOString(),
      event: 'bootstrap_fail_safe'
    }, entry);
    fs.appendFileSync(HOOKS_LOG_PATH, JSON.stringify(payload) + '\n');
  } catch {
    // Best effort only. Hook safety must not depend on logging.
  }
}

function requireHookSafely({ hookName, modulePath }) {
  try {
    require(modulePath);
  } catch (error) {
    writeBootstrapFailSafeEvent({
      hook: hookName,
      module_path: modulePath,
      error: String(error && error.message ? error.message : error)
    });
    process.exit(0);
  }
}

module.exports = {
  requireHookSafely
};
