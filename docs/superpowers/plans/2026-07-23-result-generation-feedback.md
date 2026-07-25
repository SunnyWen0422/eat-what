# Result Generation Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep recommendation results visible during regeneration and guarantee that every generation attempt ends with accurate progress, success, fallback, empty, or failure feedback.

**Architecture:** Manage generation state entirely in `pages/result/result.js` with a request version, staged timers, duplicate-submit guard, and an eight-second page timeout. Keep `utils/recommendation-flow.js` unchanged and render initial versus non-blocking refresh states separately.

**Tech Stack:** WeChat Mini Program JavaScript/WXML/WXSS, Node test runner.

---

### Task 1: Initial generation stages and hard timeout

**Files:**
- Create: `tests/frontend/result-generation-experience.test.js`
- Modify: `pages/result/result.js`
- Modify: `pages/result/result.wxml`
- Modify: `pages/result/result.wxss`

- [x] Add deferred-promise tests asserting the initial state uses `loading`, exposes a stage message, and clears all busy flags after a configurable hard timeout.
- [x] Run `node --test --test-concurrency=1 tests/frontend/result-generation-experience.test.js` and confirm the stage/timeout assertions fail.
- [x] Add `refreshing`, `loadingStage`, `generationNotice`, `generationVersion`, `generationInFlight`, timer cleanup, and configurable 800/2500/8000 ms delays.
- [x] Race the complete recommendation call against the page timeout and route first-load timeout to the existing empty/retry state.
- [x] Render the stage text inside the initial skeleton and re-run the focused tests.

### Task 2: Preserve plans during regeneration

**Files:**
- Modify: `tests/frontend/result-generation-experience.test.js`
- Modify: `pages/result/result.js`
- Modify: `pages/result/result.wxml`
- Modify: `pages/result/result.wxss`

- [x] Add a failing test proving `plans` remain unchanged and `loading=false, refreshing=true` while regeneration is pending.
- [x] Add a failing test proving a second regenerate action does not call the recommendation flow twice.
- [x] Split first-load and refresh writes, keep current plans visible, and give the regenerate button a busy/disabled state.
- [x] Add failing tests for refresh failure and empty refresh; both must preserve old plans and set a “仍显示上次方案” notice.
- [x] Implement the non-blocking banner and make all focused tests pass.

### Task 3: Ignore stale results and report fallback source

**Files:**
- Modify: `tests/frontend/result-generation-experience.test.js`
- Modify: `pages/result/result.js`

- [x] Add stale-response tests covering page unload and delayed favorite lookup after a newer recommendation.
- [x] Check the captured generation version before every success, empty, failure, favorite-status, and final state write.
- [x] Add tests for `source=cache` and `source=local` notices, then map each source to the approved user-facing message.
- [x] Clear timers and invalidate the generation version in `onUnload`.
- [x] Re-run the focused test file and confirm all scenarios pass.

### Task 4: Documentation and full verification

**Files:**
- Modify: `FUNCTION_LIST.md`
- Modify: `DEVELOPER.md`

- [x] Document the result-page timeout, preserved-results refresh and stale-response rule.
- [x] Run `npm.cmd run test:frontend` and confirm all frontend tests pass.
- [x] Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1` and confirm all repository checks pass.
- [x] Run `git diff --check` and inspect the scoped changes.
