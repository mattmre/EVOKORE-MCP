---
name: panel-api-versioning
description: Expert panel for API lifecycle management, backward compatibility, deprecation strategy, contract testing, and schema evolution
aliases: [api-versioning-panel, breaking-change-panel, api-lifecycle-panel, api-compat-panel, api-review]
category: orchestration
tags: [api, versioning, backward-compatibility, schema-evolution, breaking-changes, deprecation, contract-testing]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - API breaking change review
  - backward compatibility check
  - API deprecation strategy
  - schema evolution safety
  - contract testing review
  - public API version bump
  - SDK migration guide
---

# API Versioning & Breaking Changes Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Elena Rodriguez** | API Product Manager | Consumer impact, migration paths, deprecation timelines |
| **Omar Haddad** | Contract Testing Specialist | Consumer-driven contracts, implicit contracts, integration safety |
| **Dr. Sarah Kim (API)** | Schema Evolution Expert | Forward/backward compatibility, additive-only changes, schema registries |
| **Raj Patel (API)** | Developer Advocate & SDK Maintainer | Developer experience, migration guides, changelogs, error messages |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- Any change to a public API (REST, GraphQL, gRPC, event schema)
- Database schema changes that affect API responses
- Deprecation of any external-facing feature or endpoint
- SDK major version bumps
- Configuration format changes affecting consumers
- Renaming, removing, or changing the type of any API field
- Adding required fields to request schemas

## Review Modes

### Mode A: Breaking Change Assessment
Evaluate a proposed API change for backward compatibility, consumer impact, and migration feasibility.

### Mode B: Deprecation Strategy Review
Review a deprecation plan for timeline, communication, migration support, and sunset criteria.

### Mode C: Schema Evolution Safety Review
Evaluate schema changes (Protobuf, Avro, JSON Schema, GraphQL) for forward and backward compatibility.

---

## Review Protocol

### Step 1: CONVENE -- Select Mode and Experts

| Mode | Active Experts |
|---|---|
| Breaking Change Assessment | All 4 |
| Deprecation Strategy | Elena, Raj (API), Omar |
| Schema Evolution Safety | Dr. Kim (API), Omar, Raj (API) |

### Step 2: BRIEF -- Present the Artifact

**For Breaking Change Assessment (Mode A):**
```
## API Change Under Review
- **API Type:** [REST, GraphQL, gRPC, event schema, config format]
- **Endpoint/Field:** [what is changing]
- **Change Description:** [what the change is]
- **Before/After:** [request/response examples, old vs new]
- **Consumer Count:** [known consumers, estimated usage]
- **Migration Path:** [how consumers update]
- **Timeline:** [when the change ships]
- **Versioning Strategy:** [URL versioning, header, content negotiation]
```

**For Deprecation Strategy (Mode B):**
```
## Deprecation Plan Under Review
- **What's Being Deprecated:** [endpoint, field, SDK version, feature]
- **Reason for Deprecation:** [why this is being removed]
- **Replacement:** [what consumers should use instead]
- **Deprecation Timeline:** [warning period, sunset date]
- **Communication Plan:** [how consumers are notified]
- **Migration Guide:** [documentation for transitioning]
- **Usage Metrics:** [current usage of the deprecated feature]
- **Sunset Criteria:** [what conditions must be met before removal]
```

**For Schema Evolution Safety (Mode C):**
```
## Schema Change Under Review
- **Schema Format:** [Protobuf, Avro, JSON Schema, GraphQL SDL]
- **Change Description:** [fields added, removed, renamed, retyped]
- **Before/After Schema:** [diff of schema definitions]
- **Producers:** [services that write this schema]
- **Consumers:** [services that read this schema]
- **Compatibility Mode:** [full, backward, forward, none]
- **Registry:** [schema registry in use, if any]
```

### Step 3: SOLO -- Independent Expert Reviews

**Elena Rodriguez (API Product Manager) reviews:**
- Consumer census -- how many consumers use this endpoint, and have we analyzed their usage patterns?
- Migration effort -- what's the migration guide, and can a consumer complete it in under an hour?
- Communication plan -- how will consumers learn about this change? Email, changelog, dashboard banner?
- Deprecation timeline -- is the sunset period long enough for consumers to migrate?
- Usage analytics -- do we have metrics showing which consumers use the affected fields?
- Business impact -- what's the cost of this breaking change in terms of consumer trust and support burden?
- Competitive risk -- will this change push consumers toward a competitor's API?
- "If our largest consumer can't migrate by the sunset date, what's our contingency plan?"

**Omar Haddad (Contract Testing Specialist) reviews:**
- Contract coverage -- do the existing consumer-driven contracts still pass with this change?
- Implicit contracts -- are there consumers depending on undocumented behavior that this change alters?
- Response shape -- does the response shape change in any way not covered by existing contract tests?
- Error contract -- do error responses change format, status codes, or error codes?
- Header changes -- are there changes to response headers that consumers might depend on?
- Pagination/ordering -- does this change affect pagination behavior, sort order, or result counts?
- Idempotency -- does this change affect idempotency guarantees for any operation?
- "Add a contract test for this specific change before shipping. If you can't write one, you don't understand the impact well enough."

