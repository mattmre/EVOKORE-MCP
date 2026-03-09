---
name: orch-docs
description: Synchronize documentation with code changes
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  original_command: "/docs"
  tags: ["orchestration", "command", "documentation", "sync", "links"]
---

# Orchestration Docs

## Purpose

Synchronize documentation with code changes. Identifies outdated docs, updates content, and verifies cross-references.

## Invocation

```
orch-docs [scope]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| scope | No | Limit to specific directory or topic |
| source-changes | No | Specific commits or files to analyze |

## Workflow

### 1. Identify Affected Docs

- Scan recent code changes
- Map changes to documentation files
- Flag outdated or missing docs

### 2. Update Content

- Sync documentation with code reality
- Update examples and code snippets
- Ensure consistency across files

### 3. Verify Links

- Check internal cross-references
- Validate external links (if applicable)
- Fix broken references

### 4. Capture Evidence

- Document which files updated
- Note link verification results
- Update task tracking

## Documentation Types

| Type | Location Pattern | Update Triggers |
|------|-----------------|-----------------|
| API docs | docs/api/*.md | Endpoint changes |
| User guides | docs/*.md | Feature changes |
| README | README.md | Project structure changes |
| Handoff docs | handoff/*.md | Task/status changes |
| Code comments | In source files | Logic changes |

## Update Checklist

- [ ] Code examples match current implementation
- [ ] API signatures are accurate
- [ ] Configuration options are current
- [ ] Links resolve correctly
- [ ] Version numbers are updated
- [ ] Deprecated items are marked

## Cross-Reference Verification

Check these reference types:
- Internal markdown links: `[text](./path.md)`
- Anchor links: `[text](#section)`
- File references in code blocks
- Import paths in examples

## Outputs

| Output | Description |
|--------|-------------|
| Updated docs | Modified documentation files |
| Link report | Verification of cross-references |
| Task update | Documentation sync logged |

## Evidence Capture

```markdown
## Documentation Sync Evidence

### Files Updated
- `<file1.md>`: Updated API examples
- `<file2.md>`: Fixed broken links

### Links Verified
- Internal links: X checked, Y fixed
- External links: Skipped/Verified

### Alignment Check
- Code matches docs: Yes/No
- Examples tested: Yes/No
```

## Example Usage

```
orch-docs api
```

Flow:
1. Identify API-related documentation
2. Compare with current endpoint implementations
3. Update outdated method signatures
4. Verify all API doc links work
5. Capture evidence of changes
