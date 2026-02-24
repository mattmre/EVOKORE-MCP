# Next Session Priorities

1. **End-to-End Hook Testing**: Start a fresh Claude Code session in the EVOKORE-MCP directory and verify all 4 hooks fire correctly (damage-control blocks dangerous commands, purpose-gate asks for intent, session-replay logs events, tilldone blocks stop with incomplete tasks).
2. **Merge PRs**: Merge the hooks PR (this session) and any remaining open PRs (Voice Sidecar PR #5, etc.) into main.
3. **Hook Test Suite**: Add automated tests for the 4 hook scripts to the `npm test` suite (pipe simulated JSON payloads, assert exit codes and stdout/stderr output).
4. **TillDone Session Auto-Detection**: Add `--session auto` mode to tilldone that reads the current Claude session ID from environment variables, removing the need to manually pass `--session`.
5. **End-to-End Voice Test**: Start sidecar (`npm run voice`), send test messages via wscat, verify audio playback. Test the full auto-speak pipeline with `voice-hook.js` now registered in `.claude/settings.json`.
6. **CI/CD**: Set up GitHub Actions to automate `npm test` on PRs.
7. **NPM Publishing**: Publish `evokore-mcp` v2.0 to npm and/or GitHub Packages.
8. **Voice Refinement**: Test persona switching, speed tuning layers, and ffmpeg post-processing.
