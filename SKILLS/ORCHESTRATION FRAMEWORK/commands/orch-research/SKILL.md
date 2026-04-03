---
name: orch-research
description: Research top repos for a user-supplied topic with expert panel evaluation and presentation packaging
aliases: [research, repo-research, find-repos, discover-repos, topic-research]
category: Orchestration Framework
tags: [research, repos, discovery, evaluation, integration, panel]
version: 1.0.0
requires: [panel-of-experts]
metadata:
  source: "evokore"
  original_command: "orch-research"
resolutionHints:
  - research repos on a topic
  - find best repos for a subject
  - discover and evaluate repos
  - topic-based repo research
---

# orch-research — Topic-Based Repo Research with Expert Panel Review

## Purpose

Given a user-supplied narrative describing a topic, domain, or need, this command researches top GitHub repositories, evaluates candidates through expert panels, and produces a curated shortlist with integration recommendations and a presentation-ready summary.

## Usage

```
orch-research "<narrative>" [options]
```

### Options

| Option | Description | Default |
|---|---|---|
| `--max <n>` | Maximum repos to deeply evaluate | 10 |
| `--depth <level>` | Evaluation depth: quick, standard, deep | standard |
| `--context "<text>"` | Integration context (target system description) | — |
| `--meta-improve` | Run meta-improvement cycle after completion | false |
| `--no-presentation` | Skip presentation packaging | false |

## Examples

### Basic Topic Research
```
orch-research "TypeScript MCP server implementations with tool discovery and session management"
```

### Research with Integration Context
```
orch-research "real-time collaboration frameworks with CRDT support" \
  --context "EVOKORE-MCP v3.1 TypeScript MCP server with WebSocket support" \
  --depth deep
```

### Broad Domain Discovery
```
orch-research "AI agent orchestration frameworks that support multi-agent coordination, task decomposition, and parallel execution" \
  --max 15
```

### Research with Meta-Improvement
```
orch-research "developer productivity CLI tools with hook systems" \
  --meta-improve
```

## Workflow Steps

1. **Narrative Analysis** — Parse the user's description into structured search criteria, requirements, and quality signals
2. **Repo Discovery** (parallel)
   - GitHub API search (code, repos, topics)
   - Community scan (awesome-lists, blog posts, npm/pypi trending, discussions)
3. **Initial Filtering** — Deduplicate, rank, and filter to top N candidates based on activity, license, language match, community signal
4. **Deep Evaluation** (parallel) — For each candidate: README analysis, file tree structure, architecture pattern, test coverage, dependency health, documentation quality, unique capabilities
5. **Expert Panel Review** — Repo Ingestion Panel (Kim, Petrov, Obi, Larsson, Tanaka) evaluates all candidates. Per-repo verdicts: ADOPT / CONSIDER / SKIP
6. **Feasibility Gate** — Feasibility Panel (Torres, Wright, Okonkwo, Svensson) assesses integration effort, ROI, adoption approach
7. **Presentation Packaging** — Presentation Panel extracts key findings into stakeholder-ready format
8. **Meta-Improvement** (optional) — Evaluates expert effectiveness and workflow quality

## Output

The command produces a structured research report:

```markdown
# Repo Research Report: [Topic]

## Executive Summary
- Repos evaluated: [N]
- Top picks: [1-3 repos with one-line rationale each]
- Integration approach: [submodule / fork / skill import / reference]

## Candidate Matrix
| Repo | Stars | Activity | Language | Verdict | Integration Effort |
|---|---|---|---|---|---|

## Expert Panel Findings
[Per-repo analysis from each expert's lens]

## Feasibility Assessment
[Effort, ROI, and approach for top picks]

## Presentation Summary
[Stakeholder-ready version with narrative, visuals, and key takeaways]

## Next Steps
[Recommended actions: spikes to run, POCs to build, teams to involve]
```

## Integration Points

- **resolve_workflow:** Discoverable via `research`, `repo-research`, `find-repos`
- **orch-panel repo:** Uses Repo Ingestion Panel internally
- **orch-panel presentation:** Uses Presentation Panel for output packaging
- **evidence-capture:** Research findings logged as session evidence
- **session-replay:** Full research workflow logged for reproducibility
- **persistent-narratives:** Panel invocations recorded in panel history

## When to Use

- Starting a new project and need to survey the landscape
- Evaluating alternatives to a current dependency
- Looking for reference implementations of a pattern
- Investigating what the community has built in a domain
- Preparing a "build vs buy vs adopt" analysis
- Before starting a major integration effort (like the ECC integration)

## Related Skills

- [Repo Ingestion Panel](../../panel-of-experts/panels/repo-ingestion.md)
- [Presentation Panel](../../panel-of-experts/panels/presentation.md)
- [Feasibility Panel](../../panel-of-experts/panels/feasibility-research.md)
- [Repo Research Workflow](../../panel-of-experts/workflows/repo-research.json)
