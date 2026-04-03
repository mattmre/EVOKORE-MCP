---
name: panel-onboarding-knowledge-transfer
description: Expert panel for developer onboarding experience, documentation for newcomers, codebase navigability, local development setup, and tribal knowledge capture
aliases: [onboarding-panel, knowledge-transfer-panel, dx-onboarding-panel, onboarding-review]
category: orchestration
tags: [onboarding, documentation, knowledge-transfer, developer-experience, tribal-knowledge, setup]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - developer onboarding review
  - onboarding friction
  - knowledge transfer
  - tribal knowledge capture
  - local development setup
  - codebase navigability
  - bus factor review
---

# Onboarding & Knowledge Transfer Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Samira Hussain** | Developer Onboarding Specialist | New developer experience, time-to-first-commit, setup friction |
| **Dr. Martin Berger** | Knowledge Management Researcher | Institutional knowledge capture, ADRs, bus factor reduction |
| **Joyce Kimani** | Technical Writing & Information Architecture | Documentation quality, findability, information structure |
| **Antonio Russo** | Local Development Environment Engineer | Dev environment reliability, cross-platform setup, dependency management |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- Quarterly onboarding experience review
- When a new team member reports onboarding friction
- After major architecture changes that affect codebase navigability
- When team churn exceeds threshold (bus factor audit)
- Before open-sourcing a project
- When a critical team member departs
- When local dev setup documentation is updated or overhauled

## Review Modes

### Mode A: New Hire Onboarding Review
Evaluate the end-to-end onboarding experience from `git clone` to first meaningful contribution.

### Mode B: Bus Factor & Knowledge Capture Audit
Assess institutional knowledge coverage, ADR completeness, and single-point-of-knowledge risks.

### Mode C: Local Dev Environment Review
Review local development setup reliability, cross-platform parity, and dependency management.

---

## Review Protocol

### Step 1: CONVENE — Select Mode and Experts

| Mode | Active Experts |
|---|---|
| New Hire Onboarding | Samira, Joyce, Antonio |
| Bus Factor & Knowledge Capture | Dr. Berger, Joyce, Samira |
| Local Dev Environment | Antonio, Samira, Joyce |

### Step 2: BRIEF — Present the Artifact

**For New Hire Onboarding (Mode A):**
```
## Onboarding Experience Under Review
- **Repository:** [repo name and URL]
- **Target Developer Profile:** [junior / mid / senior; frontend / backend / fullstack]
- **Existing Onboarding Docs:** [README, CONTRIBUTING, setup guides — list paths]
- **Expected Time-to-First-Commit:** [current estimate]
- **Known Pain Points:** [reported friction areas]
- **Toolchain Requirements:** [languages, runtimes, databases, external services]
- **Access Requirements:** [credentials, VPNs, API keys, service accounts]
```

**For Bus Factor & Knowledge Capture (Mode B):**
```
## Knowledge Capture Audit Target
- **Team Size:** [current headcount]
- **Tenure Distribution:** [how long team members have been on the project]
- **Critical Subsystems:** [list of core subsystems and their primary maintainers]
- **Existing ADRs:** [count and location, or "none"]
- **Documentation Coverage:** [rough estimate of documented vs undocumented decisions]
- **Recent Departures:** [team members who left recently and what they owned]
- **Known Tribal Knowledge:** [things "everyone knows" but nobody has written down]
```

**For Local Dev Environment (Mode C):**
```
## Dev Environment Under Review
- **Setup Method:** [manual steps / script / containerized / cloud dev environment]
- **Supported Platforms:** [macOS, Linux, Windows — which versions]
- **Dependencies:** [runtimes, databases, external services, API keys]
- **Setup Time:** [how long it currently takes from scratch]
- **Known Issues:** [platform-specific quirks, version conflicts, flaky steps]
- **CI Parity:** [how closely local environment matches CI]
```

### Step 3: SOLO — Independent Expert Reviews

**Samira Hussain (Developer Onboarding Specialist) reviews:**
- First-hour experience — what happens in the first 60 minutes after `git clone`? Where is the first point of confusion?
- Documentation entry point — is there a clear "start here" path, or does the new developer face a wall of READMEs?
- Assumption audit — what does the onboarding documentation assume the developer already knows? Are those assumptions valid for the target hire profile?
- Feedback loops — how quickly does a new developer know if their setup is working? Are there intermediate verification steps?
- Contribution path — after setup is complete, is there a clear "first task" or does the developer have to figure out what to work on?
- Mentorship scaffolding — is there a buddy system, office hours, or structured check-in process documented?
- Failure recovery — when something goes wrong during setup, can the developer diagnose and fix it from the docs alone, or do they need to ask someone?
- "Can a new hire get from `git clone` to a passing test suite in under 30 minutes? If not, what's blocking that?"

**Dr. Martin Berger (Knowledge Management Researcher) reviews:**
- ADR coverage — are architecture decisions recorded with context, alternatives considered, and rationale? Can a future team member understand why the system was built this way?
- Bus factor analysis — for each critical subsystem, how many people understand it well enough to maintain it? Is any subsystem a single-person dependency?
- Decision trail — when a future developer asks "why is it done this way?", can they find the answer without asking a person?
- Knowledge decay — are there documented decisions that reference outdated context, tools, or constraints that no longer apply?
- Onboarding vs reference — is documentation structured for first-time learning, or only useful as a reference for people who already understand the system?
- Knowledge graph completeness — are the connections between subsystems documented? Can someone trace how a request flows through the system?
- Succession readiness — if the most knowledgeable person left tomorrow, what would the team lose? What would they be unable to maintain?
- "Where are the architecture decision records? If the person who built this subsystem left tomorrow, could the team maintain it?"

