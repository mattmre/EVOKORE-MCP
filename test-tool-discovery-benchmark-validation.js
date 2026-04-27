const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const benchmarkScriptPath = path.resolve(__dirname, "scripts", "benchmark-tool-discovery.js");

function runBenchmark(args = []) {
  const result = spawnSync(process.execPath, [benchmarkScriptPath, ...args], {
    cwd: __dirname,
    encoding: "utf8"
  });

  assert.strictEqual(result.status, 0, `Benchmark script should exit 0. stderr:\n${result.stderr}`);
  assert.ok(result.stdout.trim().startsWith("{"), "Benchmark script must emit JSON to stdout.");

  return {
    payload: JSON.parse(result.stdout),
    stdout: result.stdout
  };
}

function validatePayload(payload) {
  assert.strictEqual(payload.generatedAt, new Date(0).toISOString(), "generatedAt should remain deterministic.");
  assert.ok(payload.toolCounts && typeof payload.toolCounts === "object", "toolCounts must be present.");
  assert.ok(payload.payloadBytes && typeof payload.payloadBytes === "object", "payloadBytes must be present.");
  // Sprint 1.4: the synthetic benchmark now uses the real `js-tiktoken`
  // cl100k_base encoding instead of a char/4 estimate. The legacy
  // `estimatedTokens` block is replaced with a `tokens` block, plus a
  // `tokenizer` descriptor so consumers can detect the encoding.
  assert.ok(payload.tokens && typeof payload.tokens === "object", "tokens must be present.");
  assert.ok(payload.tokenizer && typeof payload.tokenizer === "object", "tokenizer descriptor must be present.");
  assert.strictEqual(typeof payload.tokenizer.kind, "string", "tokenizer.kind must be a string.");
  assert.strictEqual(typeof payload.tokenizer.encoding, "string", "tokenizer.encoding must be a string.");
  assert.ok(payload.benchmarkScenario && typeof payload.benchmarkScenario === "object", "benchmarkScenario must be present.");
  assert.ok(Array.isArray(payload.topMatches), "topMatches must be an array.");

  assert.ok(payload.toolCounts.legacy > payload.toolCounts.dynamic, "legacy tool count should exceed dynamic tool count.");
  assert.ok(payload.toolCounts.discovered > 0, "discover should return at least one match.");
  assert.ok(payload.payloadBytes.legacy > payload.payloadBytes.dynamic, "legacy payload should be larger than dynamic payload.");
  assert.ok(payload.tokens.legacy >= payload.tokens.dynamic, "legacy token count should be >= dynamic token count.");
  assert.strictEqual(payload.topMatches.length, payload.toolCounts.discovered, "topMatches length should match discovered count.");
  assert.ok(payload.topMatches.length > 0, "top matches should include the seeded exact query match.");
  assert.strictEqual(payload.benchmarkScenario.iterations, 250, "Benchmark iterations should remain stable.");
  assert.strictEqual(typeof payload.benchmarkScenario.deterministicArtifact, "boolean", "deterministicArtifact must be a boolean.");
  assert.strictEqual(typeof payload.benchmarkScenario.liveTimingsIncluded, "boolean", "liveTimingsIncluded must be a boolean.");
}

function validateLiveTimings(payload) {
  assert.ok(payload.liveTimings && typeof payload.liveTimings === "object", "liveTimings must be present when requested.");

  for (const key of ["listLegacy", "listDynamic", "discover"]) {
    const timing = payload.liveTimings[key];
    assert.ok(timing && typeof timing === "object", `${key} timing block must be present.`);
    assert.strictEqual(timing.iterations, 250, `${key} should keep the default iteration count.`);
    assert.ok(timing.avgMs >= 0, `${key}.avgMs must be non-negative.`);
    assert.ok(timing.medianMs >= 0, `${key}.medianMs must be non-negative.`);
    assert.ok(timing.p95Ms >= 0, `${key}.p95Ms must be non-negative.`);
    assert.ok(timing.p95Ms >= timing.medianMs, `${key}.p95Ms should be >= medianMs.`);
  }
}

test('tool discovery benchmark validation', () => {
  const stdoutRun = runBenchmark();
  validatePayload(stdoutRun.payload);
  assert.strictEqual(stdoutRun.payload.benchmarkScenario.deterministicArtifact, true, "Default benchmark run should stay deterministic.");
  assert.strictEqual(stdoutRun.payload.benchmarkScenario.liveTimingsIncluded, false, "Default benchmark run should omit live timings.");
  assert.ok(!Object.prototype.hasOwnProperty.call(stdoutRun.payload, "liveTimings"), "Default benchmark output should omit live timings.");

  const secondStdoutRun = runBenchmark();
  validatePayload(secondStdoutRun.payload);
  assert.deepStrictEqual(secondStdoutRun.payload, stdoutRun.payload, "Default benchmark JSON must remain deterministic across runs.");
  assert.strictEqual(secondStdoutRun.stdout, stdoutRun.stdout, "Default benchmark stdout must remain byte-stable across runs.");

  const liveTimingRun = runBenchmark(["--live-timings"]);
  validatePayload(liveTimingRun.payload);
  assert.strictEqual(liveTimingRun.payload.benchmarkScenario.deterministicArtifact, false, "Live timing mode should opt out of deterministic artifact guarantees.");
  assert.strictEqual(liveTimingRun.payload.benchmarkScenario.liveTimingsIncluded, true, "Live timing mode should record timing telemetry.");
  validateLiveTimings(liveTimingRun.payload);

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "evokore-tool-benchmark-"));
  const outputPath = path.join(outputDir, "tool-discovery-benchmark.json");

  try {
    const outputRun = runBenchmark(["--output", outputPath]);
    validatePayload(outputRun.payload);
    assert.ok(fs.existsSync(outputPath), "--output should create the requested artifact file.");

    const filePayload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.deepStrictEqual(filePayload, outputRun.payload, "Saved benchmark artifact must match stdout JSON.");
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  console.log("Tool discovery benchmark validation passed.");
});
