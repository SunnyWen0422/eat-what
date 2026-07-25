# 推荐筛选、菜系标签与偏好设置 Implementation Plan

## Implementation Status

Functional implementation completed locally on 2026-07-23 against the 6,665-dish offline baseline. The task checkboxes below preserve the original execution plan; verification evidence is maintained in `docs/testing/full-functional-test-matrix.md` and `outputs/test-report/full-functional-test-report.md`. No production deployment, production migration, commit, or push was performed.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可持久化、可筛选、可解释的推荐偏好闭环，让首页快捷标签、菜系/标签筛选和长期偏好真实影响 Java 后端推荐。

**Architecture:** Java 后端负责元数据目录、偏好持久化、硬条件过滤和软偏好评分；小程序负责本次筛选交互及离线缓存；现有中文 `tags` 保留展示，新增规范代码字段用于稳定匹配。推荐改为后端优先、本地失败降级，生产数据库迁移保留为单独授权步骤。

**Data Baseline:** 只使用 `outputs/dish-replacement-20260718/food_import.csv` 的 6,665 条离线数据开发和验证，不连接线上数据库。

**Tech Stack:** WeChat Mini Program JavaScript, Node test runner, Spring Boot 2.7, MyBatis, MySQL 8.0 JSON, JUnit 5, Python data scripts, pytest, PowerShell verification.

**Design:** `docs/superpowers/specs/2026-07-22-recommendation-filtering-preferences-design.md`

---

## File Map

**Metadata and data pipeline**

- Create: `backend/src/main/resources/recommendation-metadata.json` - canonical cuisine/tag catalog.
- Create: `backend/recommendation_preferences_schema.sql` - idempotent schema migration.
- Create: `scripts/backfill_recommendation_metadata.py` - derive canonical codes and emit audit/SQL.
- Create: `tests/data/test_recommendation_metadata.py` - vocabulary and coverage tests.
- Modify: `scripts/replace_dish_data.py` - emit metadata fields for future imports.
- Modify: `create_table.sql` and `backend/ensure_food_import_schema.sql` - new columns/table/indexes.

**Java backend**

- Create: `backend/src/main/java/com/eatwhat/dto/RecommendationCriteria.java`.
- Create: `backend/src/main/java/com/eatwhat/dto/UserPreferenceDTO.java`.
- Create: `backend/src/main/java/com/eatwhat/dto/RecommendationOptionsDTO.java`.
- Create: `backend/src/main/java/com/eatwhat/entity/UserPreference.java`.
- Create: `backend/src/main/java/com/eatwhat/mapper/UserPreferenceMapper.java`.
- Create: `backend/src/main/java/com/eatwhat/service/RecommendationMetadataService.java`.
- Create: `backend/src/main/java/com/eatwhat/service/UserPreferenceService.java`.
- Create: `backend/src/main/java/com/eatwhat/service/RecommendationCriteriaResolver.java`.
- Create: `backend/src/main/java/com/eatwhat/service/DishCandidateQueryService.java`.
- Create: `backend/src/main/java/com/eatwhat/service/RecommendationScorer.java`.
- Create: `backend/src/main/java/com/eatwhat/service/RecentDishService.java`.
- Modify: `RecommendRequest`, `RecommendationService`, `RecommendController`, `Dish`, `DishMapper`, `DishQueryService`, `DishController`, `UserController`, `CustomDishService`.

**Mini Program**

- Create: `utils/recommendation-criteria.js` - criteria normalization and session/default merge.
- Create: `utils/preference-store.js` - backend synchronization and user-isolated cache.
- Create: `pages/recommend-filter/recommend-filter.js/json/wxml/wxss`.
- Modify: `app.json`, `utils/api.js`, `utils/recommendation-flow.js`, `utils/recommend.js`.
- Modify: `pages/index/*`, `pages/settings/*`, `pages/profile/profile.js`, `pages/customize/*`, `pages/result/*`.

**Tests and documentation**

- Create: focused frontend and JUnit test files listed in the tasks below.
- Modify: `tests/frontend/page-contracts.test.js`, `tests/frontend/frontend.test.js`, `scripts/test-all.ps1`, `DEVELOPER.md`, `FUNCTION_LIST.md`, `SERVER.md`.

---

