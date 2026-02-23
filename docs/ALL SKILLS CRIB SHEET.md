# EVOKORE-MCP: All Skills Crib Sheet

This document provides a quick-reference breakdown of all 200+ skills and workflows available in the EVOKORE-MCP library, organized by category.

## ANTHROPIC COOKBOOK

| Skill Name | What this does |
|---|---|
| **claude-cookbooks** | Specialized skill for claude cookbooks workflows. |
| **contributing-to-claude-cookbooks** | Specialized skill for contributing to claude cookbooks workflows. |
| **claude-cookbooks** | Specialized skill for claude cookbooks workflows. |

## AUTOMATION AND PRODUCTIVITY

| Skill Name | What this does |
|---|---|
| **brand-guidelines** | Applies Anthropic's official brand colors and typography to any sort of artifact that may benefit from having Anthropic's look-and-feel. Use it when brand colors or style guidelines, visual formatting, or company design standards apply. |
| **file-organizer** | Intelligently organizes your files and folders across your computer by understanding context, finding duplicates, suggesting better structures, and automating cleanup tasks. Reduces cognitive load and keeps your digital workspace tidy without manual effort. |
| **image-enhancer** | Improves the quality of images, especially screenshots, by enhancing resolution, sharpness, and clarity. Perfect for preparing images for presentations, documentation, or social media posts. |
| **invoice-organizer** | Automatically organizes invoices and receipts for tax preparation by reading messy files, extracting key information, renaming them consistently, and sorting them into logical folders. Turns hours of manual bookkeeping into minutes of automated organization. |
| **slack-gif-creator** | Toolkit for creating animated GIFs optimized for Slack, with validators for size constraints and composable animation primitives. This skill applies when users request animated GIFs or emoji animations for Slack from descriptions like "make me a GIF for Slack of X doing Y". |
| **tailored-resume-generator** | Analyzes job descriptions and generates tailored resumes that highlight relevant experience, skills, and achievements to maximize interview chances |
| **theme-factory** | Toolkit for styling artifacts with a theme. These artifacts can be slides, docs, reportings, HTML landing pages, etc. There are 10 pre-set themes with colors/fonts that you can apply to any artifact that has been creating, or can generate a new theme on-the-fly. |

## DEVELOPER TOOLS

| Skill Name | What this does |
|---|---|
| **artifacts-builder** | Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies (React, Tailwind CSS, shadcn/ui). Use for complex artifacts requiring state management, routing, or shadcn/ui components - not for simple single-file HTML/JSX artifacts. |
| **changelog-generator** | Automatically creates user-facing changelogs from git commits by analyzing commit history, categorizing changes, and transforming technical commits into clear, customer-friendly release notes. Turns hours of manual changelog writing into minutes of automated generation. |
| **developer-growth-analysis** | Analyzes your recent Claude Code chat history to identify coding patterns, development gaps, and areas for improvement, curates relevant learning resources from HackerNews, and automatically sends a personalized growth report to your Slack DMs. |
| **mcp-builder** | Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Use when building MCP servers to integrate external APIs or services, whether in Python (FastMCP) or Node/TypeScript (MCP SDK). |
| **refly** | Base skill for Refly ecosystem: creates, discovers, and runs domain-specific skills bound to workflows. Routes user intent to matching domain skills via symlinks, delegates execution to Refly backend. Use when user asks to: create skills, run workflows, automate multi-step tasks, or manage pipelines. Triggers: refly, skill, workflow, run skill, create skill, automation, pipeline. Requires: @refly/cli installed and authenticated. |
| **skill-creator** | Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations. |
| **webapp-testing** | Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser screenshots, and viewing browser logs. |

## GENERAL CODING WORKFLOWS

