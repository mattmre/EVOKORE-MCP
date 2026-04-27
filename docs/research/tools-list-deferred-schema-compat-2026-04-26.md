# Schema-deferred `tools/list` — Client Compatibility Matrix

(2026-04-26 research; precedes Sprint 3 implementation)

## Summary

Schema deferral (returning `tools/list` with only `name` + `description` and omitting `inputSchema`) is **spec-legal** — the official JSON Schema marks only `name` as required on a Tool, and `inputSchema` is not in the required array ([modelcontextprotocol/modelcontextprotocol schema][spec-schema]). However, **observed client behavior is far more conservative than the spec** : multiple clients silently drop tools when schema fields are unfamiliar or missing the conventional shape, and **none** of the six clients in scope advertise a `describe_tool`/`tools/get` companion call. The recommended Sprint 3 posture is **opt-in only, behind an env flag, default off**, with EVOKORE shipping a synthetic in-band schema fetcher (an `_evokore_describe_tool` tool exposed via the standard `tools/call` path) rather than a new RPC method.

## Spec posture

The MCP specification text describes a Tool as having `inputSchema` as a "JSON Schema defining expected parameters" but the **machine-readable schema does not list `inputSchema` in the Tool's `required` array** — only `name` and `description` are required ([spec, 2025-06-18 server/tools][spec-tools]; [schema.json][spec-schema]). The prose example in the spec always shows `inputSchema` populated, so the spec is best read as *strongly conventional* rather than *strictly required*. The spec defines no separate `tools/describe`, `tools/get`, or `tools/schema` RPC; schema is expected inline on `tools/list` ([spec-tools][spec-tools]). The list-changed notification (`notifications/tools/list_changed`) is the only documented schema-refresh signal.

## Client matrix

