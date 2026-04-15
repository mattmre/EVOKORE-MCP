#!/usr/bin/env node
/**
 * EVOKORE Orchestration Runner CLI
 *
 * Usage:
 *   node scripts/orchestration-runner.js start --name <name> --spec <path-to-agents-json>
 *   node scripts/orchestration-runner.js stop --run-id <ORCH-NNN>
 *   node scripts/orchestration-runner.js status [--run-id <ORCH-NNN>]
 *
 * Run state is persisted to ~/.evokore/orchestration-runs/{runId}.json so stop /
 * status work across CLI invocations. The FleetManager and ClaimsManager state
 * itself still lives in OS process + ~/.evokore/.claims respectively; this file
 * only records the run composition so a later `stop` can rebuild it.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const OrchestrationRuntimeMod = require(path.join(DIST, "OrchestrationRuntime.js"));
const FleetManagerMod = require(path.join(DIST, "FleetManager.js"));
const ClaimsManagerMod = require(path.join(DIST, "ClaimsManager.js"));

const RUNS_DIR = path.join(os.homedir(), ".evokore", "orchestration-runs");

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function ensureRunsDir() {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
}

function saveRun(record) {
  ensureRunsDir();
  const file = path.join(RUNS_DIR, `${record.runId}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2), "utf8");
}

function loadRun(runId) {
  const file = path.join(RUNS_DIR, `${runId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function listRuns() {
  ensureRunsDir();
  const entries = fs.readdirSync(RUNS_DIR);
  const runs = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(RUNS_DIR, entry), "utf8")
      );
      runs.push(parsed);
    } catch {
      /* ignore corrupt entries */
    }
  }
  return runs;
}

function buildRuntime() {
  const fleet = new FleetManagerMod.FleetManager();
  const claims = new ClaimsManagerMod.ClaimsManager();
  const runtime = new OrchestrationRuntimeMod.OrchestrationRuntime(fleet, claims);
  return { runtime, fleet, claims };
}

async function cmdStart(args) {
  const name = args.name;
  const specPath = args.spec;
  if (!name || typeof name !== "string") {
    throw new Error("start: --name <string> is required");
  }
  if (!specPath || typeof specPath !== "string") {
    throw new Error("start: --spec <path-to-json> is required");
  }
  const absSpec = path.isAbsolute(specPath) ? specPath : path.resolve(process.cwd(), specPath);
  if (!fs.existsSync(absSpec)) {
    throw new Error(`start: spec file not found: ${absSpec}`);
  }
  const raw = fs.readFileSync(absSpec, "utf8");
  let specs;
  try {
    specs = JSON.parse(raw);
  } catch (err) {
    throw new Error(`start: spec file is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new Error("start: spec file must contain a non-empty array of AgentSpec objects");
  }

  const { runtime } = buildRuntime();
  const record = await runtime.startRun(name, specs);
  saveRun(record);
  return record;
}

async function cmdStop(args) {
  const runId = args["run-id"] || args.runId;
  if (!runId || typeof runId !== "string") {
    throw new Error("stop: --run-id <ORCH-NNN> is required");
  }
  const persisted = loadRun(runId);
  if (!persisted) {
    throw new Error(`stop: no persisted record for runId ${runId}`);
  }
  const { runtime } = buildRuntime();
  // Rehydrate the runtime's in-memory map from the persisted record so that
  // stopRun can release the right claims + fleet agents.
  runtime.getRuns().set(runId, persisted);
  const result = await runtime.stopRun(runId);
  if (result && result.isError) {
    throw new Error(result.content?.[0]?.text || "stopRun returned error");
  }
  saveRun(result);
  return result;
}

async function cmdStatus(args) {
  const runId = args["run-id"] || args.runId;
  const { runtime } = buildRuntime();
  if (runId) {
    const persisted = loadRun(runId);
    if (!persisted) {
      throw new Error(`status: no persisted record for runId ${runId}`);
    }
    runtime.getRuns().set(runId, persisted);
    const result = await runtime.statusRun(runId);
    if (result && result.isError) {
      throw new Error(result.content?.[0]?.text || "statusRun returned error");
    }
    saveRun(result);
    return result;
  }
  for (const persisted of listRuns()) {
    if (persisted && typeof persisted.runId === "string") {
      runtime.getRuns().set(persisted.runId, persisted);
    }
  }
  const result = await runtime.statusRun();
  return result;
}

async function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  const args = parseArgs(argv.slice(1));

  let result;
  try {
    if (sub === "start") {
      result = await cmdStart(args);
    } else if (sub === "stop") {
      result = await cmdStop(args);
    } else if (sub === "status") {
      result = await cmdStatus(args);
    } else {
      process.stderr.write(
        "Usage:\n" +
          "  node scripts/orchestration-runner.js start --name <name> --spec <path>\n" +
          "  node scripts/orchestration-runner.js stop --run-id <ORCH-NNN>\n" +
          "  node scripts/orchestration-runner.js status [--run-id <ORCH-NNN>]\n"
      );
      process.exit(2);
    }
  } catch (err) {
    process.stderr.write(`[orchestration-runner] ${err.message || err}\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main();
