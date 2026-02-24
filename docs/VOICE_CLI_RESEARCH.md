# Voice-Enabled CLI Agents & MCP Extensions Research

**Date:** 2026-02-23

This document captures research on voice-enabled CLI agents, PAI/KAI personal AI infrastructure, and MCP voice extensions relevant to the EVOKORE-MCP project. It serves as a reference for evaluating integration paths for voice capabilities, cross-CLI orchestration, and agent persona systems.

---

## 1. PAI / KAI - Personal AI Infrastructure

- **Repository:** https://github.com/danielmiessler/Personal_AI_Infrastructure (v3.0.0, Feb 2026)
- **Blog Post:** https://danielmiessler.com/blog/personal-ai-infrastructure-december-2025
- **DeepWiki:** https://deepwiki.com/danielmiessler/Personal_AI_Infrastructure

### Overview

KAI is a private instance of PAI. The workflow is: clone PAI, customize it with your own identity files, goals, and API keys, then operate it as KAI. The `pai`/`kai` CLI wraps Claude Code with voice notifications via ElevenLabs.

### Voice System

- ElevenLabs TTS with prosody enhancement.
- Each of the 12 named agents maps to a distinct voice persona.
- Voice Server runs on `localhost:8888`, configured via `voices.json` (parameters include stability and similarity boost).

### Hook System

- 20 hooks across 6 lifecycle events.
- Voice is triggered at Stop events.

### TELOS Identity Layer

- 10 markdown files define agent identity: `MISSION.md`, `GOALS.md`, `BELIEFS.md`, and others.
- This layer gives each agent a persistent personality and value system.

### Skill System

- 38 skills and 162 workflows.
- Hierarchy: CODE -> CLI -> PROMPT -> SKILL.

### Cost

Approximately $200-300/month in API usage.

---

## 2. Voice Input/Output Options

### A. VoiceMode (Bidirectional Voice for Claude Code)

- **Repository:** https://github.com/mbailey/voicemode
- **Site:** https://getvoicemode.com/
- **Docs:** https://voice-mode.readthedocs.io/

MCP server adding voice input (STT) and voice output (TTS) to Claude Code.

**Installation:**

```bash
uvx voice-mode-install
claude mcp add --scope user voicemode -- uvx --refresh voice-mode
```

Use the `converse` command inside Claude Code to activate.

**Providers:**

- OpenAI Whisper (STT), OpenAI TTS (output).
- Local alternative: Whisper.cpp + Kokoro.

**Configuration:**

- Speed control via environment variable: `VOICEMODE_TTS_SPEED=1.2`.
- Privacy mode: can run entirely offline with local providers.

### B. ElevenLabs MCP (Official)

- **Repository:** https://github.com/elevenlabs/elevenlabs-mcp
- **Docs:** https://elevenlabs.io/docs/agents-platform/customization/voice/speed-control

Official MCP server for Claude, Cursor, and Windsurf.

**Capabilities:**

- Speech generation
- Voice cloning
- Audio transcription
- Voice design
- Audio isolation

**Configuration:**

Add to `claude_desktop_config.json` with `uvx elevenlabs-mcp`.

**Output modes:** files, resources (base64), or both.

**Speed:** Agent platform supports 0.7x-1.2x. Raw TTS API allows a broader range.

**Free tier:** 10,000 credits/month.

### C. ElevenLabs CLI

- **Repository:** https://github.com/elevenlabs/cli
- **Docs:** https://elevenlabs.io/docs/conversational-ai/libraries/agents-cli

Dedicated CLI for conversational AI agents. Supports full duplex voice in the terminal.

### D. voice-mcp (Local, Apple Silicon Only)

- **Repository:** https://github.com/shreyaskarnik/voice-mcp

Bidirectional STT + TTS on macOS Apple Silicon via mlx-audio.

**Models:**

- Voxtral Realtime (4-bit, approximately 4B params) for STT.
- Kokoro TTS (54 voices, adjustable speed) for output.

100% local with no cloud dependencies.

### E. speak-mcp (Simple TTS)

- **Repository:** https://github.com/tylerdavis/speak-mcp

Lightweight agent-to-user voice output. 16 voices and multiple message types.

**Installation:**

```bash
npx github:tylerdavis/speak-mcp
```

