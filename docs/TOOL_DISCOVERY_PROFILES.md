# Tool Discovery Profiles (Sprint 1.4)

> Status: shipping in Sprint 1.4 of the
> [tool-discovery tiering plan](plans/tool-discovery-tiering-2026-04-26.md).
> Sprint 1.1 introduced the `ProfileResolver`; this sprint ships the
> first batch of named presets, a tokenizer-backed benchmark, and the
> deprecation timeline for `EVOKORE_TOOL_DISCOVERY_MODE`.

## Why profiles

EVOKORE-MCP aggregates dozens of native tools and proxies child MCP
servers (GitHub, filesystem, ElevenLabs, Supabase, etc.). The combined
`tools/list` payload was historically 12K–31K tokens, which dominates
context windows on every connecting client.

Sprint 1.1 introduced the `ProfileResolver` so operators can ship a
focused tool surface keyed to their workflow. Sprint 1.4 ships five
presets in the canonical `mcp.config.json` so an operator can opt in
without authoring profile JSON from scratch.

## Picking a profile

| Profile | When to pick it | Always-visible scope |
|---|---|---|
| `coding` | Day-to-day implementation work: editing files, running git, opening PRs, executing skills. | Native skill tools + memory/claims + filesystem MCP + GitHub MCP write/read tools |
| `research` | Read/search-heavy sessions: navigating the repo, querying memory, generating docs, working through `resolve_workflow`. | Native skill tools + memory + navigation + read-only filesystem + GitHub search/read |
| `voice` | Voice sidecar sessions where the only surface needed is ElevenLabs + minimum discovery. | Discovery / skill resolution + every `elevenlabs_*` proxy tool |
| `legacy-full` | Deprecation shim for operators who need the **pre-v3.1** behavior — every native + every proxy tool ships in `tools/list`. | All native + all proxy |
| `legacy-dynamic` | The **v3.0** default: native tools always visible, proxy tools dynamic (no tier filtering). | All native |
| `default` (built-in) | When no profile is selected. Identical to `legacy-dynamic`. | All native |

If you are unsure, start with `coding`. It has the broadest day-to-day
surface and stays well under the 8K-token budget.

## Opting in

```bash
# Via env var (overrides discovery.activeProfile in mcp.config.json):
export EVOKORE_DISCOVERY_PROFILE=coding

# Or set it in mcp.config.json:
# {
#   "discovery": {
#     "activeProfile": "research",
#     "profiles": { ... }
#   }
# }
```

When no profile is selected, EVOKORE falls back to the built-in
`default` profile, which is byte-identical to the v3.0 dynamic-mode
behavior (all native tools always visible, proxies dynamic).

### Safety pin

`EVOKORE_TOOL_DISCOVERY_MODE=legacy` remains a hard safety pin. When
set, EVOKORE ignores any selected profile and forces the built-in
default. Use this if you need to roll back to a known-good state
without editing `mcp.config.json`.

If `EVOKORE_TOOL_DISCOVERY_MODE` is unset or `=dynamic`, the profile
resolution proceeds normally.

## Resolution precedence

1. `EVOKORE_TOOL_DISCOVERY_MODE=legacy` (safety pin) → built-in
   `default`
2. `EVOKORE_DISCOVERY_PROFILE=<name>` → named profile from
   `mcp.config.json`
3. `discovery.activeProfile` in `mcp.config.json` → named profile
4. Built-in `default` profile (legacy-equivalent)

## Deprecation timeline for `EVOKORE_TOOL_DISCOVERY_MODE`

`EVOKORE_TOOL_DISCOVERY_MODE` predates profiles. We are **not removing
it** in Sprint 1.4. The plan:

| Sprint / version | Status |
|---|---|
| **Sprint 1.4** (this PR) | `EVOKORE_TOOL_DISCOVERY_MODE` continues to work as both a kill switch (`=legacy`) and a tier toggle (`=dynamic`). Profiles are the new sharper surface. |
| **v3.2** | `EVOKORE_TOOL_DISCOVERY_MODE` keeps its safety-pin role. The mode-vs-profile interaction is documented inline in `.env.example`. |
| **v3.3+** | Deprecation review: if profile adoption is high and operators are no longer setting `EVOKORE_TOOL_DISCOVERY_MODE`, we may collapse it. The safety-pin behavior will move under a different env name (`EVOKORE_DISCOVERY_PROFILE=default`) with a one-release deprecation warning. |