### Task 1: Lock the product semantics with failing tests

**Files:**

- Create: `tests/frontend/recommendation-criteria.test.js`
- Create: `tests/frontend/preference-store.test.js`
- Modify: `tests/frontend/page-contracts.test.js`
- Create: `backend/src/test/java/com/eatwhat/service/RecommendationCriteriaResolverTest.java`
- Create: `backend/src/test/java/com/eatwhat/service/RecommendationScorerTest.java`

- [ ] Add a frontend test proving a selected quick tag becomes `criteria.includeTagCodes` in the recommendation request.
- [ ] Add a frontend test proving session criteria do not overwrite saved defaults.
- [ ] Add a contract test requiring the new filter page to be registered and all handlers to resolve.
- [ ] Add a Java test proving permanent exclusions and session exclusions are merged as a union.
- [ ] Add a Java test proving session max cook time uses the stricter value.
- [ ] Add a scorer test with fixed candidates asserting cuisine `+30`, tag `+12`, favorite `+10`, recent `-40`.
- [ ] Run `npm run test:frontend` and `mvn -q -f backend/pom.xml -Plocal-functional-test test`; verify failures identify missing criteria, store, resolver and scorer types.
- [ ] Commit: `test: define recommendation filtering and preference contracts`.

### Task 2: Establish the canonical metadata catalog

**Files:**

- Create: `backend/src/main/resources/recommendation-metadata.json`
- Create: `backend/src/main/java/com/eatwhat/service/RecommendationMetadataService.java`
- Create: `backend/src/main/java/com/eatwhat/dto/RecommendationOptionsDTO.java`
- Create: `backend/src/test/java/com/eatwhat/service/RecommendationMetadataServiceTest.java`

- [ ] Define catalog groups `cuisine`, `flavor`, `scene`, `diet`, `method` with stable uppercase codes, Chinese labels, aliases and minimum supported client version.
- [ ] Include explicit mappings such as `川菜 -> SICHUAN`, `粤菜/广东菜 -> CANTONESE`, `东北菜 -> NORTHEAST`, `麻辣 -> NUMB_SPICY`, `懒人食谱 -> LOW_EFFORT`.
- [ ] Reject duplicate codes, duplicate aliases inside a group and unknown group names in the service constructor.
- [ ] Return only options that exist in the catalog; attach data counts later through the mapper.
- [ ] Run `mvn -q -f backend/pom.xml -Plocal-functional-test -Dtest=RecommendationMetadataServiceTest test`; expect PASS.
- [ ] Commit: `feat: add canonical recommendation metadata catalog`.

### Task 3: Extend the schema and metadata pipeline

**Files:**

- Create: `backend/recommendation_preferences_schema.sql`
- Create: `scripts/backfill_recommendation_metadata.py`
- Create: `tests/data/test_recommendation_metadata.py`
- Modify: `scripts/replace_dish_data.py`
- Modify: `create_table.sql`
- Modify: `backend/ensure_food_import_schema.sql`

- [ ] Add idempotent `food.cuisine_code`, `food.tag_codes`, `food.cook_minutes`, `food.metadata_version` columns and indexes on `cuisine_code`, `cook_minutes`.
- [ ] Add `user_preference` with JSON arrays, `avoid_recent_days`, version and update timestamp.
- [ ] In the Python mapper, derive only high-confidence codes from source fields and catalog aliases; leave cuisine `NULL` when evidence is absent.
- [ ] Derive `QUICK` from `预计时间分钟 <= 20`, `LOW_EFFORT` from existing lazy-recipe labels, and method codes from `烹饪方式`.
- [ ] Keep `kcal=0` and do not emit a low-calorie code.
- [ ] Emit `recommendation_metadata_audit.md` containing per-code counts, unknown cuisine count, invalid codes and source coverage.
- [ ] Add tests requiring 6,665 output rows, no unknown codes, no duplicate codes per dish, and unknown cuisine rather than guessed cuisine.
- [ ] Run `python -m pytest tests/data/test_recommendation_metadata.py -q`; expect PASS.
- [ ] Run the isolated MySQL replacement test and verify custom dishes remain preserved.
- [ ] Commit: `feat: add recommendation metadata schema and backfill`.

### Task 4: Persist validated user preferences

