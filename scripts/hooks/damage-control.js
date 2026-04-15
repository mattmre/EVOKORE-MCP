#!/usr/bin/env node
// @AI:NAV[SEC:requires] Module requires and constants
'use strict';

const path = require('path');
const { requireHookSafely } = require('./fail-safe-loader');
// @AI:NAV[END:requires]

requireHookSafely({
  hookName: 'damage-control',
  modulePath: path.join(__dirname, '..', 'damage-control.js')
});
