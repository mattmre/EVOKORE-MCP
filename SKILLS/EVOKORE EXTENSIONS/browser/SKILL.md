---
name: browser
description: "Use when automating browser interactions, web scraping, or E2E UI testing using AI-optimized abbreviated selectors and isolated multi-session contexts."
aliases: [browser-automation, web-automation, playwright, puppeteer, e2e]
category: automation
tags: [browser, automation, web-scraping, e2e-testing, multi-session, abbreviated-refs]
archetype: AGT-018
version: 1.0.0
---

# Browser Automation Skill

AI-optimized browser automation using abbreviated element refs (93% context reduction vs verbose XPath/CSS selectors) and isolated multi-session contexts for parallel, side-effect-free flows.

## Trigger

Use this skill when:
- Automating multi-step web UI flows (login, checkout, dashboard drilldowns)
- Scraping structured content from JS-rendered pages
- Running E2E UI tests against a deployed or local web app
- Orchestrating multiple browser tabs or parallel sessions (A/B flows, multi-account checks)
- Capturing screenshots, PDFs, or intercepting network requests as part of a verification pipeline

If the task is a single unauthenticated HTTP GET, prefer a plain `fetch`/`curl`-style tool instead of launching a browser.

## Abbreviated Ref System

Verbose selectors dominate browser-automation context windows. Each `document.querySelector('button[data-testid="submit-btn"]')` burns tokens on every reference. Abbreviated refs replace these with short stable IDs assigned at snapshot time.

### How It Works

At session or page snapshot, the browser tool enumerates interactive elements and returns a mapping table:

| Ref   | Role     | Label / Text      | Selector (internal)                                 |
|-------|----------|-------------------|------------------------------------------------------|
| `#b1` | button   | "Submit"          | `button[data-testid="submit-btn"]`                   |
| `#b2` | button   | "Cancel"          | `button.cancel-btn`                                  |
| `#i1` | input    | "Email"           | `input[name="email"]`                                |
| `#i2` | input    | "Password"        | `input[name="password"]`                             |
| `#a1` | link     | "Forgot password" | `a[href="/reset"]`                                   |

The agent then operates in abbreviated-ref space:

```
click #b1
fill #i1 "user@example.com"
fill #i2 "hunter2"
click #b1
```

Under the hood, the tool resolves `#b1` → real selector and executes. This trades ~100-byte selectors for 3-char refs — a 93% context reduction on typical flows.

### Ref Lifecycle

- **Created** at session init (first page load) and on every explicit `snapshot` call
- **Stable** across calls within the same page
- **Expire** on navigation, page reload, or DOM-mutating events (SPA route changes, modal open/close)
- **Refreshed** by calling `snapshot` again — the tool re-enumerates and returns a fresh map

Treat refs as scoped to the current DOM state. After any navigation or dynamic content load, re-snapshot before acting.

## Multi-Session Isolation

Each browser session gets its own **profile** and **browser context**. Sessions share nothing — no cookies, no localStorage, no sessionStorage, no service workers, no cache.

### Creating Isolated Contexts

```
session_a = browser.launch({ session_id: "login-variant-a" })
session_b = browser.launch({ session_id: "login-variant-b" })
```

Each `session_id` maps to a distinct persistent profile directory under `~/.evokore/browser-profiles/{session_id}/`. Concurrent sessions are safe because they operate on separate Chromium/Playwright contexts.

### What's Isolated

- Cookies (no cross-session auth bleed)
- LocalStorage / SessionStorage / IndexedDB
- HTTP cache
- Service workers
- Granted permissions (geolocation, notifications, clipboard)
- Downloaded files (per-session download dir)

### Use Cases

- **Parallel login testing** — verify two different user roles simultaneously without logging one out
- **A/B flow verification** — hit the same URL with two different cookie states to confirm experiment bucketing
- **Multi-tenant smoke tests** — spin up N sessions for N tenants and assert tenant data isolation
- **Clean-state E2E** — guarantee each test run starts with zero cookies even after a crash

## Common Patterns

### Login Flow

```
browser.launch({ session_id: "acct-1" })
browser.goto("https://app.example.com/login")
browser.snapshot()          # returns ref map
browser.fill("#i1", "user@example.com")
browser.fill("#i2", "hunter2")
browser.click("#b1")        # submit
browser.wait_for("networkidle")
browser.snapshot()          # new refs for logged-in DOM
```

### Form Fill + Submit

```
browser.snapshot()
for field, value in form_data:
    browser.fill(field_ref, value)
browser.click(submit_ref)
browser.wait_for("networkidle")
assert browser.url().endsWith("/success")
```

### Screenshot Capture

```
browser.goto("https://example.com/report")
browser.wait_for("networkidle")
browser.screenshot({ path: "report.png", full_page: true })
```

### Network Request Interception

```
browser.on_request(pattern="**/api/**", handler=lambda req: log(req.url, req.method))
browser.on_response(pattern="**/api/users", handler=lambda res: capture_json(res))
browser.goto("https://app.example.com/dashboard")
```

## Anti-Patterns

- **Verbose selectors in agent output.** Never write `document.querySelector('div.foo > button[data-testid="x"]')` when you have `#b3`. The abbreviated ref exists to stay out of your context window.
- **Shared sessions for concurrent tests.** Reusing one session_id across parallel flows corrupts cookies and causes race conditions. Spawn a new session per concurrent actor.
- **Sleeping instead of waiting for network idle.** `sleep(3)` is brittle and slow. Use `wait_for("networkidle")`, `wait_for_selector(ref)`, or `wait_for_url(pattern)` so the flow adapts to real page timing.
- **Holding refs across navigation.** Refs expire on nav. Calling `click #b1` after a route change will fail or, worse, click the wrong element. Re-snapshot after every navigation.
- **Launching a new browser per step.** Launch once per session; reuse the context across calls. Per-step launches destroy cookies and defeat multi-session isolation.

## Integration with EVOKORE Fleet

Browser sessions are expensive (memory, startup time) and carry isolation requirements — a natural fit for `fleet_spawn` + `claim_acquire`.

### Parallel Browser Agents

Use `fleet_spawn` to run N browser agents concurrently, each with its own `session_id` and its own `claim_acquire` lock on a shared resource (e.g., test user pool, tenant slot).

```
fleet_spawn({
  count: 4,
  task: "browser-login-smoke",
  per_agent_env: { BROWSER_SESSION_ID: "${agent_id}" }
})
```

Each spawned agent:
1. Calls `claim_acquire({ resource: "test-user-pool" })` to reserve a distinct test account
2. Launches `browser.launch({ session_id: process.env.BROWSER_SESSION_ID })`
3. Runs the flow in its isolated context
4. Calls `claim_release` when done

### Why This Pairing Works

- `fleet_spawn` provides the parallelism primitive
- `claim_acquire` prevents two agents from grabbing the same test account or tenant
- Browser per-session isolation prevents cookie/storage bleed between agents
- Together: safe N-way parallel E2E with zero shared state

Check `fleet_status` to monitor running browser agents and `claim_list` to see which resources are held.