**Dr. Sarah Kim (API) (Schema Evolution Expert) reviews:**
- Additive-only check -- is this change additive-only, or does it modify/remove existing fields?
- Forward compatibility -- what happens when a consumer running the old schema receives a new-schema response?
- Backward compatibility -- what happens when a consumer running the new schema receives an old-schema response?
- Default values -- are new required fields provided with sensible defaults for existing records?
- Type widening -- if a field type is changing, is it widening (safe) or narrowing (breaking)?
- Enum evolution -- if enums are involved, are new values additive? How do old consumers handle unknown enum values?
- Wire format -- does the serialized representation change in a way that breaks deserialization?
- "Run the schema compatibility checker. Show me the output for both forward and backward compatibility."

**Raj Patel (API) (Developer Advocate & SDK Maintainer) reviews:**
- Error experience -- what error does an old client get when it hits the changed endpoint? Is it helpful?
- Changelog clarity -- is the changelog entry clear enough that a developer can understand the impact without reading the PR?
- SDK migration -- do all client SDKs have updated versions ready before the API change ships?
- Code examples -- are the migration examples in the documentation copy-pasteable and tested?
- Support readiness -- is the support team briefed on this change and the expected questions?
- Upgrade friction -- how many lines of code does a typical consumer need to change?
- "I'm going to pretend to be a developer who hasn't read the migration guide. Walk me through what I experience when my code breaks."

### Step 4: CHALLENGE -- Cross-Expert Debate

Key challenges for this panel:

1. **Elena vs Dr. Kim (API):** "We need a 12-month deprecation window to protect our largest consumers" vs "Long compatibility windows accumulate tech debt -- clean breaks with good tooling are healthier"
2. **Omar vs Raj (API):** "The contract tests all pass, so this change is safe" vs "The contract tests don't cover the undocumented behavior that 30% of consumers rely on"
3. **Elena vs Raj (API):** "We can't make this breaking change -- it will generate hundreds of support tickets" vs "The current API is so confusing it already generates hundreds of support tickets"
4. **Dr. Kim (API) vs Omar:** "The schema registry will enforce compatibility automatically" vs "The registry checks syntactic compatibility, not semantic compatibility"
5. **Raj (API) vs Elena:** "The migration guide is ready and clear" vs "Clear to an engineer who wrote it, not clear to the average consumer"

### Step 5: CONVERGE -- Synthesize Findings

```markdown
## API Versioning & Breaking Changes Panel Report

### Overall Assessment: [SAFE TO SHIP / SHIP WITH MITIGATIONS / BREAKING -- REQUIRES MIGRATION PLAN / DO NOT SHIP]

### Compatibility Assessment
1. **Backward Compatible:** [yes/no -- details]
2. **Forward Compatible:** [yes/no -- details]
3. **Contract Tests:** [all pass / failures identified]

### Consumer Impact
1. **Affected Consumers:** [count, by usage pattern]
2. **Migration Effort:** [minimal/moderate/significant per consumer]
3. **Support Burden:** [expected ticket volume]

### Risk Register
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| [Risk 1] | [H/M/L] | [H/M/L] | [approach] | [who] |

### Deprecation Recommendations
- Sunset timeline: [recommended date]
- Communication plan: [channels and cadence]
- Migration support: [tooling, documentation, office hours]

### Schema Evolution Findings
1. **[Field/Type Change]** -- compatibility: [safe/breaking], mitigation: [approach]

### Dissenting Opinions
1. [Expert] argued [position] -- [rationale]
```

### Step 6: FEASIBILITY -> DELIVER

Top recommendations and alternative approaches go to [Feasibility Panel](feasibility-research.md).

## Example Invocations

### Breaking Change Assessment
```
Run an API Versioning & Breaking Changes Panel -- Mode A -- on the
proposed change to the /api/v2/users endpoint.

We're renaming the `email_address` field to `email` and changing
`created_at` from a Unix timestamp to ISO 8601 format. The endpoint
has approximately 3,200 active API consumers based on last month's
usage logs.

Key concerns:
- Is this a breaking change? (yes, obviously, but how bad?)
- What's the migration path for consumers?
- Should we version this as v3, or use a compatibility header?
- What error should old clients receive?

Full panel, all experts.
```

### Deprecation Strategy
```
Run Mode B on our plan to deprecate the v1 REST API in favor of
the GraphQL API.

The v1 API still handles 40% of all traffic. Our proposed timeline
is 6 months of deprecation warnings followed by sunset. We have
migration guides for 3 of the 5 supported SDKs.

Key concerns:
- Is 6 months long enough for 40% of traffic to migrate?
- What do we do about the 2 SDKs without migration guides?
- How do we handle consumers who refuse to migrate?
```

### Schema Evolution
```
Run Mode C on a Protobuf schema change for our order events.

We're adding a required `currency_code` field (previously assumed
USD), removing the deprecated `tax_amount` field, and changing
`order_id` from int32 to int64.

Key concerns:
- Which of these changes break forward compatibility?
- Can old consumers safely ignore the new `currency_code` field?
- What happens to services still referencing `tax_amount`?
```
