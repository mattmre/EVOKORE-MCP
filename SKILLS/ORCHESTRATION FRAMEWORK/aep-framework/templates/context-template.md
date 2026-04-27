# {Bounded Context Name}

> Skeleton for `docs/contexts/<context-slug>/CONTEXT.md`.
> Replace every `{...}` placeholder. Keep this document under 200 lines —
> if you cannot, the context is too broad (split it via a new ADR superseding
> ADR-0005) or the document is leaking implementation detail.
>
> The bounded context name above MUST match a `### N. <Name>` heading in
> [`docs/adr/0005-bounded-contexts.md`](../../../docs/adr/0005-bounded-contexts.md).

---

## Domain

{One paragraph in plain language describing what this context is responsible
for. Write for a domain expert, not for a developer reading the source.}

---

## Primary Use Cases

{3-7 bullets in user / operator language. Each line should describe a
verb-object pair the context supports.}

- {use case 1}
- {use case 2}
- {use case 3}

---

## Key Invariants

{What must always be true within this context. These are the rules that, if
violated, mean the system is in an inconsistent state.}

- {invariant 1}
- {invariant 2}

---

## Key Models

Name each model with the TypeScript symbol when one exists, so the glossary
stays grep-able.

### Aggregates

- **{AggregateName}** (`src/path/to/Symbol.ts`): {one-sentence purpose}

### Value Objects

- **{ValueObjectName}**: {one-sentence purpose}

### Domain Services

- **{ServiceName}** (`src/path/to/Symbol.ts`): {one-sentence purpose}

### Repositories

- **{RepositoryName}** (`src/path/to/Symbol.ts`): {one-sentence purpose}

---

## Open Questions

Each question must have a date and a proposed owner so it does not become
permanent fog.

- `{YYYY-MM-DD}` — {question} — owner: {agent or human}
- `{YYYY-MM-DD}` — {question} — owner: {agent or human}

---

## Last Updated

- Date: `{YYYY-MM-DD}`
- Cycle ID: `{AEP-YYYYMMDD-PRNNN}` (or session id if outside an AEP cycle)
- Updater: {agent or human}

---

## Citations

Sources that informed the current contents of this file. Cite replay JSONL
line ids and evidence-capture E-NNN ids so the next reader can audit the
change without re-doing the analysis.

- `~/.evokore/sessions/{sessionId}-replay.jsonl` line `{N}`
- `~/.evokore/sessions/{sessionId}-evidence.jsonl` entry `E-{NNN}`
- `panel-of-experts` CONVERGE artifact: `{path or id}`
- ADR cross-link: [`docs/adr/0005-bounded-contexts.md`](../../adr/0005-bounded-contexts.md)
