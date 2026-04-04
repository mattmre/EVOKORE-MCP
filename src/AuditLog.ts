import fs from "fs";
import path from "path";
import os from "os";

/**
 * Structured audit log entry.
 *
 * Each entry captures a discrete security/operational event with enough
 * context for post-hoc operator review without collecting PII.
 */
export interface AuditEntry {
  /** Unix epoch milliseconds when the event occurred. */
  timestamp: number;

  /**
   * High-level event classification.
   *
   * Categories:
   * - auth_success / auth_failure  -- authentication outcomes
   * - session_create / session_resume / session_expire -- session lifecycle
   * - tool_call      -- tool invocation (selective: admin/approval tools only)
   * - approval_grant / approval_deny  -- HITL approval decisions
   * - config_change  -- runtime configuration mutations
   */
  eventType: string;

  /** Session identifier, when the event is scoped to a session. */
  sessionId?: string;

  /** Actor identity: RBAC role name, OAuth subject, or "system". */
  actor?: string;

  /** The affected resource: tool name, session ID, config key, etc. */
  resource?: string;

  /** Whether the action succeeded, failed, or was denied. */
  outcome: "success" | "failure" | "denied";

  /** Arbitrary key-value metadata. Must not contain secrets or PII. */
  metadata?: Record<string, unknown>;
}

const AUDIT_DIR = path.join(os.homedir(), ".evokore", "audit");
const AUDIT_FILE = path.join(AUDIT_DIR, "audit.jsonl");
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAX_ROTATIONS = 3;

/**
 * AuditLog writes structured JSONL entries for operator observability.
 *
 * Design principles:
 * - Opt-out: enabled by default, disable with `EVOKORE_AUDIT_LOG=false`.
 * - Append-only JSONL format for easy grep / streaming consumption.
 * - Automatic size-based rotation (reuses the log-rotation pattern).
 * - No PII or secrets are ever written.
 * - All write operations are synchronous and fail-safe (never throw).
 * - Importable from both TypeScript (src/) and JavaScript (scripts/).
 */
export class AuditLog {
  private enabled: boolean;
  private maxBytes: number;
  private maxRotations: number;
  private auditDir: string;
  private auditFile: string;

  constructor(options?: {
    enabled?: boolean;
    maxBytes?: number;
    maxRotations?: number;
    auditDir?: string;
    auditFile?: string;
  }) {
    // Opt-out: enabled by default, disable with EVOKORE_AUDIT_LOG=false
    this.enabled = options?.enabled ?? process.env.EVOKORE_AUDIT_LOG !== "false";
    this.maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxRotations = options?.maxRotations ?? DEFAULT_MAX_ROTATIONS;
    this.auditDir = options?.auditDir ?? AUDIT_DIR;
    this.auditFile = options?.auditFile ?? AUDIT_FILE;
  }

  /**
   * Whether audit logging is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Manually set the enabled state (useful for testing).
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Append a structured audit entry.
   * No-ops when disabled. Never throws.
   */
  write(entry: AuditEntry): void {
    if (!this.enabled) return;

    try {
      this.ensureDir();
      this.rotateIfNeeded();

      // Centralize metadata sanitization so all audit writes get the same
      // redaction behavior, including direct write() callers.
      const sanitizedEntry = entry.metadata
        ? { ...entry, metadata: redactForAudit(entry.metadata) }
        : entry;

      const line = JSON.stringify(sanitizedEntry) + "\n";
      fs.appendFileSync(this.auditFile, line, "utf-8");
    } catch {
      // Never throw from the audit write path -- fail-safe
    }
  }

  /**
   * Convenience method: build and write an entry in one call.
   */
  log(
    eventType: string,
    outcome: AuditEntry["outcome"],
    fields?: Partial<Omit<AuditEntry, "timestamp" | "eventType" | "outcome">>
  ): void {
    this.write({
      timestamp: Date.now(),
      eventType,
      outcome,
      ...fields,
    });
  }

  /**
   * Read the most recent audit entries from the JSONL file.
   *
   * @param limit  Maximum number of entries to return (default 100).
   * @param offset Number of most-recent entries to skip (default 0).
   * @returns Parsed entries in reverse-chronological order (newest first).
   */
  getEntries(limit: number = 100, offset: number = 0): AuditEntry[] {
    try {
      const entries = this.readAllEntries();

      // Reverse to newest-first, then apply offset + limit
      entries.reverse();
      return entries.slice(offset, offset + limit);
    } catch {
      return [];
    }
  }

