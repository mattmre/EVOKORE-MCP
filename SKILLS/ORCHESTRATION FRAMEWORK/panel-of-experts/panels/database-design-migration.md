---
name: panel-database-design-migration
description: Expert panel for schema design, migration safety, query optimization, and data modeling across relational and document databases
aliases: [database-panel, db-panel, schema-panel, migration-panel, db-review]
category: orchestration
tags: [database, schema, migration, sql, query-performance, data-modeling]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - database schema design
  - database migration review
  - query performance analysis
  - schema migration safety
  - indexing strategy
  - data modeling
---

# Database Design & Migration Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Dr. Margaret Chen (DB)** | Database Internals Specialist | Engine-level correctness, query planner, locking, MVCC |
| **David Park** | Data Modeling Architect | Logical/physical model quality, normalization, relationships |
| **Kenji Yamamoto** | Migration Safety Engineer | Zero-downtime migrations, expand-contract, rollback safety |
| **Sonia Alvarez** | Query Performance Analyst | Query regression detection, indexing strategy, write/read tradeoffs |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- New database schema design or major schema changes
- Migrations touching tables with >1M rows
- Adding or removing indexes on production tables
- Replication topology changes
- Database engine migrations (e.g., MySQL to PostgreSQL)
- DDL on critical-path tables
- Data modeling decisions (normalization, denormalization, temporal modeling)

## Review Modes

### Mode A: Schema Design Review
Evaluate a database schema for correctness, normalization, naming, relationship integrity, and fitness for query patterns.

### Mode B: Migration Safety Review
Review a database migration for downtime risk, rollback safety, lock contention, and application compatibility during rollout.

### Mode C: Query Performance Impact Review
Evaluate how schema or index changes affect query performance, write throughput, and overall database health.

---

## Review Protocol

### Step 1: CONVENE -- Select Mode and Experts

| Mode | Active Experts |
|---|---|
| Schema Design | Margaret (DB), David, Sonia |
| Migration Safety | Margaret (DB), Kenji, Sonia |
| Query Performance Impact | Margaret (DB), Sonia, Kenji |

### Step 2: BRIEF -- Present the Artifact

**For Schema Design (Mode A):**
```
## Schema Under Review
- **Database Engine:** [PostgreSQL, MySQL, MongoDB, etc.]
- **Tables/Collections:** [list of tables being designed or changed]
- **Relationships:** [key foreign keys, references, embedded documents]
- **Expected Data Volume:** [row counts, growth rate]
- **Primary Query Patterns:** [the most common reads and writes]
- **Constraints:** [unique, check, not-null, etc.]
- **Temporal Requirements:** [audit trail, soft delete, bitemporal, etc.]
```

**For Migration Safety (Mode B):**
```
## Migration Under Review
- **Migration Script:** [file path or DDL statements]
- **Target Tables:** [which tables are affected]
- **Table Size:** [current row count and size on disk]
- **Operation Type:** [ALTER, CREATE INDEX, data backfill, etc.]
- **Deployment Strategy:** [rolling, blue-green, maintenance window]
- **Application Compatibility:** [can the app run against old AND new schema?]
- **Rollback Plan:** [how to undo if something goes wrong]
- **Estimated Duration:** [how long will the migration take?]
```

**For Query Performance Impact (Mode C):**
```
## Performance Review
- **Schema Changes:** [what changed -- new columns, indexes, constraints]
- **Affected Queries:** [top queries that touch changed tables]
- **Current Performance:** [baseline query times, EXPLAIN output]
- **Data Volume:** [current and projected row counts]
- **Write Patterns:** [INSERT/UPDATE/DELETE frequency on affected tables]
- **Connection Pool:** [current utilization, max connections]
```

### Step 3: SOLO -- Independent Expert Reviews

**Dr. Margaret Chen (DB) (Database Internals Specialist) reviews:**
- Query planner behavior -- have you run EXPLAIN ANALYZE on this query with production-scale data?
- Lock implications -- what lock level does this migration take, and for how long?
- MVCC considerations -- how does this change interact with concurrent transactions?
- Autovacuum impact -- will this change create table bloat or trigger aggressive autovacuum?
- WAL pressure -- how much write-ahead log traffic does this generate?
- Data type correctness -- are column types optimal for storage and comparison (e.g., UUID vs BIGINT, TIMESTAMPTZ vs TIMESTAMP)?
- Engine-specific features -- are we using engine-specific capabilities appropriately (partitioning, partial indexes, generated columns)?
- "What happens to in-flight transactions when this DDL executes?"

