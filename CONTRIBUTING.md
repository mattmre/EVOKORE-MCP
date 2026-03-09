# Contributing to EVOKORE-MCP

Thank you for your interest in contributing to EVOKORE-MCP! We welcome additions to our library of Agent Skills, MCP Prompts, and Workflow architectures.

## Documentation References

- Canonical docs map: [docs/README.md](docs/README.md)
- Submodule workflow: [docs/SUBMODULE_WORKFLOW.md](docs/SUBMODULE_WORKFLOW.md)
- Release flow: [docs/RELEASE_FLOW.md](docs/RELEASE_FLOW.md)
- PR merge runbook: [docs/PR_MERGE_RUNBOOK.md](docs/PR_MERGE_RUNBOOK.md)

## The Pull Request Workflow

We use a strict Pull Request (PR) only workflow. Direct commits to the main branch are restricted. 

To contribute a new skill or workflow:

1. **Fork the Repository**: Create your own fork of mattmre/EVOKORE-MCP.
2. **Create a Branch**: Create a feature branch for your new skill.
3. **Add Your Skill**:
   - Create a new directory within the appropriate category in the SKILLS/ directory.
   - Add your SKILL.md file (and any supporting assets).
   - **Crucial**: Ensure your SKILL.md begins with valid YAML frontmatter containing a name and description.
4. **Test Locally**: Run `node scripts/clean_skills.js` to ensure your YAML frontmatter parses correctly.
   - For voice/release updates, also run:
      - `node test-voice-e2e-validation.js`
      - `node test-voice-refinement-validation.js`
      - `node test-voice-sidecar-smoke-validation.js`
      - `node test-voice-windows-docs-validation.js`
      - `node test-npm-release-flow-validation.js`
5. **Submit a Pull Request**: Open a PR against the main branch of this repository.

For process/tooling/release-impacting changes (including docs/process updates such as `docs/PR_MERGE_RUNBOOK.md`, scripts/config/workflow changes, and release flow updates), fill all sections in `.github/PULL_REQUEST_TEMPLATE.md`:

- Description
- Type of Change
- Changes Made
- Skills/Tools Affected
- Testing
- Evidence

If your change touches submodule-managed content, follow [docs/SUBMODULE_WORKFLOW.md](docs/SUBMODULE_WORKFLOW.md): commit inside the submodule first, then commit the updated pointer in this parent repo.

## Modifying the Core Server

If modifying the core MCP server implementation (src/index.ts):
1. Run `npm install`.
2. Make your changes in `src/index.ts`.
3. Run `npx tsc` to compile to `dist/index.js`.
4. Submit your PR. Our CI pipeline will automatically verify the build.
