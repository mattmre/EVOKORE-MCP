---
name: panel-wiring-ui
description: Expert panel for frontend wiring, UI/UX architecture, component integration, and visual system design
aliases: [ui-panel, wiring-panel, frontend-panel, ux-panel, ui-experts]
category: orchestration
tags: [ui, ux, wiring, frontend, components, design-system, accessibility, integration]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - UI or UX review
  - frontend wiring or integration
  - component architecture review
  - design system assessment
  - visual layout or interaction critique
  - accessibility audit
---

# Wiring & UI Panel

## Purpose

Reviews frontend wiring, UI/UX architecture, component integration patterns, and visual system design. This panel catches issues that backend-focused reviews miss: broken user flows, inaccessible interactions, inconsistent visual language, state management tangles, and wiring that "works" technically but creates UX friction.

Critical for EVOKORE-MCP's growing surface area: dashboard UI, approval flows, session visualization, CLI output formatting, and any future web interfaces.

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Nina Kowalska** | Senior UI/UX Designer | User flows, visual hierarchy, interaction design, cognitive load |
| **Alex Rivera** | Senior Front-End Engineer | Component architecture, state management, render perf, a11y |
| **Dante Moreau** | Design Systems Engineer | Design tokens, component API consistency, theming, reusability |
| **Yuki Hashimoto** | Accessibility Specialist | WCAG compliance, assistive tech, keyboard nav, color contrast |
| **Leo Castellano** | Integration & Wiring Engineer | Data flow, API-to-UI contract, real-time updates, error states |

## Expert Profiles

### Nina Kowalska — Senior UI/UX Designer
- **Years:** 13
- **Background:** UX lead at consumer product companies with 50M+ users. Has redesigned onboarding flows that improved conversion by 40%. Thinks in user journeys, not screens. Obsessive about reducing cognitive load — "every decision you force the user to make is a potential exit point." Has a collection of "I told the engineers this would confuse users" post-launch screenshots.
- **Lens:** User flow completeness, information hierarchy, interaction feedback, error state UX, cognitive load, progressive disclosure, empty states, loading states, edge case screens.
- **Known Biases:** Design-perfection tendency — may push for polish that exceeds the product stage. Sometimes aesthetics compete with information density needs of power users.
- **Challenge Prompt:** "Walk me through the user journey for the most common task. Now show me what happens when they make a mistake at step 3. Is recovery obvious?"

### Alex Rivera — Senior Front-End Engineer
*(Cross-referenced from Code Refinement Panel)*
- **Years:** 14
- **Background:** Built consumer-facing products used by 50M+ users. Deep React/TypeScript expertise. Former accessibility lead. Performance obsessed after mobile-first product launch in emerging markets.
- **Lens:** Component reusability, state management correctness, render performance, accessibility violations, responsive design, bundle size impact.
- **Challenge Prompt:** "Open this in a viewport half the size with JavaScript disabled. What breaks?"

### Dante Moreau — Design Systems Engineer
- **Years:** 11
- **Background:** Built and maintained design systems used by 200+ engineers across 15 product teams. Has seen design systems that succeeded (shared language, faster development) and ones that failed (over-abstracted, never adopted). Believes a design system is a product with engineers as its users. Strong opinions about component API design — "if the prop name isn't obvious from reading it, the component API is wrong."
- **Lens:** Component API consistency, design token usage, theming architecture, component composition patterns, documentation for component consumers, versioning and breaking changes.
- **Known Biases:** System-level thinking can over-constrain individual product needs. May push for reusable abstractions before patterns are proven.
- **Challenge Prompt:** "Use this component with no documentation, just the prop types. Can you build the layout you need? Where do you fight the component instead of using it?"

### Yuki Hashimoto — Accessibility Specialist
- **Years:** 9
- **Background:** Accessibility consultant who has audited 100+ products for WCAG 2.1 AA/AAA compliance. Has tested with real assistive technology users — screen readers, switch access, voice control. Believes accessibility is not a feature; it's a quality bar. Has shut down releases that broke keyboard navigation. "If it doesn't work with a keyboard, it doesn't work."
- **Lens:** WCAG 2.1 AA compliance, screen reader compatibility, keyboard navigation, focus management, color contrast, motion sensitivity, ARIA correctness, semantic HTML, form accessibility.
- **Known Biases:** Accessibility-maximalist — may flag issues that affect extremely small user populations. Every a11y issue feels critical to them regardless of real-world impact.
- **Challenge Prompt:** "Unplug your mouse. Now complete the primary task using only a keyboard. Tab through every interactive element. Is the focus order logical? Can you always see where focus is?"

### Leo Castellano — Integration & Wiring Engineer
- **Years:** 12
- **Background:** Specialist in the plumbing between backends and frontends. Has wired up real-time dashboards, WebSocket-driven UIs, and complex form-to-API data flows. Expert in the failure modes that live in the gap between "the API works" and "the UI shows the right thing." Has debugged more "the data was there but the UI didn't update" bugs than he can count.
- **Lens:** API-to-UI data contracts, real-time update correctness, optimistic UI patterns, error propagation from API to user, loading/skeleton states, race conditions in async UI, WebSocket reconnection, cache coherence between client and server.
- **Known Biases:** Over-engineers resilience for internal tools that don't need it. Sees race conditions everywhere (sometimes correctly).
- **Challenge Prompt:** "The API returns an error after the UI has already optimistically updated. What does the user see? Now the WebSocket disconnects for 30 seconds. What happens to the display?"

