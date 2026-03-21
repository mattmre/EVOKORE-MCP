#!/usr/bin/env node
'use strict';

const path = require('path');
const { requireHookSafely } = require('./fail-safe-loader');

requireHookSafely({
  hookName: 'voice-stop',
  modulePath: path.join(__dirname, '..', 'voice-stop-hook.js')
});
