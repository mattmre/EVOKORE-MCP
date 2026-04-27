---
name: ubiquitous-language
description: Use when crystallizing a domain glossary for a single bounded context — extract canonical terms from replay JSONL, evidence JSONL, and src/ identifiers, then write GLOSSARY.md scoped to that context only.
upstream: mattpocock/skills
upstream-sha: 90ea8eec03d4ae8f43427aaf6fe4722653561a42
upstream-path: ubiquitous-language/SKILL.md
---

# Ubiquitous Language (Per Bounded Context)

## When to use this skill

Use this skill when a single named bounded context (from
`docs/adr/0005-bounded-contexts.md`) needs a crisp glossary — typically
right after `zoom-out` reveals two callers using the same word for
different concepts, or as part of a domain-modelling pass before refactor.
The trigger is "we need a canonical glossary for context X". This skill
REFUSES to run without an explicit context name; there is no repo-wide
glossary mode.

## Bounded Context Required

This skill is hard-coupled to the EVOKORE-MCP context map in
[`docs/adr/0005-bounded-contexts.md`](../../../docs/adr/0005-bounded-contexts.md).
The eight bounded contexts are:

1. **Skill Registry & Discovery** — `src/SkillManager.ts`,
   `src/RegistryManager.ts`, `src/ToolCatalogIndex.ts`,
   `src/ToolCatalogPagination.ts`, `src/ProfileResolver.ts`,
   `src/rerank/successRerank.ts`.
2. **Proxy & Routing** — `src/ProxyManager.ts`,
   `src/utils/resolveCommandForPlatform.ts`, `src/httpUtils.ts`.
3. **Auth & Security** — `src/auth/OAuthProvider.ts`,
   `src/SecurityManager.ts`, `src/ComplianceChecker.ts`,
   `src/ContainerSandbox.ts`.
4. **Session & Continuity** — `src/SessionIsolation.ts`,
   `src/SessionManifest.ts`, `src/SessionManifest.schema.ts`,
   `src/SessionStore.ts`, `src/stores/MemorySessionStore.ts`,
   `src/stores/FileSessionStore.ts`, `src/stores/RedisSessionStore.ts`,
   `src/HttpServer.ts`.
5. **Orchestration & Fleet** — `src/OrchestrationRuntime.ts`,
   `src/FleetManager.ts`, `src/ClaimsManager.ts`,
   `src/WorkerManager.ts`, `src/WorkerScheduler.ts`,
   `src/TrustLedger.ts`.
6. **Audit & Webhooks** — `src/AuditLog.ts`, `src/AuditExporter.ts`,
   `src/WebhookManager.ts`, `src/PluginManager.ts`.
7. **Telemetry & Analytics** — `src/TelemetryManager.ts`,
   `src/TelemetryExporter.ts`, `src/TelemetryIndex.ts`,
   `src/SessionAnalyticsManager.ts`, `src/NavigationAnchorManager.ts`.
8. **Memory & Knowledge** — `src/MemoryManager.ts`.

The voice subsystem is NOT a bounded context (per ADR-0005's
"Out-of-context" section); this skill rejects `--context voice`.

The context name (slug form, kebab-case) MUST be passed as `--context
<slug>` (or equivalent argv) when invoking. Accepted slugs are:
`skill-registry-and-discovery`, `proxy-and-routing`,
`auth-and-security`, `session-and-continuity`,
`orchestration-and-fleet`, `audit-and-webhooks`,
`telemetry-and-analytics`, `memory-and-knowledge`.

If no `--context` is provided, this skill MUST refuse to run, emit an
error pointing the caller at `docs/adr/0005-bounded-contexts.md`, and
exit without writing any output. There is NO fallback to a repo-wide
`UBIQUITOUS_LANGUAGE.md` — that file is an explicit anti-pattern in
EVOKORE-MCP.

## Adapted From Upstream

This adapter is derived from
[`ubiquitous-language/SKILL.md`](../../upstream/mattpocock-skills/ubiquitous-language/SKILL.md)
in the `mattpocock/skills` submodule pinned at
`90ea8eec03d4ae8f43427aaf6fe4722653561a42`. The upstream extracts a
DDD-style glossary from "the current conversation" and writes one
file at the project root.

To read the upstream body without loading the full file, prefer:

```text
nav_read_anchor SKILLS/upstream/mattpocock-skills/ubiquitous-language/SKILL.md <anchor-id>
```

License: MIT, Copyright (c) 2026 Matt Pocock. See repo-root `NOTICE` and
`SKILLS/upstream/mattpocock-skills/LICENSE`.

## EVOKORE-Specific Adaptations

Concrete deltas vs the upstream skill:

- **No repo-wide glossary.** The upstream writes a single
  `UBIQUITOUS_LANGUAGE.md` at the project root. EVOKORE-MCP rejects
  this as a DDD anti-pattern (see ADR-0005 "Decision" section: the
  same word legitimately means different things across contexts). This
  adapter writes one glossary per context only.
- **No interactive interview.** The upstream "scans the conversation"
  and proposes terms in a chat dialog. EVOKORE is autonomous — this
  adapter reads append-only artifacts instead: replay JSONL, evidence
  JSONL, and `src/` identifiers filtered to the named context's
  modules.
- **Always context-scoped.** The first line of every glossary file is
  the bounded-context name and a back-link to ADR-0005. There is no
  unscoped run mode.
- **Source citations are required.** Each term MUST cite at least one
  source: a `src/<file>.ts` identifier, a replay JSONL line range, or
  an evidence JSONL line. The upstream allows undocumented opinion;
  EVOKORE requires evidence (per the project's "Evidence Capture" hook
  philosophy).
