#!/usr/bin/env node
'use strict';

const path = require('path');
const { requireHookSafely } = require('./fail-safe-loader');

requireHookSafely({
  hookName: 'bash-throttle',
  modulePath: path.join(__dirname, '..', 'bash-throttle.js')
});
