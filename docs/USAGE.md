# EVOKORE-MCP Usage Guide

This guide covers how to install, configure, and use EVOKORE-MCP with your favorite AI assistants.

> **See also:** [SETUP.md](./SETUP.md) · [USE_CASES_AND_WALKTHROUGHS.md](./USE_CASES_AND_WALKTHROUGHS.md) · [TOOLS_AND_DISCOVERY.md](./TOOLS_AND_DISCOVERY.md) · [VOICE_AND_HOOKS.md](./VOICE_AND_HOOKS.md) · [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## 1. Connecting to an AI Assistant

EVOKORE-MCP uses the standard Model Context Protocol via `stdio`. You must point your AI client to the compiled `index.js` file.

### For Gemini CLI
To register this server globally so it's available in any project:
```bash
gemini mcp add evokore-mcp node /absolute/path/to/EVOKORE-MCP/dist/index.js --scope user
```
After running this, type `/mcp` in your interactive session to confirm it is `CONNECTED`.

### For Claude Desktop
Add the following to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "evokore-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/EVOKORE-MCP/dist/index.js"]
    }
  }
}
```

### For Cursor IDE
1. Open Cursor Settings.
2. Go to **Features > MCP Servers**.
3. Add a new server. Name it `evokore-mcp`.
4. Command: `node /absolute/path/to/EVOKORE-MCP/dist/index.js`.

## 2. Using the Built-In Tools

Once connected, your AI assistant will automatically have access to the following tools:

- **`search_skills`**: Ask the AI to find a specific workflow. The search index now uses skill names, descriptions, directory taxonomy, tags, selected frontmatter metadata, and semantic hint extraction so natural-language objectives like "wrap up session handoff" resolve more reliably. (e.g., *"Search the MCP for React styling skills."*)
- **`get_skill_help`**: If you want to know what a specific skill does, ask the AI to explain it. (e.g., *"What does the 'arch-aep-runner' skill do? Show me some examples."*)
- **`discover_tools`**: Search the merged EVOKORE catalog of native and proxied tools. In `dynamic` mode, matching proxied tools become visible for the current session.
- **`proxy_server_status`**: Inspect the aggregated child-server registry, including server status, connection type, error counts, registered tool counts, and last-seen timestamps.
- **`refresh_skills`**: Rescan the `SKILLS/` directory and rebuild the skill index. Use this after adding or modifying skill files during a live session. An optional filesystem watcher can be enabled via `EVOKORE_SKILL_WATCHER=true` for automatic hot-reload.
- **`fetch_skill`**: Download a skill from a remote URL (GitHub raw content, HTTP endpoint) and install it locally in the `SKILLS/` directory.
- **`list_registry`**: List available skills from configured remote skill registries. Registries are defined in `mcp.config.json` under `skillRegistries`.
- **`execute_skill`**: Execute code blocks extracted from a skill file in a sandboxed subprocess. Supports `bash`, `js`, `python`, and `ts` with a 30-second timeout and 1 MB output limit.

When `get_skill_help` is invoked, EVOKORE-MCP returns the raw Markdown instructions to the LLM, enabling the LLM to understand exactly what the skill is capable of and explain it to you in plain English.

### 2.1 Tool discovery mode (`EVOKORE_TOOL_DISCOVERY_MODE`)

EVOKORE supports two tool-listing modes:

- **`legacy`** (default): every `tools/list` returns the full native + proxied tool list, now including `discover_tools`.
- **`dynamic`**: `tools/list` returns the always-visible native tools plus only the proxied tools activated during the current session.

```bash
EVOKORE_TOOL_DISCOVERY_MODE=dynamic node dist/index.js
```

In `dynamic` mode:

1. Call `discover_tools` with a natural-language query or exact tool name.
2. Matching proxied tools are activated for the current session.
3. EVOKORE emits `sendToolListChanged()` on a best-effort basis.
4. Re-run `tools/list` if your client does not auto-refresh.

Hidden proxied tools remain callable by exact prefixed name for compatibility, even when they are not currently listed.

For the current stdio runtime, EVOKORE uses a default session key when the transport does not provide a real `sessionId`. In practice, that means one long-lived stdio connection behaves like one discovery session. Session isolation becomes multi-session only on transports that attach distinct session IDs.

### 2.2 Benchmarking tool discovery

Use the benchmark script to capture a deterministic JSON snapshot of the discovery/listing contract:

```bash
npm run benchmark:tool-discovery
```

The default JSON payload is deterministic across repeated runs: it captures the discovery/listing contract, stable token-size estimates, and top matches while omitting machine-specific timing telemetry. To preserve the same artifact on disk, pass `--output <path>`:

```bash
node scripts/benchmark-tool-discovery.js --output artifacts/tool-discovery-benchmark.json
```

The output file contains the exact same JSON document emitted to stdout.

If you also want live timing telemetry for a one-off local benchmark, pass `--live-timings`. That mode adds a non-deterministic `liveTimings` block and is intended for manual inspection rather than durable artifact comparison.

### 2.3 HITL approval token (`_evokore_approval_token`)

For tools configured as `require_approval`, EVOKORE returns a security-intercept error first, then includes a `_evokore_approval_token` for the retry.

- Tokens are **one-time use**. A replayed token is rejected.
- Tokens are bound to the **exact same tool arguments**. If any argument changes, the token is rejected.
- Tokens are **short-lived** (current implementation target: about 5 minutes). If you wait too long, expect expiry and request a fresh token.
- Proxied tools advertise `_evokore_approval_token` as an optional schema field even when the upstream tool declares no input properties.
- Retry workflow: ask for explicit approval -> rerun the same tool call -> include `_evokore_approval_token` exactly as returned.

## 2.4 Operator preflight before a new work session

If you are about to start a new implementation slice, cleanup wave, or repo review session, run:

```bash
npm run repo:audit
```

This is the quickest way to answer:

- am I on the right branch?
- is `main` ahead of my current work?
- are there stale worktrees or stale local branches?
- are there merged remote branches that should be accounted for?
- is my control plane (`CLAUDE.md`, `next-session.md`, planning files) drifting from repo state?

For machine-readable output:

```bash
npm run repo:audit -- --json
```

In the normal repo-maintenance loop, the recommended order is:

1. `npm run repo:audit`
2. review branch / PR state
3. run the smallest targeted validation for your subsystem
4. run `npm test` for broad changes
5. update continuity artifacts (`next-session.md`, session log, planning files) if the execution state changed

## 3. Adopting a Workflow

EVOKORE-MCP exposes skills through tools like `search_skills`, `get_skill_help`, and `resolve_workflow`.
*"Adopt the `session-wrap` workflow."* -> The AI can discover the skill and load its canonical instructions through these tools before executing the workflow.

`resolve_workflow` also explains why a workflow matched, which helps operators verify that the injected skill aligns with the requested objective.

When EVOKORE proxies child MCP servers, tool names use the prefixed tool name format `${serverId}_${tool.name}`. If the same prefixed name appears more than once, EVOKORE keeps the first registration, skips later duplicates, and logs a warning.

Child server env values in `mcp.config.json` can reference placeholders like `${ELEVENLABS_API_KEY}`. If any placeholder is unresolved at startup, EVOKORE fails fast for that child server and logs an explicit error instead of silently substituting an empty value. Other child servers continue booting.

### 3.1 PR governance metadata for process/tooling/release changes

For process/tooling/release-impacting changes, use `.github/PULL_REQUEST_TEMPLATE.md` and follow `docs/PR_MERGE_RUNBOOK.md`.

Required sections include:

- Description
- Type of Change
- Changes Made
- Skills/Tools Affected
- Testing
- Evidence

### 3.2 Windows command resolution behavior

On Windows, EVOKORE runtime command resolution remaps **only** `npx` to `npx.cmd`.

- `uv` and `uvx` are **not** remapped to `.cmd` by EVOKORE.
- Ensure your shell PATH can resolve `uv --version` / `uvx --version` directly when used in child-server configs.

## 4. Skill Ecosystem

### 4.1 Skill versioning

Skills can declare optional versioning metadata in their YAML frontmatter:

```yaml
---
name: my-skill
version: 1.2.0
requires:
  - core-utils@>=1.0.0
