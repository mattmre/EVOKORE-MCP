---
name: coding-reference
description: Quick-reference coding standards and backend patterns for consistent development
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  tags: ["standards", "patterns", "backend", "coding-style", "reference"]
---

# Coding Reference

Quick-reference guide for coding standards and backend patterns. Use this as a checklist and reference during development and code review.

---

## Part 1: Coding Standards

### File Organization

#### Directory Structure Principles
- Group by feature/domain, not by type
- Keep related files close together
- Limit directory depth (prefer flat over deep)
- Use consistent naming for common directories

#### File Naming
- Use lowercase with separators (kebab-case or snake_case)
- Be descriptive but concise
- Include type suffix when helpful (e.g., `.test.ts`, `.config.ts`)
- Avoid special characters except `-` and `_`

#### File Size
- Prefer smaller, focused files
- Split when file exceeds ~300-500 lines
- Extract reusable components into shared modules

### Naming Conventions

#### General Principles
- Names should reveal intent
- Avoid abbreviations (except well-known ones like `id`, `url`, `config`)
- Be consistent within the project
- Avoid encodings (Hungarian notation, etc.)

#### TypeScript/JavaScript Patterns

| Element | Pattern | Examples |
|---------|---------|----------|
| Variables | camelCase descriptive nouns | `userCount`, `isEnabled` |
| Functions | camelCase verb + noun | `getUserById`, `validateInput` |
| Classes | PascalCase noun phrases | `ProxyManager`, `ToolRegistry` |
| Interfaces | PascalCase (no `I` prefix) | `ServerConfig`, `ToolDefinition` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| Booleans | is/has/can prefix | `isValid`, `hasPermission`, `canEdit` |
| Enums | PascalCase | `ConnectionState`, `LogLevel` |

### Error Handling

#### Principles
- Fail fast and explicitly
- Provide actionable error messages
- Log errors with context
- Never swallow exceptions silently

#### Error Message Format
```
What happened: <description>
Why it happened: <cause if known>
What to do: <suggested action>
```

#### Exception Handling
- Catch specific exceptions, not generic `Error`
- Re-throw with context when wrapping
- Use custom error classes for domain errors
- Log at appropriate level (error vs. warn)

### Documentation

#### Code Comments
- Explain "why", not "what"
- Document non-obvious decisions
- Keep comments current with code
- Use JSDoc for public APIs

#### Function Documentation
```typescript
/**
 * Resolves environment variable references in a config object.
 *
 * @param config - The raw config with `${VAR}` placeholders
 * @param env - The environment variables to resolve from
 * @returns Config with all placeholders replaced
 * @throws {ConfigError} If a required variable is missing
 */
```

### Code Review Checklist

#### Readability
- [ ] Code is self-explanatory
- [ ] Names are clear and consistent
- [ ] Functions are focused (single responsibility)
- [ ] Complexity is manageable

#### Correctness
- [ ] Logic is sound
- [ ] Edge cases are handled
- [ ] Error paths are covered
- [ ] Tests verify behavior

#### Maintainability
- [ ] No code duplication
- [ ] Dependencies are reasonable
- [ ] Changes are isolated
- [ ] Future extension is possible

#### Performance
- [ ] No obvious inefficiencies
- [ ] Resource cleanup is proper (streams, connections)
- [ ] Loops and recursion are bounded

### Language-Neutral Best Practices

#### Control Flow
- Prefer early returns over deep nesting
- Use guard clauses
- Keep conditionals simple
- Avoid negative conditionals when possible

#### Functions
- Keep functions short (< 20 lines ideal)
- Limit parameters (< 4 ideal, use options object otherwise)
- Return early, return often
- Avoid side effects where possible

#### Data
- Prefer immutability when practical (`const`, `readonly`)
- Initialize close to use
- Validate at boundaries (API inputs, config loading)
- Transform early, use typed data internally

---

## Part 2: Backend Patterns

### API Design Patterns

#### JSON-RPC Conventions (MCP Context)

