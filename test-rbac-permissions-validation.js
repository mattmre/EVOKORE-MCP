const assert = require("assert");
const fs = require("fs");
const path = require("path");

const securityTsPath = path.resolve(__dirname, "src", "SecurityManager.ts");
const securityJsPath = path.resolve(__dirname, "dist", "SecurityManager.js");
const permissionsPath = path.resolve(__dirname, "permissions.yml");

// ---- Source-level structural validation ----

test("RBAC: SecurityManager.ts has RoleDefinition interface", () => {
  const src = fs.readFileSync(securityTsPath, "utf8");
  assert.match(src, /interface RoleDefinition/, "RoleDefinition interface must exist");
  assert.match(src, /default_permission/, "default_permission field must exist");
  assert.match(src, /overrides\??:/, "overrides field must exist");
});

test("RBAC: SecurityManager.ts loads roles from config", () => {
  const src = fs.readFileSync(securityTsPath, "utf8");
  assert.match(src, /EVOKORE_ROLE/, "Must read EVOKORE_ROLE env var");
  assert.match(src, /activeRole/, "Must have activeRole property");
  assert.match(src, /this\.roles\.set/, "Must populate roles map from config");
});

test("RBAC: SecurityManager.ts has role-based permission check logic", () => {
  const src = fs.readFileSync(securityTsPath, "utf8");
  assert.match(src, /this\.activeRole/, "checkPermission must reference activeRole");
  assert.match(src, /this\.roles\.has/, "checkPermission must check if role exists");
  assert.match(src, /this\.roles\.get/, "checkPermission must retrieve role definition");
  assert.match(src, /roleDef\.overrides/, "checkPermission must check role overrides");
  assert.match(src, /roleDef\.default_permission/, "checkPermission must fall back to role default");
});

