#!/usr/bin/env node
'use strict';

const path = require('path');
const { requireHookSafely } = require('./fail-safe-loader');

requireHookSafely({
  hookName: 'read-before-edit',
  modulePath: path.join(__dirname, '..', 'read-before-edit.js')
});
