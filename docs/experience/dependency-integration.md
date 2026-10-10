# PR4 / PR5 dependency integration

Integrated in the isolated `codex/miniapp-experience-20261009` worktree. No GitHub merges, pushes, deployments or migrations were performed. PR6 and its independent web app are excluded.

## Fixed sources

- Remote base: `8bc8d8b028ebbfdab31f5a2ed03f515875c4701a`; tree `bfc7da924a12a43605f214674d9ade06a3188c29`. The controller verified all 903 available local baseline blobs against remote SHA and mode. Local commit `5171c31` is a verified snapshot, not the remote ancestry.
- [PR4](https://github.com/SunnyWen0422/eat-what/pull/4): `60e65bceb43148a47ee592ccc8f8bfdc5d486558`, open draft, base `8bc8d8b...`.
- [PR5](https://github.com/SunnyWen0422/eat-what/pull/5): `4570bc27ca987df6c8a85933e15f315240bf6f3c`, open draft, base `8bc8d8b...`.
- Both full unified diffs and connector per-file patches were retrieved through GitHub read-only tools on 2026-10-09. Metadata was rechecked at 16:57 UTC.

- PR4 unified diff SHA-256: `d1657cd91c9a8d51addffe06e0ac8c4e6ab8007f577548a9390ecb8a5d1f4fdc`.
- PR5 unified diff SHA-256: `82ee408b04ec002c93df04b7569a78022388cefd8a7a8ab220dc2d2585395d36`.

## Replay and conflict decisions

1. PR4 applied cleanly, including quality-copy lineage, Today/menu handoff, local runtime/package and regression-runner safety fixes. Paused model-path changes and their test sources were preserved as source only; they were not executed.
2. PR5 source changes applied after PR4. `styles/workspace.wxss` was excluded from direct replay because it is generated; its actual PR5 `design/wxss/styles/workspace.tpl` was replayed and the existing asset builder regenerated the output.
3. The only rejected overlapping hunk was the initialization/preferences block in `utils/meal-workspace-page.js`. Keep PR4's following-Today `activeMealTarget` write and explicit/history target safeguards, then apply PR5's people-input reset, wrapped/validated default people, hard-exclusion summary and unavailable-read handling. All remaining PR5 hunks applied. No competing fix was dropped.
4. Before resolving that hunk, the inherited frontend allowlist had 51 passes / 5 failures out of 56. After the combined initialization was restored, the same 56 tests passed. This was an integration failure, not a hidden baseline failure. The immutable baseline separately passed 329/329 frontend tests.
5. Task 1 changes the approved tab label from `计划` to `日历` and body token from 14 to 16. Generated em bindings therefore differ from the PR5 generated head. The old exact navigation expectation and hardcoded font mutation fixture were updated to the approved label and token-derived exact expectations; assertions were not weakened.
6. Ordinary text stays fully opaque during entrance feedback. The 180ms image fade is confined to dish thumbnails; feedback and sheets use 180ms / 200ms translation. This preserves declared contrast while explaining changes, and reduced motion sets durations to zero.

## Source-byte provenance at initial Task 1 commit `1a64aadd`

30 of 33 PR-file references match the exact connector diff head blob prefix. The three adapted references are the one shared JS file (listed in both PRs) and the regenerated workspace stylesheet.

| PR | Path | Verification |
|---|---|---|
| 4 | `backend/src/main/java/com/eatwhat/dto/CatalogQuality.java` | exact head blob `9f65379` |
| 4 | `backend/src/main/java/com/eatwhat/mapper/DishQualityMapper.java` | exact head blob `e8450ba` |
| 4 | `backend/src/main/java/com/eatwhat/service/CustomDishService.java` | exact head blob `880e38c` |
| 4 | `backend/src/main/java/com/eatwhat/service/DishQualityService.java` | exact head blob `7edf4c5` |
| 4 | `backend/src/main/java/com/eatwhat/service/MealWorkspacePlanner.java` | exact head blob `f6713f5` |
| 4 | `backend/src/main/java/com/eatwhat/service/WorkspaceAgentContextService.java` | exact head blob `d466c62` |
| 4 | `backend/src/test/java/com/eatwhat/service/CatalogQualityCopyContractTest.java` | exact head blob `5979751` |
| 4 | `backend/src/test/java/com/eatwhat/service/WorkspaceAgentContextRequestTest.java` | exact head blob `c91bccf` |
| 4 | `pages/customize/customize.js` | exact head blob `e8e5dd1` |
| 4 | `recommend-service/authorized_catalog.py` | exact head blob `ca40be2` |
| 4 | `scripts/local_maturity.py` | exact head blob `6b00826` |
| 4 | `scripts/package_maturity_release.py` | exact head blob `be26ba7` |
| 4 | `scripts/run_regression_tests.py` | exact head blob `95eb0b7` |
| 4 | `tests/frontend-workflow-regressions.test.js` | exact head blob `5451313` |
| 4 | `tests/test_authorized_catalog.py` | exact head blob `61d763c` |
| 4 | `tests/test_local_maturity_runtime.py` | exact head blob `abab54e` |
| 4 | `tests/test_maturity_release_package.py` | exact head blob `17f0471` |
| 4 | `tests/test_regression_runner.py` | exact head blob `c0f922e` |
| 4 | `utils/meal-workspace-page.js` | combined initialization, both behavior suites pass |
| 5 | `design/wxss/styles/workspace.tpl` | exact head blob `3ad9115` |
| 5 | `pages/about/about.wxml` | exact head blob `4f419c4` |
| 5 | `pages/calendar-detail/calendar-detail.wxml` | exact head blob `38d10b2` |
| 5 | `pages/calendar/calendar.wxml` | exact head blob `6f301a9` |
| 5 | `pages/dish-detail/dish-detail.json` | exact head blob `daba993` |
| 5 | `pages/dish-detail/dish-detail.wxml` | exact head blob `d35a713` |
| 5 | `pages/statistics/statistics.wxml` | exact head blob `587bc20` |
| 5 | `styles/workspace.wxss` | rebuilt from exact PR5 template plus approved body-16 tokens |
| 5 | `templates/meal-actual-sheet.wxml` | exact head blob `79bed84` |
| 5 | `templates/meal-workspace.wxml` | exact head blob `34d352f` |
| 5 | `tests/page-purpose-copy.test.js` | exact head blob `7cce647` |
| 5 | `tests/workspace-homepage.test.js` | exact head blob `4bf7e8e` |
| 5 | `utils/meal-workspace-page.js` | combined initialization, both behavior suites pass |
| 5 | `utils/meal-workspace-presentation.js` | exact head blob `1362130` |

## Verification boundary

- Frontend dependency tests: `node --test tests/frontend-workflow-regressions.test.js tests/workspace-homepage.test.js tests/page-purpose-copy.test.js`, 56/56.
- Java: only `CatalogQualityCopyContractTest,CatalogQualityContractTest,CatalogPaginationTest,PersonalRecipeFoundationTest,FavoriteDishVisibilityTest,ShoppingListReliabilityTest,ShoppingMutationServiceTest,V4ShoppingContractTest,LocalV4LoginServiceTest`, 58/58. SQL/receipt persistence is replaced by in-memory boundaries; no live database or server was started. JaCoCo reports zero covered instructions in `MealWorkspacePlanner` and `WorkspaceAgentContextService`.
- Python: only isolated `test_local_maturity_runtime.py`, `test_maturity_release_package.py`, `test_regression_runner.py`, 5/5; platform/process/database boundaries are mocked, package inputs are synthetic/inert.
- Paused: `WorkspaceAgentContextRequestTest`, `test_authorized_catalog.py`, all planner/context/gateway/transport/provider/model behavior, including offline tests. Imported Python sources only underwent AST/compile checking.
- No native WeChat compiler/device is present. A normal Chromium launch failed with AF_UNIX socket permission denied; no bypass or second launch was attempted. No visual screenshot or native accessibility/keyboard acceptance is claimed.
- All 12 remotely tracked historical `outputs/` blobs are absent from this local snapshot but remain preserved in the verified remote tree. There are no local deletion entries. Publication must use the verified remote tree incrementally and preserve their SHA/mode.

## Review fix 1 adaptations

The initial 30/33 byte matches above describe commit `1a64aadd`. Review fix 1 changes the copied `CatalogQualityCopyContractTest.java` fixture to inspect `Collection<?>` elements before using `Long` IDs, removing its unchecked generic casts. This is a test-only refactor, covered by the same 58-test non-model Java allowlist. All other inherited dependency files remain unchanged from that reviewed integration snapshot. The current match count is therefore 29/33; the fourth adapted reference is this Java test fixture.

The shared sheet now bounds its actual panel by the keyboard-visible viewport and moves all chrome, including close and final actions, into a native outer `scroll-view` when chrome cannot fit. Decorative margin yields before a 48px primary target. With less than 48px room, it requests supported native keyboard dismissal once and waits for the height event; failure prompts manual keyboard dismissal without faking success. Zero-height viewports remain zero. Native device acceptance is still pending.

Focus reconciliation: all current sheet-entry triggers are buttons (`profile` login, shopping add/more, recipe filters/menus, meal requirements/settings and actual recording). None exposes the native input/textarea `focus` property. No production host consumes `returnFocusId` / `restorefocus`. The optional event is tested against a synthetic host input binding only. Actual trigger and screen-reader restoration remains a disclosed platform/native acceptance gap; later host integration is needed if a genuine supported input trigger is introduced. No artificial input or button-focus API was added.
