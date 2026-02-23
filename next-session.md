# Next Session Priorities

1. **Merge PR #5**: Review and merge the Voice Sidecar + Cross-CLI Sync PR into main. URL: https://github.com/mattmre/EVOKORE-MCP/pull/5
2. **End-to-End Voice Test**: Start sidecar (`npm run voice`), send test messages via wscat, verify audio playback. Register `voice-hook.js` in Claude Code hooks and test the full auto-speak pipeline.
3. **CI/CD**: Set up GitHub Actions to automate `npm test` on PRs.
4. **NPM Publishing**: Publish `evokore-mcp` v2.0 to npm and/or GitHub Packages.
5. **Pending PRs**: Review and merge any remaining open PRs (docs-architect-v2, etc.).
6. **Voice Refinement**: Test persona switching, speed tuning layers, and ffmpeg post-processing. Consider adding a CLI flag to `voice-hook.js` for persona selection based on agent context.
