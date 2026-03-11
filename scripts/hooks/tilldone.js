#!/usr/bin/env node
'use strict';

const path = require('path');
const { requireHookSafely } = require('./fail-safe-loader');

requireHookSafely({
  hookName: 'tilldone',
  modulePath: path.join(__dirname, '..', 'tilldone.js')
});
