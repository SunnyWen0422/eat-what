# Mini-program experience acceptance — development candidate

Final review update: Tasks 1–11 and whole-branch repair rereview are complete at ae635db; Spec PASS / Quality APPROVED. Native/device/user acceptance remains not-run. The stage-specific pending statements below are historical; publication details belong to the delivery report.

Historical Task 11 record, date: 2026-10-09. Implementation base: local `d9c9cf3`. This is implementation evidence, not release approval. Remote exact SHA, draft PR, CI, independent whole-branch review and device acceptance are pending the controller's later gates. No deployment or production data changes.

## Evidence boundary

Published logs normalize trailing whitespace only; complete original logs remain in the local task evidence. Every machine-readable result in `evidence/acceptance.json` uses `{check, kind, status, evidence, limitation}`. Kinds are automated/static/devtools/device/user-study; status is passed/failed/not-run. Missing evidence stays not-run. The Node journey uses actual Page/Component handlers and real stores with literal API receipts and a controlled WeChat platform boundary. It does not run generation models, offline/mock models, a browser screenshot, native WeChat or real users.

## G1–G5

- G1: explicit 60-file Node list in `scripts/verify_miniapp_experience.py`; no wildcard runner. Complete current results and audited source hashes are in `evidence/`. One sequential journey starts empty, applies 2 meat/1 vegetable/1 soup, replaces/undoes, reads a recipe and returns, saves tomorrow once, opens that calendar meal, adds food once, checks/undoes shopping, creates an own recipe, saves a reusable menu, and applies it to another day without a second calendar write. Other tests retain midnight/year, changed-account, deleted-dish, legacy-lock, unknown-result, conflict, quantity and actual-history regressions.
- G2: exactly `test_ui_structure.py`, `test_ui_self_check.py`, `test_product_migration_contract.py`. Initial pytest import was missing; installed pytest in an isolated `/tmp` dependency directory and reran the requested files with existing isolated Cairo dependencies. Generator tests use temporary copies. No broad Python discovery/model flows.
- G3: 17 Java classes explicitly listed in `evidence/test-audit.json`, 99 tests. Inert planner mocks are used only for validation/queue boundaries; no generation/transport/processTask call runs. Shopping preview/merge and actual-history tests use mapper stubs/pure functions. Maven offline with the isolated `.superpowers/m2` repository, then `-DskipTests package`; no default Maven test or SQL/migrations.
- G4: v2 visual design source reviewed; source/layout contracts and isolated token regeneration are checked. WeChat compiler commands are absent on PATH; the supported native checker requires `wcc.exe`/`wcsc.exe` in a supplied compiler directory. Native compilation, native screenshots, screen reader, keyboard, device testing and real-user timing remain not-run. No browser mock is called a device result.
- G5: independent Task 11 and whole-branch reviews, remote tree preservation, remote SHA/status/check-runs/actions and publication are pending. Keep PR draft. The 12 historical output blobs absent from the local snapshot must be preserved by publishing changes on the verified remote base tree, never inferred as deletions.

## All registered ordinary pages and branches

All 21 ordinary registered pages are included in copy, root font scaling, event/registration and structural checks. Common assets/background/body/controls inherit the existing generated theme. Admin pages retain existing functional checks only, without new visual work.

| Route | Entry and purpose | Source/visual coverage; native status |
|---|---|---|
| index | Today tab | Shared workspace and retained flag-off home; requirements, composition, save states; native not-run |
| result | Workspace result/legacy route | Shared workspace plus flag-off recommendations; independent row actions; native not-run |
| chat | Current meal conversation | Shared workspace and retained legacy conversation; scope/recovery preserved; native not-run |
| customize | Recipes tab, selected/menu handoffs | Search, source tabs, filters, selected sheet, own recipe form, reusable menus; native not-run |
| dish-detail | Dish rows, saved own recipe | Image failure, readable ingredients/steps, selected feedback, save/favorite distinctions; native not-run |
| calendar | Calendar tab | Day/meal entries, review entry, factual recorded/planned states; native not-run |
| calendar-detail | Dated meal and saved-result link | Read-only compact image/fallback rows, historical actual source, adjustment and management separated; native not-run |
| meal-cooking | Saved-meal cooking route | Readable steps/progress and actual-record action, scoped by revision; native not-run |
| shopping-preview | Calendar/workspace/selected recipes | Shared summary/source rows, optional quantities, one confirmed add; native not-run |
| shopping-list | Today top-right, My, prepared list | Pending/bought only, source counts, summary/by-dish, checked undo, no visible costs; native not-run |
| profile | My tab | Login sheet, independent account/data/preferences/history entries, gated admin; native not-run |
| favorite-dishes | My favorites | Compact rows, empty/search/error, selected recovery; native not-run |
| settings | My preferences/settings | Long-term hard exclusions and reduced-motion setting; native not-run |
| recommend-filter | Meal filter/legacy entry | Current-meal filters explicitly separate from permanent exclusions; native not-run |
| profile-edit | My avatar/name | Upload explanation, cancel/save, field retention/identity guards; native not-run |
| custom-dishes | Own-recipe management/edit | Minimal required fields, optional image/time/servings, focus/errors, ownership; native not-run |
| sync | My data synchronization | Original local drafts and retry/confirmation; native not-run |
| statistics | Calendar/My diet review | Recorded meals only, expandable basis and empty actions; native not-run |
| assistant-history | My history | Read-only history until explicit import, source version checks; native not-run |
| about | My help | Steps explain generate, save plan, prepare, actual record; native not-run |
| logs | Registered diagnostic deep link | No ordinary menu entry found; nevertheless included, local-record meaning/empty/clear; native not-run |

