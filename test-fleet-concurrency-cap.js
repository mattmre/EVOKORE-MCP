'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Wave 0d-f regression coverage for FleetManager's
// EVOKORE_PANEL_MAX_CONCURRENCY semaphore.

const { FleetManager, resolvePanelMaxConcurrency } = require('./dist/FleetManager');

test('Wave 0d-f: resolvePanelMaxConcurrency defaults to 5', () => {
  const prev = process.env.EVOKORE_PANEL_MAX_CONCURRENCY;
  delete process.env.EVOKORE_PANEL_MAX_CONCURRENCY;
  try {
    assert.strictEqual(resolvePanelMaxConcurrency(), 5);
  } finally {
    if (prev !== undefined) process.env.EVOKORE_PANEL_MAX_CONCURRENCY = prev;
  }
});

test('Wave 0d-f: resolvePanelMaxConcurrency clamps to [1, 50]', () => {
  const prev = process.env.EVOKORE_PANEL_MAX_CONCURRENCY;
  try {
    process.env.EVOKORE_PANEL_MAX_CONCURRENCY = '0';
    assert.strictEqual(resolvePanelMaxConcurrency(), 1, '0 clamps up to 1');
    process.env.EVOKORE_PANEL_MAX_CONCURRENCY = '-3';
    assert.strictEqual(resolvePanelMaxConcurrency(), 1, 'negative clamps up to 1');
    process.env.EVOKORE_PANEL_MAX_CONCURRENCY = '999';
    assert.strictEqual(resolvePanelMaxConcurrency(), 50, '999 clamps down to 50');
    process.env.EVOKORE_PANEL_MAX_CONCURRENCY = '7';
    assert.strictEqual(resolvePanelMaxConcurrency(), 7, '7 passes through');
    process.env.EVOKORE_PANEL_MAX_CONCURRENCY = 'not-a-number';
    assert.strictEqual(resolvePanelMaxConcurrency(), 5, 'non-numeric falls back to default');
  } finally {
    if (prev === undefined) delete process.env.EVOKORE_PANEL_MAX_CONCURRENCY;
    else process.env.EVOKORE_PANEL_MAX_CONCURRENCY = prev;
  }
});

test('Wave 0d-f: FleetManager exposes getConcurrencyState() snapshot', () => {
  const fm = new FleetManager();
  const state = fm.getConcurrencyState();
  assert.strictEqual(typeof state.max, 'number');
  assert.strictEqual(typeof state.inFlight, 'number');
  assert.strictEqual(typeof state.queued, 'number');
  assert.ok(state.max >= 1 && state.max <= 50);
  assert.strictEqual(state.inFlight, 0);
  assert.strictEqual(state.queued, 0);
});

test('Wave 0d-f: setMaxConcurrencyForTests overrides the cap', () => {
  const fm = new FleetManager();
  fm.setMaxConcurrencyForTests(2);
  assert.strictEqual(fm.getConcurrencyState().max, 2);
  // Below 1 is rejected silently.
  fm.setMaxConcurrencyForTests(0);
  assert.strictEqual(fm.getConcurrencyState().max, 2, '0 should not override');
  fm.setMaxConcurrencyForTests(NaN);
  assert.strictEqual(fm.getConcurrencyState().max, 2, 'NaN should not override');
  // Above 50 is clamped.
  fm.setMaxConcurrencyForTests(999);
  assert.strictEqual(fm.getConcurrencyState().max, 50);
});

test('Wave 0d-f: handleSpawn queues spawns past the cap and drains FIFO on release', async () => {
  const fm = new FleetManager();
  // Force cap to 2 for deterministic semaphore behavior.
  fm.setMaxConcurrencyForTests(2);

  // Spawn a portable command that lives briefly so we can exercise the
  // slot accounting. `unref()` inside FleetManager prevents the parent
  // from waiting on the child once we kill it via fleet_release.
  const node = process.execPath;
  const args = ['-e', 'setTimeout(()=>{}, 60_000)'];

  // Fire 4 spawns in parallel. With cap=2, the first two should resolve
  // immediately and the next two should queue.
  const r1 = fm.handleTool('fleet_spawn', { command: node, args });
  const r2 = fm.handleTool('fleet_spawn', { command: node, args });
  const r3 = fm.handleTool('fleet_spawn', { command: node, args });
  const r4 = fm.handleTool('fleet_spawn', { command: node, args });

  // r1 + r2 are immediate (already in flight). Awaiting them does not
  // require a release.
  const a1 = JSON.parse((await r1).content[0].text);
  const a2 = JSON.parse((await r2).content[0].text);

  let state = fm.getConcurrencyState();
  assert.strictEqual(state.inFlight, 2, `expected inFlight=2 after r1+r2 spawn, got ${state.inFlight}`);
  assert.strictEqual(state.queued, 2, `expected queued=2 after r3+r4 queue, got ${state.queued}`);

  // Releasing r1 drains the next waiter (r3) FIFO.
  await fm.handleTool('fleet_release', { agentId: a1.agentId });
  const a3 = JSON.parse((await r3).content[0].text);

  state = fm.getConcurrencyState();
  assert.strictEqual(state.inFlight, 2, 'expected inFlight=2 after r1 release + r3 drain');
  assert.strictEqual(state.queued, 1, 'expected queued=1 after r3 drained');

  // Releasing r2 drains r4.
  await fm.handleTool('fleet_release', { agentId: a2.agentId });
  const a4 = JSON.parse((await r4).content[0].text);

  state = fm.getConcurrencyState();
  assert.strictEqual(state.inFlight, 2);
  assert.strictEqual(state.queued, 0);

  // Release the remaining slots cleanly.
  await fm.handleTool('fleet_release', { agentId: a3.agentId });
  await fm.handleTool('fleet_release', { agentId: a4.agentId });

  // Force-stop in case any child is still alive (best-effort).
  fm.stop();

  state = fm.getConcurrencyState();
  assert.strictEqual(state.inFlight, 0, 'expected all slots released after stop');
  assert.strictEqual(state.queued, 0);
});

test('Wave 0d-f: stop() drains queued spawn waiters so callers do not deadlock', async () => {
  const fm = new FleetManager();
  fm.setMaxConcurrencyForTests(1);

  const node = process.execPath;
  const args = ['-e', 'setTimeout(()=>{}, 60_000)'];

  const r1 = fm.handleTool('fleet_spawn', { command: node, args });
  // r2 and r3 will queue behind r1 (cap=1).
  const r2 = fm.handleTool('fleet_spawn', { command: node, args });
  const r3 = fm.handleTool('fleet_spawn', { command: node, args });

  await new Promise((resolve) => setImmediate(resolve));

  let state = fm.getConcurrencyState();
  assert.strictEqual(state.inFlight, 1);
  assert.strictEqual(state.queued, 2);

  // Calling stop() should drain the queued resolvers so r2/r3 do not
  // hang forever. We do not assert specific tool result shape here —
  // just that the promises resolve in a bounded time.
  fm.stop();

  // Race each remaining spawn against a hard timeout to prove no deadlock.
  await Promise.all([
    Promise.race([
      r1.catch(() => null),
      new Promise((_, reject) => setTimeout(() => reject(new Error('r1 hung')), 5000))
    ]),
    Promise.race([
      r2.catch(() => null),
      new Promise((_, reject) => setTimeout(() => reject(new Error('r2 hung')), 5000))
    ]),
    Promise.race([
      r3.catch(() => null),
      new Promise((_, reject) => setTimeout(() => reject(new Error('r3 hung')), 5000))
    ])
  ]);

  state = fm.getConcurrencyState();
  assert.strictEqual(state.queued, 0);
});
