---
name: panel-security-audit
description: Expert panel for security review, threat modeling, and compliance assessment
aliases: [security-panel, security-experts, threat-panel, security-review-panel]
category: orchestration
tags: [security, threat-modeling, compliance, vulnerabilities, audit]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - security review or audit
  - threat modeling
  - vulnerability assessment
  - compliance review
  - auth or crypto code review
---

# Security Audit Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Dr. Natasha Volkov** | Penetration Tester | Attack surface, injection, privilege escalation |
| **Thomas Eriksen** | Compliance & Privacy Officer | Data handling, PII, audit trails, regulatory |
| **Dr. Lisa Park** | Threat Modeler | Trust boundaries, STRIDE, defense in depth |
| **Omar Hassan** | Crypto & Secrets Specialist | Cryptographic correctness, key management, timing |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- Security-sensitive code changes (auth, crypto, tokens, sessions)
- API design review (endpoint security, authorization model)
- New integrations with external services
- Webhook/event systems (payload security, HMAC, redaction)
- Configuration changes affecting security posture
- Pre-release security gate

## Review Protocol

### Step 1: CONVENE — Select Active Experts

| Artifact Type | Active Experts |
|---|---|
| Auth/session code | All 4 |
| API endpoints | Natasha, Lisa, Thomas |
| Webhook/event system | Natasha, Omar, Lisa |
| Crypto/token code | Omar, Natasha, Lisa |
| Data handling changes | Thomas, Lisa, Natasha |
| Config/permissions | Lisa, Thomas, Omar |

### Step 2: BRIEF — Present the Artifact
```
## Security Review Target
- **Files:** [list of files under review]
- **Change Type:** [new feature / modification / configuration]
- **Trust Boundaries Affected:** [which boundaries this code touches]
- **Data Sensitivity:** [what sensitive data flows through this code]
- **Threat Context:** [known threats, deployment environment, user base]
- **Existing Controls:** [what security measures are already in place]
```

### Step 3: SOLO — Independent Expert Reviews

**Dr. Natasha Volkov (Penetration Tester) reviews:**
- Input validation completeness — every user-controlled input, every parameter
- Injection vectors — command injection, SQL injection, path traversal, SSRF
- Authentication bypass — default credentials, session fixation, token leakage
- Authorization bypass — horizontal privilege escalation, IDOR, missing checks
- Information disclosure — error messages leaking internals, debug endpoints
- Rate limiting and abuse potential
- "I have a valid account and curl. What shouldn't I be able to do but can?"

**Thomas Eriksen (Compliance & Privacy) reviews:**
- PII in logs, error messages, and telemetry
- Data retention policies and enforcement
- Consent tracking for data collection
- Audit trail completeness — who did what, when, to what data
- GDPR/SOC2/HIPAA relevant data flows
- Right-to-deletion capability
- "If a user asks 'what data do you have about me,' can you answer completely and accurately?"

**Dr. Lisa Park (Threat Modeler) reviews:**
- Trust boundary map — where data crosses trust domains
- STRIDE analysis per trust boundary:
  - **S**poofing: Can identity be faked?
  - **T**ampering: Can data be modified in transit?
  - **R**epudiation: Can actions be denied without evidence?
  - **I**nformation Disclosure: Can data leak across boundaries?
  - **D**enial of Service: Can the service be overwhelmed?
  - **E**levation of Privilege: Can permissions be escalated?
- Defense-in-depth gaps — single points of security failure
- Least privilege violations
- "If this trust boundary fails, what's the maximum blast radius?"

**Omar Hassan (Crypto & Secrets) reviews:**
- Cryptographic algorithm choices (are they current, appropriate?)
- Key management lifecycle (generation, storage, rotation, revocation)
- HMAC/signature implementation correctness
- Timing attack resistance (constant-time comparison)
- Entropy sources for random values
- Secrets in code, configs, logs, or error messages
- Token design (expiry, scope, revocation capability)
- "Where are the secrets? How are they born, how do they live, how do they die?"

### Step 4: CHALLENGE

1. **Natasha vs Lisa:** "I can exploit this" vs "The threat model says this risk is acceptable"
2. **Omar vs Natasha:** "The crypto is correct" vs "The crypto is correct but the key is stored in plaintext"
3. **Thomas vs Omar:** "We need to log this for compliance" vs "Logging this creates a PII exposure"
4. **Lisa vs Thomas:** "Defense in depth requires this additional control" vs "That control would violate data minimization"

### Step 5: CONVERGE

```markdown
## Security Audit Panel Report

### Security Verdict: [PASS / CONDITIONAL PASS / FAIL]

### Critical Vulnerabilities (Block Release)
1. [Vulnerability] — CVSS estimate: [score], exploit difficulty: [easy/medium/hard]

### High-Risk Findings (Fix Before Next Release)
1. [Finding] — risk: [description], remediation: [approach]

### Compliance Gaps
1. [Gap] — regulatory impact: [which regulation], remediation: [approach]

### Threat Model Updates
1. [New threat identified] — added to threat model: [boundary/category]

### Secrets Management Findings
1. [Finding] — current state: [description], recommendation: [approach]

### Accepted Risks (With Justification)
1. [Risk] — accepted because: [rationale], review date: [when to reassess]
```

## EVOKORE-Specific Security Checklist

Given EVOKORE-MCP's architecture, always verify:
- [ ] HITL approval tokens cannot be guessed or replayed
- [ ] Proxied tool calls preserve RBAC restrictions
- [ ] WebhookManager redacts sensitive arguments before emission
- [ ] SessionIsolation prevents cross-session data leakage
- [ ] damage-control rules cover the tool being reviewed
- [ ] OAuth tokens are validated on every HTTP request, not just connection
- [ ] Plugin tools cannot bypass SecurityManager permissions
- [ ] Audit log captures security-relevant events with sufficient detail
