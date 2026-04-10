# AI Navigation Anchors — Implementation Plan

**Created:** 2026-04-06  
**Origin:** Token waste audit across `D:/GITHUB` projects revealed 16,599 redundant file reads across 4,075 sessions. Root cause: Claude re-reads large files (4,000–40,000 tokens) to find insertion points because hardcoded line numbers in CLAUDE.md go stale. This system fixes that permanently.

---

## The Problem

Large files get re-read dozens to hundreds of times per project lifecycle:

| File | Project | Re-reads | Tokens/read |
|------|---------|----------|-------------|
| `app.module.ts` | Claudius Maximus | 1,367 | ~38,720 |
| `ocr_gpu_async.py` | OCR_LOCAL | 820 | ~23,232 |
| `Main.cs` | EDCTool | 384 | ~14,102 |
| `shared/src/index.ts` | Claudius Maximus | 336 | ~4,000 |

Line numbers hardcoded in CLAUDE.md go stale as files grow. There is no way for Claude to find an insertion point without reading the full file — until now.

---

## The Solution: `@AI:NAV` Anchor Comments

Embed structured comments directly in source files. They travel with the code as lines shift, they grep instantly, and they work with or without EVOKORE-MCP.

### 1. Anchor Syntax

```
<comment-prefix> @AI:NAV[TYPE:id] description
```

**Types:**
- `SEC` — section start
- `END` — section end (paired with a matching `SEC:id`)
- `INS` — insert point ("add new code above this line")

**Regex (matches all languages):** `@AI:NAV\[(SEC|END|INS):([a-z0-9-]+)\]\s*(.*)`

### 2. Examples by Language

**TypeScript** (`app.module.ts`):
```typescript
// @AI:NAV[SEC:entity-imports] Phase entity import declarations — add new imports before END
import { UserEntity } from './user/entities';
// ... 2000+ lines of imports ...
// @AI:NAV[INS:new-entity-import] Add new phase entity imports above this line
// @AI:NAV[END:entity-imports]

// @AI:NAV[SEC:module-imports] @Module imports array
@Module({
  imports: [
    // ... modules ...
    // @AI:NAV[INS:new-module] Add new NestJS modules above this line
  ],
// @AI:NAV[END:module-imports]
```

**TypeScript** (`shared/src/index.ts`):
```typescript
// @AI:NAV[SEC:barrel-exports] Alphabetical barrel exports — insert in alphabetical order
export * from './types/admin-workspace-tools.types';
// ...
// @AI:NAV[INS:new-export] Add new type exports above this line (maintain alpha order)
// @AI:NAV[END:barrel-exports]
```

**Python** (`ocr_gpu_async.py`):
```python
# @AI:NAV[SEC:pipeline-config] Global config, constants, env vars
# @AI:NAV[END:pipeline-config]

# @AI:NAV[SEC:scheduler-thread] Stage 1: file scanning and chunk dispatch
def scheduler_thread():
# @AI:NAV[END:scheduler-thread]

# @AI:NAV[SEC:worker-thread] Stage 3: GPU OCR inference (PaddleOCR / Tesseract)
def worker_thread(worker_id):
# @AI:NAV[END:worker-thread]
```

**C#** (`Main.cs`):
```csharp
// @AI:NAV[SEC:di-constructors] Dependency injection constructors
public Main(IDataService dataService, IConfiguration configuration, ...)
// @AI:NAV[END:di-constructors]

// @AI:NAV[SEC:menu-handlers] WinForms menu event handlers
// @AI:NAV[INS:new-handler] Add new menu handlers above this line
// @AI:NAV[END:menu-handlers]
```

### 3. Constraints

- IDs must be **unique within a file** (kebab-case, lowercase)
- Every `SEC:id` must have a matching `END:id`
- `INS` anchors stand alone
- Anchor line contains only the comment — no executable code on the same line
- If a file needs more than 15 anchors, consider splitting it

---

## EVOKORE-MCP Implementation

### New File: `src/NavigationAnchorManager.ts`

Follows the same pattern as `TelemetryManager.ts`. Implements:

```typescript
class NavigationAnchorManager {
  getTools(): Tool[]           // returns nav_get_map + nav_read_anchor definitions
  isNavTool(name: string): boolean
  handleToolCall(name: string, args: any): Promise<CallToolResult>
}
```

### Tool 1: `nav_get_map`

**Purpose:** Scan a file for all `@AI:NAV` anchors. Returns structured JSON with line numbers, section spans, insert points, and validation warnings. Costs ~100 tokens vs. 40,000 for reading the file.

**Input:**
```json
{ "path": "absolute/path/to/file" }
```

