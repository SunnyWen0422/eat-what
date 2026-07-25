# EatWhat Full Local Functional Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and execute a repeatable local functional test suite covering the complete WeChat mini-program surface, Java API/service behavior, Python recommendation service, database replacement tooling, and bundled static web experience, then publish an evidence-backed report.

**Architecture:** Use native test runners for each subsystem: Node's built-in test runner with a WeChat runtime harness, JUnit 5/Mockito through Maven, and Python `unittest` in an isolated local virtual environment. Add browser smoke tests for the standalone web page and consolidate machine-readable results into one Markdown report.

**Tech Stack:** Node.js 24 `node:test`, Java 21 compiling Java 8 source, Maven 3.9.11, Spring Boot Test/Mockito, Python 3.12 `unittest`, FastAPI TestClient, local HTTP server, in-app browser automation.

---

### Task 1: Test inventory and matrix

**Files:**
- Create: `docs/testing/full-functional-test-matrix.md`
- Inspect: `app.json`, `pages/**/*.js`, `utils/*.js`, `backend/src/main/java/**/*.java`, `recommend-service/**/*.py`

- [ ] Enumerate all 18 registered mini-program pages and their WXML-bound handlers.
- [ ] Enumerate every frontend API wrapper and matching/missing backend route.
- [ ] Enumerate Java controllers, service branches, authentication paths, and error responses.
- [ ] Enumerate Python health, recommendation, sync chat, streaming chat, RAG, fallback, and database-helper paths.
- [ ] Define evidence and a pass/fail criterion for every matrix row.

### Task 2: Mini-program automated functional suite

**Files:**
- Create: `tests/frontend/wechat-runtime.js`
- Create: `tests/frontend/frontend.test.js`
- Create: `tests/frontend/page-contracts.test.js`
- Create: `package.json`

- [ ] Create a `wx`, `App`, `Page`, storage, navigation, request, and modal harness.
- [ ] Test user-isolated storage, default/custom dishes, recommendation counts, uniqueness, selected-dish priority, preference weighting, fallback data, and recent-history behavior.
- [ ] Test API success, token headers, ETag reuse, request deduplication, 401 relogin, retry, and endpoint paths.
- [ ] Load all page modules, verify every WXML event binding resolves to a page method, verify every declared navigation route exists, and run lifecycle smoke tests with deterministic API mocks.
- [ ] Run `node --test tests/frontend/*.test.js` and record totals and failures.

### Task 3: Java backend automated functional suite

**Files:**
- Create: `backend/src/test/java/com/eatwhat/util/TokenUtilTest.java`
- Create: `backend/src/test/java/com/eatwhat/service/DishServiceTest.java`
- Create: `backend/src/test/java/com/eatwhat/service/RecipeRecordServiceTest.java`
- Create: `backend/src/test/java/com/eatwhat/controller/ControllerContractTest.java`

- [ ] Test token issuance, replacement, invalidation, and expiry-facing behavior.
- [ ] Test dish pagination/search/custom ownership, three-plan recommendation composition, selected dishes, exclusions, and empty pools.
- [ ] Test recipe-record enrichment, update/delete delegation, date range, and category statistics.
- [ ] Test controller success/error/authorization contracts with mocked services and request attributes.
- [ ] Run `mvn -f backend/pom.xml test` and record Surefire totals.

### Task 4: Python recommendation-service suite

**Files:**
- Create: `recommend-service/tests/test_db.py`
- Create: `recommend-service/tests/test_rag.py`
- Create: `recommend-service/tests/test_chat_handler.py`
- Create: `recommend-service/tests/test_graph.py`
- Create: `recommend-service/tests/test_api.py`
- Modify: `.gitignore`

- [ ] Create `.test-venv` and install `recommend-service/requirements.txt` plus the test HTTP client dependencies.
- [ ] Test type normalization, cache behavior, sampled/fallback queries, recent-dish lookup, ingredient parsing/search, semantic search, intent recognition, DeepSeek fallback, conversation memory, rule recommendations, validation, and health/API response contracts.
- [ ] Start FastAPI locally, call `/health`, and record the process/HTTP evidence.
- [ ] Run `python -m unittest discover -s recommend-service/tests -v` and record totals.

### Task 5: Data replacement and SQL safety suite

**Files:**
- Create: `tests/data/test_replace_dish_data.py`
- Test: `scripts/replace_dish_data.py`
- Test: `outputs/dish-replacement-20260718/*`

- [ ] Generate a temporary workbook fixture and validate all category mappings and normalization rules.
- [ ] Verify duplicate IDs block import, user custom rows are preserved by generated SQL, source IDs are not inserted into the live table, and manifests match produced files.
- [ ] Verify the current 6,665-row bundle, type totals, HTTPS images, required fields, and zero blocking issues.

### Task 6: Standalone web and visual smoke tests

**Files:**
- Test: `backend/src/main/resources/static/index.html`
- Test: `backend/src/main/resources/static/main.html`
- Create: `outputs/test-report/web-desktop.png`
- Create: `outputs/test-report/web-mobile.png`

- [ ] Start a local static HTTP server on a free port.
- [ ] Open `/main.html`, exercise parameter controls, recommendation generation, plan switching, local recipe save/apply/delete, and dish detail modal.
- [ ] Check console errors and capture desktop/mobile screenshots.
- [ ] Open `/index.html` and verify the published informational page renders.

### Task 7: Consolidated verification and report

**Files:**
- Create: `scripts/test-all.ps1`
- Create: `outputs/test-report/full-functional-test-report.md`
- Modify: `scripts/verify.ps1`

- [ ] Make one runner execute frontend, Java, Python, data, syntax, JSON, and static contract tests with non-zero exit on failure.
- [ ] Run the full runner from a clean command and retain concise logs under `outputs/test-report/`.
- [ ] Report tested functions, counts, pass/fail results, known defects, unimplemented routes, environment limitations, and exact reproduction commands.
- [ ] Reconcile every test-matrix row with current evidence; mark uncovered items explicitly rather than inferring coverage.
