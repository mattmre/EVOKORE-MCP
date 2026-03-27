---
title: "S3.9b: Container Sandbox Resource Profiles"
date: 2026-03-27
status: implemented
milestone: S3.9b
---

# S3.9b: Container Sandbox Resource Profiles

## Scope

This slice implements the remaining deferred container-sandbox hardening item:
per-language memory and CPU limits.

S3.9a already landed:

- startup image warmup
- explicit custom seccomp override support

Those concerns stay out of scope here so S3.9b remains focused on execution
resource selection only.

## Design

### Baseline behavior stays unchanged

The existing global knobs remain the default baseline:

- `EVOKORE_SANDBOX_MEMORY_MB`
- `EVOKORE_SANDBOX_CPU_LIMIT`

If no language-specific override is configured, the container sandbox keeps
using those existing global values. This avoids changing resource behavior for
current deployments that have already tuned the global limits.

### Canonical language families

Language aliases are normalized into four operator-facing resource families:

- `bash` (`bash`, `sh`)
- `javascript` (`javascript`, `js`)
- `typescript` (`typescript`, `ts`)
- `python` (`python`, `py`)

This keeps the env var surface explicit without duplicating alias-specific keys.

### Per-language override contract

Each canonical language family gets an optional memory and CPU override:

- `EVOKORE_SANDBOX_BASH_MEMORY_MB`
- `EVOKORE_SANDBOX_BASH_CPU_LIMIT`
- `EVOKORE_SANDBOX_JAVASCRIPT_MEMORY_MB`
- `EVOKORE_SANDBOX_JAVASCRIPT_CPU_LIMIT`
- `EVOKORE_SANDBOX_TYPESCRIPT_MEMORY_MB`
- `EVOKORE_SANDBOX_TYPESCRIPT_CPU_LIMIT`
- `EVOKORE_SANDBOX_PYTHON_MEMORY_MB`
- `EVOKORE_SANDBOX_PYTHON_CPU_LIMIT`

Resolution order:

1. explicit per-language override
2. global sandbox baseline
3. hard fallback (`256MB`, `1 CPU`)

## Implementation Plan

Files in scope:

- `src/ContainerSandbox.ts`
- `.env.example`
- `tests/integration/container-sandbox-validation.test.ts`

Key additions:

- alias normalization helper
- resource-profile resolver
- per-execution resource selection inside `ContainerSandbox.executeInContainer()`

## Validation

Add tests for:

- alias normalization
- fallback to global limits
- per-language override resolution
- `.env.example` documentation for the new knobs