Until that review lands, treat `EVOKORE_TOOL_DISCOVERY_MODE=legacy` as a
permanent escape hatch.

## Mandatory injection-point downstream skills

The panel-of-experts framework lists 7 skills that must remain
reachable in every workflow because they participate in mandatory
injection points (release gates, multi-perspective review, etc.):

1. `release-readiness`
2. `repo-ingestor`
3. `docs-architect`
4. `orch-review`
5. `orch-plan`
6. `tool-governance`
7. `orch-refactor`

Source: `SKILLS/ORCHESTRATION FRAMEWORK/panel-of-experts/SKILL.md`,
section "Mandatory Injection Points (Always Run)".

Every shipped non-legacy profile (`coding`, `research`, `voice`)
declares these 7 skill IDs in its `mandatoryInjectionSkills` array.
The runtime exposes them through `resolve_workflow` / `execute_skill`,
which are themselves in every default profile's `alwaysVisible` list,
so the skills remain reachable even when their direct tool wrapper is
not surfaced.

## Measured token counts

The values below come from
`scripts/benchmark-tool-discovery.js --all`. The benchmark uses the
real `js-tiktoken` `cl100k_base` encoding (the OpenAI tokenizer used by
GPT-4-class models and a close proxy for Claude's tokenizer).

The synthetic catalog mirrors the real EVOKORE surface: 36 native
tools and 81 proxy tools across `github`, `fs`, `elevenlabs`, and
`supabase`. Tool descriptions in the synthetic catalog are intentionally
short ("MCP: tool-name operation."), so the **production** token counts
will be higher because real schemas carry richer descriptions and JSON
schemas. Treat the numbers below as the **lower bound** of each
profile's footprint and the **relative shape** between profiles.

| Profile | Visible tools | Payload bytes | Tokens (cl100k_base) | Budget | Status |
|---|---:|---:|---:|---:|---|
| `voice` | 20 | 3,737 | 823 | ≤ ~3K | within budget |
| `research` | 27 | 4,919 | 1,011 | ≤ ~5K | within budget |
| `default` | 36 | 6,388 | 1,318 | (no regression vs. v3.0) | matches `legacy-dynamic` |
| `legacy-dynamic` | 36 | 6,388 | 1,318 | matches v3.0 default | unchanged |
| `coding` | 44 | 7,982 | 1,644 | ≤ ~8K | within budget |
| `legacy-full` | 117 | 21,429 | 4,531 | (no regression vs. pre-v3.1) | unchanged |

> **Approximate.** The synthetic catalog under-counts real tool schemas.
> Production deployments with full GitHub / ElevenLabs / Supabase tool
> schemas can be 3–5× larger than the synthetic counts above. Profile
> *ordering* is faithful — `voice` < `research` < `default` < `coding`
> < `legacy-full` — but absolute numbers should be re-measured against
> a live runtime when you tune budgets.

## Customizing or extending profiles

Profiles live under the `discovery.profiles` block in
`mcp.config.json`. Each profile takes:

```jsonc
{
  "discovery": {
    "profiles": {
      "my-profile": {
        "description": "Free-form text that surfaces in benchmark output.",
        "alwaysVisible": ["fs_read_file", "github_get_file_contents"],
        "mandatoryInjectionSkills": [
          "release-readiness", "repo-ingestor", "docs-architect",
          "orch-review", "orch-plan", "tool-governance", "orch-refactor"
        ]
      }
    },
    "activeProfile": "my-profile"
  }
}
```

`alwaysVisible` accepts:

- `"all-native"` — every native tool, proxies dynamic.
- `"all"` — every native and every proxy tool.
- `string[]` — explicit allowlist of tool names.

The `mandatoryInjectionSkills` field is informational. The runtime does
not currently filter skill access by profile; the field exists so
tests, audits, and the benchmark can verify the 7 mandatory injection
points remain documented per profile.

## Re-running the benchmark

```bash
# Build first so the benchmark sees the latest ProfileResolver shape:
npm run build

# Measure every profile (built-in default + everything in mcp.config.json):
node scripts/benchmark-tool-discovery.js --all

# Measure a single profile by name:
node scripts/benchmark-tool-discovery.js --profile coding
```

Both commands emit JSON to stdout. Pass `--output <path>` to also
write the JSON to disk. Pass `--live-timings` to include hot-path
measurements (excluded by default so the artifact is reproducible).