conflicts:
  - legacy-helper
---
```

- `version`: semver string for the skill
- `requires`: list of skill dependencies with optional version constraints
- `conflicts`: list of skill names that are incompatible

EVOKORE validates dependencies at load time via `validateDependencies()`. Unsatisfied requirements are reported but do not block skill loading.

### 4.2 Remote skill registries

Configure registries in `mcp.config.json`:

```json
{
  "skillRegistries": [
    {
      "name": "example",
      "baseUrl": "https://example.com/skills",
      "index": "registry.json"
    }
  ]
}
```

Use the `list_registry` tool to browse available remote skills, and `fetch_skill` to download and install them locally.

### 4.3 Skill execution sandbox

The `execute_skill` tool extracts fenced code blocks from a skill file and runs them in a sandboxed child process:

- Supported languages: `bash`, `js`, `python`, `ts`
- Timeout: 30 seconds per execution
- Output limit: 1 MB
- Isolation: runs in a subprocess, not in the MCP server process
- Container mode uses the global `EVOKORE_SANDBOX_MEMORY_MB` / `EVOKORE_SANDBOX_CPU_LIMIT`
  baseline plus optional per-language overrides for `bash`, `javascript`, `typescript`,
  and `python`

Example usage through your AI client: *"Execute the setup steps from the 'project-bootstrap' skill."*

### 4.4 Skill hot-reload

Two mechanisms for refreshing the skill index:

1. **Manual**: call `refresh_skills` to trigger an immediate rescan of `SKILLS/`
2. **Automatic**: set `EVOKORE_SKILL_WATCHER=true` to enable a filesystem watcher that auto-refreshes when skill files change

## 5. Rate Limiting

EVOKORE supports configurable rate limits per server and per tool via `mcp.config.json`:

```json
{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "rateLimit": {
        "maxTokens": 10,
        "refillRate": 2,
        "refillIntervalMs": 1000
      }
    }
  }
}
```

- **Algorithm**: token bucket
- **`maxTokens`**: maximum burst capacity
- **`refillRate`**: tokens added per interval
- **`refillIntervalMs`**: interval in milliseconds between refills
- Rate limiting is separate from the error-triggered cooldown mechanism

When a tool call is rate-limited, EVOKORE returns an error instructing the client to retry after a short delay.

## 6. Session Dashboard

Launch the zero-dependency session dashboard:

```bash
npm run dashboard
```

The dashboard runs on `127.0.0.1:8899` and provides:

- Session replay viewer (reads `~/.evokore/sessions/*-replay.jsonl`)
- Evidence log viewer (reads `~/.evokore/sessions/*-evidence.jsonl`)
- HITL approval UI at `/approvals` (reads/writes `~/.evokore/pending-approvals.json`)

The approval page shows pending approval tokens with deny buttons, allowing operators to review and reject HITL approval requests from a browser.

## 7. Voice Integration

EVOKORE-MCP supports voice input/output through two complementary systems:

### ElevenLabs MCP (TTS - Voice Output)

ElevenLabs is proxied as a child server through EVOKORE-MCP, giving all connected AI clients access to high-quality text-to-speech, voice cloning, and audio tools.

**Setup:**

1. Get your API key from https://elevenlabs.io/app/developers/api-keys (10k free credits/month)
2. Add it to your `.env` file:
   ```
   ELEVENLABS_API_KEY=your_key_here
   ```
3. Install `uv` if not already installed: https://docs.astral.sh/uv/getting-started/installation/
4. Restart EVOKORE-MCP. The `elevenlabs_*` tools will appear automatically.

**Available tools** (prefixed with `elevenlabs_`): text-to-speech generation, voice cloning, audio transcription, voice design, audio isolation, and soundscape creation.

**Output modes** (set via `ELEVENLABS_MCP_OUTPUT_MODE` in `mcp.config.json`):
- `files` - saves audio to disk (default: ~/Desktop)
- `resources` - returns base64-encoded audio in MCP responses
- `both` - saves to disk and returns base64

### VoiceMode (STT + TTS - Bidirectional Voice)

VoiceMode adds voice conversations directly to Claude Code via MCP. Speak naturally and hear responses.

**Setup:**

```bash
# Add to Claude Code (user scope - already done if using EVOKORE-MCP setup)
claude mcp add --scope user voicemode -- uvx --refresh voice-mode

# Set your OpenAI API key for Whisper STT + TTS
export OPENAI_API_KEY="sk-your-key-here"
```

**Windows setup notes (PowerShell):**

```powershell
# Persist for future terminals
setx OPENAI_API_KEY "sk-your-key-here"

# Also set for the current session before launching Claude Code
$env:OPENAI_API_KEY = "sk-your-key-here"
```

If `uvx` is not on PATH in Windows shells, retry the registration command from a shell where `uvx --version` succeeds.

**Usage:** Type `converse` in Claude Code to start a voice conversation.

**Configuration (environment variables):**
- `VOICEMODE_TTS_SPEED=1.2` - Adjust speech speed
- `VOICEMODE_VOICES=nova,shimmer` - Choose TTS voices

**Local/offline mode:** Install Whisper.cpp (STT) and Kokoro (TTS) for fully local voice with no cloud dependencies. VoiceMode auto-detects local services.

### Local TTS (OpenAI-Compatible)

VoiceSidecar supports any OpenAI-compatible TTS endpoint as an alternative to ElevenLabs. This enables fully local, offline text-to-speech via projects like [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) or [Chatterbox TTS API](https://github.com/travisvn/chatterbox-tts-api).

**Setup:**

1. Run a local TTS server (example with Kokoro-FastAPI):
   ```bash
   docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi:latest
   ```

2. Configure VoiceSidecar to use it:
   ```bash
   export EVOKORE_TTS_PROVIDER=openai-compat
   export EVOKORE_TTS_BASE_URL=http://127.0.0.1:8880
   # No API key needed for local servers
   ```

3. Start VoiceSidecar as usual — it will POST to `${EVOKORE_TTS_BASE_URL}/v1/audio/speech` instead of connecting to ElevenLabs.

**Voice mapping:** Each persona in `voices.json` has an `openaiVoice` field that maps to a voice name on your local server. The default voice can also be set via `EVOKORE_TTS_VOICE`.

**Supported local TTS servers:**
- [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) — 82M params, 35-100x realtime, Docker ready
- [Chatterbox TTS API](https://github.com/travisvn/chatterbox-tts-api) — Voice cloning, 23 languages, OpenAI-compat
- Any server implementing the OpenAI `/v1/audio/speech` endpoint

> **Note:** `ELEVENLABS_API_KEY` is not required when using `openai-compat` provider.

### Voice Sidecar (Auto-Speak Responses)

The Voice Sidecar is a standalone WebSocket server that auto-speaks AI responses through ElevenLabs TTS (or any OpenAI-compatible TTS endpoint). It runs independently from the MCP router, so custom clients can publish speech payloads directly to the sidecar without routing through MCP tools.

**Setup:**

1. Ensure `ELEVENLABS_API_KEY` is set in your `.env` file (required only when using the default `elevenlabs` provider)
2. Compile: `npx tsc`
3. Start the sidecar: `npm run voice` (or `npm run voice:dev` for development)
4. Register the voice hook in `~/.claude/settings.json`:
   ```json
   {
      "hooks": {
        "Stop": [
          {
            "command": "node /path/to/EVOKORE-MCP/scripts/voice-hook.js",
            "env": {
              "VOICE_SIDECAR_PERSONA": "orchestrator"
            }
          }
        ]
      }
   }
   ```

The sidecar listens on `ws://127.0.0.1:8888` by default (override with `VOICE_SIDECAR_PORT`, and use `VOICE_SIDECAR_HOST` on the hook side only if you need a non-default host). This `ws://127.0.0.1:<VOICE_SIDECAR_PORT>` endpoint is the standalone sidecar protocol endpoint for any custom producer. When Claude Code finishes a response, the bundled hook forwards the text to that endpoint and can now forward a persona as well, either from `VOICE_SIDECAR_PERSONA` or from a `persona` field carried in the payload metadata.

**Optional runtime controls:**

- `VOICE_SIDECAR_DISABLE_PLAYBACK=1` - skip local audio playback while keeping synthesis/stream handling intact; the sidecar logs that playback is disabled.
- `VOICE_SIDECAR_ARTIFACT_DIR=/absolute/path` - preserve a copy of the final playable `.mp3` in the specified directory and log the saved path.
- `VOICE_SIDECAR_PERSONA=orchestrator` - force the bundled hook to send that persona with every utterance.
- `VOICE_SIDECAR_HOST=127.0.0.1` - override the hook target host if you intentionally need something other than the loopback default.

These toggles are opt-in only; if unset, the sidecar preserves the existing playback behavior.

**Protocol contract (for custom integrations):**

Each WebSocket message is a JSON object with these fields:

- `text` (`string`): Text chunk to append to the current utterance buffer. Use `""` when sending a flush-only frame.
- `persona` (`string`, optional): Persona key from `voices.json` (`personas.<name>`). If omitted, the `default` voice config is used.
- `flush` (`boolean`, optional): When `true`, finalize buffered chunks and trigger synthesis/playback for the current utterance.

```json
{"text": "Hello world.", "persona": "orchestrator", "flush": true}
```

Or stream in chunks:
```json
{"text": "First part. ", "persona": "orchestrator"}
{"text": "Second part. "}
{"text": "", "flush": true}
```

Contract notes:

- `flush: true` can be sent with or without additional `text` in the same frame.
- `persona` may be sent on the first chunk, or repeated on each chunk for explicitness.
- Unknown personas fall back to `default` voice settings.
- The bundled `scripts/voice-hook.js` forwards `VOICE_SIDECAR_PERSONA` first, then falls back to any `persona` or `metadata.persona` field present in the hook payload.

### Persona Configuration

Edit `voices.json` in the project root to map agent roles to ElevenLabs voices. Each persona overrides fields from the `default` config:

```json
{
  "default": { "voiceId": "...", "model": "eleven_turbo_v2_5", "speed": 1.0, ... },
  "personas": {
    "orchestrator": { "voiceId": "...", "stability": 0.6 },
    "researcher": { "voiceId": "...", "speed": 1.1 }
  }
}
```

The sidecar re-reads `voices.json` on each new WebSocket connection (hot-reload), so persona/voice changes apply without restarting the sidecar process. Available default personas: `orchestrator`, `researcher`, `architect`, `implementer`, `tester`, `reviewer`.

### Speed and Prosody Tuning

Three layers of speed control, each stacking on the others:

| Layer | Method | Range | Notes |
|-------|--------|-------|-------|
| 1. API speed | `speed` in `voices.json` | 0.5 - 2.0 | Prosody-aware, best quality |
| 2. Model selection | `model` in `voices.json` | N/A | `eleven_turbo_v2_5` generates 3x faster |
| 3. Post-processing | `postProcessTempo` in `voices.json` | 1.0 - 4.0 | Requires `ffmpeg` on PATH; chains `atempo` filters |

Example for fast playback:
```json
{
  "speed": 1.2,
  "model": "eleven_turbo_v2_5",
  "postProcessTempo": 1.5
}
```

For natural-sounding fast speech, prefer Layer 1 (API speed) over Layer 3 (ffmpeg). Only use `postProcessTempo` for speeds beyond what the API supports.

Validation checks for this path:
- `npx vitest run test-voice-e2e-validation.js`
- `npx vitest run test-voice-refinement-validation.js`
- `npx vitest run test-voice-sidecar-smoke-validation.js`
- `npx vitest run test-voice-sidecar-hotreload-validation.js`

Opt-in live validation against ElevenLabs:

```bash
EVOKORE_RUN_LIVE_VOICE_TEST=1 ELEVENLABS_API_KEY=your_key_here npm run test:voice:live
```

The live test is intentionally excluded from `npm test`. It starts the compiled sidecar with playback disabled, captures an `.mp3` artifact into a temporary directory, sends a short websocket utterance with `flush: true`, and verifies the sidecar shuts down cleanly.

### Release Workflow

Safe npm publish is handled in GitHub Actions via `.github/workflows/release.yml`.

- Triggers: `v*.*.*` tags and `workflow_dispatch`
- Manual workflow guard: `workflow_dispatch` requires `chain_complete=true`
- Mainline safety gate: release commit must be an ancestor of `origin/main`
- Gates: `npm ci`, `npm test`, `npm run build`
- Publish guard: requires `NPM_TOKEN` secret
- Validation: `npm run release:check`

See [docs/RELEASE_FLOW.md](./RELEASE_FLOW.md) for the operator checklist.

### Cross-CLI Config Sync

Sync your EVOKORE-MCP registration across all supported AI CLIs:

```bash
# Preview what would change (recommended first)
npm run sync:dry

# Apply changes (writes files)
npm run sync

# Direct script usage defaults to DRY RUN
node scripts/sync-configs.js

# Explicitly write changes when running script directly
node scripts/sync-configs.js --apply

# Preserve existing evokore-mcp entries explicitly (default behavior)
node scripts/sync-configs.js --apply --preserve-existing

# Force overwrite existing evokore-mcp entries
node scripts/sync-configs.js --apply --force
```

**Supported CLIs:** Claude Code, Claude Desktop (Win/Mac/Linux), Cursor, Gemini CLI (prints manual command).

**Prerequisite:** You must build the project before running sync, because the script validates that `dist/index.js` exists:

```bash
npm run build
```

The sync script:
- Auto-detects installed CLIs
- Uses DRY RUN by default (or `--apply` to write changes)
- Preserves existing `evokore-mcp` entries by default (or `--force` to overwrite)
- Rejects conflicting flag pairs (`--dry-run` + `--apply`, `--force` + `--preserve-existing`)
- Only adds/updates the `evokore-mcp` server entry (never overwrites other servers)
- Resolves `dist/index.js` from the canonical repo root when run inside disposable git worktrees
- Target specific CLIs: `node scripts/sync-configs.js claude-code cursor` (dry run) or `node scripts/sync-configs.js --apply claude-code cursor` (write)

**Exit codes:**

| Code | Meaning |
|------|---------|
| 0 | Success (sync completed or dry-run previewed) |
| 1 | Error (conflicting flags, unknown target, or missing `dist/index.js`) |

**Troubleshooting:**

- **"dist/index.js not found"**: Run `npm run build` (or `npx tsc`) before syncing. The sync script requires the compiled entry point to exist.
- **Malformed target config**: If a CLI's config file contains invalid JSON, the sync script recovers gracefully by treating it as an empty config. The old file content will be replaced on `--apply`.
- **Cursor falls back to project-level config**: If `~/.cursor/mcp.json` does not exist, the script writes to `<PROJECT_ROOT>/.cursor/mcp.json` instead. Create the user-level file first if you prefer global Cursor configuration.
- **Gemini CLI shows "Not detected"**: The script checks for the `gemini` binary on PATH. Install Gemini CLI or run the printed `gemini mcp add` command manually.
- **Config not updating on re-run**: By default, `--preserve-existing` is active. If you need to overwrite a stale `evokore-mcp` entry, use `--force`.
- **Need to pin a different repo root**: Set `EVOKORE_SYNC_PROJECT_ROOT=/absolute/path/to/EVOKORE-MCP` before running the sync script.

## 8. Hook Observability

EVOKORE hook scripts emit structured JSONL events to:

- `~/.evokore/logs/hooks.jsonl`

Use this when validating hook behavior (damage-control, purpose-gate, session-replay, tilldone) without changing normal hook UX.

Event envelope fields:

- `ts`: ISO timestamp
- `hook`: hook identifier (`damage-control`, `purpose-gate`, `session-replay`, `tilldone`)
- `event`: hook-specific event name
- `session_id` (optional): sanitized session ID when available
- additional hook-specific metadata (for example `tool`, `reason`, `mode`, `incomplete_count`)

Common events:

- `damage-control`: `allow`, `ask`, `block`, `fail_open`
- `purpose-gate`: `state_initialized`, `purpose_recorded`, `purpose_reminder`, `fail_safe_error`
- `session-replay`: `replay_entry_written`, `fail_safe_error`
- `tilldone`: `hook_mode_block`, `hook_mode_allow`, `hook_mode_fail_safe`, `cli_action`, `cli_error`

Observability logging is best-effort and fail-safe: hook logging failures do not block hook execution paths.

### Log Rotation

`hooks.jsonl` is automatically rotated to prevent unbounded growth:

- **Threshold:** 5 MB per file
- **Rotation count:** Up to 3 rotated files (`hooks.jsonl.1`, `.2`, `.3`)
- **Trigger:** Checked before each write; when `hooks.jsonl` exceeds 5 MB, the current file is renamed to `.1`, existing `.1` shifts to `.2`, and `.2` to `.3`
- **Oldest file:** `.3` is overwritten on the next rotation cycle
- **Fail-safe:** Rotation errors are silently caught and never block hook execution

### Hook Log Viewer

View and filter hook events with the built-in viewer:

```bash
# Show last 50 events (default)
npm run hooks:view

# Filter by hook name
npm run hooks:view -- --hook damage-control

# Filter by date
npm run hooks:view -- --since 2025-02-26

# Filter by session ID (partial match)
npm run hooks:view -- --session abc123

# Show last 100 events
npm run hooks:view -- --tail 100

# Show all events (no tail limit)
npm run hooks:view -- --all

# Raw JSONL output (for piping)
npm run hooks:view -- --json

# Combine filters
npm run hooks:view -- --hook purpose-gate --since 2025-02-26 --tail 20
```

The viewer prints a formatted table with timestamps, hook names, event types, and session IDs, followed by summary statistics showing event counts by hook type.

PowerShell quick checks:

```powershell
# Tail recent hook events
Get-Content "$HOME\.evokore\logs\hooks.jsonl" -Tail 30

# Filter a specific hook with parsed JSON
Get-Content "$HOME\.evokore\logs\hooks.jsonl" |
  ForEach-Object { $_ | ConvertFrom-Json } |
  Where-Object { $_.hook -eq "damage-control" }
```

## 9. v3.0 Platform Modules

EVOKORE-MCP v3.0 introduces a suite of platform modules that enable HTTP deployment, authentication, multi-tenancy, and extensibility. Each module is covered in detail in its own guide; this section provides a brief overview and cross-references.

### 9.1 HTTP Transport

EVOKORE-MCP can serve MCP over HTTP using the StreamableHTTP transport, enabling remote access, multi-client connections, and integration with load balancers and reverse proxies. Start in HTTP mode with `node dist/index.js --http` or `EVOKORE_HTTP_MODE=true`. The server exposes a `/health` endpoint for monitoring and `/mcp` for all MCP communication via JSON-RPC over HTTP with SSE streaming.

> **Detailed guide:** [HTTP_DEPLOYMENT.md](./HTTP_DEPLOYMENT.md)

### 9.2 Authentication and OAuth

HTTP transport endpoints can be protected with Bearer token authentication in two modes: a simple static shared secret for internal deployments, or JWT validation against a remote JWKS endpoint for production use with identity providers like Auth0 or Keycloak. Enable with `EVOKORE_AUTH_REQUIRED=true` and configure the mode via `EVOKORE_AUTH_MODE` (`static` or `jwt`).

> **Detailed guide:** [OAUTH_SETUP.md](./OAUTH_SETUP.md)

### 9.3 Session Isolation and Multi-Tenancy

In HTTP mode, each client connection receives a fully isolated session with its own tool activation state, rate limit counters, RBAC role, and metadata. Sessions are identified by UUID and managed with a configurable TTL (`EVOKORE_SESSION_TTL_MS`, default 1 hour). Expired sessions are cleaned periodically, and an LRU eviction policy caps the pool at 100 concurrent sessions.

> **Detailed guide:** [HTTP_DEPLOYMENT.md -- Session Lifecycle](./HTTP_DEPLOYMENT.md#session-lifecycle)

### 9.4 RBAC (Role-Based Access Control)

EVOKORE supports three predefined roles -- `admin`, `developer`, and `readonly` -- defined in `permissions.yml`. Each role specifies a default permission level and per-tool overrides. When JWT authentication is active, the `role` claim from the token is threaded into the session and used by the `SecurityManager` for permission checks. Set `EVOKORE_ROLE` as a fallback when JWT is not in use.

> **Detailed guide:** [OAUTH_SETUP.md -- Role Claim Passthrough](./OAUTH_SETUP.md#role-claim-passthrough)

### 9.5 Rate Limiting

Configurable per-server and per-tool rate limits use a token bucket algorithm defined in `mcp.config.json` under each server's `rateLimit` block. Rate limit counters are scoped per-session in HTTP mode, so one client cannot exhaust another's quota. This mechanism is independent of the error-triggered cooldown that temporarily disables failing child servers.

> **Configuration details:** [Section 5 above](#5-rate-limiting)

### 9.6 Webhook Events

EVOKORE emits structured webhook events (tool calls, errors, session lifecycle, HITL approvals, plugin operations) to configured HTTP endpoints with HMAC-SHA256 signatures. Delivery is fire-and-forget with 3 retries and exponential backoff. Sensitive tool arguments are automatically redacted before emission. Enable with `EVOKORE_WEBHOOKS_ENABLED=true` and define subscriptions in the `webhooks` array of `mcp.config.json`.

> **Detailed guide:** [WEBHOOK_GUIDE.md](./WEBHOOK_GUIDE.md)

### 9.7 Plugin System

Plugins extend EVOKORE with custom tools and resources by placing `.js` files in the `plugins/` directory (configurable via `EVOKORE_PLUGINS_DIR`). Plugins are loaded at startup and can be hot-reloaded at runtime via the `reload_plugins` tool without restarting the server. Each plugin exports a manifest with `name`, optional `version`, and a `register(context)` function that uses the `PluginContext` API to register tools, resources, and emit webhook events.

> **Detailed guide:** [PLUGIN_AUTHORING.md](./PLUGIN_AUTHORING.md)
