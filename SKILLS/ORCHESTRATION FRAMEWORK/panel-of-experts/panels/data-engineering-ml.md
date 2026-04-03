---
name: panel-data-engineering-ml
description: Expert panel for data pipelines, ETL/ELT, streaming architectures, ML model lifecycle, data quality, and feature engineering
aliases: [data-panel, data-engineering-panel, ml-panel, pipeline-panel, etl-panel, data-review]
category: orchestration
tags: [data-engineering, etl, ml, streaming, data-quality, pipelines, machine-learning]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - data pipeline design or review
  - ETL or ELT workflow
  - machine learning model lifecycle
  - streaming architecture (Kafka, Kinesis)
  - data quality or lineage system
  - feature engineering or feature store design
---

# Data Engineering & ML Pipeline Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Priya Lakshman** | Data Platform Architect | System-level data architecture, pipeline composition, ingestion/transformation/serving boundaries |
| **Carlos Mendez** | ML Engineering Lead | ML lifecycle, training reproducibility, feature/training skew, drift monitoring |
| **Adaeze Okonkwo** | Data Quality Engineer | Data quality validation, lineage, observability, governance |
| **Tomasz Kowalski** | Streaming Systems Specialist | Event-driven architecture, streaming correctness, ordering, backpressure |
| **Rachel Stern** | Analytics Engineering Lead | Business value alignment, metric consistency, analyst ergonomics |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- New data pipeline design or major pipeline refactoring
- ML model deployment or MLOps infrastructure design
- Data warehouse or lakehouse schema changes
- Streaming architecture design or migration (Kafka, Kinesis, Flink)
- Data quality system design or data contract definition
- Feature engineering or feature store architecture
- ETL/ELT workflow review

## Review Modes

### Mode A: Pipeline Architecture Review
Evaluate data pipeline design for composition, scalability, data contracts, and quality.

### Mode B: ML Model Lifecycle Review
Review ML model deployment for reproducibility, feature/training skew, drift detection, and production readiness.

### Mode C: Data Quality Assessment
Evaluate data quality strategy, validation coverage, lineage tracking, and governance.

---

## Review Protocol

### Step 1: CONVENE -- Select Mode and Experts

| Mode | Active Experts |
|---|---|
| Pipeline Architecture | Priya, Tomasz, Rachel, Adaeze |
| ML Model Lifecycle | Carlos, Priya, Adaeze |
| Data Quality Assessment | Adaeze, Priya, Rachel |

### Step 2: BRIEF -- Present the Artifact

**For Pipeline Architecture (Mode A):**
```
## Pipeline Under Review
- **Pipeline Name:** [name/identifier]
- **Data Sources:** [upstream systems, APIs, event streams]
- **Transformations:** [key transformation steps]
- **Serving Layer:** [where processed data lands -- warehouse, API, cache]
- **Volume:** [expected throughput -- events/sec, rows/day, GB/hour]
- **Latency Requirements:** [batch, micro-batch, or real-time]
- **Data Contracts:** [schema definitions, SLAs between producer/consumer]
- **Quality Checks:** [existing validation, if any]
```

**For ML Model Lifecycle (Mode B):**
```
## ML Model Under Review
- **Model Name:** [name/identifier]
- **Task:** [classification, regression, ranking, etc.]
- **Training Data:** [source, volume, freshness]
- **Feature Pipeline:** [how features are computed and served]
- **Training Infrastructure:** [where and how training runs]
- **Serving Infrastructure:** [batch inference, real-time API, edge]
- **Monitoring:** [drift detection, performance metrics, alerting]
- **Rollback Strategy:** [how to revert to previous model version]
```

**For Data Quality Assessment (Mode C):**
```
## Data Quality Review
- **Data Domain:** [which datasets or pipelines]
- **Current Quality Checks:** [existing validation rules]
- **Known Issues:** [data quality problems encountered]
- **Lineage Coverage:** [how data provenance is tracked]
- **Governance Requirements:** [regulatory, compliance, audit needs]
- **Consumer Impact:** [what breaks when data quality degrades]
```

### Step 3: SOLO -- Independent Expert Reviews

**Priya Lakshman (Data Platform Architect) reviews:**
- Pipeline composition -- are ingestion, transformation, and serving layers cleanly separated?
- Data contracts -- is there an explicit schema contract between producer and consumer?
- Schema evolution -- what happens when the upstream schema changes without notice?
- Replay capability -- how do you replay failed batches without duplication?
- Platform fit -- does this pipeline compose well with the broader data platform, or is it a snowflake?
- Technology selection -- is the chosen stack appropriate for the volume and latency requirements?
- Boundary clarity -- where does this pipeline's responsibility end and the next system's begin?
- "If the upstream source adds a new column tomorrow, what breaks? What if it removes one?"

**Carlos Mendez (ML Engineering Lead) reviews:**
- Training reproducibility -- can you reproduce this exact training run six months from now?
- Feature/training skew -- are training features computed the same way as serving features?
- Model versioning -- how are model artifacts versioned, stored, and promoted?
- Drift detection -- how do you detect model drift post-deployment?
- A/B testing -- how do you compare model versions in production?
- Rollback -- how quickly can you revert to the previous model version?
- Experiment tracking -- are hyperparameters, data versions, and metrics tracked per run?
- "Show me the path from 'data scientist pushes a notebook' to 'model serves production traffic.' How many manual steps are there?"

