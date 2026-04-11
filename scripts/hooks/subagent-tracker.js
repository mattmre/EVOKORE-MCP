#!/usr/bin/env node
'use strict';

const path = require('path');
const { requireHookSafely } = require('./fail-safe-loader');

requireHookSafely({
  hookName: 'subagent-tracker',
  modulePath: path.join(__dirname, '..', 'subagent-tracker.js')
});
