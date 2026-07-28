# Backend Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen the existing Spring Boot/FastAPI backend against the identified security and production risks while preserving current mini-program API contracts.

**Architecture:** Keep Spring Boot as the authenticated business and database-write boundary, keep FastAPI as the AI/RAG process, and keep Nginx as the HTTPS proxy. Add security controls through focused components, configuration-driven policies, Actuator health endpoints, and versioned migration metadata instead of a platform rewrite.

**Tech Stack:** Spring Boot 2.7.14, Java 8 source compatibility, MyBatis, MySQL 8, FastAPI, Nginx, Node test runner, JUnit 5, Pytest.

---

### Task 1: Add failing security regression tests

**Files:**
- Create: `backend/src/test/java/com/eatwhat/security/ProductionHardeningTest.java`
- Modify: `backend/src/test/java/com/eatwhat/interceptor/AuthInterceptorTest.java`
- Modify: `backend/src/test/java/com/eatwhat/controller/ControllerBehaviorTest.java`

- [ ] **Step 1: Write tests for sensitive-log redaction, disabled-user rejection, public-user DTO shape, and rate-limit responses.**
- [ ] **Step 2: Run `mvn -q -f backend/pom.xml -Plocal-functional-test -Dtest=ProductionHardeningTest,AuthInterceptorTest,ControllerBehaviorTest test` and verify the new assertions fail for the current implementation.**
- [ ] **Step 3: Keep the failures focused on the missing behavior, not missing test fixtures.**

### Task 2: Remove sensitive logging and create public user responses

**Files:**
- Modify: `backend/src/main/java/com/eatwhat/util/WeChatUtil.java`
- Create: `backend/src/main/java/com/eatwhat/dto/PublicUserDTO.java`
- Modify: `backend/src/main/java/com/eatwhat/controller/UserController.java`
- Modify: `backend/src/main/java/com/eatwhat/controller/AdminController.java`

- [ ] **Step 1: Replace `System.out` response logging with structured logger fields containing request context and WeChat error code only.**
- [ ] **Step 2: Add `PublicUserDTO.from(User)` that excludes `openId`, `unionId`, and `sessionKey`, while preserving client-facing profile fields.**
- [ ] **Step 3: Return the DTO from login and `/users/info`; keep admin responses on the existing safe summary shape.**
- [ ] **Step 4: Run the focused security tests and confirm they pass.**

### Task 3: Make production secrets fail fast

**Files:**
- Create: `backend/src/main/java/com/eatwhat/config/ProductionSecurityProperties.java`
- Modify: `backend/src/main/java/com/eatwhat/service/TokenService.java`
- Modify: `backend/src/main/resources/application.yml.example`
- Test: `backend/src/test/java/com/eatwhat/service/TokenServiceTest.java`

- [ ] **Step 1: Add a configuration validator that rejects placeholder secrets when the active profile is production.**
- [ ] **Step 2: Remove the fixed TokenService fallback and require a nonblank, minimum-length secret.**
- [ ] **Step 3: Document required environment variables and safe local-test overrides in the example configuration.**
- [ ] **Step 4: Run TokenService and application-context tests.**

### Task 4: Enforce account status and protect AI usage

**Files:**
- Create: `backend/src/main/java/com/eatwhat/service/UserAccessService.java`
- Create: `backend/src/main/java/com/eatwhat/service/RequestRateLimiter.java`
- Create: `backend/src/main/java/com/eatwhat/config/AiProtectionProperties.java`
- Modify: `backend/src/main/java/com/eatwhat/interceptor/AuthInterceptor.java`
- Modify: `backend/src/main/java/com/eatwhat/controller/ChatController.java`
- Modify: `backend/src/main/resources/application.yml.example`
- Test: `backend/src/test/java/com/eatwhat/interceptor/AuthInterceptorTest.java`
- Test: `backend/src/test/java/com/eatwhat/controller/ControllerBehaviorTest.java`

- [ ] **Step 1: Add a mapper query that reads only active status by user ID and reject disabled accounts before the controller.**
- [ ] **Step 2: Add a bounded single-instance token-bucket limiter keyed by authenticated user ID or client IP, with separate anonymous and authenticated limits.**
- [ ] **Step 3: Enforce chat request byte limits and maximum in-flight requests before proxying to FastAPI.**
- [ ] **Step 4: Return HTTP 429 and `Retry-After` without leaking provider details.**
- [ ] **Step 5: Run the focused interceptor/controller suite and a concurrency test.**

