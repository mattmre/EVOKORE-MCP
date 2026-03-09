---
name: tool-governance
description: Tool governance framework with allowlists, progressive disclosure, and YAML-based tool definitions
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  tags: ["governance", "tools", "security", "allowlists", "progressive-disclosure"]
---

# Tool Governance Skill

## Overview

This skill imports Agent33's tool governance framework, providing a structured approach to managing tool access, approval, and runtime constraints. The framework is built on three core principles:

1. **Default-deny allowlisting** -- Tools and network access are off unless explicitly approved via allowlist entries with scoped permissions.
2. **Provenance tracking** -- Every tool must pass a provenance checklist covering ownership, licensing, security posture, and revocation plans.
3. **Progressive disclosure** -- Tool schemas are loaded incrementally (L0 through L2+) so agents only consume the detail they need for the current task.

## Reference Documents

| File | Purpose |
|------|---------|
| `TOOL_GOVERNANCE.md` | Allowlist policy, provenance checklist, governance checkpoints |
| `TOOLS_AS_CODE.md` | Progressive disclosure levels, minimal schemas, registry workflow |

## Tool Definitions

| Definition | Governance Constraints |
|------------|----------------------|
| `definitions/shell.yml` | Command allowlist/denylist, max timeout 120s, 1 MB output cap |
| `definitions/browser.yml` | Domain allowlist, max timeout 60s |
| `definitions/file_ops.yml` | Path allowlist, 1 MB output cap |
| `definitions/reader.yml` | Domain allowlist, 5 MB response cap |
| `definitions/search.yml` | Domain allowlist, configurable result count |
| `definitions/web_fetch.yml` | Domain allowlist, 5 MB response cap, max timeout 120s |

## Progressive Disclosure Levels

| Level | What is loaded | When to use |
|-------|---------------|-------------|
| **L0** | Name + summary + owner | Tool discovery and inventory |
| **L1** | Inputs/outputs summary | Task planning and tool selection |
| **L2** | Full schema and constraints | Execution-time validation |

## Integration with EVOKORE-MCP Security Layer

This governance framework complements EVOKORE-MCP's existing security mechanisms:

- **`damage-control-rules.yaml`** -- EVOKORE's PreToolUse hook (`scripts/damage-control.js`) already enforces a deny-list of dangerous commands, zero-access paths for secrets, read-only paths, and no-delete paths. Agent33's `shell.yml` definition provides the inverse view: an explicit *allowlist* of permitted executables. Together, the two layers form a defense-in-depth posture where EVOKORE blocks known-dangerous patterns and Agent33-style governance only permits known-safe commands.

- **`permissions.yml`** -- EVOKORE's HITL permission system (`allow`, `require_approval`, `deny`) governs proxied MCP tool invocations at runtime. Agent33's `governance.required_scope` field and provenance checklists operate at the *registration* layer, ensuring tools are vetted before they ever reach the runtime permission check. The two systems are complementary: provenance gates tool onboarding, permissions gate tool execution.

- **Mapping** -- When adopting these specs operationally, each YAML definition's `governance.command_allowlist` or `governance.domain_allowlist` should be cross-referenced against `damage-control-rules.yaml` deny patterns to ensure no contradictions exist between the two policy sets.
