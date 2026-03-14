# RBAC (Role-Based Access Control) Guide

EVOKORE-MCP v3.0 provides role-based access control for proxied MCP tools. This guide covers how to configure, activate, and troubleshoot RBAC.

## Overview

RBAC adds a layer of permission control on top of EVOKORE's existing flat per-tool rules. When a role is active, it defines a **default permission level** for all tools plus **per-tool overrides**. When no role is active, the original flat `rules:` section in `permissions.yml` is used directly.

## Available Roles

Three built-in roles are defined in `permissions.yml`:

| Role | Default Permission | Description |
|------|-------------------|-------------|
| `admin` | `allow` | Full access to all tools. No restrictions. |
| `developer` | `require_approval` | Standard development access. Read operations are allowed; write/destructive operations require human approval or are denied. |
| `readonly` | `deny` | Read-only access. Only explicitly listed read tools are allowed; everything else is blocked. |

## Permission Levels

Each tool can have one of three permission levels:

- **`allow`** -- The AI can execute this tool without confirmation.
- **`require_approval`** -- The AI must pause and ask the user for explicit permission (HITL flow). A token is generated and must be approved before the tool executes.
- **`deny`** -- The tool is completely blocked. The AI receives an error message.

## How to Activate a Role

### Option 1: Environment Variable (recommended)

Set the `EVOKORE_ROLE` environment variable before starting the MCP server:

```bash
# In your .env file
EVOKORE_ROLE=developer

# Or inline when starting
EVOKORE_ROLE=readonly node dist/index.js
```

### Option 2: Config File

Uncomment and set the `active_role` key in `permissions.yml`:

```yaml
active_role: developer
```

The environment variable takes precedence over the config file value.

### Option 3: Runtime API

The `SecurityManager` class exposes `setActiveRole()` for runtime switching:

```typescript
security.setActiveRole('admin');    // Switch to admin
security.setActiveRole(null);       // Deactivate RBAC, revert to flat rules
security.listRoles();               // List all defined roles
```

## Permission Resolution Order

When a role is active, permissions are resolved in this order:

1. **Role-specific overrides** for the exact tool name
2. **Flat per-tool rules** from the `rules:` section (act as additional overrides)
3. **Role default_permission** (fallback)

This means flat rules in the `rules:` section still apply even when a role is active, providing a way to enforce organization-wide policies regardless of role.

## Configuration Examples

### Default permissions.yml

```yaml
roles:
  admin:
    description: Full access to all tools
    default_permission: allow

  developer:
    description: Standard development access
    default_permission: require_approval
    overrides:
      github_list_commits: allow
      github_search_repositories: allow
      fs_read_file: allow
      fs_list_directory: allow
      supabase_list_projects: allow
      supabase_list_tables: allow
      supabase_create_project: deny
      supabase_delete_branch: deny

  readonly:
    description: Read-only access
    default_permission: deny
    overrides:
      github_search_repositories: allow
      github_list_commits: allow
      fs_read_file: allow
      fs_list_directory: allow
      supabase_list_projects: allow
      supabase_get_project: allow
      supabase_list_tables: allow
      supabase_search_docs: allow

rules:
  fs_read_file: "allow"
  fs_write_file: "require_approval"
  github_search_repositories: "allow"
  github_push_files: "require_approval"
  supabase_create_project: "deny"
```

### Custom Role Example

Add a new role for a CI/CD pipeline that can read and deploy but not modify infrastructure:

```yaml
roles:
  cicd:
    description: CI/CD pipeline access
    default_permission: deny
    overrides:
      github_list_commits: allow
      github_search_repositories: allow
      github_create_pull_request: allow
      supabase_list_projects: allow
      supabase_deploy_edge_function: allow
      supabase_list_migrations: allow
```

## How to Test

### 1. Check active role

Start the server and look for the startup log:

```
[EVOKORE] Active role: developer
```

### 2. Test permission checks

Call a tool that should be denied:

```
Tool 'supabase_create_project' -> "Execution of 'supabase_create_project' is strictly denied by EVOKORE-MCP security policies."
```

Call a tool that requires approval:

```
Tool 'fs_write_file' -> "[EVOKORE-MCP SECURITY INTERCEPTOR] ACTION REQUIRES HUMAN APPROVAL..."
```

### 3. Run the RBAC validation test

```bash
npx vitest run test-rbac-permissions-validation
```

### 4. Verify role listing

The `list_roles` native tool (if available) or `SecurityManager.listRoles()` returns:

```json
[
  { "name": "admin", "description": "Full access to all tools", "isActive": false },
  { "name": "developer", "description": "Standard development access", "isActive": true },
  { "name": "readonly", "description": "Read-only access", "isActive": false }
]
```

## Troubleshooting

### Role not activating

- Check that `EVOKORE_ROLE` is set in your `.env` file or environment.
- Verify the role name matches exactly (case-sensitive) with a role defined in `permissions.yml`.
- Look for the startup warning: `"Warning: active role 'X' not found in role definitions. Falling back to flat permissions."`

### Tool unexpectedly allowed or denied

- Remember the resolution order: role overrides > flat rules > role default.
- A flat rule in the `rules:` section can override the role default even if the role doesn't have a specific override for that tool.
- Use `checkPermission(toolName)` to debug the resolved permission for a specific tool.

### permissions.yml not loading

- The file must be at the project root as `permissions.yml`.
- YAML syntax errors will cause the entire file to fail to load (all tools default to `allow`).
- Check stderr for: `"No permissions.yml found or error parsing it."`

### Switching roles at runtime

- `setActiveRole()` returns `false` if the role name is not found in the loaded definitions.
- Setting the role to `null` deactivates RBAC and reverts to flat rules.
- Role changes take effect immediately for the next `checkPermission()` call.
