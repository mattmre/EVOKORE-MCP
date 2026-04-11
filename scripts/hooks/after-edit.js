#!/usr/bin/env node
'use strict';

const path = require('path');
const { requireHookSafely } = require('./fail-safe-loader');

requireHookSafely({
  hookName: 'after-edit',
  modulePath: path.join(__dirname, '..', 'after-edit.js')
});