EVOKORE-MCP uses JSON-RPC 2.0 over stdio. Key patterns:

| Method | Purpose |
|--------|---------|
| `tools/list` | Enumerate available tools |
| `tools/call` | Execute a tool by name |
| `resources/list` | Enumerate available resources |
| `resources/read` | Read a resource by URI |

#### REST Conventions (General Reference)

| Method | Purpose | Response Codes |
|--------|---------|----------------|
| GET | Retrieve resource(s) | 200, 404 |
| POST | Create resource | 201, 400, 409 |
| PUT | Replace resource | 200, 201, 404 |
| PATCH | Partial update | 200, 404 |
| DELETE | Remove resource | 204, 404 |

#### Response Format

##### Success
```json
{
  "data": { },
  "meta": {
    "timestamp": "ISO-8601",
    "requestId": "uuid"
  }
}
```

##### Error
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": []
  }
}
```

### Data Access Patterns

#### Repository Pattern
- Encapsulate data access logic behind a clean interface
- Provide collection-like interface for CRUD operations
- Enable testability with mock implementations
- Keep domain logic separate from persistence

#### Repository Interface
```typescript
interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(criteria?: QueryCriteria): Promise<T[]>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}
```

#### Query Patterns
- Use parameterized queries (never string concatenation)
- Limit result sets with pagination
- Use indexes for frequently queried fields
- Log slow queries for optimization

### Caching Strategies

| Pattern | Use Case | Trade-offs |
|---------|----------|------------|
| Cache-aside | Read-heavy, tolerate stale | Complexity, potential inconsistency |
| Write-through | Consistency critical | Higher latency on writes |
| Write-behind | High write volume | Potential data loss |
| Refresh-ahead | Predictable access | Wasted refreshes |

#### Cache Key Design
```
<namespace>:<entity>:<id>:<version?>
example: tools:definition:github_create_issue
```

#### Cache Invalidation
- Set appropriate TTLs
- Invalidate on write operations
- Use versioning for complex invalidation
- Monitor hit/miss ratios

### Authentication Patterns

#### Token-Based Authentication
1. **Access tokens**: Short-lived, carries claims
2. **Refresh tokens**: Long-lived, secure storage
3. **Token rotation**: Issue new refresh token on use

#### MCP-Specific: HITL Approval
- `_evokore_approval_token` injected into tool arguments
- Server returns error prompting AI to request user approval
- Token validates that the human authorized the action

### Error Handling (Backend)

| Category | HTTP Code | Retry? |
|----------|-----------|--------|
| Client error | 4xx | No |
| Server error | 5xx | Maybe |
| Rate limit | 429 | Yes, with backoff |
| Unavailable | 503 | Yes, with backoff |

### Logging Patterns

#### Log Levels

| Level | Use For |
|-------|---------|
| ERROR | Failures requiring attention |
| WARN | Unexpected but handled situations |
| INFO | Significant business events |
| DEBUG | Development troubleshooting |

#### Structured Log Format
```json
{
  "timestamp": "ISO-8601",
  "level": "INFO",
  "message": "Child server connected",
  "context": {
    "serverName": "github",
    "toolCount": 15,
    "requestId": "abc-123"
  }
}
```

---

## Evidence Capture

Use these templates when documenting compliance with standards.

### Coding Standards Review
```markdown
## Coding Standards Review
### Scope
- Files reviewed: `<file-list>`
- Standards applied: TypeScript / project conventions
### Findings
- [ ] <file>: <issue> - <recommendation>
### Metrics
- Naming consistency: X%
- Documentation coverage: Y%
```

### Backend Patterns Review
```markdown
## Backend Patterns Review
### Patterns Applied
- API Design: JSON-RPC conventions followed
- Data Access: Repository pattern implemented
- Caching: Cache-aside with TTL
### Compliance
- [ ] Endpoints follow conventions
- [ ] Error responses are consistent
- [ ] Data access is encapsulated
- [ ] Caching strategy is documented
```
