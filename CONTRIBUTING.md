# Contributing to EVOKORE-MCP

Thank you for your interest in contributing to EVOKORE-MCP. This guide covers the essentials for getting started, making changes, and submitting pull requests.

## Prerequisites

- **Node.js v20+** (check with `node --version`)
- **npm** (bundled with Node.js)
- **git** (with submodule support)
- **TypeScript** knowledge (the codebase uses strict mode)

## Getting Started

### Clone and Install

```bash
git clone --recurse-submodules https://github.com/mattmre/EVOKORE-MCP.git
cd EVOKORE-MCP
npm ci
```

The `--recurse-submodules` flag is important because the `SKILLS/` directory contains git submodules.

### Build

```bash
npm run build
```

This compiles TypeScript from `src/` into `dist/`. The build must succeed before running or testing the project.

### Configure Environment

Copy `.env.example` to `.env` and fill in the values you need:

```bash
cp .env.example .env
```

At minimum, set `GITHUB_PERSONAL_ACCESS_TOKEN` for the GitHub child server. Other API keys are optional depending on which child servers you want to test.

### Run Tests

```bash
# Run the full test suite
npx vitest run

# Run tests in watch mode during development
npx vitest

# Run a specific test file
npx vitest run test-name

# Run tests with UI
npx vitest --ui
```

All tests must pass before submitting a PR.

## Project Structure

```
EVOKORE-MCP/
  src/                    # TypeScript source code
    index.ts              # Main MCP server, request handlers, routing
    ProxyManager.ts       # Child server boot, prefixing, proxy execution
    SkillManager.ts       # Native tools, skill indexing, versioning
    ToolCatalogIndex.ts   # Unified tool catalog and search index
    SecurityManager.ts    # HITL/allow/deny policy, RBAC roles
    HttpServer.ts         # HTTP transport with SSE streaming
    SessionIsolation.ts   # Per-session state isolation
    WebhookManager.ts     # Webhook event delivery
    PluginManager.ts      # Plugin loading and hot-reload
    VoiceSidecar.ts       # Standalone voice WebSocket server
    auth/                 # OAuth/JWT authentication
    utils/                # Shared utilities
  dist/                   # Compiled output (gitignored)
  tests/                  # vitest test files
    integration/          # Integration tests
    helpers/              # Test utilities
  scripts/                # CLI tools, hooks, and governance helpers
    hooks/                # Claude Code hook entrypoints
  SKILLS/                 # Skill definitions (git submodules)
  docs/                   # Documentation
  plugins/                # Plugin directory (for custom tool providers)
  mcp.config.json         # Child server registry
  permissions.yml         # Tool permission rules and RBAC role definitions
  damage-control-rules.yaml  # Security rules for the damage-control hook
  voices.json             # Voice persona configuration
```

### Key Files

| File | Purpose |
|------|---------|
| `mcp.config.json` | Defines child servers to proxy (github, fs, elevenlabs, supabase) |
| `permissions.yml` | Flat and role-based permission rules for proxied tools |
| `.env` / `.env.example` | Environment variables (API keys, feature flags) |
| `tsconfig.json` | TypeScript configuration (strict mode, target ES2022) |
| `CLAUDE.md` | Detailed developer context, conventions, and learnings |

## Development Workflow

### Branch Naming

Use descriptive prefixes:

- `feat/` -- new features
- `fix/` -- bug fixes
- `chore/` -- maintenance, dependency updates
- `docs/` -- documentation changes
- `test/` -- test additions or improvements
- `refactor/` -- code restructuring without behavior change

### Making Changes

