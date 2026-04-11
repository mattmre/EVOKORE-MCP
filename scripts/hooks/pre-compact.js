#!/usr/bin/env node
'use strict';

const path = require('path');
const { requireHookSafely } = require('./fail-safe-loader');

requireHookSafely({
  hookName: 'pre-compact',
  modulePath: path.join(__dirname, '..', 'pre-compact.js')
});
