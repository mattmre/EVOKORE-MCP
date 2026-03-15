# Skill Execution Sandbox Security Audit

**Date:** 2026-03-14
**Scope:** `execute_skill` tool in `src/SkillManager.ts`
**Version:** EVOKORE-MCP v3.0.0

---

## 1. Current Sandbox Implementation

The `execute_skill` tool allows executing code blocks extracted from skill markdown files. The implementation uses Node.js `child_process.execFileSync` to run code in a subprocess.

### Execution Flow

1. User calls `execute_skill` with `skill_name` and optional `step` index.
2. `extractCodeBlocks()` parses fenced code blocks from the skill's markdown content using regex: `` /```(\w*)\n([\s\S]*?)```/g ``.
3. The code block's language tag determines the executor (bash, js, python, ts).
4. Code is written to a temporary file in `os.tmpdir()` with prefix `evokore-sandbox-{timestamp}`.
5. `execFileSync` runs the appropriate interpreter with the temp file as argument.
6. The temp file is deleted in a `finally` block.

### Executor Mapping

| Language Tag      | Command   | Args        | Extension |
|-------------------|-----------|-------------|-----------|
| bash, sh          | bash / sh | [-e]        | .sh       |
| javascript, js    | node      | []          | .js       |
| python, py        | python3   | []          | .py       |
| typescript, ts    | npx       | [tsx]       | .ts       |

### Resource Limits

| Limit     | Value   | Mechanism                        |
|-----------|---------|----------------------------------|
| Timeout   | 30s     | `execFileSync` `timeout` option  |
| Output    | 1MB     | `execFileSync` `maxBuffer` option|

---

## 2. Security Boundaries and Their Strength

### Strong Boundaries

1. **No shell injection via execFileSync.** Unlike `exec()` or `execSync()` with a string command, `execFileSync` does not spawn a shell. The command and arguments are passed as an array, preventing shell metacharacter injection. This is a meaningful security boundary.

2. **Timeout enforcement.** The 30-second timeout via `execFileSync`'s `timeout` option kills the process with SIGTERM. Timed-out processes are detected via `err.killed` and reported to the user. This prevents infinite loops and long-running processes.

3. **Output size cap.** The 1MB `maxBuffer` limit prevents output-based denial of service (memory exhaustion from unbounded stdout/stderr).

4. **Temp file cleanup.** The `finally` block ensures temp files are removed even if execution fails. The timestamp-based naming avoids collisions.

5. **Language allowlist.** Only bash, sh, js, python, and ts are permitted. Unknown languages throw an error before any file is written or process is spawned.

6. **EVOKORE_SANDBOX environment flag.** Executed code receives `EVOKORE_SANDBOX=true` in its environment, which skill code can check to adjust behavior (e.g., skip destructive operations).

### Weak or Missing Boundaries

1. **No filesystem isolation.** The executed process runs with the same filesystem permissions as the EVOKORE-MCP server process. It can read/write any file the server user has access to, including `~/.ssh`, `~/.env`, project source files, etc.

2. **No network isolation.** The subprocess inherits the host's network stack. It can make outbound HTTP requests, connect to databases, or exfiltrate data.

3. **Full environment inheritance.** `process.env` is spread into the subprocess environment, exposing all environment variables including API keys, tokens, and credentials (e.g., `GITHUB_PERSONAL_ACCESS_TOKEN`, `ELEVENLABS_API_KEY`, `SUPABASE_ACCESS_TOKEN`).

4. **No process isolation (no container/chroot/seccomp).** The subprocess runs as the same OS user with the same capabilities. There is no namespace isolation, cgroup limits, or seccomp filtering.

5. **No memory or CPU limits.** Beyond the timeout, there are no resource limits on memory consumption or CPU usage. A malicious script could consume all available RAM within 30 seconds.

6. **User-supplied env merges into process.env.** The `userEnv` parameter merges into `process.env`, which means a caller could override sensitive variables like `HOME`, `PATH`, or `NODE_OPTIONS`.

---

## 3. Potential Attack Vectors and Mitigations

### Attack Vector: Secret Exfiltration

**Risk:** High
**Vector:** A malicious skill code block reads `process.env.GITHUB_PERSONAL_ACCESS_TOKEN` (or any other secret) and sends it to an external server via `fetch()` or `curl`.
**Current mitigation:** None. The EVOKORE_SANDBOX flag is advisory only.
**Recommended:** Filter sensitive env vars before passing to subprocess. Create an allowlist of safe env vars or strip known secret patterns (`*_TOKEN`, `*_KEY`, `*_SECRET`, `*_PASSWORD`).

