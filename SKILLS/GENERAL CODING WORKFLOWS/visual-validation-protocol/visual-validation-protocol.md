# Automated Visual Validation & E2E Testing Protocol

## Objective
To ensure rapid, high-confidence reviews of all Pull Requests that touch the Web UI. We require not just logical test passes (green checkmarks) but **comprehensive visual evidence** of all screens, states, and components in action. This guarantees that UI elements, styling, layout, and component integrations meet our visual standards before any merge.

## Core Requirements

1. **Playwright UI Mode as Standard**
   All projects must utilize Playwright for End-to-End (E2E) testing. The project must have a standard `npm run test:e2e:ui` script configured to launch Playwright's native UI Mode (`playwright test --ui`) so developers can interactively trace, step through, and debug test flows.

2. **Automated Visual Evidence (Screenshots/Traces)**
   Passing tests are not enough. The Playwright configuration must be set up to capture visual evidence of the application in action.
   - **Traces:** Configure Playwright to retain traces on `retain-on-failure` (or `on` for critical PRs) so the entire DOM state and network payload can be replayed.
   - **Screenshots:** Tests must be written to explicitly capture full-page screenshots at key milestones, especially after complex rendering or data loading is complete.

3. **PR Visual Artifact Generation**
   Every PR must generate a structured visual summary.
   - Create an automated script or CI step (e.g., `playwright test --reporter=html`) that outputs the Playwright HTML report.
   - The test suite must include a dedicated "Visual Tour" or "Page Catalog" test spec. This spec will systematically navigate to every major route, open major modals, and interact with complex components (like data grids or forms), taking full-page screenshots of each state.
   - These screenshots should be gathered into a `test-results/visual-validation/` directory.

4. **Visual Validation Review Checklist**
   Before a PR can be merged, the reviewer must examine the generated screenshots and traces to validate:
   - **Layout & Spacing:** No broken grids, overlapping text, or cut-off elements.
   - **Component State:** Buttons, inputs, and dropdowns are correctly styled in their resting, active, and disabled states.
   - **Data Rendering:** Mock data in the UI (tables, charts, lists) fits appropriately without breaking the design.
   - **Responsiveness:** (If applicable) Screenshots captured at desktop and mobile viewports verify responsive breakpoints.

## Implementation Steps for Agents

When spinning up a new project or updating an existing one, agents must:
1. Initialize Playwright: `npm init playwright@latest`
2. Add the UI script: `"test:e2e:ui": "playwright test --ui"`
3. Update `playwright.config.ts` to enable screenshotting (e.g., `screenshot: 'on'` or via explicit `await page.screenshot()`).
4. Create a specific `visual-tour.spec.ts` that iterates through all application routes/pages and captures screenshots for PR review purposes.
5. Ensure CI/CD pipelines upload the HTML report and screenshots as build artifacts so reviewers can download and view them directly from GitHub/GitLab.

## Ongoing Maintenance
As new features, pages, or components are added, the agent must update `visual-tour.spec.ts` to include the new UI surfaces. Visual validation is treated as a first-class citizen alongside unit and integration testing.