**Output:**
```json
{
  "file": "D:/GITHUB/.../app.module.ts",
  "total_lines": 4292,
  "anchor_count": 8,
  "anchors": [
    { "id": "entity-imports", "type": "SEC", "line": 3,    "description": "Phase entity import declarations" },
    { "id": "new-entity-import", "type": "INS", "line": 2414, "description": "Add new phase entity imports above this line" },
    { "id": "entity-imports", "type": "END", "line": 2419, "description": "" },
    { "id": "module-imports", "type": "SEC", "line": 2423, "description": "@Module imports array" },
    { "id": "new-module",     "type": "INS", "line": 4269, "description": "Add new NestJS modules above this line" },
    { "id": "module-imports", "type": "END", "line": 4271, "description": "" }
  ],
  "sections": [
    {
      "id": "entity-imports",
      "start_line": 3, "end_line": 2419, "line_count": 2416,
      "description": "Phase entity import declarations",
      "insert_points": [
        { "id": "new-entity-import", "line": 2414, "description": "Add new phase entity imports above this line" }
      ]
    },
    {
      "id": "module-imports",
      "start_line": 2423, "end_line": 4271, "line_count": 1848,
      "description": "@Module imports array",
      "insert_points": [
        { "id": "new-module", "line": 4269, "description": "Add new NestJS modules above this line" }
      ]
    }
  ],
  "warnings": []
}
```

**Implementation notes:**
- Read file line-by-line with `readline` — never load full content
- Parse anchors with regex: `/@AI:NAV\[(SEC|END|INS):([a-z0-9-]+)\]\s*(.*)/`
- Pair SEC/END by matching `id`, compute spans
- Warn on: unpaired SEC/END, duplicate IDs, END before SEC
- Return as single `text` content block (JSON string)

### Tool 2: `nav_read_anchor`

**Purpose:** Read N lines centered on a named anchor. Surgical read without loading the full file.

**Input:**
```json
{
  "path": "absolute/path/to/file",
  "anchor_id": "new-module",
  "lines_before": 20,
  "lines_after": 10,
  "anchor_type": "INS"  // optional — disambiguates if same id used as SEC and END
}
```

**Output:**
```json
{
  "file": "D:/GITHUB/.../app.module.ts",
  "anchor_id": "new-module",
  "anchor_type": "INS",
  "anchor_line": 4269,
  "window": { "start_line": 4249, "end_line": 4279, "line_count": 31 },
  "content": "4249:    WorkflowAutomationModule,\n4250: ...\n4269:    // @AI:NAV[INS:new-module] Add new NestJS modules above this line\n..."
}
```

**Implementation notes:**
- Scan line-by-line until anchor found, then collect window lines
- Cap `lines_before`/`lines_after` at 500 each
- If anchor not found: `isError: true`, message: `"Anchor 'X' not found. Run nav_get_map to see available anchors."`
- Output uses `cat -n` style line number prefixes (matching Claude Code Read tool format)

### Wiring in `src/index.ts`

Three changes following established patterns:

1. Import and instantiate `NavigationAnchorManager`
2. Add tools to `rebuildToolCatalog()`
3. Add dispatch branch in `CallToolRequestSchema` handler:
```typescript
} else if (this.navManager.isNavTool(toolName)) {
  result = await this.navManager.handleToolCall(toolName, args);
}
```
4. Add `"nav_get_map"` and `"nav_read_anchor"` to the `source: "builtin"` detection block

### Tool naming: why `nav_` not `fs_`

The `fs_` prefix comes from the proxied `@modelcontextprotocol/server-filesystem` child server name in `mcp.config.json`. These are native tools — using `nav_` avoids collision and clearly namespaces them as AI-workflow tools.

---

## Anchor Placement: Priority Files

These are the files to anchor first, ranked by re-read count:

### Phase 1 — Claudius Maximus

**`src/packages/backend/src/app.module.ts`** (4,292 lines)
- `SEC/END:entity-imports` — wraps the entire ES6 import block (lines ~3–2419)
- `INS:new-entity-import` — just before the subscriber imports (~line 2414)
- `SEC/END:typeorm-entities` — the `entities: asEntityClasses([...])` array (lines ~2468–4265)
- `INS:new-typeorm-entity` — last entry in the entities array
- `SEC/END:module-imports` — the `@Module({ imports: [...] })` array (lines ~2424–4271)
- `INS:new-module` — last entry in the module imports array (~line 4269)

**`src/packages/shared/src/index.ts`** (1,401 lines)
- `SEC/END:barrel-exports` — wraps the entire file
- `INS:new-export` — end of file, before closing (maintain alphabetical order note)