test("RBAC: SecurityManager.ts has role management methods", () => {
  const src = fs.readFileSync(securityTsPath, "utf8");
  assert.match(src, /getActiveRole\(\)/, "getActiveRole method must exist");
  assert.match(src, /setActiveRole\(/, "setActiveRole method must exist");
  assert.match(src, /listRoles\(\)/, "listRoles method must exist");
});

test("RBAC: permissions.yml has roles section with admin, developer, readonly", () => {
  const perms = fs.readFileSync(permissionsPath, "utf8");
  assert.match(perms, /^roles:/m, "roles: top-level key must exist");
  assert.match(perms, /^\s+admin:/m, "admin role must be defined");
  assert.match(perms, /^\s+developer:/m, "developer role must be defined");
  assert.match(perms, /^\s+readonly:/m, "readonly role must be defined");
  assert.match(perms, /default_permission:\s*allow/, "admin role should default to allow");
  assert.match(perms, /default_permission:\s*require_approval/, "developer role should default to require_approval");
  assert.match(perms, /default_permission:\s*deny/, "readonly role should default to deny");
});

test("RBAC: permissions.yml still has flat rules section", () => {
  const perms = fs.readFileSync(permissionsPath, "utf8");
  assert.match(perms, /^rules:/m, "rules: section must still exist");
  assert.match(perms, /fs_read_file:\s*"allow"/, "Flat fs_read_file rule must be preserved");
  assert.match(perms, /fs_write_file:\s*"require_approval"/, "Flat fs_write_file rule must be preserved");
  assert.match(perms, /supabase_create_project:\s*"deny"/, "Flat supabase_create_project rule must be preserved");
});

// ---- Compiled module behavioral tests ----

test("RBAC: no active role preserves flat behavior (default allow)", () => {
  const { SecurityManager } = require(securityJsPath);
  const sm = new SecurityManager();
  // Manually set rules without loading file
  sm.rules = { fs_read_file: "allow", fs_write_file: "require_approval", supabase_create_project: "deny" };

  assert.strictEqual(sm.getActiveRole(), null, "No role should be active by default");
  assert.strictEqual(sm.checkPermission("fs_read_file"), "allow");
  assert.strictEqual(sm.checkPermission("fs_write_file"), "require_approval");
  assert.strictEqual(sm.checkPermission("supabase_create_project"), "deny");
  assert.strictEqual(sm.checkPermission("unknown_tool"), "allow", "Unknown tools default to allow with no role");
});

test("RBAC: admin role defaults everything to allow", () => {
  const { SecurityManager } = require(securityJsPath);
  const sm = new SecurityManager();
  sm.rules = {};
  sm.roles = new Map([
    ["admin", { description: "Full access", default_permission: "allow" }]
  ]);
  sm.setActiveRole("admin");

  assert.strictEqual(sm.getActiveRole(), "admin");
  assert.strictEqual(sm.checkPermission("any_tool"), "allow");
  assert.strictEqual(sm.checkPermission("another_tool"), "allow");
});

test("RBAC: developer role uses overrides then flat rules then default", () => {
  const { SecurityManager } = require(securityJsPath);
  const sm = new SecurityManager();
  sm.rules = { github_push_files: "require_approval" };
  sm.roles = new Map([
    ["developer", {
      description: "Dev access",
      default_permission: "require_approval",
      overrides: {
        fs_read_file: "allow",
        supabase_delete_branch: "deny"
      }
    }]
  ]);
  sm.setActiveRole("developer");

  // Role override: allow
  assert.strictEqual(sm.checkPermission("fs_read_file"), "allow", "Role override should take priority");
  // Role override: deny
  assert.strictEqual(sm.checkPermission("supabase_delete_branch"), "deny", "Role override deny should apply");
  // Flat rule (not in overrides): require_approval
  assert.strictEqual(sm.checkPermission("github_push_files"), "require_approval", "Flat rule should apply when no role override");
  // No override, no flat rule: falls back to role default
  assert.strictEqual(sm.checkPermission("unknown_tool"), "require_approval", "Should fall back to role default_permission");
});

test("RBAC: readonly role denies by default with specific allows", () => {
  const { SecurityManager } = require(securityJsPath);
  const sm = new SecurityManager();
  sm.rules = {};
  sm.roles = new Map([
    ["readonly", {
      description: "Read-only",
      default_permission: "deny",
      overrides: {
        fs_read_file: "allow",
        github_search_repositories: "allow"
      }
    }]
  ]);
  sm.setActiveRole("readonly");

  assert.strictEqual(sm.checkPermission("fs_read_file"), "allow", "Override allow in readonly");
  assert.strictEqual(sm.checkPermission("github_search_repositories"), "allow", "Override allow in readonly");
  assert.strictEqual(sm.checkPermission("fs_write_file"), "deny", "Not overridden = deny");
  assert.strictEqual(sm.checkPermission("random_tool"), "deny", "Default deny for readonly");
});

test("RBAC: setActiveRole validates role existence", () => {
  const { SecurityManager } = require(securityJsPath);
  const sm = new SecurityManager();
  sm.roles = new Map([
    ["admin", { description: "Full access", default_permission: "allow" }]
  ]);

  assert.strictEqual(sm.setActiveRole("admin"), true, "Setting a known role should succeed");
  assert.strictEqual(sm.getActiveRole(), "admin");

  assert.strictEqual(sm.setActiveRole("nonexistent"), false, "Setting an unknown role should fail");
  assert.strictEqual(sm.getActiveRole(), "admin", "Role should remain unchanged after failed set");

  assert.strictEqual(sm.setActiveRole(null), true, "Setting null should succeed");
  assert.strictEqual(sm.getActiveRole(), null, "Role should be null after deactivation");
});

test("RBAC: listRoles returns all roles with active status", () => {
  const { SecurityManager } = require(securityJsPath);
  const sm = new SecurityManager();
  sm.roles = new Map([
    ["admin", { description: "Full access", default_permission: "allow" }],
    ["developer", { description: "Dev access", default_permission: "require_approval" }],
    ["readonly", { description: "Read-only", default_permission: "deny" }]
  ]);

  // No active role
  let roles = sm.listRoles();
  assert.strictEqual(roles.length, 3, "Should list all 3 roles");
  assert(roles.every((r) => !r.isActive), "No role should be active");

  // Activate developer
  sm.setActiveRole("developer");
  roles = sm.listRoles();
  const dev = roles.find((r) => r.name === "developer");
  assert(dev, "Developer role must be in list");
  assert.strictEqual(dev.isActive, true, "Developer should be marked active");
  assert.strictEqual(dev.description, "Dev access");

  const admin = roles.find((r) => r.name === "admin");
  assert(admin, "Admin role must be in list");
  assert.strictEqual(admin.isActive, false, "Admin should not be active");
});

test("RBAC: role overrides take priority over flat rules for same tool", () => {
  const { SecurityManager } = require(securityJsPath);
  const sm = new SecurityManager();
  // Flat rule says require_approval
  sm.rules = { fs_read_file: "require_approval" };
  // Role override says allow
  sm.roles = new Map([
    ["dev", {
      description: "Dev",
      default_permission: "deny",
      overrides: { fs_read_file: "allow" }
    }]
  ]);
  sm.setActiveRole("dev");

  // Role override should win over flat rule
  assert.strictEqual(sm.checkPermission("fs_read_file"), "allow",
    "Role override must take priority over flat rule");
});