**David Park (Data Modeling Architect) reviews:**
- Normalization appropriateness -- is the normalization level right for the use case (OLTP vs OLAP)?
- Naming conventions -- do table and column names follow project conventions and are they self-documenting?
- Relationship integrity -- are foreign keys defined where needed? Are cascading deletes intentional?
- Cardinality accuracy -- what's the cardinality of this relationship in practice, not just in theory?
- Temporal modeling -- how do you model state transitions? Overwrite, append, or bitemporal?
- Null semantics -- does NULL mean "unknown," "not applicable," or "not yet set"? Is this consistent?
- Extensibility -- can this schema accommodate known future requirements without migration?
- "If a new entity type is added next quarter, does this schema accommodate it or require restructuring?"

**Kenji Yamamoto (Migration Safety Engineer) reviews:**
- Downtime requirement -- can this migration be applied without downtime? If not, how long?
- Expand-contract pattern -- can old and new application versions run against both schemas simultaneously?
- Partial failure -- what happens if this migration fails halfway through?
- Rollback safety -- is there a tested rollback script, and how long does rollback take?
- Data backfill safety -- if backfilling data, is it batched? Does it hold locks?
- Replication lag -- will this migration cause replication lag on read replicas?
- Feature flag coordination -- does the application need a feature flag to handle both schemas during rollout?
- "Walk me through the deployment sequence: when does the migration run relative to the application deploy?"

**Sonia Alvarez (Query Performance Analyst) reviews:**
- Top query impact -- what are the top 10 queries by execution time that touch these tables?
- Index utilization -- does this new index actually get used, or does the planner prefer a sequential scan at this data volume?
- Write amplification -- what's the write performance cost of adding this index?
- Query regression risk -- which existing queries might regress due to planner changes after this schema change?
- Statistics freshness -- will ANALYZE need to run before queries perform well against the new schema?
- Connection pressure -- does this change increase query duration enough to affect connection pool exhaustion?
- Pagination strategy -- if adding new query patterns, is pagination cursor-based or offset-based?
- "Run this query against a copy of production data and show me the actual vs estimated rows at each plan node."

### Step 4: CHALLENGE -- Cross-Expert Debate

Key challenges for this panel:

1. **David vs Sonia:** "This schema should be properly normalized for data integrity" vs "Denormalize this join -- it's in the critical query path and costs 200ms"
2. **Kenji vs Margaret (DB):** "This migration must be zero-downtime with expand-contract" vs "A 30-second maintenance window is acceptable and dramatically simplifies the migration"
3. **Margaret (DB) vs David:** "PostgreSQL can handle this with a materialized view" vs "The right answer is a document store for this access pattern"
4. **Sonia vs Kenji:** "Add this index now to fix the slow query" vs "That index will make the upcoming data migration 3x slower"
5. **David vs Sonia:** "This temporal model needs bitemporal tracking for audit compliance" vs "Bitemporal queries are 10x more complex and most consumers don't need it"

### Step 5: CONVERGE -- Synthesize Findings

```markdown
## Database Design & Migration Panel Report

### Overall Assessment: [APPROVED / APPROVED WITH MODIFICATIONS / NEEDS REWORK]

### Schema Design Findings
1. **[Table/Column/Relationship]** -- verdict: [accept/modify/reject], rationale: [why]

### Migration Safety Assessment
1. **[Risk/Concern]** -- severity: [high/medium/low], mitigation: [approach]
- Estimated downtime: [none/seconds/minutes/hours]
- Rollback tested: [yes/no]
- Expand-contract compatible: [yes/no]

### Query Performance Impact
1. **[Query/Pattern]** -- impact: [improved/unchanged/degraded], mitigation: [approach]

### Risk Register
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| [Risk 1] | [H/M/L] | [H/M/L] | [approach] | [who] |

### Recommended Migration Sequence
1. [Step 1] -- [what and why]
2. [Step 2] -- [what and why]

### Dissenting Opinions
1. [Expert] argued [position] -- [rationale]
```

### Step 6: FEASIBILITY -> DELIVER

Top recommendations and alternative approaches go to [Feasibility Panel](feasibility-research.md).

## Example Invocations

### Migration Safety Review
```
Run a Database Design & Migration Panel -- Mode B -- on our users table
migration adding a `tenant_id` column for multi-tenancy.

The users table has 12M rows in PostgreSQL 15. The migration adds a
NOT NULL column with a default value and creates a composite index
on (tenant_id, email).

Key concerns:
- Can this run without downtime on a 12M row table?
- What lock level does ALTER TABLE ... ADD COLUMN ... DEFAULT take?
- Can the application run against both schemas during rollout?
- What's the rollback plan if the migration fails at 60%?

Full Mode B panel.
```

### Schema Design Review
```
Run Mode A on the proposed event sourcing schema for our order
management system.

We're designing an events table, a projections table, and a
snapshots table. Expected volume is 50K orders/day with an average
of 8 events per order lifecycle.

Key concerns:
- Is the event schema extensible for new event types?
- How do we handle projection rebuilds at scale?
- Partitioning strategy for the events table
```
