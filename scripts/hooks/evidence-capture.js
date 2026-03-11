#!/usr/bin/env node
'use strict';

const path = require('path');
const { requireHookSafely } = require('./fail-safe-loader');

requireHookSafely({
  hookName: 'evidence-capture',
  modulePath: path.join(__dirname, '..', 'evidence-capture.js')
});
