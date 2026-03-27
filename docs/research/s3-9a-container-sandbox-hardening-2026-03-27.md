---
title: "S3.9a: Container Sandbox Hardening"
date: 2026-03-27
status: implemented
milestone: S3.9a
---

# S3.9a: Container Sandbox Hardening

## Scope

This slice closes two deferred hardening items from the M2.4 container sandbox
research:

1. Startup image warmup to reduce first-execution latency for container-backed
   skill execution.
2. Explicit custom seccomp profile support for operators who need a stricter
   syscall policy than the container runtime default.

Per-language resource limits remain intentionally deferred to S3.9b so this
change stays narrowly scoped and low-drift.

## Design Decisions

### 1. Startup warmup is opt-in

`EVOKORE_SANDBOX_PREPULL=true` enables a startup warmup pass from
`EvokoreMCPServer.loadSubsystems()`. The warmup:

- Resolves the effective sandbox mode
- Skips immediately in `process` mode
- Detects Docker/Podman once
- Ensures the sandbox image set is present locally
- Pulls only images that are currently missing

This keeps normal startup unchanged unless an operator explicitly chooses to
trade a small startup cost for lower first-run latency.

### 2. Seccomp support stays opt-in and does not replace runtime defaults

Docker already runs containers with its default seccomp profile unless
`--security-opt seccomp=...` overrides it. Docker documents that the default
profile is moderately protective and is generally the recommended baseline. For
that reason, this slice does **not** ship a bundled replacement profile.

Instead, `EVOKORE_SANDBOX_SECCOMP_PROFILE` allows an operator to point the
container sandbox at an explicit JSON profile file when they have validated a
stricter profile for their deployment environment.

If the variable is unset, EVOKORE leaves seccomp handling to the runtime
default.

## Implementation Notes

Files changed in this slice:

- `src/ContainerSandbox.ts`
- `src/index.ts`
- `.env.example`
- `tests/integration/container-sandbox-validation.test.ts`

Key additions:

- `getSandboxImageNames()` for the canonical image set
- `warmContainerSandboxImages()` for startup warmup
- `resolveSeccompProfilePath()` for validated custom profile resolution
- `buildSecurityArgs(..., seccompProfilePath)` to append a seccomp override only
  when explicitly configured

## Validation Strategy

Coverage added for:

- Exported warmup/seccomp helpers
- Unique sandbox image set resolution
- Seccomp flag rendering in container args
- Validated seccomp profile path handling
- `.env.example` documentation for the new flags
- Startup integration wiring in `src/index.ts`

## Deferred to S3.9b

- Per-language memory/CPU tuning
- Language-specific resource profiles
- Any wider sandbox scheduling or pooling logic
