#!/usr/bin/env node
'use strict';

const path = require('path');
const { requireHookSafely } = require('./fail-safe-loader');

requireHookSafely({
  hookName: 'purpose-gate',
  modulePath: path.join(__dirname, '..', 'purpose-gate.js')
});
