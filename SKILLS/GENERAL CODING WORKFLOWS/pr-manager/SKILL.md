---
name: pr-manager
description: Review, test, lint, and prepare smart merges for all open and
  closed PRs, verifying features and documenting technical debt.
---

# PR Manager

This skill manages outstanding PRs, ensuring code quality, feature completeness, and smart merging without losing context or code.

## Core Workflows

### 1. PR Review and Merge Preparation
- We have a large amount of outstanding and open PRs.
- Use agentic orchestration to complete implementation of these items to prevent context rot.
- Provide agents with instructions and plans as needed, then dispose of the agent and use a fresh one.
- **Before Implementation**: Research and plan/architect all features. Coordinate analysis of current research and docs within the repo. If new research is done, save it to the `docs` folder.
- **Review Each PR**: Check for comments, test/lint, and prepare for merge. Address and fix comments as needed. Update the PR once complete.
- **Merge Smartly**: Analyze as you go, test final before the final merge to main. Do not lose any coding we have; be as safe as possible.
- **Tracking**: Keep track of the session log and agents' work so we can track and monitor. Post a PR update for each so we can review.

### 2. Verification of Phase Features and Wiring
- Examine the feature requirements for each OPEN PR AND CLOSED PR.
- Verify the features were implemented or appear to be fully wired and flushed out.
- Prevent inline failures not explicitly exposed by the agents or models that would cause extensive re-writes.
- Produce a report of findings based on severity. Use multiple agents and orchestrate as needed to expedite.

### 3. Verification of Technical Deferment
- Do a sweep using multiple agents on all closed PRs AND open PRs for:
  - Technical deferment
  - Technical debt
  - Features that were not implemented
  - Any other issues noted in PR comments
- Ensure each PR is reviewed by Gemini if it hasn't been.
- Add these findings to the ARCH-AEP findings so we can remediate and tackle them all at once.

## Risk-Based Review Routing

Adapted from Agent33's risk trigger framework. When a PR touches certain areas, it must be routed to the appropriate specialist reviewer before merge.

### When Security Review Is Mandatory

Route to security reviewer (or invoke `security-review` skill) when the PR includes any of:

- **Authentication/authorization changes**: Login flows, session management, token handling, RBAC modifications
- **Input validation changes**: User-facing input parsing, sanitization logic, allowlist/blocklist updates
- **Secrets handling**: Any code that reads, writes, rotates, or references API keys, tokens, or credentials
- **Cryptographic changes**: Encryption, hashing, signing, or certificate management
- **Prompt injection exposure**: Processing untrusted external content, passing user content to tool invocations, modifying system prompts dynamically

### When DBA Review Is Needed

Route to database/schema reviewer when the PR includes:

- **Schema changes**: Table creation, column additions/removals, index modifications, migration files
- **Data model changes**: ORM model updates, relationship changes, constraint modifications
- **Query changes**: New queries against production data, query optimization, raw SQL

### When Architecture Review Is Needed

Route to architecture reviewer when the PR includes:

- **Public API surface changes**: New endpoints, changed request/response schemas, removed endpoints
- **CI/CD or deployment changes**: Pipeline modifications, Dockerfile changes, infrastructure-as-code updates
- **Large refactors**: Changes touching 10+ files or restructuring module boundaries
- **New dependencies**: Adding packages to `package.json`, `requirements.txt`, or lockfiles

### Risk Trigger Reference Table

| Trigger Category | Specific Triggers | Required Reviewer | Block Merge? |
|-----------------|-------------------|-------------------|--------------|
| **Security/Auth/Crypto** | Auth flows, session mgmt, token handling, encryption | Security | Yes |
| **Input Validation** | User input parsing, sanitization, allowlists | Security | Yes |
| **Secrets Handling** | API keys, tokens, vault config, credential rotation | Security | Yes |
| **Schema/Data Model** | Migrations, ORM models, constraints, indexes | DBA | Yes |
| **Public API/Interface** | New endpoints, schema changes, removed routes | Architecture | Yes |
| **CI/CD/Deployment** | Pipelines, Dockerfiles, IaC | Architecture | Yes |
| **Large Refactor** | 10+ files changed, module restructuring | Architecture | Recommended |
| **Supply Chain** | New deps, lockfile changes, build scripts | Security | Recommended |
| **Prompt Injection** | Untrusted content processing, dynamic prompts | Security | Yes |
| **Sandbox/Permissions** | Tool approvals, elevated permissions, network access | Security | Yes |