- **Composition phrasing.** When a glossary surface ambiguity that
  warrants an architectural change, the skill emits literal "invoke
  improve-codebase-architecture skill" phrasing so the static
  composition graph (`derive-skill-composition.js`) can edge to it.
- **Trigger-explicit description.** Frontmatter `description` is
  rewritten in EVOKORE's "Use when ..." form so `resolve_workflow`
  semantic ranking can rank this skill above deep reference leaves.

## Output Path

Glossary files are written under this skill's own directory so they
live alongside the rules that produced them and cannot be confused
with a repo-wide artifact:

```text
SKILLS/CONTEXT/ubiquitous-language/glossaries/<context-slug>.md
```

Where `<context-slug>` is the kebab-case slug listed in the **Bounded
Context Required** section above. Existing files are read first and
re-written in place (the skill is idempotent; re-running incorporates
new terms without losing prior ones).

The glossary file MUST start with:

```md
# Ubiquitous Language — <Bounded Context Name>

> Scope: this glossary applies ONLY to the bounded context defined in
> [`docs/adr/0005-bounded-contexts.md`](../../../../docs/adr/0005-bounded-contexts.md)
> as **<Bounded Context Name>**. Terms here may have different meanings in
> other contexts; do NOT assume cross-context portability.
```

## Composition

- **Callers (skills that should invoke this skill):**
  - `domain-model` — when a domain-model pass produces ambiguous terms
    inside a single context, invoke ubiquitous-language skill scoped to
    that context.
  - `zoom-out` — when zoom-out's reframe reveals two callers using the
    same word for different concepts inside one context, invoke
    ubiquitous-language skill on that context.

- **Callees (skills this skill may invoke, conditionally):**
  - When the produced glossary surfaces a name conflict that requires a
    refactor (not just renaming), invoke improve-codebase-architecture
    skill — but only after the glossary file is written and only when
    the conflict is internal to the same bounded context. Cross-context
    conflicts route to ADR-level discussion, not architecture refactor.

## Procedure

1. **Validate the `--context` argument.** Reject the run if no context
   slug is provided, or if the slug does not match one of the eight
   accepted slugs above. The error message must point at
   `docs/adr/0005-bounded-contexts.md` and list the accepted slugs.

2. **Resolve context modules.** From ADR-0005, look up the
   "Primary modules" list for the chosen context. This is the
   filter set used in every subsequent step. Do NOT extract terms
   from files outside this set.

3. **Read replay artifacts.** Open the active session's replay log at
   `~/.evokore/sessions/{sessionId}-replay.jsonl`. Filter entries
   whose `args.file_path` (or equivalent) matches the context module
   set. Collect candidate terms from `args` and from any rendered
   text in the entry.

4. **Read evidence artifacts.** Open
   `~/.evokore/sessions/{sessionId}-evidence.jsonl`. Filter entries
   touching the context's modules (file paths, test names, git
   operations). Collect candidate terms.

5. **Read source identifiers.** Run `git grep -h
   "^\(export\|class\|interface\|type\|function\)" -- <module-paths>`
   over the context's primary modules. Collect exported identifiers
   as canonical-name candidates.

6. **Score candidates.** A candidate term qualifies if it appears in
   at least two distinct sources (e.g., one source-code identifier
   plus one replay/evidence reference) OR if it is a noun phrase
   that recurs three or more times in replay/evidence with a
   stable casing. Skip generic programming words (array, function,
   loop) unless they have context-specific meaning.

7. **Detect ambiguities.** Flag any candidate whose source citations
   carry conflicting definitions (same word, different concepts) or
   whose source citations include a known synonym from another
   candidate (different words, same concept).

8. **Write the glossary file.** Emit
   `SKILLS/CONTEXT/ubiquitous-language/glossaries/<context-slug>.md`
   using the structure below. If the file already exists, MERGE: keep
   prior terms whose source citations still resolve, update
   definitions where source identifiers were renamed, and append new
   terms.

9. **Recommend follow-up.** If the glossary contains at least one
   `Flagged ambiguities` entry that names a concrete refactor seam
   inside the same context, append "invoke
   improve-codebase-architecture skill" to the conversation reply.
   Otherwise, do not invoke a follow-up skill.

## Glossary File Structure

```md
# Ubiquitous Language — <Bounded Context Name>

> Scope: this glossary applies ONLY to the bounded context defined in
> [docs/adr/0005-bounded-contexts.md](...) as **<Bounded Context Name>**.

## Terms

| Term        | Definition                                              | Sources                                              | Aliases to avoid      |
| ----------- | ------------------------------------------------------- | ---------------------------------------------------- | --------------------- |
| **Session** | <one-sentence definition scoped to THIS context>        | `src/SessionIsolation.ts:42`, replay L1248-L1260     | connection, transport |

## Relationships

- A **Session** owns zero-or-one **TenantId** (per ADR-0003).
- A **Manifest** is appended-to by exactly one **Session** at a time.

## Flagged ambiguities

- "Resource" appears with two distinct meanings inside this context
  (lock-key vs MCP URI); recommend renaming the lock-key flavor to
  "ClaimKey" — invoke improve-codebase-architecture skill to scope
  the rename.
```

## Anti-patterns

- Writing `UBIQUITOUS_LANGUAGE.md` at the repo root. This file is
  banned by ADR-0005's Decision section. The skill must hard-fail
  before it would write to that path.
- Letting a single term span two contexts in one definition. If
  "Session" means different things in `Session & Continuity` and in
  `Auth & Security`, write the term twice — once in each
  context's glossary file — with each definition scoped to that
  context only. Never write a "shared" definition.
- Running without an explicit `--context` argument. The skill MUST
  refuse rather than guessing.
- Inferring terms from prose without a source citation. Every term
  needs at least one citable source line; opinion-only terms are
  rejected.