### F. local-voice-mcp (Local TTS)

- **Repository:** https://github.com/CodeCraftersLLC/local-voice-mcp

Chatterbox Turbo TTS or Kokoro TTS. Cross-platform. MIT license.

### G. mcp-tts (Multi-Provider)

- **Repository:** https://github.com/blacktop/mcp-tts

Supports multiple providers: macOS `say`, ElevenLabs, Google TTS, and OpenAI TTS.

---

## 3. Cross-CLI Workflow & Orchestration

### amtiYo/agents - Universal Config Sync

- **Repository:** https://github.com/amtiYo/agents

One `.agents` source of truth syncing MCP servers, skills, and instructions across Codex, Claude Code, Gemini CLI, Cursor, Copilot, and Antigravity.

### all-agents-mcp - Multi-CLI Orchestrator

- **Repository:** https://github.com/Dokkabei97/all-agents-mcp

Unified stdio interface to orchestrate Claude Code, Codex, Gemini CLI, and Copilot CLI.

### Claude Squad - Multi-Agent Manager

- **Repository:** https://github.com/smtg-ai/claude-squad

Terminal application managing multiple agents in separate workspaces.

### AgentSys - Task-to-Production Workflows

- **Repository:** https://github.com/avifenesh/agentsys

PR management, code cleanup, drift detection, and multi-agent code review.

### TSK - Sandboxed Agent Tasks

- **Repository:** https://github.com/dtormoen/tsk

Rust CLI for sandboxed Docker agents with parallel execution.

---

## 4. Speed and Human Inflection Notes

| Factor | Detail |
|---|---|
| ElevenLabs Agent platform | Caps speed at 0.7x-1.2x |
| ElevenLabs raw TTS API | Allows broader speed range via `speed` parameter |
| Kokoro TTS (local) | Adjustable speed with no cap |
| PAI approach | Prosody enhancement + concise output, not raw speed multiplication |
| 2-3x playback | Use ElevenLabs TTS API directly or post-process with `ffmpeg atempo` |
| ElevenLabs Turbo 2.5 | Generates 3x faster (generation latency, not playback speed) |
| ElevenLabs Expressive Mode | Analyzes prosody for natural timing |

**Key takeaway:** For natural-sounding accelerated speech, prosody-aware generation (ElevenLabs Expressive Mode or PAI's approach) is preferable to naive speed multiplication. For raw speed beyond 1.2x, use the TTS API directly or apply ffmpeg post-processing.

---

## 5. Recommended Integration Path for EVOKORE-MCP

| Capability | Tool | Reason |
|---|---|---|
| Voice output (TTS) | elevenlabs-mcp or PAI voice | Best quality, persona voices, MCP native |
| Voice input (STT) | VoiceMode or voice-mcp | Bidirectional, Claude Code compatible |
| Agent personas | PAI TELOS + ElevenLabs voice mapping | Distinct voice + personality per agent |
| Cross-CLI sync | amtiYo/agents | One config for all CLIs |
| Workflow orchestration | AgentSys or Claude Squad | Multi-agent task management |
| Fast speech | ElevenLabs API + custom speed | Raw API allows higher speed than agent platform |

### Integration Considerations

1. **MCP Native First:** Prioritize tools that expose capabilities as MCP servers (elevenlabs-mcp, VoiceMode) since EVOKORE-MCP already operates as an MCP aggregator and can proxy these as child servers.
2. **Persona Mapping:** The PAI TELOS identity layer pattern (markdown files per agent) aligns well with EVOKORE-MCP's existing skill system. Voice personas can be mapped to agent roles via a `voices.json` configuration.
3. **Offline Fallback:** For environments without cloud access, Kokoro TTS + Whisper.cpp provides a fully local voice pipeline with no API costs.
4. **Cross-Platform:** voice-mcp is Apple Silicon only. For Windows/Linux compatibility, prefer VoiceMode or elevenlabs-mcp.

---

## 6. Additional Resources

- **awesome-claude-code:** https://github.com/hesreallyhim/awesome-claude-code
- **Tembo CLI Comparison:** https://www.tembo.io/blog/coding-cli-tools-comparison
- **PAI DeepWiki:** https://deepwiki.com/danielmiessler/Personal_AI_Infrastructure
- **ElevenLabs Expressive Mode:** https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode
