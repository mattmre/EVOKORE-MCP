---
title: "M2.4: Container-Based Skill Sandbox Isolation"
date: 2026-03-26
status: implemented
milestone: M2.4
---

# M2.4: Container-Based Skill Sandbox Isolation

## Problem Statement

The `execute_skill` tool in EVOKORE-MCP runs extracted code blocks from skill
files in a subprocess sandbox (temp directory, filtered environment, 30s timeout,
1MB output limit). While this provides basic isolation, it shares the host
process's filesystem, network, and kernel namespace. A malicious or buggy skill
could:

- Read arbitrary host files outside the temp directory
- Make outbound network requests (exfiltration, C2 callbacks)
- Fork-bomb or consume unbounded memory/CPU
- Escalate privileges if running as a privileged user

## Solution: Container Sandbox Layer

`src/ContainerSandbox.ts` introduces a container-based execution layer that
wraps skill code in a Docker or Podman container with strong security defaults:

| Control                | Setting                            |
| ---------------------- | ---------------------------------- |
| Network                | `--network=none`                   |
| Filesystem             | `--read-only` + `/tmp` tmpfs only  |
| Memory                 | `--memory=256m` (configurable)     |
| CPU                    | `--cpus=1` (configurable)          |
| PID limit              | `--pids-limit=100`                 |
| Privilege escalation   | `--security-opt=no-new-privileges` |
| User                   | `--user=1000:1000` (non-root)      |

### Mode Selection

The sandbox mode is controlled by `EVOKORE_SANDBOX_MODE`:

- **`auto`** (default): Detect Docker/Podman. If available, use container
  sandbox. Otherwise fall back to subprocess with a stderr warning.
- **`container`**: Always use container sandbox. Fails with an error if no
  runtime is detected.
- **`process`**: Always use the legacy subprocess sandbox.

### Image Strategy

No custom Dockerfiles are needed. The sandbox uses pre-built minimal images:

| Language       | Image                  | Entry command    |
| -------------- | ---------------------- | ---------------- |
| bash, sh       | `alpine:latest`        | `sh -e`          |
| javascript, js | `node:20-alpine`       | `node`           |
| typescript, ts | `node:20-alpine`       | `npx tsx`        |
| python, py     | `python:3.12-alpine`   | `python3`        |

Code is written to a host temp directory and bind-mounted read-only into the
container at `/tmp/sandbox/`.

### Execution Flow

1. Write code to host temp directory
2. Build `docker run` / `podman run` CLI args with security flags
3. Bind-mount code directory read-only
4. Inject environment variables via `-e` flags
5. Execute with timeout and output size limits
6. Parse stdout/stderr/exit code
7. Clean up host temp directory

### Graceful Fallback

`ProcessSandbox` implements the same `execute()` interface as
`ContainerSandbox`, so the caller does not need to branch. The factory function
`createSandbox()` returns whichever backend is appropriate for the resolved mode.

## Environment Variables

| Variable                    | Default | Description                                |
| --------------------------- | ------- | ------------------------------------------ |
| `EVOKORE_SANDBOX_MODE`      | `auto`  | Sandbox backend: container, process, auto  |
| `EVOKORE_SANDBOX_MEMORY_MB` | `256`   | Container memory limit in MB               |
| `EVOKORE_SANDBOX_CPU_LIMIT` | `1`     | Container CPU limit                        |

## Runtime Detection

Detection is done by running `docker info --format {{.ID}}` or `podman info
--format {{.ID}}` with a 5-second timeout. The result is cached for the process
lifetime (`detectContainerRuntime()`). A `resetRuntimeCache()` function is
exported for test use.

## Integration with SkillManager

`SkillManager.executeCodeBlock()` now delegates to the unified sandbox layer
via `createSandbox()`. The return type is extended with an optional
`sandboxType` field so the `execute_skill` tool response includes which backend
was used (e.g., `[sandbox: container]` or `[sandbox: process]`).

## Security Comparison

| Vector                    | Process sandbox | Container sandbox |
| ------------------------- | --------------- | ----------------- |
| Host filesystem read      | Possible        | Blocked           |
| Network exfiltration      | Possible        | Blocked           |
| Fork bombing              | Partial (OOM)   | Blocked (PID 100) |
| Memory exhaustion         | Partial         | Blocked (256MB)   |
| Privilege escalation      | Possible        | Blocked           |
| CPU exhaustion            | Timeout only    | CPU limit + timeout|
| Write to host filesystem  | Temp dir only   | Blocked (read-only)|

## Test Coverage

Tests in `tests/integration/container-sandbox-validation.test.ts`:

**Always-run tests:**
- Module exports correct interfaces and functions
- `isContainerRuntimeAvailable()` returns boolean
- `getImageSpec()` maps all languages correctly
- `buildSecurityArgs()` includes all security flags
- `getSecurityFlagDescriptor()` returns correct descriptor
- `resolveSandboxMode()` handles all modes
- ProcessSandbox fallback executes JS, handles errors, enforces timeout
- `createSandbox()` factory works in all modes
- SkillManager source imports ContainerSandbox
- Environment variable documentation in example file

**Container-gated tests (skipped without Docker):**
- JavaScript execution in container
- Python execution in container
- Bash execution in container
- Timeout enforcement in container
- Network isolation verification
- Non-root user verification
- Environment variable passing
- Custom memory/CPU limits

## Dependencies

No new npm dependencies. Uses only `child_process.execFile` and standard Node
APIs. Docker or Podman is detected at runtime and is not a hard requirement.

## Future Work

- Container image pre-pull on startup (avoid cold-start latency)
- Per-language resource limits (e.g., more memory for Python ML workloads)
- Seccomp profile for further syscall filtering
- Container reuse pool for high-throughput scenarios
- gVisor/Kata Containers support for defense-in-depth