**Adaeze Okonkwo (Data Quality Engineer) reviews:**
- Validation coverage -- what happens when this column contains nulls? Negative values? Values from 1970?
- Failure behavior -- when quality checks fail, do you alert or halt the pipeline?
- Lineage tracking -- can you trace bad output data back to the source record that caused it?
- Freshness monitoring -- how do you detect when data stops arriving?
- Completeness checks -- how do you know if a batch is missing records vs. legitimately smaller?
- Expectation definitions -- are quality expectations codified (Great Expectations, dbt tests) or tribal knowledge?
- Cross-system consistency -- do the same entities have consistent definitions across pipelines?
- "Show me what happens when the source system sends duplicate records. At which stage are they caught?"

**Tomasz Kowalski (Streaming Systems Specialist) reviews:**
- Ordering guarantees -- what are your ordering guarantees, and do consumers actually need them?
- Late-arriving data -- how do you handle events that arrive after the processing window closes?
- Exactly-once semantics -- what's the delivery guarantee, and is it actually enforced end-to-end?
- Backpressure -- what happens when consumers can't keep up with producers?
- Partitioning strategy -- is the partition key chosen for even distribution and correct ordering?
- Consumer lag monitoring -- how do you detect and alert on growing consumer lag?
- Replay and reprocessing -- can you reprocess a time range of events without side effects?
- "If a consumer crashes and restarts, what's the worst case for duplicate processing? What's the blast radius?"

**Rachel Stern (Analytics Engineering Lead) reviews:**
- Business alignment -- who consumes this data and what decisions does it inform?
- Metric consistency -- is this metric definition consistent with how Finance (or other stakeholders) calculates it?
- Analyst accessibility -- can an analyst query this data without engineering help?
- Documentation -- are transformations documented well enough for a new analyst to understand?
- Semantic layer -- are business definitions codified in a metrics layer or scattered across queries?
- Historical comparability -- when the pipeline changes, can analysts still compare old and new data?
- "If an executive asks 'why did revenue change this quarter,' can an analyst answer that question using this pipeline's output?"

### Step 4: CHALLENGE -- Cross-Expert Debate

Key challenges for this panel:

1. **Priya vs Rachel:** "This schema is normalized for engineering correctness" vs "Analysts need a wide, denormalized table they can query without 12 joins"
2. **Carlos vs Tomasz:** "Build a feature store with proper offline/online parity" vs "Just stream the features directly -- the feature store adds latency and complexity"
3. **Adaeze vs Tomasz:** "Every event needs validation before processing" vs "Validation on the hot path adds latency that violates our SLA"
4. **Priya vs Carlos:** "The pipeline architecture should be general-purpose" vs "ML pipelines have unique requirements (versioning, reproducibility) that justify special-purpose infrastructure"
5. **Rachel vs Adaeze:** "Ship the data now and fix quality issues as they're reported" vs "Don't serve data downstream until quality is validated"

### Step 5: CONVERGE -- Synthesize Findings

```markdown
## Data Engineering & ML Panel Report

### Overall Assessment: [APPROVED / APPROVED WITH MODIFICATIONS / NEEDS REWORK]

### Pipeline Architecture Findings
1. **[Component/Decision]** -- verdict: [accept/modify/reject], rationale: [why]

### Data Quality Assessment
1. **[Gap/Strength]** -- severity: [high/medium/low], recommendation: [approach]

### ML Lifecycle Findings
1. **[Concern/Strength]** -- severity: [high/medium/low], recommendation: [approach]

### Risk Register
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| [Risk 1] | [H/M/L] | [H/M/L] | [approach] | [who] |

### Data Contract Recommendations
- Producer obligations: [what upstream must guarantee]
- Consumer expectations: [what downstream can rely on]
- Monitoring: [how contract violations are detected]

### Dissenting Opinions
1. [Expert] argued [position] -- [rationale]
```

### Step 6: FEASIBILITY -> DELIVER

Top recommendations and alternative approaches go to [Feasibility Panel](feasibility-research.md).

## Example Invocations

### Pipeline Architecture Review
```
Run a Data Engineering & ML Panel -- Mode A -- on our Teams message
ingestion pipeline.

The pipeline ingests messages from Microsoft Teams via webhook, transforms
them through a Kafka topic, enriches with user metadata from PostgreSQL,
and lands in Snowflake for analytics.

Key concerns:
- Does the pipeline design compose well with our broader data platform?
- Are there data quality checks at each stage?
- Is there a clear data contract between Teams webhook and our ingestion?
- What happens when Teams changes their webhook payload schema?

Full Mode A panel. Include feasibility gate.
```

### ML Model Lifecycle Review
```
Run Mode B on our new document classification model.

The model classifies support tickets into 47 categories using a fine-tuned
transformer. Training data comes from 18 months of manually labeled tickets.
Features are computed in a Jupyter notebook and served via a Redis cache.

Key concerns:
- Training reproducibility across environments
- Feature/training skew between notebook and Redis serving path
- Production drift detection strategy
- Rollback plan if the new model underperforms
```