  /**
   * Read audit entries in chronological order (oldest first).
   */
  getEntriesChronological(limit: number = 100, offset: number = 0): AuditEntry[] {
    try {
      const entries = this.readAllEntries();
      return entries.slice(offset, offset + limit);
    } catch {
      return [];
    }
  }

  /**
   * Compute summary counts grouped by eventType.
   */
  getSummary(): Record<string, number> {
    try {
      const entries = this.readAllEntries();
      const counts: Record<string, number> = {};
      for (const entry of entries) {
        if (entry.eventType) {
          counts[entry.eventType] = (counts[entry.eventType] || 0) + 1;
        }
      }
      return counts;
    } catch {
      return {};
    }
  }

  /**
   * Return the total number of entries in the audit log.
   */
  getEntryCount(): number {
    try {
      return this.readAllEntries().length;
    } catch {
      return 0;
    }
  }

  /**
   * Get the path to the audit log file (for diagnostics/testing).
   */
  getAuditFilePath(): string {
    return this.auditFile;
  }

  /**
   * Get the audit directory path (for diagnostics/testing).
   */
  getAuditDir(): string {
    return this.auditDir;
  }

  // ---- Static factory for shared singleton usage ----

  private static instance: AuditLog | null = null;

  /**
   * Get the shared AuditLog singleton.
   * Creates one on first call, honoring `EVOKORE_AUDIT_LOG` env var.
   */
  static getInstance(): AuditLog {
    if (!AuditLog.instance) {
      AuditLog.instance = new AuditLog();
    }
    return AuditLog.instance;
  }

  /**
   * Replace the shared singleton (useful for testing).
   */
  static setInstance(instance: AuditLog): void {
    AuditLog.instance = instance;
  }

  /**
   * Reset the shared singleton (useful for testing).
   */
  static resetInstance(): void {
    AuditLog.instance = null;
  }

  // ---- Private ----

  private ensureDir(): void {
    if (!fs.existsSync(this.auditDir)) {
      fs.mkdirSync(this.auditDir, { recursive: true });
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (!fs.existsSync(this.auditFile)) return;

      const stat = fs.statSync(this.auditFile);
      if (stat.size < this.maxBytes) return;

      // Remove the oldest rotation
      const oldest = `${this.auditFile}.${this.maxRotations}`;
      if (fs.existsSync(oldest)) {
        fs.unlinkSync(oldest);
      }

      // Shift existing rotated files: .2 -> .3, .1 -> .2
      for (let i = this.maxRotations - 1; i >= 1; i--) {
        const older = `${this.auditFile}.${i}`;
        const newer = `${this.auditFile}.${i + 1}`;
        if (fs.existsSync(older)) {
          fs.renameSync(older, newer);
        }
      }

      // Rotate current file to .1
      fs.renameSync(this.auditFile, `${this.auditFile}.1`);
    } catch {
      // Never throw from rotation -- fail-safe
    }
  }

  private readAllEntries(): AuditEntry[] {
    if (!fs.existsSync(this.auditFile)) return [];

    const raw = fs.readFileSync(this.auditFile, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const entries: AuditEntry[] = [];

    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }

    return entries;
  }
}

/**
 * Keys that should never appear in audit metadata.
 * Used by `redactForAudit()` to strip secrets before logging.
 */
const SENSITIVE_KEYS = new Set([
  "token",
  "secret",
  "password",
  "api_key",
  "apiKey",
  "authorization",
  "credential",
  "private_key",
  "privateKey",
  "access_token",
  "accessToken",
]);

/**
 * Redact sensitive keys from a metadata object before audit logging.
 * Recursively traverses nested objects and arrays up to a depth limit of 5.
 * Returns a copy with sensitive values replaced by "[REDACTED]".
 */
export function redactForAudit(
  obj: Record<string, unknown> | undefined,
  depth = 0
): Record<string, unknown> | undefined {
  if (!obj || depth > 5) return obj;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? redactForAudit(item as Record<string, unknown>, depth + 1)
          : item
      );
    } else if (value !== null && typeof value === 'object') {
      result[key] = redactForAudit(value as Record<string, unknown>, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result;
}
