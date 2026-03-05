# 📂 Category: HIVE FRAMEWORK

This section details the extensive use cases and training materials for the `HIVE FRAMEWORK` domain.

---

## 🛠️ Skill: `hive`

**Description:** Complete workflow for building, implementing, and testing goal-driven agents. Orchestrates hive-* skills. Use when starting a new agent project, unsure which skill to use, or need end-to-end guidance.

### 🧠 Core Directives & Framework
*No specific directives found.*


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `hive` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `hive`.
3. **Orchestration**: As part of a larger multi-agent sequence where `hive` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **hive** workflow to accomplish this task."*
> *"Please load the **hive** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **hive**."*

---

## 🛠️ Skill: `hive-concepts`

**Description:** Core concepts for goal-driven agents - architecture, node types (event_loop, function), tool discovery, and workflow overview. Use when starting agent development or need to understand agent fundamentals.

### 🧠 Core Directives & Framework
*No specific directives found.*


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `hive-concepts` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `hive-concepts`.
3. **Orchestration**: As part of a larger multi-agent sequence where `hive-concepts` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **hive-concepts** workflow to accomplish this task."*
> *"Please load the **hive-concepts** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **hive-concepts**."*

---

## 🛠️ Skill: `hive-create`

**Description:** Step-by-step guide for building goal-driven agents. Qualifies use cases first (the good, bad, and ugly), then creates package structure, defines goals, adds nodes, connects edges, and finalizes agent class. Use when actively building an agent.

### 🧠 Core Directives & Framework
*No specific directives found.*


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `hive-create` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `hive-create`.
3. **Orchestration**: As part of a larger multi-agent sequence where `hive-create` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **hive-create** workflow to accomplish this task."*
> *"Please load the **hive-create** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **hive-create**."*

---

## 🛠️ Skill: `hive-credentials`

**Description:** Set up and install credentials for an agent. Detects missing credentials from agent config, collects them from the user, and stores them securely in the local encrypted store at ~/.hive/credentials.

### 🧠 Core Directives & Framework
*No specific directives found.*


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `hive-credentials` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `hive-credentials`.
3. **Orchestration**: As part of a larger multi-agent sequence where `hive-credentials` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **hive-credentials** workflow to accomplish this task."*
> *"Please load the **hive-credentials** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **hive-credentials**."*

---

## 🛠️ Skill: `hive-debugger`

**Description:** Interactive debugging companion for Hive agents - identifies runtime issues and proposes solutions

### 🧠 Core Directives & Framework
*No specific directives found.*


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `hive-debugger` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `hive-debugger`.
3. **Orchestration**: As part of a larger multi-agent sequence where `hive-debugger` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **hive-debugger** workflow to accomplish this task."*
> *"Please load the **hive-debugger** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **hive-debugger**."*

---

## 🛠️ Skill: `hive-patterns`

**Description:** Best practices, patterns, and examples for building goal-driven agents. Includes client-facing interaction, feedback edges, judge patterns, fan-out/fan-in, context management, and anti-patterns.

### 🧠 Core Directives & Framework
*No specific directives found.*


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `hive-patterns` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `hive-patterns`.
3. **Orchestration**: As part of a larger multi-agent sequence where `hive-patterns` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **hive-patterns** workflow to accomplish this task."*
> *"Please load the **hive-patterns** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **hive-patterns**."*

---

## 🛠️ Skill: `hive-test`

**Description:** Iterative agent testing with session recovery. Execute, analyze, fix, resume from checkpoints. Use when testing an agent, debugging test failures, or verifying fixes without re-running from scratch.

### 🧠 Core Directives & Framework
> Running in MOCK MODE - structure validation only")
        else:
            pytest.fail(
                "
> ANTHROPIC_API_KEY not set!
> "
                "Set API key: export ANTHROPIC_API_KEY='your-key-here'
> "
                "Or run structure validation: MOCK_MODE=1 pytest exports/{agent}/tests/"
            )

    if not mock_mode:
        agent_tools = []  # Update per agent
        missing = creds.get_missing_for_tools(agent_tools)
        if missing:
            lines = ["
> Missing tool credentials!"]
            for name in missing:
                spec = creds.specs.get(name)
                if spec:
                    lines.append(f"  {spec.env_var} - {spec.description}")
            pytest.fail("


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `hive-test` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `hive-test`.
3. **Orchestration**: As part of a larger multi-agent sequence where `hive-test` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **hive-test** workflow to accomplish this task."*
> *"Please load the **hive-test** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **hive-test**."*

---

## 🛠️ Skill: `triage-issue-skill`

**Description:** Specialized skill for triage issue skill workflows.

### 🧠 Core Directives & Framework
*No specific directives found.*


#### 🎯 Primary Use Cases
1. **Direct Execution**: When you need to immediately apply the `triage-issue-skill` workflow to the current task.
2. **Consultation**: When asking the AI to review your existing architecture against the principles defined in `triage-issue-skill`.
3. **Orchestration**: As part of a larger multi-agent sequence where `triage-issue-skill` handles a specific specialized sub-task.

#### 💡 Training & Invocation Examples
To trigger this skill in your AI assistant, use explicit phrasing:
> *"Adopt the **triage-issue-skill** workflow to accomplish this task."*
> *"Please load the **triage-issue-skill** skill and evaluate my code."*
> *"Use the `search_skills` tool to find the exact instructions for **triage-issue-skill**."*

---

