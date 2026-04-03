---
name: panel-dependency-supply-chain
description: Expert panel for dependency selection, vulnerability scanning, license compliance, transitive dependency risk, and supply chain security
aliases: [dependency-panel, supply-chain-panel, license-panel, sbom-panel, dependency-review]
category: orchestration
tags: [dependencies, supply-chain, security, licenses, vulnerabilities, sbom, npm, packages]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - dependency selection review
  - supply chain security
  - license compliance audit
  - adding a new dependency
  - dependency vulnerability
  - package security review
  - SBOM or software composition analysis
---

# Dependency & Supply Chain Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Dr. Lena Fischer** | Software Supply Chain Researcher | Supply chain attacks, SBOM, provenance, attestation |
| **Marcus Thompson (Legal)** | License Compliance Attorney | License compatibility, copyleft risk, transitive license audit |
| **Yuki Tanaka (Deps)** | Dependency Health Analyst | Maintenance velocity, bus factor, community health, upgrade path |
| **Alex Rivera (Security)** | Application Security Engineer | CVE exposure, exploitability, patching SLA, vulnerability scanning |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- Adding a new dependency (especially with >5 transitive dependencies)
- Major version upgrades of critical dependencies
- Security advisories affecting project dependencies
- License compliance audits (annual or pre-acquisition)
- When a dependency's maintenance status changes (maintainer leaves, project archived)
- Annual dependency health reviews
- Evaluating alternatives to an existing dependency
- Before open-sourcing a project (license audit)

## Review Modes

### Mode A: New Dependency Review
Evaluate a proposed new dependency for security, license compliance, maintenance health, and necessity.

### Mode B: Security Advisory Response
Assess a reported vulnerability in an existing dependency for exploitability, urgency, and remediation options.

### Mode C: Annual License & Health Audit
Comprehensive review of the full dependency tree for license compliance, maintenance health, and security posture.

---

## Review Protocol

### Step 1: CONVENE -- Select Mode and Experts

| Mode | Active Experts |
|---|---|
| New Dependency Review | All 4 |
| Security Advisory Response | Alex (Security), Dr. Fischer, Yuki (Deps) |
| Annual License & Health Audit | Marcus (Legal), Yuki (Deps), Alex (Security) |

### Step 2: BRIEF -- Present the Artifact

**For New Dependency Review (Mode A):**
```
## Dependency Under Review
- **Package:** [name, version, registry]
- **Purpose:** [what it does, why we need it]
- **Alternatives Considered:** [other packages or build-it-yourself]
- **Direct Dependencies:** [count]
- **Transitive Dependencies:** [count]
- **License:** [SPDX identifier]
- **Maintainers:** [count, identity]
- **Last Release:** [date]
- **Weekly Downloads:** [count]
- **Usage in Project:** [where and how it will be used]
```

**For Security Advisory Response (Mode B):**
```
## Vulnerability Under Review
- **CVE/Advisory:** [identifier]
- **Affected Package:** [name, affected versions]
- **Current Version:** [our version]
- **CVSS Score:** [score and vector]
- **Description:** [what the vulnerability allows]
- **Exploitability:** [conditions required for exploitation]
- **Fix Available:** [patched version, if any]
- **Workaround:** [mitigation without upgrading, if any]
- **Our Exposure:** [how we use the affected package]
```

**For Annual License & Health Audit (Mode C):**
```
## Dependency Audit Scope
- **Project:** [name]
- **Project License:** [our project's license]
- **Total Dependencies:** [direct + transitive count]
- **Last Audit Date:** [when this was last reviewed]
- **Known Issues:** [any dependencies already flagged]
- **Compliance Requirements:** [regulatory, contractual, or policy constraints]
- **Distribution Model:** [SaaS, on-premises, open-source, embedded]
```

### Step 3: SOLO -- Independent Expert Reviews

**Dr. Lena Fischer (Software Supply Chain Researcher) reviews:**
- Maintainer identity -- who maintains this package, and what's their identity verification?
- Transitive dependency audit -- how many transitive dependencies does this add, and have you audited them?
- Provenance chain -- can you verify the published package matches the source repository?
- Build reproducibility -- can you reproduce the published artifact from source?
- Supply chain attack surface -- has this package or its dependencies been involved in previous supply chain incidents?
- Publication integrity -- is the package signed? Is there a provenance attestation?
- Typosquatting risk -- are there similarly named packages that could be confused with this one?
- "If a maintainer's npm account is compromised tomorrow, what's the blast radius to our project?"

**Marcus Thompson (Legal) (License Compliance Attorney) reviews:**
- Direct license compatibility -- is this package's license compatible with our project's license and distribution model?
- Transitive license audit -- what's the license of every transitive dependency this adds?
- Copyleft contamination -- are there any copyleft licenses (GPL, AGPL, LGPL) hiding in the dependency tree?
- License ambiguity -- is the license clearly stated, or is it ambiguous (dual-licensed, custom license, no license file)?
- Patent clauses -- does the license include patent grants or retaliation clauses?
- Attribution requirements -- what attribution obligations does this dependency create?
- Distribution impact -- does our distribution model (SaaS vs on-premises vs open-source) change the license analysis?
- "Show me the full license tree. If there's a single copyleft license in there, we need to understand the linking boundary."