`utils/config.js` currently enables `ENABLE_MEAL_WORKSPACE` and login. `index`, `result` and `chat` retain flag-off templates/handlers; these are not assumed deleted and are checked alongside active branches. Login is a profile sheet, not an absent standalone route. Six admin routes are registered and remain gated by authenticated authorization; no admin product redesign.

## v2 twelve-screen visual-to-source mapping

Reviewed all six `v2_review-*.png` pages and `设计交付说明.md` from the approved v2 design artifact. Images are design examples, never execution evidence. Existing theme uses the specified warm background, green actions, 16px body, 48px primary controls and 44px minimum targets. Compact dish rows are 80px minimum and ingredient rows 52px minimum; both may grow for long text and 200% type. This fits the approved ranges rather than forcing fixed illustrative heights.

| Screen | Implementation mapping | Qualified comparison |
|---|---|---|
| 01 Before generation | `templates/meal-workspace.wxml` + composition summary | Persistent context and top-right list, one generation action; 2/1/1 example is not hardcoded default |
| 02 After generation | Same template + compact dish/action feedback | Image/category fallback, per-dish replace, undo and next step |
| 03 Composition sheet | Workspace sheet + `meal-composition` | Bounded counts, breakfast categories, cancel/apply without automatic regeneration |
| 04 Calendar meal | Calendar detail + read-mode compact dish rows | Thumbnail/fallback and recipe access added; actual historical source retained, management secondary |
| 05 Pending shopping | Shopping list + compact ingredient row | Read-only quantity until explicit edit, source counts separate from rows, bought undo |
| 06 Confirm shopping | Shopping preview | Source grouping and summary share data; unknown quantities remain visible; receipt-based success |
| 07 Recipe browse | Customize | Search/source/filter hierarchy and persistent selection; list/detail contracts retained |
| 08 Recipe detail | Dish detail | Image/error fallback, ingredients/steps, joined-state next action |
| 09 Own recipe | Customize form/custom-dishes editor | Required name/ingredients/steps, optional fields, returned ID opens own detail |
| 10 Common menu | Customize menus sheet | Read-mode image/fallback rows and per-dish access added; default menu people carried to detail |
| 11 Save target | Workspace save sheet | Full date/meal and immutable source snapshot, explicit replacement/version check |
| 12 Saved result | Workspace confirmation/feedback | Persistent destination and direct calendar link. Source workspace is deliberately retained; unlike illustrative header, it does not silently switch to a different target workspace |

The last distinction follows the approved frozen-source safety contract. Likewise illustrative food/time/quantity metadata is not fabricated. Runtime first-screen density (3 dishes + next action, 6 ordinary shopping rows) still requires 390×844 native screenshots. Source dimensions alone are not a pixel pass.

## Accessibility and exception matrix

- Automated/static: 200% font base in the journey; scalable component fonts and flexible heights; touch/contrast source audit across routes/components; reduced-motion branch for animated dish/feedback/sheet components; other new compact components have no animation; image-failure fallback and independent view/replace events; ordinary tappable text/views now expose button semantics.
- Existing regression evidence: empty/not logged in, network failure, 409, unknown outcome, repeated action, return/reentry, account switch, midnight, missing template dish, long name and conservative quantities.
- Not-run: iOS/Android WeChat, native rendering at narrow/390 widths and 200%, all-image-failure actual layout, live screen-reader labels/focus restoration, virtual keyboard obstruction, platform Back behavior, real weak-network timing. Supported sheet restoration events are not proof of native focus restoration.
- User-study not-run: five uninvolved users, at least four completing unprompted; ten-second generation discoverability. Do not claim measured usability improvement.

## Final-review repair evidence (local only)

Automated retained-component visibility tests now cover reduced motion off→on→return without reattachment, on→off and account changes. Shopping boundary tests cover durable predispatch storage, unload-before-response, 5xx/authentication/timeout/throttle uncertainty, original request/version replay, inverse restore context, account isolation, replacement races and receipt/conflict guards. Fresh targeted 167/167, full explicit frontend allowlist 785/785 and Java 99/99 passed; static and offline packaging passed. Empty selected-meal save actions now route to picking; help describes replace/undo and legacy locks. This source/fixture evidence does not certify native rendering, focus restoration or user-study outcomes. Focused independent rereview and remote publication gates remain pending.

Final screened Python rerun: 13 passed plus 83 passing subtests (three explicit files). Its first run lacked CairoSVG on PYTHONPATH; corrected to the existing dependency directories, with no installation. The environment failure is preserved separately in evidence.