### Task 5: Restrict CORS and align proxy methods

**Files:**
- Modify: `backend/src/main/java/com/eatwhat/config/CorsConfig.java`
- Modify: `backend/src/main/resources/application.yml.example`
- Modify: `backend/nginx-chishenme.conf`
- Test: `backend/src/test/java/com/eatwhat/config/CorsConfigTest.java`

- [ ] **Step 1: Read a comma-separated origin allowlist from configuration and reject wildcard origins when credentials are enabled.**
- [ ] **Step 2: Add PATCH to the allowed methods and expose only the headers used by the client.**
- [ ] **Step 3: Update the Nginx template to use a configured allowlist and handle PATCH preflight consistently.**
- [ ] **Step 4: Run configuration tests and a static Nginx configuration inspection.**

### Task 6: Add Actuator health and request observability

**Files:**
- Modify: `backend/pom.xml`
- Create: `backend/src/main/java/com/eatwhat/config/RequestIdFilter.java`
- Create: `backend/src/main/java/com/eatwhat/health/RecommendationHealthIndicator.java`
- Modify: `backend/src/main/resources/application.yml.example`
- Test: `backend/src/test/java/com/eatwhat/health/HealthEndpointTest.java`

- [ ] **Step 1: Add the Actuator dependency and expose health/readiness/liveness/metrics only on the internal interface.**
- [ ] **Step 2: Propagate or generate `X-Request-Id` and include it in error logs and responses.**
- [ ] **Step 3: Add a non-blocking recommendation-service health indicator with a bounded timeout.**
- [ ] **Step 4: Verify database-down and recommendation-down readiness behavior without changing business endpoints.**

### Task 7: Introduce migration safety metadata

**Files:**
- Create: `backend/db/migrations/V1__production_hardening.sql`
- Create: `backend/db/migration-manifest.json`
- Create: `scripts/check_database_migrations.ps1`
- Modify: `SERVER.md`
- Test: `tests/data/test_migration_manifest.py`

- [ ] **Step 1: Add a non-destructive migration table and the schema changes required by this hardening release.**
- [ ] **Step 2: Add a manifest containing version, checksum, target database and rollback notes.**
- [ ] **Step 3: Make the checker reject fixed `USE food`, unguarded `DROP TABLE`, and checksum drift in production migrations.**
- [ ] **Step 4: Run the checker against an isolated MySQL database and rerun it to prove idempotence.**

### Task 8: Complete user custom-dish CRUD and document ownership

**Files:**
- Modify: `backend/src/main/java/com/eatwhat/controller/DishController.java`
- Modify: `backend/src/main/java/com/eatwhat/service/CustomDishService.java`
- Modify: `backend/src/main/java/com/eatwhat/mapper/DishMapper.java`
- Modify: `utils/api.js`
- Test: `backend/src/test/java/com/eatwhat/service/CustomDishServiceTest.java`
- Test: `tests/frontend/api-contract.test.js`

- [ ] **Step 1: Add `PUT /dishes/custom/{id}` and `DELETE /dishes/custom/{id}` with ownership predicates.**
- [ ] **Step 2: Reuse the existing normalization and metadata validation for updates.**
- [ ] **Step 3: Add client wrappers without changing existing create/list behavior.**
- [ ] **Step 4: Run ownership and endpoint-inventory tests.**

### Task 9: Run the complete verification matrix and commit

**Files:**
- Modify only files proven necessary by Tasks 1-8.
- Do not stage `outputs/`, `target/`, `.coverage`, or temporary pytest directories.

- [ ] **Step 1: Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify.ps1`.**
- [ ] **Step 2: Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\test-all.ps1`.**
- [ ] **Step 3: Run targeted security, migration, Java, Python, and frontend tests again after any fixes.**
- [ ] **Step 4: Run `git diff --check` and inspect the staged file list.**
- [ ] **Step 5: Commit the implementation with `refactor: harden backend production boundaries`.**

