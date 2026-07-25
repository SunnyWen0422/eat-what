# Admin Request Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the mobile admin responsive and informative while ensuring only the newest list or detail request can update the page.

**Architecture:** Add request-version guards and explicit initial/refresh states to the admin page, then clamp backend pages after counting matching users. Existing API routes and page modes remain unchanged.

**Tech Stack:** WeChat Mini Program JavaScript/WXML/WXSS, Node test runner, Spring Boot 2.7, MyBatis, JUnit 5/Mockito.

---

### Task 1: List request sequencing and visible refresh feedback

**Files:**
- Modify: `tests/frontend/admin-page.test.js`
- Modify: `pages/admin/admin.js`
- Modify: `pages/admin/admin.wxml`
- Modify: `pages/admin/admin.wxss`

- [x] Write failing tests with deferred promises proving that a second reset request starts while the first is pending and a stale success cannot overwrite the newest result.
- [x] Run `node --test --test-concurrency=1 tests/frontend/admin-page.test.js` and confirm the second request is currently dropped.
- [x] Add `listRequestVersion`, `listReady`, `refreshing`, and `listNotice`; guard every success, error, and final state write with the request version.
- [x] Keep existing users visible during reset refreshes and render compact “正在更新” and failure notices.
- [x] Add a failing test proving a refresh failure preserves the current list and clears all busy states, then make it pass.

### Task 2: Pagination supersession and detail request sequencing

**Files:**
- Modify: `tests/frontend/admin-page.test.js`
- Modify: `pages/admin/admin.js`
- Modify: `pages/admin/admin.wxml`

- [x] Write a failing test where a pending page-two response arrives after a new search and confirm it must not be appended.
- [x] Make reset requests supersede pending pagination while keeping load-more requests serial.
- [x] Write a failing test where user A resolves after user B and confirm the page must continue showing user B.
- [x] Add `detailRequestVersion`, `detailReady`, `detailRefreshing`, `detailNotice`, and retry tracking for the requested user ID.
- [x] Render non-blocking detail refresh/error feedback while preserving existing details.

### Task 3: Backend page normalization

**Files:**
- Modify: `backend/src/test/java/com/eatwhat/service/AdminUserServiceTest.java`
- Modify: `backend/src/main/java/com/eatwhat/service/AdminUserService.java`

- [x] Write a failing test with `page=Integer.MAX_VALUE`, `pageSize=20`, and `total=21`; expect page 2 and offset 20.
- [x] Run `mvn -q -f backend/pom.xml -Plocal-functional-test "-Dtest=AdminUserServiceTest" test` and confirm the offset/page assertion fails.
- [x] Compute the maximum page from `total` using long arithmetic, clamp the requested page, and calculate the offset only after clamping.
- [x] Re-run the focused Maven test and confirm it passes.

### Task 4: Full verification and documentation

**Files:**
- Modify: `FUNCTION_LIST.md`
- Modify: `DEVELOPER.md`

- [x] Document latest-request-wins behavior and non-blocking refresh feedback.
- [x] Run `npm.cmd run test:frontend` and confirm all frontend tests pass.
- [x] Run `mvn -q -f backend/pom.xml -Plocal-functional-test test` and confirm all backend tests pass.
- [x] Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1` and confirm all checks pass.
- [x] Run `git diff --check` and review the scoped diff.
