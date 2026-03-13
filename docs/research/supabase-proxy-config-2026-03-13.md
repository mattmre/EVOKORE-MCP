# Supabase as Proxied Child Server

**Date:** 2026-03-13
**Task:** T40 - Supabase MCP Integration
**Status:** Implemented

## Why Supabase as a Child Server

EVOKORE-MCP already proxies GitHub (code), filesystem (local), and ElevenLabs (voice) as child MCP servers. Adding Supabase extends the aggregator to cover database and backend-as-a-service operations, enabling AI agents to:

- Query project metadata and table schemas for context-aware code generation
- Inspect migration history to understand database evolution
- Search Supabase documentation inline during development
- Read logs for debugging and monitoring
- Execute SQL queries (with approval) for data exploration

The `@supabase/mcp-server-supabase` package is the official Supabase MCP server, maintained by the Supabase team. It exposes tools for project management, SQL execution, migrations, edge functions, and documentation search.

## Permission Model Rationale

The permission rules follow the principle of least privilege with three tiers:

### Allowed (no confirmation needed)
Read-only operations that expose metadata but cannot modify state:
- `list_projects`, `get_project`, `get_project_url` - project discovery
- `list_tables`, `list_migrations`, `list_extensions` - schema inspection
- `get_logs` - observability
- `list_organizations`, `get_organization` - org context
- `search_docs` - documentation lookup

### Require Approval (human-in-the-loop)
Operations that modify state but are recoverable:
- `execute_sql` - arbitrary SQL execution (even in read-only mode, approval adds a second safety layer)
- `apply_migration` - schema changes
- `restore_project` - restoring a paused project
- `create_branch` / `merge_branch` - database branching operations
- `deploy_edge_function` - deploying serverless functions

### Denied (blocked entirely)
Destructive or irreversible operations unsuitable for autonomous execution:
- `create_project` - resource provisioning with billing implications
- `pause_project` - availability-impacting action
- `delete_branch` - irreversible data loss

### Additional Safety: `--read-only` Flag

The server is launched with `--read-only` in the args array. This is a server-side safety layer provided by `@supabase/mcp-server-supabase` that restricts SQL execution to read-only queries at the server level, independent of the permission rules. The permission-level `require_approval` on `execute_sql` adds a second, client-side gate.

## Setup Requirements

1. **Access Token**: Generate a Supabase access token at https://supabase.com/dashboard/account/tokens
2. **Environment Variable**: Add `SUPABASE_ACCESS_TOKEN=<your_token>` to `.env`
3. **No Additional Dependencies**: The server is fetched on-demand via `npx -y`

The server will fail to start if `SUPABASE_ACCESS_TOKEN` is not set in `.env`. This is the same behavior as the ElevenLabs server when `ELEVENLABS_API_KEY` is missing -- ProxyManager logs a warning but other servers continue operating normally.

## Integration Points

- **ProxyManager**: Discovers `supabase` in `mcp.config.json` automatically. No code changes needed.
- **SecurityManager**: Reads permission rules from `permissions.yml`. Tool names are prefixed as `supabase_*`.
- **HITL Flow**: Tools marked `require_approval` follow the existing `_evokore_approval_token` pattern.
- **Tool Discovery**: The `supabase_*` tools appear in `tools/list` responses alongside other proxied tools.
- **Env Interpolation**: `${SUPABASE_ACCESS_TOKEN}` is resolved by ProxyManager from `process.env`.

## References

- Package: https://www.npmjs.com/package/@supabase/mcp-server-supabase
- Supabase MCP docs: https://supabase.com/docs/guides/getting-started/mcp
