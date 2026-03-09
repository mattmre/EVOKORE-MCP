# Skill Promotion Criteria

Use these criteria to decide whether a workflow or skill should move from experimental/draft status into the canonical `SKILLS/` directory as a stable, versioned skill.

## Promote if

- It is broadly reusable across projects and sessions (not specific to a single task).
- It documents a standard quality gate (tests, lint, security checks, review).
- It does not hardcode repository-specific paths, secrets, or configurations.
- It matches the model-agnostic orchestration intent (works with any LLM client).
- It includes acceptance checks and verification evidence.
- It includes a brief security posture note (risk triggers, approvals needed).
- It has been used successfully in at least two distinct sessions or workflows.

## Keep as experimental if

- It solves a one-off or narrow problem.
- It assumes a particular repo layout, SDK, or runtime that limits portability.
- It encodes organization-specific ownership or paths (e.g., CODEOWNERS).
- It has not been validated beyond its initial creation context.

## How to promote

1. Compare with existing canonical skills in `SKILLS/` to avoid duplication.
2. Normalize names and paths for generic use.
3. Add proper YAML frontmatter (`name`, `description`, `category`, `metadata`).
4. Capture rationale, acceptance checks, and evidence references.
5. Place in the appropriate `SKILLS/<CATEGORY>/` directory.
6. Update any relevant index or README documents.

## Promotion Decision Log (Template)

```markdown
- Date:
- Candidate skill:
- Current location:
- Decision: Promote / Keep as experimental
- Rationale:
- Acceptance checks:
  - [ ] Used in 2+ sessions
  - [ ] No hardcoded paths or secrets
  - [ ] Frontmatter complete
  - [ ] Documentation adequate
- Evidence:
- Security notes:
```
