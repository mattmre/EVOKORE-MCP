/**
 * SessionManifest schema definitions.
 *
 * This module defines the append-only JSONL event schema that all Claude Code
 * hook scripts write to `~/.evokore/sessions/{sessionId}.jsonl`. See
 * `docs/adr/0001-session-manifest-jsonl.md` for the architectural decision.
 *
 * Schema is versioned: every appended event line carries `schemaVersion: 1`.
 * Increment `SCHEMA_VERSION` only when making a breaking change to the event
 * shape, and keep a migration path for existing manifests.
 */

export const SCHEMA_VERSION = 1 as const;

export type SessionEventType =
  | 'session_initialized'
  | 'purpose_recorded'
  | 'purpose_reminder'
  | 'tool_invoked'
  | 'evidence_captured'
  | 'task_action'
  | 'stop_check';

export interface SessionEvent<P = Record<string, unknown>> {
  schemaVersion: 1;
  ts: string; // ISO 8601
  sessionId: string;
  type: SessionEventType;
  payload: P;
}

// Per-event payload interfaces.

export interface SessionInitializedPayload {
  workspaceRoot: string;
  canonicalRepoRoot?: string;
  repoName?: string;
}

export interface PurposeRecordedPayload {
  purpose: string;
  mode?: string;
  modeSetAt?: string;
  purposeSetAt?: string;
}

export interface PurposeReminderPayload {
  lastPromptAt: string;
}

export interface ToolInvokedPayload {
  tool: string;
  summary: string;
  outcome: 'ok' | 'error';
  output?: string;
}

export interface EvidenceCapturedPayload {
  evidence_id: string;
  evidence_type: 'test-result' | 'git-operation' | 'file-change' | 'edit-trace';
  tool: string;
  summary: string;
  exit_code?: number;
  passed?: boolean;
}

export interface TaskActionPayload {
  action: 'add' | 'toggle' | 'done' | 'list' | 'clear';
  taskIndex?: number;
  taskText?: string;
}

export interface StopCheckPayload {
  result: 'blocked' | 'clear';
  incompleteCount?: number;
}

/**
 * Folded manifest state, reconstructed by left-folding all events in a
 * session's JSONL file. The shape mirrors `buildBaseState()` in
 * `scripts/session-continuity.js` so existing readers stay compatible.
 */
export interface SessionManifestState {
  continuityVersion: number;
  sessionId: string;
  workspaceRoot?: string;
  canonicalRepoRoot?: string;
  repoName?: string;
  purpose?: string | null;
  created?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  set_at?: string;
  purposeSetAt?: string;
  lastPromptAt?: string;
  lastActivityAt?: string;
  lastReplayAt?: string;
  lastEvidenceAt?: string;
  lastToolName?: string;
  lastEvidenceId?: string;
  lastEvidenceType?: string;
  lastTaskAction?: string;
  lastStopCheckAt?: string;
  lastStopCheckResult?: string;
  artifacts?: Record<string, string>;
  metrics?: {
    replayEntries?: number;
    evidenceEntries?: number;
    totalTasks?: number;
    incompleteTasks?: number;
  };
  [key: string]: unknown;
}
