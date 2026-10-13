# Assistant Review Fixes Implementation Plan

**Goal:** Fix F1–F6 and E1 from the fixed c17d05b review without changing rollout or deployment state.

**Architecture:** Preserve authenticated Java ownership, versioned domain services and independent confirmations. Python may select only verifiable read facts; model prose is never a business receipt.

**Tech Stack:** Java 8-compatible Spring/MyBatis, Python FastAPI, native mini-program JavaScript.

**Spec:** User-authorized review remediation; full review delivered as Library `libfile_b0e46d9469c08191add6a64812947762`.

## Constraints

- Base c17d05ba449484890c3e490691f5f6d9a39ff73f; target codex/v4-meal-workspace-green-20261003. PR #9 remains untouched.
- No model/mock/offline/Agent test execution, live providers, production, migrations, credentials/security changes, frontend upload or release.
- Add regression test sources; only inspected static/syntax/compile/build checks may execute. No broad verify or Maven tests.
- Independent final review, then same-repository branch and draft PR if CI will not trigger prohibited tests. Never merge.

## Tasks and regression sources (execution paused)

- F1: ControlledToolHarnessService Extension boundary and Calendar/Shopping adapters. Reject new extension writes when disabled, while old tools and completed receipt recovery remain available. Add gate regression to AssistantCalendarActionTest/AssistantShoppingPreviewTest or focused harness tests.
- F2: AssistantV4Store and AssistantV4Mapper retention predicate. Keep expired previews renewable within bounded 30-day lifecycle; never revive user cancellation/deletion. Update AssistantV4StoreTest for expired-token cleanup versus lifecycle expiry.
- F3: AssistantV4ContextService action summaries. Deduplicate stable receipts and obsolete previews; bound optional history while protecting latest pending action and hard constraints. Add repeated-repreview context coverage to AssistantV4ContextTest.
- F4: Shopping receipt rendering must show only submitted selected items; preview remains fully selectable. Add deselected-receipt case to tests/assistant-cards.test.js.
- F5: AssistantReadToolService uses existing OR semantics within each include-tag group and independently validates meal and additional criteria. Add tests to AssistantReadToolTest.
- F6: assistant_v4_schema.py / step instructions and AssistantV4TurnService read projection. Use bounded server-verifiable context references for final answers, or require explicit corresponding read. Add schema and Java regression sources without executing them.
- E1: assistant_v4_live_acceptance.py ties LIVE05 source and persisted rows to LIVE04 receipt; add negative assertion fixtures in test_assistant_v4_live_acceptance.py. Never invoke the live runner.

## Review focus

- Disabled capability must not break completed receipts or old workspace tools (F1).
- Token expiry must not become unlimited retention or resurrect cancellation (F2).
- Repeated previews must not evict restrictions or current pending state (F3).
- Receipt/selection source facts remain authoritative, including empty or unselected rows (F4/F6).
- OR inside groups must not become OR across independent constraint groups; wrong-target live fixtures fail before confirmation (F5/E1).

## Verification and handoff

- Inspect build configuration, then Java compile/test-compile with test execution disabled, Python AST/compile-only, JS syntax and JSON checks.
- Fresh reviewer reads the final diff and affected call chains; resolve introduced regressions and record deferred dynamic checks.
- Recheck remote target and CI configuration immediately before push. Verify pushed SHA and draft PR base/head/state afterward.
- Deliver Chinese fix report with per-finding changed/verified/deferred states and confirmed-readable Library ID.

User authorization supplies the execution method and approval to implement; no new plan approval is requested. All test-running steps from generic skill workflows are overridden by the explicit pause above.
