# Next Session Priorities

1. **Voice Server Sidecar**: Build a PAI-style Stop hook + local voice server (`localhost:8888`) that auto-speaks Claude responses using ElevenLabs WebSocket streaming. Reference implementation at `SKILLS/ANTHROPIC COOKBOOK/third_party/ElevenLabs/stream_voice_assistant_websocket.py`.
2. **Voice Personas**: Create `voices.json` mapping EVOKORE-MCP agent roles (Orchestrator, Researcher, Architect, Implementer, etc.) to distinct ElevenLabs voices with per-agent stability/similarity_boost tuning.
3. **Speed & Prosody**: Implement 2-3x natural speech using ElevenLabs Expressive Mode + Turbo v2.5 model + concise spoken-style output prompting.
4. **Cross-CLI Sync**: Evaluate `amtiYo/agents` for syncing MCP servers, skills, and instructions across Claude Code, Gemini CLI, Copilot CLI, and Codex.
5. **Pending PRs**: Review and merge any open PRs from previous sessions (docs-architect-v2, etc.).
6. **CI/CD**: Set up GitHub Actions to automate `npm test` on PRs.