**Files:**

- Create: `backend/src/main/java/com/eatwhat/entity/UserPreference.java`
- Create: `backend/src/main/java/com/eatwhat/dto/UserPreferenceDTO.java`
- Create: `backend/src/main/java/com/eatwhat/mapper/UserPreferenceMapper.java`
- Create: `backend/src/main/java/com/eatwhat/service/UserPreferenceService.java`
- Create: `backend/src/test/java/com/eatwhat/service/UserPreferenceServiceTest.java`
- Modify: `backend/src/main/java/com/eatwhat/controller/UserController.java`
- Modify: `backend/src/test/java/com/eatwhat/controller/ControllerEndpointInventoryTest.java`

- [ ] Write tests for default preferences, JSON round trip, duplicate removal, invalid code rejection, ingredient trimming and limits.
- [ ] Enforce at most 12 preferred cuisines, 20 preferred tags, 20 excluded tags, 30 excluded ingredients, 20 characters per ingredient, and `avoidRecentDays` in `0..30`.
- [ ] Implement `GET /users/preferences` and `PUT /users/preferences` using only `currentUserId` from the interceptor.
- [ ] Return `version` and `updatedAt`; ignore any client-supplied user ID.
- [ ] Update endpoint inventory expectations and run all JUnit tests.
- [ ] Commit: `feat: persist user recommendation preferences`.

### Task 5: Add filtered dish queries

**Files:**

- Modify: `backend/src/main/java/com/eatwhat/entity/Dish.java`
- Modify: `backend/src/main/java/com/eatwhat/mapper/DishMapper.java`
- Create: `backend/src/main/java/com/eatwhat/service/DishCandidateQueryService.java`
- Create: `backend/src/test/java/com/eatwhat/service/DishCandidateQueryServiceTest.java`
- Modify: `backend/src/main/java/com/eatwhat/service/DishQueryService.java`
- Modify: `backend/src/main/java/com/eatwhat/controller/DishController.java`

- [ ] Add `cuisineCode`, `tagCodes`, `cookMinutes`, `metadataVersion` to the entity and every relevant projection.
- [ ] Fix search queries so they return real tags and metadata instead of `'' as tags`.
- [ ] Add optional dish-list parameters `cuisineCodes`, `tagCodes`, `methodCodes`, `maxCookMinutes` with comma-separated codes.
- [ ] Query system dishes plus only the current user's custom dishes; never expose another user's custom dishes.
- [ ] Candidate query applies type, cuisine, include tags and time in SQL, then applies excluded tags and ingredient terms in Java before capping at 400 per type.
- [ ] Test unknown cuisine behavior, any-of positive tags, any-hit exclusions, ingredient exclusions and stable pagination totals.
- [ ] Run focused and full JUnit suites.
- [ ] Commit: `feat: add canonical dish filtering queries`.

### Task 6: Implement criteria resolution and recommendation scoring

**Files:**

- Create: `backend/src/main/java/com/eatwhat/dto/RecommendationCriteria.java`
- Modify: `backend/src/main/java/com/eatwhat/dto/RecommendRequest.java`
- Create: `backend/src/main/java/com/eatwhat/service/RecommendationCriteriaResolver.java`
- Create: `backend/src/main/java/com/eatwhat/service/RecommendationScorer.java`
- Create: `backend/src/main/java/com/eatwhat/service/RecentDishService.java`
- Modify: `backend/src/main/java/com/eatwhat/service/RecipeRecordService.java`
- Modify: `backend/src/main/java/com/eatwhat/service/RecommendationService.java`
- Modify: corresponding JUnit tests.

- [ ] Resolve `useSavedPreferences=false` without loading positive saved preferences, while still applying permanent exclusions unless the product explicitly changes that rule.
- [ ] Load recent dish IDs from recipe records for `avoidRecentDays`; malformed legacy IDs are skipped and logged, not fatal.
- [ ] Score candidates with constants in one class and a seeded `Random` supplied by tests.
- [ ] Perform weighted sampling without replacement inside each type and prevent duplicate dish names across all three plans.
- [ ] Preserve user-selected dishes unless they violate permanent exclusions; return a warning when a selected dish is removed.
- [ ] Return partial plans with shortage warnings when hard filters leave too few candidates; never silently remove exclusions.
- [ ] Add tests for empty pools, rare cuisine, recent penalty, selected-dish conflicts, three-plan uniqueness and deterministic seeded output.
- [ ] Run all JUnit tests and generate JaCoCo coverage.
- [ ] Commit: `feat: score recommendations from filters and preferences`.

