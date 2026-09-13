# Complete Admin Console Implementation Plan

> **For agentic workers:** Execute this plan inline in the current session with verification after each task. Do not run production migrations or deployment commands.

**Goal:** Split the existing administrator screen into a complete dashboard, user-management, dish-management, and audit-log workbench with server-enforced authorization and non-destructive data operations.

**Architecture:** Spring Boot remains the only administrator authorization and database-write boundary. A versioned MySQL migration adds publication state and audit storage. The mini-program adds separate admin pages that consume paged APIs and preserve visible data during refresh failures.

**Tech Stack:** Spring Boot 2.7, MyBatis annotations, MySQL 8, WeChat Mini Program pages, Node test runner, Maven/JUnit, isolated MySQL migration tests.

---

### Task 1: Lock API contracts with failing tests

**Files:**
- Create: `backend/src/test/java/com/eatwhat/controller/AdminConsoleContractTest.java`
- Create: `backend/src/test/java/com/eatwhat/service/AdminAuditServiceTest.java`
- Modify: `tests/frontend/admin-console-contract.test.js`

- [ ] **Step 1: Add backend contract tests** for overview, user status, dish pagination, publication status, custom dish update, and audit endpoints using reflection and direct controller calls.
- [ ] **Step 2: Add service tests** proving audit records contain the authenticated admin ID, target IDs, action, result, and request ID, while sensitive request fields are excluded.
- [ ] **Step 3: Add frontend contract tests** asserting `app.json` registers `admin-dashboard`, `admin-users`, `admin-user-detail`, `admin-dishes`, and `admin-audit`, and `utils/api.js` exports every documented wrapper.
- [ ] **Step 4: Run the focused tests** with `mvn -q -f backend\pom.xml -Plocal-functional-test '-Dtest=AdminConsoleContractTest,AdminAuditServiceTest' test` and `node --test tests/frontend/admin-console-contract.test.js`; confirm failures are caused by missing contracts.

### Task 2: Add the V2 migration and manifest validation

**Files:**
- Create: `backend/db/migrations/V2__admin_console.sql`
- Modify: `backend/db/migration-manifest.json`
- Modify: `scripts/check_database_migrations.ps1`
- Modify: `tests/data/test_migration_manifest.py`
- Modify: `SERVER.md`

- [ ] **Step 1: Create an idempotent migration** that adds `food.is_published` with default `1`, creates `admin_audit_log`, and adds indexes for audit filtering.
- [ ] **Step 2: Ensure the migration has no fixed `USE food`, `DROP TABLE`, or `TRUNCATE TABLE`, and records a deterministic migration fingerprint in `schema_migrations`.
- [ ] **Step 3: Add the V2 file checksum and rollback note to the manifest.
- [ ] **Step 4: Extend the Python manifest test** to validate both V1 and V2 checksums and dangerous SQL rules.
- [ ] **Step 5: Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check_database_migrations.ps1` and `& .\.test-venv\Scripts\python.exe -m pytest -q tests\data\test_migration_manifest.py`; both must pass.

### Task 3: Implement audit storage and shared recording

**Files:**
- Create: `backend/src/main/java/com/eatwhat/entity/AdminAuditLog.java`
- Create: `backend/src/main/java/com/eatwhat/dto/AdminAuditLogDTO.java`
- Create: `backend/src/main/java/com/eatwhat/mapper/AdminAuditLogMapper.java`
- Create: `backend/src/main/java/com/eatwhat/service/AdminAuditService.java`
- Create: `backend/src/main/java/com/eatwhat/dto/AdminAuditPageDTO.java`
- Modify: `backend/src/main/resources/application.yml.example`

- [ ] **Step 1: Define the audit entity and DTO** with IDs, action, result, safe detail JSON, request ID, and timestamps.
- [ ] **Step 2: Add mapper insert and paged search methods** using optional admin/target/action/date predicates and deterministic `created_at DESC, id DESC` ordering.
- [ ] **Step 3: Add `AdminAuditService.record(...)`** that normalizes detail keys to an allowlist and never accepts token, session key, openId, unionId, or raw request body fields.
- [ ] **Step 4: Add `AdminAuditService.search(...)`** with bounded page size `1..50` and normalized date filters.
- [ ] **Step 5: Add focused tests** for allowlisted details, pagination bounds, and request ID propagation.

### Task 4: Implement overview and user status management

**Files:**
- Create: `backend/src/main/java/com/eatwhat/dto/AdminOverviewDTO.java`
- Create: `backend/src/main/java/com/eatwhat/mapper/AdminOverviewMapper.java`
- Create: `backend/src/main/java/com/eatwhat/service/AdminOverviewService.java`
- Modify: `backend/src/main/java/com/eatwhat/controller/AdminController.java`
- Modify: `backend/src/main/java/com/eatwhat/mapper/UserMapper.java`
- Modify: `backend/src/main/java/com/eatwhat/service/AdminUserService.java`
- Modify: `backend/src/main/resources/application.yml.example`

- [ ] **Step 1: Add aggregate queries** for total users, active users, disabled users, system dishes, custom dishes, today’s new users, and today’s new custom dishes.
- [ ] **Step 2: Add `PATCH /admin/users/{id}/status`** with `status` validation, target existence checks, idempotent `409` behavior, and audit recording.
- [ ] **Step 3: Make the status update atomic** with `WHERE id = #{id} AND status <> #{status}` and return the safe updated user DTO.
- [ ] **Step 4: Add `GET /admin/overview`** returning aggregate values plus the latest five audit rows.
- [ ] **Step 5: Add Java tests** for non-admin rejection, missing users, repeated status updates, and accurate aggregates.