### Phase 2 — OCR_LOCAL

**`ocr_gpu_async.py`** (4,293 lines)
- `SEC/END:pipeline-config` — global config and constants (lines ~1–230)
- `SEC/END:scheduler-thread` — `scheduler_thread()` function (line 1764)
- `SEC/END:extractor-thread` — `extractor_thread()` function (line 1968)
- `SEC/END:worker-thread` — `worker_thread()` function (line 2050)
- `SEC/END:assembler-thread` — `assembler_thread()` function (line 3580)
- `SEC/END:main-entry` — `main()` function (line 3994)
- `INS:new-cli-arg` — inside `_parse_args()` before the `return parser` line

### Phase 3 — EDCTool

**`WindowsFormsApplication19/Main.cs`** (~1,400 lines)
- `SEC/END:di-constructors` — the three Main() constructors (lines 129–172)
- `INS:new-di-param` — inside the full DI constructor param list
- `SEC/END:menu-handlers` — the block of private void *_Click methods (lines 413+)
- `INS:new-handler` — after last menu handler method

---

## CLAUDE.md Template for Consumer Projects

Add this section to each project's CLAUDE.md once anchors are placed:

```markdown
## AI Navigation Anchors

This project uses `@AI:NAV` structured comments. Before reading a large file in full,
call `nav_get_map` to get a section map, then `nav_read_anchor` to read only what you need.

### Anchored Files

| File | Lines | Key Insert Anchors |
|------|-------|--------------------|
| `src/packages/backend/src/app.module.ts` | 4,292 | `new-entity-import`, `new-typeorm-entity`, `new-module` |
| `src/packages/shared/src/index.ts` | 1,401 | `new-export` |

### Workflow

1. `nav_get_map({ "path": "src/packages/backend/src/app.module.ts" })` — get section map
2. Identify the insert anchor you need (e.g. `new-module`)
3. `nav_read_anchor({ "path": "...", "anchor_id": "new-module", "lines_before": 5, "lines_after": 3 })` — read just that area
4. Edit the exact line range returned

### Without EVOKORE-MCP

`@AI:NAV` anchors are plain comments. If `nav_*` tools are unavailable, grep directly:
`grep -n "@AI:NAV" <file>` — returns all anchor locations with line numbers.
```

---

## File Threshold

Worth anchoring when a file meets **both**:
- 500+ lines (~1,500+ tokens)
- 3+ distinct logical sections navigated independently

Below this threshold, a full Read is cheap enough. Above 15 anchors in a single file, consider splitting the file instead.

---

## Implementation Checklist

### EVOKORE-MCP (Session 10)
- [ ] Create `src/NavigationAnchorManager.ts` (~200 lines)
- [ ] Wire into `src/index.ts` (import, instantiate, catalog, dispatch, source detection)
- [ ] Add integration tests `tests/integration/nav-anchor-tools.test.ts`
- [ ] Update `CLAUDE.md` with `nav_get_map` and `nav_read_anchor` tool docs
- [ ] Build + `npx vitest run` green
- [ ] PR: `feat/nav-anchor-tools`

### Anchor Placement (can run in parallel with or after EVOKORE-MCP PR)
- [ ] Add anchors to `Claudius Maximus/src/packages/backend/src/app.module.ts`
- [ ] Add anchors to `Claudius Maximus/src/packages/shared/src/index.ts`
- [ ] Update `Claudius Maximus/CLAUDE.md` anchor table (replace brittle line numbers added 2026-04-06)
- [ ] Add anchors to `OCR_LOCAL/ocr_gpu_async.py`
- [ ] Update `OCR_LOCAL/CLAUDE.md` anchor table
- [ ] Add anchors to `EDCTool/WindowsFormsApplication19/Main.cs`
- [ ] Update `EDCTool/CLAUDE.md` anchor table

### Session Analytics Tools (bundle into same PR or separate `feat/session-analytics`)

- [ ] `session_analyze_replay` — cross-session aggregator (see spec below)
- [ ] `session_work_ratio` — useful-work density scorer (see spec below)
- [ ] `session_context_health` — context size + compact recommendation (see next-session.md)

### Future
- [ ] Consider a `nav_validate` tool that checks all anchors in a project still have matching SEC/END pairs
- [ ] Consider a skill `add-nav-anchors` that analyzes a new large file and proposes anchor placements

---

## Session Analytics Tools

These two tools address the gap identified in the 2026-04-06 token waste audit: EVOKORE captures per-session data (replay logs, evidence, hooks) but never aggregates or scores it across sessions. No existing tool answers "is my process improving?" or "which sessions were high-value?"

### Tool 3: `session_analyze_replay`