### Task 7: Expose metadata and enriched recommendation responses

**Files:**

- Modify: `backend/src/main/java/com/eatwhat/controller/RecommendController.java`
- Modify: `backend/src/main/java/com/eatwhat/dto/PlanDTO.java`
- Modify: `backend/src/test/java/com/eatwhat/controller/ControllerBehaviorTest.java`
- Modify: `backend/src/test/java/com/eatwhat/controller/ControllerEndpointInventoryTest.java`

- [ ] Add `GET /recommend/options` returning catalog groups, counts and metadata version.
- [ ] Extend `POST /recommend` response with `appliedCriteria`, `warnings`, `preferenceVersion` while retaining `plans` and `favoriteIds`.
- [ ] Validate request codes before querying and return `400` with field-level errors for unknown codes.
- [ ] Keep old clients compatible by making every new request field optional.
- [ ] Update controller tests for authenticated access, validation errors and backward-compatible requests.
- [ ] Commit: `feat: expose recommendation options and applied criteria`.

### Task 8: Add the frontend criteria and preference boundary

**Files:**

- Create: `utils/recommendation-criteria.js`
- Create: `utils/preference-store.js`
- Modify: `utils/api.js`
- Modify: `tests/frontend/frontend.test.js`
- Create: `tests/frontend/recommendation-criteria.test.js`
- Create: `tests/frontend/preference-store.test.js`

- [ ] Add API wrappers for recommendation options and user preferences using existing auth/error handling.
- [ ] Normalize criteria to sorted unique code arrays and bounded text values before navigation or API calls.
- [ ] Cache options by `metadataVersion` and preferences by `getUserStorageKey('userPreferencesV2')`.
- [ ] Load backend preferences first, then update the local cache; on failure return cached data with `synced=false`.
- [ ] Migrate the old boolean cuisine settings once into V2 codes, then delete the old key only after a successful backend save.
- [ ] Add tests for migration, user isolation, offline cache, invalid code removal and session/default separation.
- [ ] Run all frontend tests.
- [ ] Commit: `feat: add frontend preference and criteria services`.

### Task 9: Build the recommendation filter page and wire the home page

**Files:**

- Create: `pages/recommend-filter/recommend-filter.js`
- Create: `pages/recommend-filter/recommend-filter.json`
- Create: `pages/recommend-filter/recommend-filter.wxml`
- Create: `pages/recommend-filter/recommend-filter.wxss`
- Modify: `app.json`
- Modify: `pages/index/index.js`
- Modify: `pages/index/index.wxml`
- Modify: `pages/index/index.wxss`
- Modify: `tests/frontend/page-contracts.test.js`

- [ ] Replace the dead `activeTag` string with normalized `sessionCriteria`.
- [ ] 首页只展示三个快捷选择：家常菜映射 `HOME_STYLE`，川菜映射 `SICHUAN`，粤菜映射 `CANTONESE`；移除快手菜和减脂餐旧入口。
- [ ] 三个快捷选择支持再次点击取消，并提供选中色、勾选图标、轻触震动和当前筛选摘要。
- [ ] Add a filter icon/button with selected-condition count and a clear command.
- [ ] Build grouped multi-select controls, cuisine counts, excluded ingredient chips and a 10/20/30/45/60 minute segmented control.
- [ ] Return criteria through user-isolated temporary storage rather than an oversized query string.
- [ ] Include `criteria` and `useSavedPreferences` in the result-page params.
- [ ] Add page-contract tests for all handlers, navigation targets and quick-tag request mapping.
- [ ] Commit: `feat: add recommendation filter experience`.

### Task 10: Rebuild the preference settings page

**Files:**

- Modify: `pages/settings/settings.js`
- Modify: `pages/settings/settings.wxml`
- Modify: `pages/settings/settings.wxss`
- Modify: `pages/profile/profile.js`
- Create: `tests/frontend/settings-preferences.test.js`

