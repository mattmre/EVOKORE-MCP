# M2.3: Supabase Live Validation Research

**Date:** 2026-03-26
**Milestone:** M2.3 - Supabase Live Validation
**Status:** Implemented

## Overview

EVOKORE-MCP proxies the Supabase MCP server (`@supabase/mcp-server-supabase`) as a child
server via `mcp.config.json`. This milestone adds production validation tests that verify the
integration works correctly when credentials are available and degrades gracefully when they
are not.

## Supabase Permission Tiers

The Supabase integration uses three permission tiers defined in `permissions.yml`, reflecting
the principle of least privilege for autonomous AI tool use:

### Allow (10 tools) - Safe read operations

| Tool | Purpose |
|------|---------|
| `supabase_list_projects` | List all projects in the account |
| `supabase_get_project` | Get details for a specific project |
| `supabase_list_tables` | List tables in a project database |
| `supabase_list_migrations` | View migration history |
| `supabase_list_extensions` | List installed Postgres extensions |
| `supabase_get_logs` | Read project logs |
| `supabase_get_project_url` | Get the project's API URL |
| `supabase_list_organizations` | List organizations the user belongs to |
| `supabase_get_organization` | Get details for a specific organization |
| `supabase_search_docs` | Search Supabase documentation |

**Rationale:** These are purely read operations that cannot mutate state. They are safe for
autonomous execution by AI agents without human confirmation.

### Require Approval (6 tools) - Write/mutating operations

| Tool | Purpose |
|------|---------|
| `supabase_execute_sql` | Run arbitrary SQL against the database |
| `supabase_apply_migration` | Apply a database migration |
| `supabase_restore_project` | Restore a project from backup |
| `supabase_create_branch` | Create a database branch |
| `supabase_merge_branch` | Merge a database branch |
| `supabase_deploy_edge_function` | Deploy an edge function |

**Rationale:** These tools modify state (data, schema, deployments). EVOKORE's HITL
(Human-in-the-Loop) mechanism requires the AI to obtain an approval token from the user
before execution. The `_evokore_approval_token` argument is injected into the tool schema
by ProxyManager.

### Deny (3 tools) - Destructive/irreversible operations

| Tool | Purpose |
|------|---------|
| `supabase_create_project` | Create a new Supabase project (billing implications) |
| `supabase_pause_project` | Pause a running project |
| `supabase_delete_branch` | Delete a database branch |

**Rationale:** These operations are either irreversible, have billing implications, or can
cause data loss. They are completely blocked by the security interceptor regardless of
whether an approval token is provided.

## Credential-Gated Test Pattern

The validation suite uses a credential-gated pattern to support both CI (no credentials)
and local development (with credentials):

```typescript
const hasCredentials = Boolean(process.env.SUPABASE_ACCESS_TOKEN);

// Configuration tests always run (no credentials needed)
describe('configuration validation', () => { ... });

// Credential availability is detected and reported (never fails)
describe('credential availability', () => { ... });

// Live tests are skipped when credentials are missing
describe.skipIf(!hasCredentials)('live integration', () => { ... });

// Degradation tests always run (verify error handling)
describe('degradation validation', () => { ... });
```

This pattern ensures:
1. CI always gets useful validation (config structure, permission tiers, RBAC roles)
2. Local developers with credentials get full live API validation
3. Missing credentials produce informative warnings, not failures

## What "Live Validation" Means

Live validation tests make real API calls to the Supabase Management API through the
proxied MCP child server:

1. **Server boot** -- EVOKORE spawns the `@supabase/mcp-server-supabase` process, which
   authenticates with the `SUPABASE_ACCESS_TOKEN`
2. **Tool listing** -- The child server exposes its tools, which EVOKORE prefixes with
   `supabase_` and registers
3. **Tool execution** -- Tests call `supabase_list_projects` and
   `supabase_list_organizations` to verify end-to-end proxy flow
4. **Security enforcement** -- Tests verify that deny-tier tools are rejected and
   require_approval tools return the HITL token prompt

Live tests are inherently slower (each spawns an EVOKORE server process) and require
network access. They should be run locally, not in CI.

## RBAC Integration

The permission tiers integrate with EVOKORE's RBAC system:

- **admin** role: `default_permission: allow` -- all supabase tools are accessible
- **developer** role: `default_permission: require_approval` with overrides for
  `supabase_list_projects` (allow), `supabase_list_tables` (allow),
  `supabase_create_project` (deny), `supabase_delete_branch` (deny)
- **readonly** role: `default_permission: deny` with overrides for read-only supabase
  tools (list_projects, get_project, list_tables, search_docs)

## Configuration Details

### mcp.config.json entry

```json
{
  "supabase": {
    "command": "npx",
    "args": ["-y", "@supabase/mcp-server-supabase", "--read-only"],
    "env": {
      "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
    }
  }
}
```

Key points:
- `--read-only` flag provides an additional safety layer at the child server level
- `${SUPABASE_ACCESS_TOKEN}` uses EVOKORE's env interpolation (resolved from `.env`)
- No explicit `transport` key means stdio transport (default)

### Environment variable

Documented in `.env.example`:
```
SUPABASE_ACCESS_TOKEN=your_supabase_access_token_here
```

Token is obtained from: https://supabase.com/dashboard/account/tokens

## Files Modified/Created

| File | Purpose |
|------|---------|
| `tests/integration/supabase-live-validation.test.ts` | Main vitest suite (config + live + degradation) |
| `test-supabase-config-validation.js` | Root-level CI-safe config validation |
| `docs/research/m2-3-supabase-validation-research-2026-03-26.md` | This research document |