**Purpose:** Aggregate tool usage patterns, retry rates, and hook trigger frequencies across all EVOKORE sessions (or a filtered subset). Surfaces process inefficiencies that are invisible within a single session.

**Input:**
```json
{
  "project_filter": "EVOKORE-MCP",
  "days_back": 30,
  "min_tool_calls": 10
}
```
All fields optional. Default: all sessions, all time.

**Output:**
```json
{
  "sessions_analyzed": 42,
  "period": "2026-03-07 to 2026-04-06",
  "tool_frequency": {
    "Read":  { "total": 1842, "pct": 38.2, "consecutive_repeats": 312 },
    "Bash":  { "total": 1203, "pct": 24.9, "consecutive_repeats": 549 },
    "Agent": { "total": 122,  "pct": 2.5,  "consecutive_repeats": 47  },
    "Edit":  { "total": 601,  "pct": 12.4, "consecutive_repeats": 59  }
  },
  "retry_signals": [
    { "tool": "Bash", "consecutive_count": 549, "interpretation": "High — likely retry-on-failure or parallel calls. Investigate Bash failure rate." },
    { "tool": "Read", "consecutive_count": 312, "interpretation": "High — file re-read pattern. Check for missing @AI:NAV anchors." },
    { "tool": "Agent", "consecutive_count": 47, "interpretation": "Moderate — subagent spawn chains. May indicate sequential delegation that could be parallelized." }
  ],
  "hook_triggers": {
    "damage-control": 23,
    "purpose-gate": 18,
    "evidence-capture": 891,
    "tilldone": 445
  },
  "damage_control_rate_per_session": 0.55,
  "top_blocked_patterns": ["rm -f", "git push --force"],
  "sessions_with_zero_evidence": 8,
  "sessions_with_zero_evidence_pct": 19.0
}
```

**Implementation:** Read all `~/.evokore/sessions/*-replay.jsonl` matching filter. Parse tool sequences. Count consecutive same-tool pairs as retry signals. Read `~/.evokore/logs/hooks.jsonl` for hook trigger aggregation. O(n) scan, no full file loads.

**Wires into:** `NavigationAnchorManager.ts` (same manager) or new `SessionAnalyticsManager.ts`

---

### Tool 4: `session_work_ratio`

**Purpose:** Score each session by "useful work density" — the ratio of significant operations (evidence entries: test results, file changes, git ops) to total tool calls. Low-ratio sessions are overhead-heavy and flag process inefficiency.

**Input:**
```json
{
  "project_filter": "optional",
  "days_back": 30,
  "threshold_pct": 10
}
```
`threshold_pct`: sessions below this evidence/replay ratio are flagged. Default: 10%.

**Output:**
```json
{
  "sessions_scored": 42,
  "median_work_ratio_pct": 17.3,
  "flagged_sessions": [
    {
      "session_id": "abc123",
      "replay_entries": 287,
      "evidence_entries": 4,
      "work_ratio_pct": 1.4,
      "duration_minutes": 94,
      "last_tool": "Read",
      "diagnosis": "Very low evidence density. 287 tool calls produced only 4 significant operations. Likely extensive exploration without output — consider tighter session scope or earlier commit checkpoints."
    }
  ],
  "high_efficiency_sessions": [
    {
      "session_id": "def456",
      "replay_entries": 89,
      "evidence_entries": 31,
      "work_ratio_pct": 34.8,
      "diagnosis": "High density. Efficient session — fast path from tool call to verifiable output."
    }
  ],
  "improvement_signal": "8 sessions (19%) had <10% work ratio. Common pattern: high Read counts with no subsequent Edit/Write/Bash output. Correlates with sessions lacking @AI:NAV anchors in target files."
}
```

**Implementation:** For each session with both replay and evidence logs: `evidence_count / replay_count * 100`. Parse session manifest for duration and last tool. Generate diagnosis strings based on ratio band and tool breakdown.

**Data source:** `~/.evokore/sessions/{id}.json` (has both metrics already), `~/.evokore/sessions/{id}-evidence.jsonl` (for detail). Zero new instrumentation required.

---

## Related Files Modified 2026-04-06

As an interim measure while this system is built, targeted grep instructions were added to:
- `D:/GITHUB/Claudius Maximus/CLAUDE.md` — grep commands + line number hints for `app.module.ts` and `shared/src/index.ts`
- `D:/GITHUB/OCR_LOCAL/CLAUDE.md` — full function/class line map for `ocr_gpu_async.py`
- `D:/GITHUB/EDCTool/CLAUDE.md` — grep commands + key line anchors for `Main.cs`

These will be superseded by the `@AI:NAV` anchor system once implemented.
