# EatWhat Architecture Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unsupported frontend features and establish testable frontend, Java, and AI service boundaries for the existing product.

**Architecture:** Keep the Java modular monolith and separate Python AI process. Make Java the owner of database writes, place recommendation orchestration outside Mini Program pages, and verify endpoint families against controller routes.

**Tech Stack:** WeChat Mini Program JavaScript, Node test runner, Spring Boot 2.7, MyBatis, JUnit 5, FastAPI, pytest.

---

### Task 1: Lock the frontend contract

**Files:**
- Modify: `tests/frontend/frontend.test.js`
- Modify: `tests/frontend/page-contracts.test.js`

- [ ] Add a failing test that requires `utils/api.js` to use `utils/config.js` as its only base URL source.
- [ ] Add a failing test that rejects API endpoint families without a Java controller.
- [ ] Add a failing test that requires the shopping-list route and source directory to be absent.
- [ ] Run `npm run test:frontend` and verify the new tests fail for those reasons.

### Task 2: Remove unsupported frontend capabilities

**Files:**
- Modify: `app.json`
- Modify: `utils/api.js`
- Modify: `utils/config.js`
- Modify: `tests/frontend/wechat-runtime.js`
- Modify: `pages/about/about.wxml`
- Delete: `pages/shopping-list/shopping-list.js`
- Delete: `pages/shopping-list/shopping-list.json`
- Delete: `pages/shopping-list/shopping-list.wxml`
- Delete: `pages/shopping-list/shopping-list.wxss`
- Modify: `README.md`
- Modify: `FUNCTION_LIST.md`
- Modify: `DEVELOPER.md`

- [ ] Remove the unsupported page, wrappers, and documentation claims.
- [ ] Resolve the API root at request time through `config.getApiBaseUrl()`.
- [ ] Run `npm run test:frontend` and verify contract tests pass.

### Task 3: Extract recommendation orchestration

**Files:**
- Create: `utils/recommendation-flow.js`
- Create: `tests/frontend/recommendation-flow.test.js`
- Modify: `pages/result/result.js`

- [ ] Write failing tests for backend normalization, cache-first generation, backend-first generation, and local fallback.
- [ ] Run the focused Node test and verify the missing module failure.
- [ ] Implement the flow module and replace duplicated Page logic.
- [ ] Run all frontend tests.

### Task 4: Split Java dish responsibilities

**Files:**
- Create: `backend/src/main/java/com/eatwhat/service/DishQueryService.java`
- Create: `backend/src/main/java/com/eatwhat/service/CustomDishService.java`
- Create: `backend/src/main/java/com/eatwhat/service/RecommendationService.java`
- Delete: `backend/src/main/java/com/eatwhat/service/DishService.java`
- Create: `backend/src/test/java/com/eatwhat/service/DishQueryServiceTest.java`
- Create: `backend/src/test/java/com/eatwhat/service/CustomDishServiceTest.java`
- Create: `backend/src/test/java/com/eatwhat/service/RecommendationServiceTest.java`
- Modify: Java controllers and dependent services/tests.

- [ ] Write tests against the three desired service APIs and verify compilation fails because they do not exist.
- [ ] Move each method to its owning service with constructor injection.
- [ ] Replace public-pool asynchronous mapper calls with bounded in-thread queries.
- [ ] Update controllers and services, delete the old service, and run all JUnit tests.

### Task 5: Make Java own AI-triggered writes

**Files:**
- Modify: `recommend-service/chat_handler.py`
- Modify: `recommend-service/main.py`
- Modify: Python tests.
- Create: `backend/src/main/java/com/eatwhat/service/AiChatGateway.java`
- Create: `backend/src/main/java/com/eatwhat/service/ChatApplicationService.java`
- Modify: `backend/src/main/java/com/eatwhat/controller/ChatController.java`
- Modify: backend configuration and JUnit tests.

- [ ] Write a failing Python test requiring a structured save action and no DB write.
- [ ] Write a failing JUnit test requiring authenticated Java ownership of the save action.
- [ ] Implement the Python action and Java application service/gateway.
- [ ] Run Python and Java suites.

### Task 6: Stabilize authentication and admin authorization

**Files:**
- Create: `backend/src/main/java/com/eatwhat/service/TokenService.java`
- Create: `backend/src/main/java/com/eatwhat/service/AdminAuthorizationService.java`
- Delete: `backend/src/main/java/com/eatwhat/util/TokenUtil.java`
- Modify: `backend/src/main/java/com/eatwhat/interceptor/AuthInterceptor.java`
- Modify: `backend/src/main/java/com/eatwhat/controller/UserController.java`
- Modify: `backend/src/main/java/com/eatwhat/controller/AdminController.java`
- Modify: `pages/profile/profile.js`
- Modify: backend and frontend tests.

- [ ] Write failing tests for cross-instance token validation, expiry, tampering, admin allowlisting, and frontend admin-route gating.
- [ ] Implement HMAC signed tokens and configured admin IDs.
- [ ] Move user identity consumption behind the interceptor and guard all admin controller methods.
- [ ] Run frontend and Java tests.

### Task 7: Full verification and audit

**Files:**
- Modify: `docs/testing/full-functional-test-matrix.md`
- Modify: `outputs/test-report/full-functional-test-report.md`

- [ ] Run `powershell -ExecutionPolicy Bypass -File .\scripts\test-all.ps1`.
- [ ] Run `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1`.
- [ ] Search for removed routes, direct Python writes, obsolete `DishService` references, and hardcoded chat service URLs.
- [ ] Update the reports with current route/page counts and architecture assertions.