1. **Branch from `main`**:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/my-feature
   ```

2. **Make your changes** in `src/`.

3. **Build and test**:
   ```bash
   npm run build
   npx vitest run
   ```

4. **Commit** with clear, conventional-style messages:
   ```
   feat: add rate limit configuration per tool
   fix: handle missing env variable in proxy boot
   docs: update USAGE.md with webhook setup instructions
   chore: bump @modelcontextprotocol/sdk to 1.27.1
   test: add integration tests for session isolation
   ```

### Pull Request Process

1. Push your branch and open a PR against `main`.
2. Fill out the PR template (`.github/PULL_REQUEST_TEMPLATE.md`). Required sections:
   - **Description** -- what the PR does
   - **Type of Change** -- bug fix, feature, breaking change, etc.
   - **Changes Made** -- bullet list of changes
   - **Skills/Tools Affected** -- which parts of the system are impacted
   - **Testing** -- how you verified the changes
   - **Evidence** -- build output, test results, or screenshots
3. CI will run automatically (type check, test suite, build, Windows runtime validation).
4. All CI checks must pass before merge.

For process/tooling/release-impacting changes (including docs/process updates, scripts/config/workflow changes, and release flow updates), fill all sections in `.github/PULL_REQUEST_TEMPLATE.md` including Description, Type of Change, Changes Made, Skills/Tools Affected, Testing, and Evidence.

For the full PR merge governance process, see [docs/PR_MERGE_RUNBOOK.md](docs/PR_MERGE_RUNBOOK.md).

### CI Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs four jobs on every PR:

| Job | What it does |
|-----|-------------|
| **Type Check** | `npx tsc --noEmit` on Ubuntu with Node.js 20 |
| **Test Suite** | `npm test` (vitest) with PR metadata validation |
| **Build** | Full TypeScript build plus skills frontmatter normalization |
| **Windows Runtime** | Build + Windows-specific tests on `windows-latest` |

## Coding Standards

### TypeScript

- **Strict mode** is enabled (`"strict": true` in tsconfig.json)
- Target is ES2022 with CommonJS modules
- Use explicit types for function parameters and return values
- Prefer `const` over `let`; avoid `var`

### Style Guidelines

- Follow existing patterns in the codebase
- Use clear, self-documenting names over excessive comments
- Keep functions focused and reasonably sized
- Handle error cases explicitly (no silent swallowing)
- No hardcoded values that should be configurable

### Important Conventions

- **Path resolution**: compiled code runs from `dist/`. Relative paths resolving to root files (`mcp.config.json`, `.env`, `SKILLS/`) must use `../`, not `../../`.
- **Build output**: never commit compiled artifacts. `dist/` is gitignored.
- **Submodules**: if you modify files inside `SKILLS/` submodules, commit inside the submodule first, then update the parent repo pointer. See [docs/SUBMODULE_WORKFLOW.md](docs/SUBMODULE_WORKFLOW.md).
- **Windows compatibility**: `npx` needs `.cmd` suffix on Windows (handled by the runtime). Do not add `.cmd` to `uv` or `uvx`.

For the full list of project-specific conventions and learnings, see [CLAUDE.md](./CLAUDE.md).

## Testing

### Writing Tests

- Place test files in `tests/` or alongside the code they test
- Use vitest globals (`test()`, `describe()`, `expect()`)
- Follow the naming pattern of existing tests
- For integration tests that use proxied tools, use `waitForProxyBoot()` from `tests/helpers/wait-for-proxy-boot.js`

### Running Tests

```bash
# Full suite
npx vitest run

# Specific file
npx vitest run test-security-validation

# Watch mode for development
npx vitest

# With UI
npx vitest --ui
```

### Test Categories

- **Unit tests**: test individual modules in isolation
- **Integration tests**: test the full MCP server with tool calls (in `tests/integration/`)
- **Validation tests**: verify contract consistency, docs links, PR metadata, and submodule cleanliness

## Contributing Skills

To add a new skill or workflow:

1. Create a new directory within the appropriate category in `SKILLS/`.
2. Add your `SKILL.md` file (and any supporting assets).
3. Ensure your `SKILL.md` begins with valid YAML frontmatter containing at least `name` and `description`.
4. Run `node scripts/clean_skills.js` to verify your frontmatter parses correctly.
5. Submit a PR.

## Hook System

EVOKORE uses Claude Code hooks for development tooling. These hooks are active when developing with Claude Code but do not affect the runtime:

- **Damage Control** (`scripts/hooks/damage-control.js`): blocks dangerous shell commands based on rules in `damage-control-rules.yaml`
- **Purpose Gate** (`scripts/hooks/purpose-gate.js`): asks for session intent on first prompt
- **Session Replay** (`scripts/hooks/session-replay.js`): logs tool usage for replay
- **TillDone** (`scripts/hooks/tilldone.js`): blocks session stop if tasks are incomplete
- **Evidence Capture** (`scripts/hooks/evidence-capture.js`): captures test results and file changes

All hooks use fail-safe loading (`scripts/hooks/fail-safe-loader.js`) so failures degrade gracefully without crashing the editor.

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm test` | Run full test suite (vitest) |
| `npx vitest` | Run tests in watch mode |
| `npm run repo:audit` | Check branch state, worktrees, and drift |
| `npm run dashboard` | Launch session dashboard (port 8899) |
| `npm run sync:dry` | Preview config sync across AI CLIs |
| `npm run replay` | View latest session replay |
| `npm run hooks:view` | View hook event log |

## Documentation References

- [docs/README.md](docs/README.md) -- canonical docs portal
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) -- runtime architecture
- [docs/SUBMODULE_WORKFLOW.md](docs/SUBMODULE_WORKFLOW.md) -- submodule workflow
- [docs/RELEASE_FLOW.md](docs/RELEASE_FLOW.md) -- release flow
- [docs/PR_MERGE_RUNBOOK.md](docs/PR_MERGE_RUNBOOK.md) -- PR merge governance
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) -- common issues and solutions
- [CLAUDE.md](./CLAUDE.md) -- detailed developer context and accumulated learnings
