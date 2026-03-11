#!/usr/bin/env node
'use strict';

const path = require('path');
const { requireHookSafely } = require('./fail-safe-loader');

requireHookSafely({
  hookName: 'damage-control',
  modulePath: path.join(__dirname, '..', 'damage-control.js')
});