### Task 5: Implement administrator dish management

**Files:**
- Create: `backend/src/main/java/com/eatwhat/dto/AdminDishPageDTO.java`
- Create: `backend/src/main/java/com/eatwhat/service/AdminDishService.java`
- Modify: `backend/src/main/java/com/eatwhat/mapper/DishMapper.java`
- Modify: `backend/src/main/java/com/eatwhat/controller/AdminController.java`
- Modify: `backend/src/main/java/com/eatwhat/service/CustomDishService.java`
- Modify: `backend/src/main/java/com/eatwhat/mapper/DishMapper.java`
- Modify: `recommend-service/db.py`
- Modify: `recommend-service/rag.py`

- [ ] **Step 1: Add paged admin dish queries** for `scope=system|custom`, keyword, type, publication status, and owner ID without applying the public `is_published` filter.
- [ ] **Step 2: Add safe system dish edit and publication status methods** constrained by `user_id IS NULL`.
- [ ] **Step 3: Reuse custom dish normalization for administrator custom dish updates** constrained by both owner and dish ID.
- [ ] **Step 4: Add `GET /admin/dishes`, `GET /admin/dishes/{id}`, `PUT /admin/dishes/{id}`, `PATCH /admin/dishes/{id}/status`, `PUT /admin/users/{userId}/dishes/{dishId}`, and `DELETE /admin/users/{userId}/dishes/{dishId}`.
- [ ] **Step 5: Record every successful and rejected write action in the audit service.
- [ ] **Step 6: Update Java and FastAPI public recommendation queries** to filter `COALESCE(is_published, 1) = 1` for system dishes while retaining admin visibility of unpublished rows.
- [ ] **Step 7: Add ownership, soft-unpublish, restore, and recommendation-filter tests.

### Task 6: Add the four frontend administrator workspaces

**Files:**
- Create: `pages/admin-dashboard/admin-dashboard.js`
- Create: `pages/admin-dashboard/admin-dashboard.wxml`
- Create: `pages/admin-dashboard/admin-dashboard.wxss`
- Create: `pages/admin-dashboard/admin-dashboard.json`
- Create: `pages/admin-users/admin-users.js`
- Create: `pages/admin-users/admin-users.wxml`
- Create: `pages/admin-users/admin-users.wxss`
- Create: `pages/admin-users/admin-users.json`
- Create: `pages/admin-user-detail/admin-user-detail.js`
- Create: `pages/admin-user-detail/admin-user-detail.wxml`
- Create: `pages/admin-user-detail/admin-user-detail.wxss`
- Create: `pages/admin-user-detail/admin-user-detail.json`
- Create: `pages/admin-dishes/admin-dishes.js`
- Create: `pages/admin-dishes/admin-dishes.wxml`
- Create: `pages/admin-dishes/admin-dishes.wxss`
- Create: `pages/admin-dishes/admin-dishes.json`
- Create: `pages/admin-audit/admin-audit.js`
- Create: `pages/admin-audit/admin-audit.wxml`
- Create: `pages/admin-audit/admin-audit.wxss`
- Create: `pages/admin-audit/admin-audit.json`
- Modify: `app.json`
- Modify: `pages/profile/profile.js`
- Modify: `utils/api.js`

- [ ] **Step 1: Add API wrappers** for overview, status, admin dish list/detail/update/publish, admin custom dish update/delete, and audit logs.
- [ ] **Step 2: Add shared admin navigation** with clear active state and route parameters.
- [ ] **Step 3: Implement dashboard** with skeleton loading, aggregate cards, recent audit list, and retry feedback.
- [ ] **Step 4: Implement users workspace** with search, status filter, pagination, refresh, and status confirmation.
- [ ] **Step 5: Implement user detail workspace** with safe profile data, custom dish list, add/edit/delete actions, and stale-response guards.
- [ ] **Step 6: Implement dishes workspace** with system/custom segmented views, filters, edit form, publication toggle, and no physical system-dish delete.
- [ ] **Step 7: Implement audit workspace** with action/object/date filters, pagination, and preserved old rows on refresh failure.
- [ ] **Step 8: Update the profile admin entry** to navigate to `admin-dashboard` while keeping the existing five-tap behavior.
- [ ] **Step 9: Add frontend tests** for routing, filtering, status changes, dish edits, soft publish, audit pagination, loading states, and duplicate action guards.

### Task 7: Full verification and commit

**Files:**
- Modify only files proven necessary by Tasks 1-6.
- Do not stage `outputs/`, `target/`, `.coverage`, or temporary pytest directories.

- [ ] **Step 1: Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1`.
- [ ] **Step 2: Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-all.ps1`.
- [ ] **Step 3: Run focused admin, migration, and frontend tests again.
- [ ] **Step 4: Run `git diff --cached --check` and inspect staged file names.
- [ ] **Step 5: Commit with `feat: complete administrator console`.
