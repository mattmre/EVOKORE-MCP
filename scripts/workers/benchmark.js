#!/usr/bin/env node
'use strict';

/**
 * benchmark worker -- minimal stub that measures process startup time and
 * a tiny CPU/IO probe. Real benchmarking will land in a later wave; this
 * exists so the purpose-gate "performance" auto-trigger has a sink.
 */

function send(msg) {
  if (typeof process.send === 'function') {
    try { process.send(msg); } catch { /* ignore */ }
  }
}

function parseOptions() {
  try { return JSON.parse(process.env.WORKER_OPTIONS || '{}'); } catch { return {}; }
}

(function main() {
  send({ type: 'start', workerId: process.env.WORKER_ID });

  const opts = parseOptions();
  const iterations = Number.isFinite(opts.iterations) ? opts.iterations : 200_000;

  try {
    const t0 = Date.now();
    let acc = 0;
    for (let i = 0; i < iterations; i++) acc += Math.sqrt(i);
    const cpuMs = Date.now() - t0;

    send({
      type: 'complete',
      result: {
        startupMs: Math.round(process.uptime() * 1000),
        cpuProbeMs: cpuMs,
        cpuProbeIterations: iterations,
        cpuProbeAccumulator: acc,
        nodeVersion: process.version,
        platform: process.platform,
      },
    });
    process.exit(0);
  } catch (err) {
    send({ type: 'error', error: err && err.message ? err.message : String(err) });
    process.exit(1);
  }
})();
