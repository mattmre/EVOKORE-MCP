---
name: security-review
description: Comprehensive security review checklist covering input validation, authentication, secrets management, and vulnerability patterns
category: General Coding Workflows
metadata:
  version: "1.0"
  source: "Agent33"
  tags: ["security", "review", "OWASP", "vulnerability", "authentication"]
---

# Security Review

Comprehensive security review checklist for code changes. Use this skill when reviewing PRs, auditing existing code, or verifying security posture before deployment.

## When to Use

- Reviewing code changes that touch authentication, authorization, or secrets
- Auditing input validation and data handling
- Pre-merge security checks on PRs
- Periodic security sweeps of the codebase

## Skill Signature

```
invoke: security-review
inputs: target-path, review-depth (full | focused)
outputs: security-report, findings, evidence
```

---

## Security Checklist

### Input Validation

- [ ] All user inputs are validated before use
- [ ] Input length limits are enforced
- [ ] Input type validation is strict
- [ ] Allowlists preferred over blocklists
- [ ] Dangerous characters are sanitized or rejected

### Authentication

- [ ] Authentication is required for protected resources
- [ ] Password policies are enforced
- [ ] Multi-factor authentication is available (if applicable)
- [ ] Session management is secure
- [ ] Token expiration is implemented

### Authorization

- [ ] Principle of least privilege is applied
- [ ] Role-based access control is consistent
- [ ] Resource ownership is verified
- [ ] Privilege escalation is prevented
- [ ] Cross-tenant access is blocked

### Secrets Management

- [ ] No hardcoded secrets in code
- [ ] Secrets loaded from secure storage
- [ ] Secrets are not logged
- [ ] Secrets are not exposed in error messages
- [ ] Rotation procedures exist

### Data Protection

- [ ] Sensitive data is encrypted at rest
- [ ] Sensitive data is encrypted in transit
- [ ] PII handling follows policy
- [ ] Data retention limits are enforced
- [ ] Secure deletion is implemented

---

## Common Vulnerability Patterns

### Injection Attacks

| Type | Risk | Mitigation |
|------|------|------------|
| SQL Injection | High | Parameterized queries |
| Command Injection | High | Input sanitization, avoid shell |
| LDAP Injection | High | Escape special characters |
| XPath Injection | Medium | Parameterized XPath |

### Cross-Site Scripting (XSS)

| Type | Risk | Mitigation |
|------|------|------------|
| Stored XSS | High | Output encoding, CSP |
| Reflected XSS | High | Input validation, output encoding |
| DOM-based XSS | Medium | Avoid innerHTML, use safe APIs |

### Cross-Site Request Forgery (CSRF)

- Verify anti-CSRF tokens on state-changing requests
- Check origin/referer headers
- Use SameSite cookie attribute

### Insecure Direct Object References

- Verify user authorization for requested resources
- Use indirect references where possible
- Log access attempts

---

## Input Validation Patterns

### String Validation
```
- Maximum length enforced
- Character allowlist applied
- Encoding validated (UTF-8)
- Null bytes rejected
```

### Numeric Validation
```
- Range limits enforced
- Type coercion is explicit
- Overflow checked
```

### File Upload Validation
```
- File type verified (magic bytes, not just extension)
- File size limited
- Filename sanitized
- Storage location is secure
```

---

## Agentic-Specific Security Concerns

These additional checks apply to AI/agent systems such as MCP servers and orchestrated workflows.

### Prompt Injection

- [ ] Untrusted user input is sanitized before inclusion in prompts
- [ ] External content (web scrapes, file reads) is not passed raw to LLMs
- [ ] User content is not directly passed to tool invocations
- [ ] System prompts and agent behavior are not modifiable by user input

### Sandbox and Permissions

- [ ] First use of a new tool requires approval (AG-01)
- [ ] Autonomy budget limits are enforced (AG-02)
- [ ] External network access is gated (AG-03)
- [ ] File writes are restricted to designated workspace (AG-04)
- [ ] Elevated permissions require explicit approval (AG-05)

### Secrets in Agentic Contexts

- [ ] S3+ classified secrets are access-controlled
- [ ] Secrets are never exposed in logs or agent outputs
- [ ] Secrets storage and vault configuration changes are reviewed
- [ ] Token and credential rotation procedures are documented

### Supply Chain

- [ ] New dependencies are reviewed for known vulnerabilities
- [ ] Lockfiles are committed and verified
- [ ] Build scripts are audited for injection vectors

---

## Evidence Capture

After completing a security review, document findings using this template:

```markdown
## Security Review Evidence

### Scope
- Target: `<path>`
- Depth: <full/focused>
- Date: <datetime>

### Checklist Results
- Input Validation: X/Y passed
- Authentication: X/Y passed
- Authorization: X/Y passed
- Secrets Management: X/Y passed
- Data Protection: X/Y passed

### Findings
- [ ] <finding-1>: <severity> - <description>
- [ ] <finding-2>: <severity> - <description>

### Recommendations
1. <recommendation>
2. <recommendation>
```

---

## Severity Levels

| Level | Description | Response |
|-------|-------------|----------|
| Critical | Exploitable now, high impact | Block deployment |
| High | Significant risk | Fix before merge |
| Medium | Moderate risk | Fix soon |
| Low | Minor risk | Track for later |
| Info | Best practice suggestion | Optional |

---

## Integration with Workflow

1. **Pre-implementation**: Review design for security concerns
2. **During implementation**: Apply secure coding patterns
3. **Pre-merge**: Run security checklist against the PR diff
4. **Post-deployment**: Monitor for security events

## Cross-References

- Risk triggers: `SKILLS/GENERAL CODING WORKFLOWS/pr-manager/SKILL.md` (Risk-Based Review Routing)
- Session evidence: `SKILLS/GENERAL CODING WORKFLOWS/session-wrap/SKILL.md` (Evidence-First Handoff Protocol)
- Damage control hook: `scripts/damage-control.js` + `damage-control-rules.yaml`