## When to Invoke

- Dashboard or web UI development/review
- Component library design or changes
- CLI output formatting and interaction design
- Approval flow UI/UX (HITL interfaces)
- Session replay/evidence viewer design
- Real-time data display (WebSocket, SSE, streaming)
- Any user-facing surface area changes

## Review Protocol

### Step 1: CONVENE

| Artifact Type | Active Experts |
|---|---|
| Full UI feature | All 5 |
| Component library/design system | Dante, Alex, Yuki |
| Dashboard/data display | Leo, Nina, Alex |
| Form/input flow | Nina, Yuki, Leo |
| CLI output/terminal UI | Nina, Alex, Leo |
| Accessibility audit | Yuki, Alex, Nina |
| API-to-UI wiring | Leo, Alex, Dante |

### Step 2: BRIEF
```
## Wiring & UI Review Target
- **Surface:** [dashboard / component / form / CLI / approval flow]
- **User:** [who uses this? technical level? context of use?]
- **Data Sources:** [what APIs/WebSockets/state feeds this UI?]
- **Key Interactions:** [primary user tasks]
- **Known Issues:** [reported UX problems, a11y gaps]
- **Constraints:** [browser support, bundle budget, framework limits]
```

### Step 3: SOLO — Independent Expert Reviews

**Nina Kowalska reviews:**
- User flow completeness — happy path AND error/edge paths
- Information hierarchy — is the most important thing most visible?
- Interaction feedback — does the UI confirm every user action?
- Empty states — what does the user see before data exists?
- Loading states — what happens during slow operations?
- Error states — are errors recoverable from the UI?
- Cognitive load — how many decisions per screen?
- "Show me the 'nothing has happened yet' state. Now show me the 'everything went wrong' state."

**Alex Rivera reviews:**
- Component architecture — composable, testable, reusable?
- State management — unnecessary re-renders, stale closures, prop drilling?
- Render performance — virtualization for lists, memoization, lazy loading?
- Bundle impact — is this adding weight disproportionate to its value?
- Responsive behavior — does this work on all target viewports?
- "Profile the render cycle. What's re-rendering that shouldn't be?"

**Dante Moreau reviews:**
- Design token usage — hardcoded values vs tokens?
- Component API clarity — prop names, required vs optional, defaults
- Composition patterns — slot/children patterns vs configuration props
- Theming — does this respect the theming system?
- Documentation — can another developer use this component correctly?
- "Read the component's type signature. Can you use it correctly without reading the implementation?"

**Yuki Hashimoto reviews:**
- Keyboard navigation — tab order, focus trapping in modals, skip links
- Screen reader — ARIA labels, live regions, role attributes, heading hierarchy
- Color contrast — meets WCAG AA minimum (4.5:1 text, 3:1 UI)
- Motion — respects prefers-reduced-motion? Essential animations only?
- Form accessibility — labels, error association, required field indication
- "Navigate this entire interface with VoiceOver/NVDA. What's announced? What's missing?"

**Leo Castellano reviews:**
- Data contract — does the UI expect data shapes the API actually provides?
- Real-time updates — WebSocket/SSE reconnection, missed message recovery
- Optimistic UI — what happens when optimistic updates are rolled back?
- Error propagation — do API errors reach the user in understandable form?
- Race conditions — concurrent requests, out-of-order responses
- Stale data — what's the cache strategy? How does the user know data is fresh?
- "Simulate 2 seconds of network latency on every request. Does the UI still feel usable?"

### Step 4: CHALLENGE

1. **Nina vs Dante:** "This needs a custom component" vs "Use the existing design system component"
2. **Yuki vs Nina:** "This interaction needs to be keyboard-accessible" vs "The visual design doesn't accommodate focus indicators"
3. **Leo vs Alex:** "We need a WebSocket for real-time updates" vs "Polling is simpler and good enough"
4. **Dante vs Alex:** "This component API should be simple" vs "Simple API means complex workarounds for edge cases"
5. **Yuki vs Leo:** "Screen readers need these ARIA live regions" vs "Live regions cause excessive announcements during rapid updates"

### Step 5: CONVERGE

```markdown
## Wiring & UI Panel Report

### UI/UX Verdict: [SHIP / NEEDS WORK / REDESIGN]

### User Flow Issues
1. [Broken/confusing flow] — affected users: [who], fix: [approach]

### Accessibility Violations
| Issue | WCAG Criterion | Severity | Fix |
|---|---|---|---|
| [issue] | [criterion] | [critical/major/minor] | [approach] |

### Wiring Issues
1. [Data flow problem] — symptom: [what user sees], cause: [technical], fix: [approach]

### Component Architecture Findings
1. [Finding] — impact: [reusability/performance/maintainability]

### Design System Alignment
- Tokens used correctly: [Y/N with details]
- New patterns introduced: [list — do they belong in the system?]

### Performance Concerns
1. [Issue] — impact: [render time/bundle size/memory]
```

## EVOKORE-Specific UI Checklist

- [ ] Dashboard (`scripts/dashboard.js`) approval flow is keyboard-navigable
- [ ] WebSocket approval transport handles reconnection gracefully in UI
- [ ] Session replay viewer handles large JSONL files without freezing
- [ ] Evidence viewer presents structured data with clear hierarchy
- [ ] CLI status output (`scripts/status.js`) is scannable in under 5 seconds
- [ ] HITL approval prompts show enough context for informed decisions
- [ ] Dashboard auth prevents unauthorized session viewing
