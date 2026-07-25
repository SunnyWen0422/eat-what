# Mobile Admin User Dishes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the hidden Mini Program admin area into a mobile-safe user search, detail, and user-owned dish creation workflow.

**Architecture:** Add a typed admin user service and mapper-level paginated aggregate query, keep authorization in the controller boundary, and reuse `CustomDishService` for ownership-safe creation and deletion. Replace the centered admin modal with page states and a full-screen form backed by explicit admin API helpers.

**Tech Stack:** WeChat Mini Program JavaScript/WXML/WXSS, Spring Boot 2.7, MyBatis annotations, JUnit 5/Mockito, Node test runner.

---

### Task 1: Typed paginated admin users

**Files:**
- Create: `backend/src/main/java/com/eatwhat/dto/AdminUserSummaryDTO.java`
- Create: `backend/src/main/java/com/eatwhat/dto/AdminUserPageDTO.java`
- Create: `backend/src/main/java/com/eatwhat/service/AdminUserService.java`
- Modify: `backend/src/main/java/com/eatwhat/mapper/UserMapper.java`
- Modify: `backend/src/main/java/com/eatwhat/controller/AdminController.java`
- Test: `backend/src/test/java/com/eatwhat/service/AdminUserServiceTest.java`
- Test: `backend/src/test/java/com/eatwhat/controller/ControllerBehaviorTest.java`

- [x] Write failing tests proving page normalization, keyword search delegation, typed response fields and target-user 404 behavior.
- [x] Run `mvn -q -f backend/pom.xml -Plocal-functional-test -Dtest=AdminUserServiceTest,ControllerBehaviorTest test` and confirm the new tests fail because the service and endpoint contract do not exist.
- [x] Add mapper queries that return one row per user with `COUNT(food.id)` and a separate total count.
- [x] Implement `AdminUserService.listUsers(keyword,page,pageSize)` with page size capped at 50 and `findUser(id)`.
- [x] Update `AdminController` to return `data`, `list`, `page`, `pageSize`, and `total`, and to reject a missing target user before dish creation.
- [x] Re-run the focused Maven tests and confirm they pass.

### Task 2: Ownership-safe custom dishes

**Files:**
- Modify: `backend/src/main/java/com/eatwhat/mapper/DishMapper.java`
- Modify: `backend/src/main/java/com/eatwhat/service/CustomDishService.java`
- Test: `backend/src/test/java/com/eatwhat/service/CustomDishServiceTest.java`

- [x] Write failing tests for unsupported type, required details, overlong values, whitespace normalization and physical deletion restricted by `userId + dishId`.
- [x] Run `mvn -q -f backend/pom.xml -Plocal-functional-test -Dtest=CustomDishServiceTest test` and confirm the deletion test fails against `clearCustomDishOwner`.
- [x] Replace owner clearing with `DELETE FROM food WHERE id=? AND user_id=? AND is_custom=1`.
- [x] Normalize and validate `name`, `type`, `cl`, `step`, optional cuisine/tags and `cookMinutes` before insert.
- [x] Re-run the focused service test and confirm it passes.

### Task 3: Admin API helpers and page behavior

**Files:**
- Modify: `utils/api.js`
- Rewrite: `pages/admin/admin.js`
- Test: `tests/frontend/admin-page.test.js`
- Test: `tests/frontend/wechat-runtime.js`

- [x] Write failing Node tests for user search, paging, pull-down refresh, selecting a user, form validation, metadata payload and duplicate-submit prevention.
- [x] Run `node --test --test-concurrency=1 tests/frontend/admin-page.test.js` and confirm failures reference missing admin helpers and handlers.
- [x] Add `getAdminUsers`, `getAdminUser`, `createAdminUserDish`, and `deleteAdminUserDish` API helpers.
- [x] Implement explicit list/detail/form page modes, metadata loading, form normalization and guarded save/delete handlers.
- [x] Re-run the focused Node tests and confirm they pass.

### Task 4: Mobile-safe templates and styles

**Files:**
- Rewrite: `pages/admin/admin.wxml`
- Rewrite: `pages/admin/admin.wxss`
- Modify: `pages/admin/admin.json`
- Test: `tests/frontend/admin-page.test.js`

- [x] Add failing structure assertions for search input, loading/empty/error states, full-screen form, 88rpx touch targets, sticky action bar and safe-area padding.
- [x] Run the focused Node test and confirm the contract assertions fail against the old centered modal.
- [x] Build the list, detail and form templates without nested cards or fixed-width controls.
- [x] Add responsive `rpx` sizing, text wrapping, keyboard-safe page scrolling and `env(safe-area-inset-bottom)` padding.
- [x] Enable pull-down refresh in page JSON and re-run the focused test.

### Task 5: Documentation and full verification

**Files:**
- Modify: `DEVELOPER.md`
- Modify: `FUNCTION_LIST.md`

- [x] Document the query parameters and typed admin response while keeping the five-tap access rule explicit.
- [x] Run `npm run test:frontend` and confirm all frontend tests pass.
- [x] Run `mvn -q -f backend/pom.xml -Plocal-functional-test test` and confirm all backend tests pass.
- [x] Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1`; if an inaccessible generated cache blocks recursive enumeration, run the equivalent targeted JSON/JS/Java checks and record the exact limitation.
- [x] Run `git diff --check` and inspect the final diff for unrelated or destructive changes.