**Joyce Kimani (Technical Writing & Information Architecture) reviews:**
- Information architecture — is documentation organized by user intent (task-based) or by system structure (component-based)? Is the right choice made for each document?
- Findability — can someone search for a common task and find the right guide without knowing internal jargon or project-specific terminology?
- Consistency — are there multiple documents that describe the same thing differently? Are there contradictory instructions?
- Freshness — are there stale references, dead links, or instructions that describe a system that no longer exists?
- Progressive disclosure — does documentation present essential information first and advanced topics later, or does it front-load complexity?
- Navigation — is there a documentation map or table of contents that helps a new reader understand what documentation exists and where to find it?
- Visual aids — are diagrams, screenshots, and examples used where they would accelerate understanding?
- "If I search for [common task], do I find the right guide? Are there multiple documents that describe the same thing differently?"

**Antonio Russo (Local Development Environment Engineer) reviews:**
- Fresh-machine test — does the setup script work on a machine with no prior configuration? Has this been tested recently?
- Cross-platform parity — does setup work identically on all supported platforms, or are there platform-specific workarounds documented only in tribal knowledge?
- Dependency pinning — are all dependencies version-pinned? Can a setup from 6 months ago still be reproduced?
- External service dependencies — does local development require access to external services (databases, APIs, cloud resources)? Are there local alternatives or mocks?
- Setup idempotency — can the setup script be run multiple times without breaking? Does it handle partial failures gracefully?
- Test suite reliability — does the full local test suite pass consistently, or are there flaky tests that confuse new developers?
- CI/local divergence — are there tests that pass locally but fail in CI, or vice versa? Is the local environment a reliable predictor of CI results?
- "Does `make setup` work on a fresh machine with no prior configuration? How long does the full local test suite take to run?"

### Step 4: CHALLENGE — Cross-Expert Debate

Key tensions for this panel:

1. **Samira vs Dr. Berger:** "Optimize for day-one experience — too much documentation overwhelms new developers" vs "Optimize for month-six understanding — shallow onboarding creates long-term knowledge gaps"
2. **Joyce vs Antonio:** "Restructure all documentation for findability and consistency first" vs "Just make the setup script work reliably — nobody reads docs until the build is broken"
3. **Dr. Berger vs Samira:** "Document everything — institutional knowledge loss is the real risk" vs "Too much documentation is worse than too little — nobody maintains 200 pages of internal docs"
4. **Antonio vs Joyce:** "Automate away the need for documentation — a script is better than a guide" vs "Automation without documentation is a black box — when the script breaks, nobody knows what it was supposed to do"
5. **Samira vs Joyce:** "Write a quick-start guide with only the essentials" vs "A quick-start guide that omits context creates developers who can run the project but don't understand it"

### Step 5: CONVERGE — Synthesize Findings

```markdown
## Onboarding & Knowledge Transfer Panel Report

### Overall Assessment: [READY / READY WITH IMPROVEMENTS / NEEDS REWORK]

### Onboarding Experience Findings
1. **[Finding]** — severity: [critical/high/medium/low], remediation: [approach]

### Knowledge Capture Gaps
1. **[Gap]** — bus factor: [number of people who hold this knowledge], risk: [what happens if they leave], remediation: [approach]

### Documentation Quality Findings
1. **[Finding]** — type: [stale/missing/contradictory/unfindable], remediation: [approach]

### Local Dev Environment Findings
1. **[Finding]** — platforms affected: [which], severity: [critical/high/medium/low], remediation: [approach]

### Risk Register
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| [Risk 1] | [H/M/L] | [H/M/L] | [approach] | [who] |

### Time-to-First-Commit Assessment
- Current estimated time: [duration]
- Target time: [duration]
- Bottlenecks: [ordered list of what slows onboarding most]
- Recommended improvements: [prioritized list]

### Dissenting Opinions
1. [Expert] argued [position] — [rationale]
```

### Step 6: FEASIBILITY -> DELIVER

Top recommendations and improvement proposals go to [Feasibility Panel](feasibility-research.md) for implementation viability assessment.

---

## Example Invocations

### New Hire Onboarding Review
```
Run an Onboarding & Knowledge Transfer Panel review — Mode A
(New Hire Onboarding) — on the EVOKORE-MCP repository.

Target developer profile: mid-level TypeScript engineer,
familiar with Node.js but no prior MCP protocol experience.

Key concerns:
- How long does it take to get from git clone to running tests?
- Is the MCP protocol architecture explained for newcomers?
- Are there undocumented setup steps that require asking a team member?

Samira, Joyce, Antonio active. Include feasibility gate.
```

### Bus Factor Audit
```
Run an Onboarding & Knowledge Transfer Panel review — Mode B
(Bus Factor & Knowledge Capture Audit) — on the EVOKORE-MCP project.

The project has had a single primary contributor for 6 months.
Key subsystems: ProxyManager, SessionIsolation, hook system,
skill resolution, damage-control rules.

Key question: What institutional knowledge exists only in the
primary contributor's head, and what is the plan to capture it?

Dr. Berger, Joyce, Samira active. Include feasibility gate.
```

### Local Dev Environment Review
```
Run an Onboarding & Knowledge Transfer Panel review — Mode C
(Local Dev Environment) — on the EVOKORE-MCP setup process.

The project targets Windows, macOS, and Linux. Setup involves
Node.js, TypeScript compilation, optional Python/UV for child
servers, and .env configuration.

Key concern: Does the setup work on a fresh Windows machine
without manual intervention? Are platform-specific quirks documented?

Antonio, Samira, Joyce active.
```
