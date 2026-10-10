# Actual-record feedback: evidence and limits

## Existing capability, preserved

- `backend/src/main/java/com/eatwhat/service/MealConsumptionService.java:66-151`: explicit eaten/skipped/unrecorded mutations; validates date and account, resolves known IDs via the owned dish query, preserves free text without inventing an ID. Plans are separate from actual snapshots.
- `backend/src/main/java/com/eatwhat/mapper/MealConsumptionMapper.java:15-16`: recent records are read from `meal_consumption` with `user_id` and date bounds. No plan-table substitution.
- `backend/src/main/java/com/eatwhat/service/MealWorkspacePlanner.java:30-55`: `eligible` resolves existing criteria, reads actual history only when `avoidRecentDays > 0`, bounds the window to at most 30 days ending at the meal context date, accepts only eaten snapshots, then scores eligible candidates. The parsing loop now delegates to the pure scorer helper; SQL, date bounds, account filtering and invalid-snapshot failure behavior are unchanged.
- `backend/src/main/java/com/eatwhat/service/RecommendationScorer.java`: recent known IDs get the existing -40 adjustment. Favorite/cuisine/tag and owned-ingredient criteria can offset it. This is a soft rank adjustment, not a permanent ban or proof that the final menu changed because of one record. The extracted `recentActualIds` helper accepts only explicit positive numeric IDs and never maps a name to an ID.
- `MealWorkspacePlanner.generate`: eligible ordering is consumed by existing replace/category/time selection and previous-menu avoidance. These later constraints can affect the result. Its generic explanations do not provide record-by-record causal evidence. This method was statically inspected only, never executed in this task.
- `utils/meal-workspace-page.js:onReplace/runCommand` and `utils/meal-action-feedback.js:interactionCommand`: a replacement submits the one-time replace command, releasing legacy locks. It does not write excluded ingredients or permanent preference settings.

## Review provenance and new presentation

- `MealConsumptionService.review` → `DietReviewCalculator.report` → `DietReviewReport.build`: fresh owned actual snapshots, six report blocks, range/timezone/calculation version/source fingerprint. Existing report counters remain authoritative, and the existing API shape is retained.
- `utils/diet-report.js:presentDietReport`: validates explicit-eaten basis and selected range; retains existing returned fields and adds a display-only coverage notice, lightweight review facts, and record URLs. Detail rows accept only eaten, selected-range, observed-date records. Zero observed days does not count future snapshots. No calories or health score is fabricated.
- `pages/statistics/statistics.wxml`: initial overview and real categories; visible secondary toggle for distribution, source rows, plan comparison, completeness and calculation provenance. Empty periods offer the existing lightweight calendar record entry. Category rows are hidden when there are no eaten meals. Missing days and skipped meals are described separately; missing records do not establish missing meals.
- `templates/meal-workspace.wxml`: only the generic claim “已记录的用餐可参与近期重复推荐判断，不等于推荐效果已验证”. No yesterday/chicken/per-dish adjustment claim.
- Every eaten detail's source link retains date and meal type. Page request epoch, unload and account checks remain unchanged; new presentation fields/expanded state clear with the report.

## Executed evidence (no models)

- `node --test tests/experience-diet-review.test.js tests/diet-report.test.js tests/diet-report-api.test.js`: 18 passed, zero failed/skipped/cancelled. Explicit local fixtures and Page harness; the replace test uses the real Page dispatch and real workspace store, receiving a terminal 409 transport double rather than generating/model-mocking a menu. It verifies replace payload, lock release and zero permanent preference writes.
- Offline Maven, explicit `-Dtest=RecommendationHistoryEvidenceTest,DietReviewCalculatorTest,DietReportFoundationTest,LegacyStatisticsBasisTest`: 13 passed, zero failures/errors/skips. The new history test invokes only a plain `RecommendationScorer` with fixed candidates and parsed maps. Existing foundation mocks only repositories/query services; no Spring application/model startup.
- Node syntax checks and `git diff --check`: passed.

No planner generation, model service/transport, offline/mock model flows, production endpoints, full Maven suite or unscreened test command was run. The recent-history wiring was verified by static tracing plus the extracted pure parser/scorer tests, not by claiming an end-to-end recommendation run.

## Still unverified

Real recommendation effects require a separately authorized user study or controlled recorded-history experiment: measure repeated known dishes under the same eligible candidate pool, criteria, constraints and time window; distinguish ranking from final selection; track missing/free-text history and independently review source evidence. No real-user improvement, nutritional benefit, causal per-dish adjustment, device rendering, 200% font or screen-reader acceptance is claimed here. Real-device and independent review gates remain open.