### Attack Vector: File System Manipulation

**Risk:** High
**Vector:** A code block executes `rm -rf /` or reads sensitive files like `~/.ssh/id_rsa`.
**Current mitigation:** Bash uses `-e` flag (fail on error), but this does not prevent deliberate file operations.
**Recommended:** Execute in a temporary directory with `cwd` set to a sandboxed path. Consider using `--restricted` shell mode for bash. For stronger isolation, use Docker containers or OS-level sandboxing.

### Attack Vector: Arbitrary Process Execution

**Risk:** Medium
**Vector:** A JavaScript code block uses `child_process` to spawn additional processes (e.g., reverse shell, crypto miner).
**Current mitigation:** 30-second timeout kills the parent process, but child processes spawned by the code may survive.
**Recommended:** Use process groups (`detached: false` and killing the process group) to ensure all child processes are terminated on timeout.

### Attack Vector: Denial of Service via Memory

**Risk:** Medium
**Vector:** A code block allocates large arrays or buffers to exhaust system memory within the 30-second window.
**Current mitigation:** None beyond the 30-second timeout.
**Recommended:** Set `--max-old-space-size` for Node.js execution. For Python, use `resource.setrlimit()` wrapper. For bash, use `ulimit -v`.

### Attack Vector: Environment Variable Override

**Risk:** Low-Medium
**Vector:** The `env` parameter in `execute_skill` allows overriding arbitrary env vars, including `PATH`, `HOME`, `NODE_OPTIONS`, or `LD_PRELOAD`.
**Current mitigation:** None.
**Recommended:** Validate the `env` parameter keys against an allowlist. Block overriding system-level env vars.

### Attack Vector: Temp File Race Condition

**Risk:** Low
**Vector:** Between writing the temp file and executing it, another process could replace its contents (TOCTOU). Unlikely in practice since `os.tmpdir()` permissions usually restrict access.
**Current mitigation:** Timestamp-based unique naming reduces collision risk.
**Recommended:** Use `mkdtempSync` with mode 0o700 for a private temp directory per execution.

---

## 4. Recommendations for Hardening

### Priority 1 (High Impact, Feasible)

1. **Strip secrets from subprocess environment.** Before constructing the env object, remove keys matching `*_TOKEN`, `*_KEY`, `*_SECRET`, `*_PASSWORD`, `*_CREDENTIAL`. This prevents the most impactful attack vector (credential theft) with minimal code change.

2. **Set working directory to a sandboxed path.** Add `cwd: os.tmpdir()` to the `execFileSync` options so executed code defaults to the temp directory rather than the server's working directory.

3. **Block env overrides for system variables.** Validate the `userEnv` keys and reject `PATH`, `HOME`, `NODE_OPTIONS`, `LD_PRELOAD`, and similar system-level variables.

### Priority 2 (Medium Impact, Moderate Effort)

4. **Add memory limits per language.** Pass `--max-old-space-size=128` for Node.js. Wrap Python with a resource-limiting script. Use `ulimit` in bash execution.

5. **Kill process groups on timeout.** Use `setsid` / process group management to ensure all child processes spawned by the code are terminated when the timeout fires.

6. **Use private temp directories.** Create a unique directory per execution with `fs.mkdtempSync` and restricted permissions, then clean up the entire directory afterward.

### Priority 3 (High Impact, High Effort)

7. **Container-based isolation.** Run code blocks in a lightweight container (Docker/Podman) with network restrictions, filesystem mounts limited to the temp directory, and resource limits. This is the gold standard for sandbox security but adds deployment complexity.

8. **V8 isolate for JavaScript.** For JS/TS code blocks specifically, use `vm2` or `isolated-vm` to run code in a V8 isolate without filesystem or network access.

---

## 5. Summary

The current sandbox provides basic process-level isolation through `execFileSync` with timeout and output limits. The use of `execFileSync` (rather than shell-based `exec`) prevents shell injection. However, the sandbox does **not** isolate the filesystem, network, or environment secrets from executed code.

The most critical gap is **environment variable exposure**: all configured API keys and tokens are available to executed skill code. The recommended first step is to strip secret-bearing env vars from the subprocess environment.

The current implementation is appropriate for trusted skill code authored by the system operator. It is **not suitable** for executing untrusted or user-submitted code without the hardening improvements described above.