| Client | Tolerates missing `inputSchema`? | Failure mode | Schema fetch path | Recommendation |
|--------|----------------------------------|--------------|-------------------|----------------|
| Claude Desktop | unknown — closed source; behavior likely strict (sibling Claude Code shares MCP client posture) | Likely silent tool drop on schema-validation failure ([twentyhq/twenty #15348][cd-twenty]) | None documented | Do not enable deferral |
| Cursor IDE | unknown — closed source; observed strict schema validation rejecting non-conventional shapes ([forum #130573][cur-brackets], [forum #141326][cur-vsche]) | Silent rejection or tool unavailable; aggravated by 40-tool active limit ([forum #81627][cur-40]) | None | Do not enable deferral |
| Cline | Pass-through via MCP SDK `ListToolsResultSchema` (no local validation in `McpHub.ts`) ([cline/cline McpHub.ts][cline-hub]) | Whatever the bundled `@modelcontextprotocol/sdk` Zod schema permits — `inputSchema` is *not* in the spec's required set ([spec-schema][spec-schema]) | None — sends tool list directly to LLM | Likely safe; verify with a probe build before defaulting |
| Continue | unknown — implementation details not in public docs ([continue MCP docs][cont-docs]); existing inputSchema bugs reported ([continue #7995][cont-7995]) | Unknown; user-reported mis-handling of inputSchema fields exists | None documented | Do not enable deferral |
| Claude Code | Strict validation; **silently drops all tools from a server if unfamiliar fields are present** ([anthropics/claude-code #25081][cc-25081], status: closed/not-planned) | Silent tool drop; server stays "connected", zero tools surface | None | Do not enable deferral; bug history makes deviation high-risk |
| Codex (OpenAI) | unknown — public docs cover config only ([Codex MCP docs][codex-mcp]); supports an internal `dynamicTools`/`deferLoading` concept for *its own* tool exposure ([codex-rs config.schema][codex-cfg]) but not documented as a client-side fetch path | Unknown; codex CLI surfaces tools to the model alongside builtins | None documented | Do not enable deferral until Codex source is reviewed |

## Per-client details

### Claude Desktop

Claude Desktop is closed source, so the only signal is downstream bug reports. The Twenty CRM team documented that Claude Desktop's MCP client rejects tools whose `inputSchema` deviates from the conventional `{type: "object", properties: {...}}` shape — for example, schemas with an extra `jsonSchema` wrapper or `strict: true` field cause silent tool drops ([twentyhq/twenty #15348][cd-twenty]). No documentation, source, or release note describes a `describe_tool` companion call. Schema is consumed inline from `tools/list`. Treat omission as risky until proven safe in a controlled probe.

### Cursor IDE

Cursor performs strict schema validation client-side. Confirmed bug reports show rejection of valid JSON Schemas with bracketed property names ([forum #130573][cur-brackets]), `anyOf` integer/null unions ([forum #141252][cur-anyof]), and the Anthropic-API-specific `strict` field ([forum #141326][cur-vsche]). The compounding 40-tool active limit ([forum #81627][cur-40]) actually *creates* the appetite for deferral elsewhere, but Cursor itself does not expose a documented schema-fetch RPC, and its strict validator means any deviation from the inline `inputSchema` convention risks silent tool drop. Cursor docs ([Cursor MCP][cur-docs]) describe the user-facing approval flow but document nothing about the parsing contract.

### Cline

Cline is the only client in scope where source code is readable. `src/services/mcp/McpHub.ts` calls `connection.client.request({method: "tools/list"}, ListToolsResultSchema, ...)` — i.e., it delegates parsing entirely to the bundled `@modelcontextprotocol/sdk` Zod schema and does not perform additional in-Cline validation ([cline/cline McpHub.ts][cline-hub]). Arguments are also passed directly to `tools/call` without a local schema check. As long as the SDK's `ListToolsResultSchema` permits a missing `inputSchema` (which it must, given the spec's `required` array does not include it), Cline should tolerate deferral. Cline has no separate schema-fetch RPC; the LLM sees whatever Cline forwards from the list response.

### Continue

Continue's public docs ([Continue MCP docs][cont-docs], [Continue MCP deep dive][cont-deep]) cover configuration only and do not describe parsing internals. Open issues show users hitting inputSchema-related bugs already ([continue #7995][cont-7995]), suggesting the parsing path is fragile in places. Without source-level confirmation we cannot say deferral is safe, and Continue does not document any schema-fetch RPC.

### Claude Code

The most decisive negative signal in this matrix. Issue [#25081][cc-25081] documents that Claude Code's MCP client **silently drops every tool from a server** when the `tools/list` response contains the *new* MCP 2025-11-25 fields (`outputSchema`, `title`, `toolAnnotations`). The bug is closed as "not planned." This is the inverse direction from schema deferral, but the takeaway generalizes: Claude Code's MCP parser is strict, brittle, and fails silently. Issues [#10031][cc-10031] and [#10858][cc-10858] document similar silent-drop behavior on other schema deviations. Until Anthropic ships a permissive parser or Claude Code adds a documented schema-fetch path, schema deferral against Claude Code should be treated as guaranteed-broken.

### Codex (OpenAI)

OpenAI's public Codex MCP docs ([Codex MCP][codex-mcp], [Codex config reference][codex-cfg-doc]) only describe configuration (allowlists, transports, OAuth) and do not document the parsing contract. Codex's *own* tool exposure has a `dynamicTools` concept with a `deferLoading` flag ([codex-rs config.schema.json][codex-cfg]), which suggests the team has thought about deferred-loading semantics — but this is for tools Codex *exposes*, not how Codex's MCP *client* handles deferred schemas from upstream servers. Without a source review of `codex-rs` MCP client code, deferral against Codex is unverified.

## Recommendation for Sprint 3 implementation

- **Ship as opt-in, default off.** Add `EVOKORE_TOOLS_LIST_DEFER_SCHEMAS=true` (or per-server `deferSchemas: true` in `mcp.config.json`). Default to inline schemas to match every existing client expectation.
- **Default-on candidates: none for now.** Cline is the only client where the source path looks safe, and even there the recommendation is "verify with a probe build" before changing defaults. Cursor and Claude Code's documented strict-validation behavior makes default-on a guaranteed regression.
- **Companion fetch shape: do *not* invent a new RPC method.** No client implements `tools/describe` or equivalent. Instead, expose schema retrieval through the standard `tools/call` path as a meta-tool, e.g. an `_evokore_describe_tool` that takes `{name: string}` and returns the deferred `inputSchema` as JSON in `content`. This keeps EVOKORE within the spec-defined surface and means the LLM (not the client) drives schema fetching just-in-time before invocation. The discover-then-fetch pattern is already proven by EVOKORE's existing `_evokore_approval_token` HITL mechanism.
- **Hard advisory: Claude Code, Cursor, Claude Desktop.** Document that operators using these clients should NOT enable `EVOKORE_TOOLS_LIST_DEFER_SCHEMAS`. Schema deferral against Claude Code in particular is expected to break catastrophically based on issue [#25081][cc-25081] precedent.
- **Observability requirement.** When deferral is enabled, log every `tools/list` response shape sent to each connected client and every meta-tool schema-fetch call, so we can spot client-side silent-drop regressions quickly.

## Open questions / unknowns

- **Codex MCP client parsing path.** Public docs are silent. Resolving this requires reading `codex-rs/mcp-client/` source on GitHub. Sprint 3 should treat Codex as unverified.
- **Claude Desktop direct behavior.** We are inferring from sibling-product (Claude Code) and third-party bug reports. A controlled probe build (a deliberate EVOKORE child server returning name+description-only on `tools/list`) targeting Claude Desktop would confirm.
- **Continue parsing internals.** Same — public docs silent, source review needed.
- **MCP SDK `ListToolsResultSchema` exact Zod definition.** Multiple raw-content fetches for `modelcontextprotocol/typescript-sdk/main/src/types.ts` returned 404 during this research session (likely path moved post-refactor to a `types/` directory). The downstream evidence (the spec's required array, Cline's pass-through, the `inputSchema` field's general optionality discussed in Zod-related issues) is consistent with `inputSchema` being `.optional()` in Zod, but a direct quote was not obtained. Sprint 3 should pin the SDK version actually shipping in EVOKORE and read `node_modules/@modelcontextprotocol/sdk/dist/types.js` locally to confirm before flipping any flag.
- **Effect of schema deferral on tool-selection accuracy.** Even where deferral is *tolerated*, the LLM sees less context per tool when picking which to call. Sprint 3 should measure tool-selection precision/recall on a fixed eval set with deferral on vs off before recommending broader rollout.

[spec-tools]: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
[spec-schema]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.json
[cd-twenty]: https://github.com/twentyhq/twenty/issues/15348
[cur-brackets]: https://forum.cursor.com/t/top-level-properties-with-brackets-in-tools-lists-inputschema-in-mcp-are-incorrectly-rejected/130573
[cur-vsche]: https://forum.cursor.com/t/json-schema-validation-error-with-tools-16-custom-input-schema-in-cursor-2-0-34/141326
[cur-anyof]: https://forum.cursor.com/t/mcp-parameter-validation-failure-for-integer-in-anyof-integer-null-schemas/141252
[cur-40]: https://forum.cursor.com/t/mcp-server-40-tool-limit-in-cursor-is-this-frustrating-your-workflow/81627
[cur-docs]: https://cursor.com/docs/context/mcp
[cline-hub]: https://github.com/cline/cline/blob/main/src/services/mcp/McpHub.ts
[cont-docs]: https://docs.continue.dev/customize/mcp-tools
[cont-deep]: https://docs.continue.dev/customize/deep-dives/mcp
[cont-7995]: https://github.com/continuedev/continue/discussions/7995
[cc-25081]: https://github.com/anthropics/claude-code/issues/25081
[cc-10031]: https://github.com/anthropics/claude-code/issues/10031
[cc-10858]: https://github.com/anthropics/claude-code/issues/10858
[codex-mcp]: https://developers.openai.com/codex/mcp
[codex-cfg-doc]: https://developers.openai.com/codex/config-reference
[codex-cfg]: https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json