| Skill Name | What this does |
|---|---|
| **arch-aep-runner** | Manage the ARCH-AEP workflow review cycle. |
| **docs-architect** | Execute a Gold Standard documentation overhaul or normalize cross-links across the existing docs suite. |
| **implementation-session** | Start an implementation cycle: review priorities, check stale branches, orchestrate agents for coding tasks, and wrap up the session. |
| **planning-with-files** | Implements Manus-style file-based planning for complex tasks. Creates task_plan.md, findings.md, and progress.md. Use when starting complex multi-step tasks, research projects, or any task requiring >5 tool calls. Now with automatic session recovery after /clear. |
| **pr-manager** | Review, test, lint, and prepare smart merges for all open and closed PRs, verifying features and documenting technical debt. |
| **repo-ingestor** | Ingest external repositories, research papers, and benchmarks using 40-agent swarms to analyze, adapt features, and improve current workflows. |
| **session-wrap** | Wrap up the current coding session by creating PRs, updating the session log, preparing the next session md, and updating the claude md with learnings. |

## HIVE FRAMEWORK

| Skill Name | What this does |
|---|---|
| **hive** | Complete workflow for building, implementing, and testing goal-driven agents. Orchestrates hive-* skills. Use when starting a new agent project, unsure which skill to use, or need end-to-end guidance. |
| **hive-concepts** | Core concepts for goal-driven agents - architecture, node types (event_loop, function), tool discovery, and workflow overview. Use when starting agent development or need to understand agent fundamentals. |
| **hive-create** | Step-by-step guide for building goal-driven agents. Qualifies use cases first (the good, bad, and ugly), then creates package structure, defines goals, adds nodes, connects edges, and finalizes agent class. Use when actively building an agent. |
| **hive-credentials** | Set up and install credentials for an agent. Detects missing credentials from agent config, collects them from the user, and stores them securely in the local encrypted store at ~/.hive/credentials. |
| **hive-debugger** | Interactive debugging companion for Hive agents - identifies runtime issues and proposes solutions |
| **hive-patterns** | Best practices, patterns, and examples for building goal-driven agents. Includes client-facing interaction, feedback edges, judge patterns, fan-out/fan-in, context management, and anti-patterns. |
| **hive-test** | Iterative agent testing with session recovery. Execute, analyze, fix, resume from checkpoints. Use when testing an agent, debugging test failures, or verifying fixes without re-running from scratch. |
| **triage-issue-skill** | Specialized skill for triage issue skill workflows. |

## OFFICIAL MCP SERVERS

| Skill Name | What this does |
|---|---|
| **contributor-covenant-code-of-conduct** | Specialized skill for contributor covenant code of conduct workflows. |
| **contributing-to-mcp-servers** | Specialized skill for contributing to mcp servers workflows. |
| **model-context-protocol-servers** | Specialized skill for model context protocol servers workflows. |
| **security-policy** | Specialized skill for security policy workflows. |

## RESEARCH AND CONTENT

| Skill Name | What this does |
|---|---|
| **competitive-ads-extractor** | Extracts and analyzes competitors' ads from ad libraries (Facebook, LinkedIn, etc.) to understand what messaging, problems, and creative approaches are working. Helps inspire and improve your own ad campaigns. |
| **content-research-writer** | Assists in writing high-quality content by conducting research, adding citations, improving hooks, iterating on outlines, and providing real-time feedback on each section. Transforms your writing process from solo effort to collaborative partnership. |
| **lead-research-assistant** | Identifies high-quality leads for your product or service by analyzing your business, searching for target companies, and providing actionable contact strategies. Perfect for sales, business development, and marketing professionals. |
| **meeting-insights-analyzer** | Analyzes meeting transcripts and recordings to uncover behavioral patterns, communication insights, and actionable feedback. Identifies when you avoid conflict, use filler words, dominate conversations, or miss opportunities to listen. Perfect for professionals seeking to improve their communication and leadership skills. |
| **twitter-algorithm-optimizer** | Analyze and optimize tweets for maximum reach using Twitter's open-source algorithm insights. Rewrite and edit user tweets to improve engagement and visibility based on how the recommendation system ranks content. |

