# ADR 0001: Session Manifest Append-Only JSONL

**Status:** Accepted  
**Date:** 2026-04-14  
**Deciders:** 4-round successive expert panel (RuFlo assimilation R4 synthesis)  
**Supersedes:** Implicit "single-writer TypeScript class" assumption in pre-v3.1 design

---

## Context

EVOKORE-MCP runs seven Claude Code hook scripts (`damage-control.js`, `purpose-gate.js`,
`session-replay.js`, `tilldone.js`, `evidence-capture.js`, `after-edit.js`,
`subagent-tracker.js`) as separate Node.js processes, one per hook event. The session
manifest at `~/.evokore/sessions/{sessionId}.json` is the shared continuity anchor read
and written by all of them.

The prior implicit design assumed a single in-process TypeScript class (`SessionManifest`)
could serialize access to this file. That assumption is false: seven separate OS processes
cannot share a single in-memory writer. Each hook reads the full JSON, parses it, mutates
in memory, and writes the whole file back — a read-modify-write cycle that races under any
concurrent hook execution.

Observed failure modes:
- Two hooks fire within the same Claude Code event (e.g., PostToolUse triggers both
  `session-replay.js` and `after-edit.js`). Both read the current JSON, both compute a
  new state, both write — one write silently clobbers the other.
- On Windows, `fs.writeFileSync` to an open file can throw `EBUSY`, corrupting the
  manifest partially.
- A crash mid-write leaves a partial JSON file that makes the next hook fail to parse.

---

## Decision

Replace the single-file `{sessionId}.json` read-modify-write pattern with **append-only
JSONL** (`{sessionId}.jsonl`). Each hook call appends one JSON line; a fold function
reconstructs current state on read.

### Implementation

**`src/SessionManifest.ts`**

```ts
appendEvent(sessionId: string, event: ManifestEvent): void
```
- Opens `~/.evokore/sessions/{sessionId}.jsonl` with `fs.appendFileSync`
- Writes exactly one line: `JSON.stringify(event) + '\n'`
- No read before write; no lock required for individual append

```ts
readManifest(sessionId: string): SessionState
```
- Reads all lines via `readline`
- Left-folds: later events overwrite earlier values for the same key
- Returns a `SessionState` snapshot

**Compaction** (triggered in `tilldone.js` Stop hook and `scripts/log-rotation.js`):
- Fires when file exceeds 1 MB
- Reads all lines, folds to current state, writes `.tmp` file, atomically renames
- Writes a legacy `{sessionId}.json` snapshot post-compaction for reader compatibility
  during the hook migration window (PRs 0-C and 0-D)

### Schema versioning

`src/SessionManifest.schema.ts` exports `schemaVersion: 1`. Every appended event line
includes `{ schemaVersion: 1, ts: ISO8601, type: string, ...payload }`.

---

## Consequences

**Positive:**
- POSIX `write(2)` calls are atomic up to `PIPE_BUF` bytes (≥512 bytes on all platforms;
  a typical manifest event line is ≤200 bytes). No cross-process race for individual
  appends.
- Crash-safe: a partial final line is ignored by the fold; all prior lines are intact.
- No external lock dependency (SQLite WAL adds a native binary; advisory-lock npm packages
  carry supply chain risk and maintenance debt).
- Compaction is infrequent (most sessions never hit 1 MB) and atomic (`fs.rename`).

**Negative / accepted trade-offs:**
- Read path folds all lines — O(n) where n = number of events this session. Acceptable:
  hooks fire at most a few hundred times per session; fold is pure in-memory iteration.
- Legacy JSON snapshot adds a brief window of dual-format state during PR 0-C/0-D
  migration. The snapshot is written only after compaction and is read-only from the
  hook perspective.
- Windows does not guarantee `PIPE_BUF` atomicity by spec; in practice, single-syscall
  `WriteFile` for small buffers is atomic on NTFS. If future profiling shows corruption,
  a `proper-lockfile`-free sentinel (`fs.promises.open(path, 'wx')`) can be layered on
  compaction only, not on individual appends.

---

## Alternatives Considered

| Option | Verdict | Rationale |
|--------|---------|-----------|
| Single-writer TS class in main process | Rejected | Fiction across 7 separate OS processes |
| SQLite WAL | Rejected | Requires native binary; cross-platform build complexity |
| `proper-lockfile` npm package | Rejected | Maintenance-mode; last meaningful release 2020 |
| `fs.promises.open(path, 'wx')` advisory lock on every append | Rejected | Serializes all hooks; single-process throughput acceptable, but cross-process lock contention adds latency on Windows |
| Redis / shared state service | Rejected | External runtime dependency; operator complexity |

---

## References

- `docs/research/ruflo-assimilation-final-2026-04-14.md` — Decision D1
- `src/SessionManifest.ts` (to be created in PR 0-B: `feat/session-manifest-jsonl`)
- `src/SessionManifest.schema.ts` (to be created in PR 0-B)
- `tests/SessionManifest.test.ts` (to be created in PR 0-B)
