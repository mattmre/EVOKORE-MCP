#!/usr/bin/env node
'use strict';

const { syncMemory } = require('./claude-memory');

try {
  const result = syncMemory();
  console.log(`[EVOKORE] Synced Claude memory to ${result.memoryDir}`);
  for (const file of result.files) {
    console.log(`- ${file}`);
  }
  process.exit(0);
} catch (error) {
  console.error(`[EVOKORE] Failed to sync Claude memory: ${error && error.message ? error.message : error}`);
  process.exit(1);
}
