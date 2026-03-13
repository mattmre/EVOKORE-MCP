#!/usr/bin/env node
'use strict';

const path = require('path');
const { requireHookSafely } = require('./fail-safe-loader');

requireHookSafely({
  hookName: 'repo-audit-hook',
  modulePath: path.join(__dirname, '..', 'repo-audit-hook-runtime.js')
});
