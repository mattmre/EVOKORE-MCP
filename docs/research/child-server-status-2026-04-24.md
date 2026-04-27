# EVOKORE-MCP Child-Server Status — 2026-04-24

**Context:** Week-1 audit remediation, issue [#282](https://github.com/mattmre/EVOKORE-MCP/issues/282) item #6. Before this change, 3 of 5 production child servers were erroring on every boot (per workflow audit, Theme E).

## Snapshot

| Server | Prior state | New state (2026-04-24) | Notes |
|---|---|---|---|
| `github` | healthy | healthy, unchanged | Uses `GITHUB_PERSONAL_ACCESS_TOKEN` which is provisioned. No action taken. |
| `fs` | healthy | healthy, unchanged | Stdio-only filesystem proxy, no env var needed. No action taken. |
| `elevenlabs` | erroring | **disabled** | `ELEVENLABS_API_KEY` env var is not set in the user's environment, so every proxy boot attempt was failing. Marked `"disabled": true` in `mcp.config.json` with a TODO `_comment`. Re-enable once the key is provisioned. The upstream package (`elevenlabs-mcp` via `uvx`) is a separate install dependency that should also be confirmed before re-enabling. |
| `supabase` | erroring | **disabled** | `SUPABASE_ACCESS_TOKEN` env var is not set. Marked `"disabled": true` with a TODO `_comment`. Re-enable once the token is in the environment. |
| `stitch` | erroring | **disabled** | `STITCH_API_KEY` env var is not set AND the upstream package reference `@google/stitch-mcp` is suspect — npx resolution has been failing, and no such package appears under Google's npm org at audit time. Marked `"disabled": true` with a TODO `_comment`. Before re-enabling, verify the correct package identifier (may need to be sourced from `@googlestitch/*` or a private registry). |

## Why disable rather than delete

The existing config entries document what the user *wants* to run, including the exact env-var names the harness expects. Deleting them would lose that intent. The `"disabled": true` flag is already honored by the proxy manager for other entries (`ghidra_headless`, `reva`, `binary_analysis`) and surfaces a clean "disabled" state in `proxy_server_status` rather than a noisy boot-loop error.

## Follow-up

No code change is required to re-enable a server — flip `"disabled"` to `false` (or delete the line) after provisioning the relevant env var. The `_comment` field documents the exact reason each server was disabled and what must be true to bring it back.

## Related

- Audit doc: `docs/research/workflow-audit-2026-04-24.md` section 2, Theme E
- Tracking issue: [#282](https://github.com/mattmre/EVOKORE-MCP/issues/282)
- PR: [#285](https://github.com/mattmre/EVOKORE-MCP/pull/285)