**Yuki Tanaka (Deps) (Dependency Health Analyst) reviews:**
- Maintenance cadence -- when was the last release, and what's the release cadence?
- Maintainer bus factor -- how many active maintainers does this have? What happens if the primary maintainer disappears?
- Issue response time -- how quickly are issues triaged and addressed?
- Community health -- is there an active community, or is this a single-person project?
- Funding -- is this project funded or sponsored? Is there a sustainability risk?
- Upgrade path -- what's the project's track record on breaking changes and major version upgrades?
- Abandonment risk -- what happens to our project if this dependency is abandoned tomorrow?
- "Check the commit history for the last 12 months. Is this a living project or a zombie?"

**Alex Rivera (Security) (Application Security Engineer) reviews:**
- Known vulnerabilities -- are there any known CVEs in this version?
- Exploitability in context -- is this CVE exploitable in our deployment context, or is it theoretical?
- Patching cadence -- how quickly does this project release security patches?
- Security policy -- does the project have a SECURITY.md or responsible disclosure process?
- Dependency depth -- are there deeply nested transitive dependencies that are hard to patch?
- Runtime exposure -- does this dependency run in a security-sensitive context (handling user input, crypto, auth)?
- Patching SLA -- what's our SLA for patching critical dependency vulnerabilities, and can this project meet it?
- "Run `npm audit` (or equivalent) and show me every advisory. For each one, tell me if it's exploitable in our context."

### Step 4: CHALLENGE -- Cross-Expert Debate

Key challenges for this panel:

1. **Dr. Fischer vs Yuki (Deps):** "Minimize dependencies -- every dependency is attack surface" vs "Use well-maintained dependencies instead of rolling your own -- your homegrown version will have more bugs"
2. **Marcus (Legal) vs Alex (Security):** "This license is ambiguous, don't use it" vs "The security-patched version is only available under this license -- the risk of the vulnerability outweighs the license ambiguity"
3. **Yuki (Deps) vs Dr. Fischer:** "Low commit activity means this project is risky" vs "Stable packages with few updates have a smaller attack surface than frequently-churning packages"
4. **Alex (Security) vs Yuki (Deps):** "Upgrade immediately to patch this CVE" vs "The major version upgrade required for the patch introduces 15 breaking changes"
5. **Dr. Fischer vs Marcus (Legal):** "This package has excellent provenance and security" vs "Its license is incompatible with our distribution model, so none of that matters"

### Step 5: CONVERGE -- Synthesize Findings

```markdown
## Dependency & Supply Chain Panel Report

### Overall Assessment: [APPROVED / APPROVED WITH CONDITIONS / REJECTED]

### Security Assessment
1. **Known Vulnerabilities:** [count, severity]
2. **Supply Chain Risk:** [low/medium/high] -- rationale: [why]
3. **Exploitability:** [theoretical/conditional/confirmed]

### License Assessment
1. **Direct License:** [SPDX] -- compatible: [yes/no]
2. **Transitive Licenses:** [list of unique licenses] -- compatible: [yes/no/requires review]
3. **Copyleft Risk:** [none/LGPL boundary/GPL contamination]

### Health Assessment
1. **Maintenance Status:** [active/declining/abandoned]
2. **Bus Factor:** [count]
3. **Abandonment Risk:** [low/medium/high]

### Risk Register
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| [Risk 1] | [H/M/L] | [H/M/L] | [approach] | [who] |

### Recommendation
- **Verdict:** [adopt/adopt with mitigations/find alternative/build internally]
- **Conditions:** [if conditional approval, what must be done]
- **Alternatives:** [if rejected, recommended alternatives]
- **Review Schedule:** [when to re-evaluate this dependency]

### Dissenting Opinions
1. [Expert] argued [position] -- [rationale]
```

### Step 6: FEASIBILITY -> DELIVER

Top recommendations and alternative approaches go to [Feasibility Panel](feasibility-research.md).

## Example Invocations

### New Dependency Review
```
Run a Dependency & Supply Chain Panel -- Mode A -- on adding
`sharp` (v0.33.2) for image processing.

We need server-side image resizing for user avatar uploads.
Alternatives considered: Jimp (pure JS, slower), ImageMagick
(system dependency), Thumbor (separate service).

Sharp adds 47 transitive dependencies including native binaries
(libvips). It's MIT-licensed with 2 active maintainers.

Key concerns:
- Is the native binary supply chain trustworthy?
- What's the bus factor with only 2 maintainers?
- Are there license issues in the transitive dependency tree?
- Is the native build process reliable across our CI environments?

Full panel, all experts.
```

### Security Advisory Response
```
Run Mode B on CVE-2024-XXXXX affecting lodash 4.17.20.

CVSS 7.5, prototype pollution in `_.merge()`. We use lodash
extensively (127 import sites), but we've audited and believe
we never pass user-controlled objects to `_.merge()`.

Key concerns:
- Is this exploitable in our context given our usage patterns?
- Should we upgrade to 4.17.21, or is the risk acceptable?
- Are there transitive dependencies that also use the vulnerable `_.merge()`?
```

### Annual Audit
```
Run Mode C -- annual license and health audit for our project.

We have 312 direct dependencies and 1,847 transitive dependencies.
Our project is MIT-licensed and distributed as a SaaS product.
Last audit was 14 months ago.

Key concerns:
- License compliance for SaaS distribution
- Dependencies that have been abandoned since last audit
- Critical dependencies with known unpatched vulnerabilities
```