- [ ] Replace local boolean switches with catalog-driven cuisine and tag multi-select controls.
- [ ] Remove the low-calorie switch until a separate nutrition-data project supplies real kcal values.
- [ ] Add permanent exclusions, ingredient chips and avoid-recent-days control.
- [ ] Show `保存中 / 已同步 / 仅保存在本机` states without blocking ordinary navigation.
- [ ] Make the profile menu navigate directly to `/pages/settings/settings`.
- [ ] Test backend load, cached load, successful save, offline save and old-preference migration.
- [ ] Commit: `feat: persist recommendation preference settings`.

### Task 11: Apply metadata to browsing and custom dishes

**Files:**

- Modify: `pages/customize/customize.js`
- Modify: `pages/customize/customize.wxml`
- Modify: `pages/customize/customize.wxss`
- Modify: `backend/src/main/java/com/eatwhat/service/CustomDishService.java`
- Modify: frontend and JUnit tests.

- [ ] Add cuisine/tag/method/time filters to the browse page using the same catalog and API query parameters.
- [ ] Preserve selected dishes when changing filters, including dishes no longer visible in the current result set.
- [ ] Add optional cuisine and tag selection to the custom-dish form.
- [ ] Validate custom metadata codes in Java and bind ownership from the authenticated user only.
- [ ] Ensure custom dishes with unknown metadata remain browseable but only match filters when data exists.
- [ ] Commit: `feat: use recommendation metadata in dish browsing`.

### Task 12: Make backend recommendation authoritative with safe local fallback

**Files:**

- Modify: `utils/recommendation-flow.js`
- Modify: `utils/recommend.js`
- Modify: `pages/result/result.js`
- Modify: `pages/result/result.wxml`
- Modify: `tests/frontend/recommendation-flow.test.js`

- [ ] Change normal generation to backend-first with a 2.5-second timeout; run local fallback only on timeout, transport error or empty server response.
- [ ] Apply the same hard criteria and permanent exclusions in local fallback using canonical codes.
- [ ] Keep local scoring simpler, but never infer cuisine from dish names and never bypass exclusions.
- [ ] Display the applied filter summary and shortage warnings above plans.
- [ ] Remove the silent result replacement that currently swaps cache output for backend output after rendering.
- [ ] Test backend success, timeout fallback, exclusion parity, warning rendering and metadata-version mismatch.
- [ ] Commit: `refactor: make personalized recommendation backend authoritative`.

### Task 13: Verify performance, compatibility and deployment artifacts

**Files:**

- Modify: `scripts/test-all.ps1`
- Create: `scripts/test_recommendation_preferences_mysql.ps1`
- Modify: `docs/testing/full-functional-test-matrix.md`
- Modify: `outputs/test-report/full-functional-test-report.md`
- Modify: `DEVELOPER.md`
- Modify: `FUNCTION_LIST.md`
- Modify: `SERVER.md`
- Modify: `backend/src/main/resources/application.yml.example`

- [ ] Add isolated MySQL tests for schema migration, metadata backfill, preference JSON round trip, hard filters and custom-dish ownership.
- [ ] Add a repeatable performance test using the 6,665-dish dataset and assert local p95 under 800ms for representative filters.
- [ ] Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-all.ps1`.
- [ ] Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1`.
- [ ] Run `git diff --check` and scan for old `preferChuan` booleans, unsupported low-calorie text and dead `activeTag` behavior.
- [ ] Document `recommendation.preferences.enabled`, schema backup/migration order and rollback procedure.
- [ ] Do not deploy or execute production migrations without a separate explicit request.
- [ ] Commit: `docs: document recommendation filtering rollout`.

---

## Delivery Order

1. Metadata catalog and data audit.
2. Backward-compatible database schema.
3. Preference API and filtered candidate query.
4. Recommendation criteria/scoring.
5. Frontend filter and settings pages.
6. Backend-first flow and local fallback parity.
7. Isolated MySQL, full regression and deployment documentation.

## Rollback

- Set `recommendation.preferences.enabled=false` to keep accepting new optional fields but use the current count-only recommendation path.
- Frontend hides filter and preference controls when options endpoint reports disabled.
- Added columns and `user_preference` table remain in place; rollback does not delete user data.
- Old clients continue using the existing request shape throughout rollout.
