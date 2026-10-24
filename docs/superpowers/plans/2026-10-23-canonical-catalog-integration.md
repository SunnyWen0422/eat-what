# Canonical catalog isolated integration Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and independently review bounded tasks. No production access or external model calls.

**Goal:** Integrate the reviewed 5,407-recipe canonical local catalog into database, Java, Python, mini-program and public web consumers; verify fixed recipe quantities across the full catalog in an owned isolated environment.

**Architecture:** MySQL remains the runtime store. One canonical recipe document per ID and one canonical ingredient definition per ID are authoritative; legacy-shaped read projections may be deterministically derived, never separately edited or used as fallback. Consumers receive the canonical recipe contract; quantities and nutrition use one service calculation, not text inference.

**Tech Stack:** Existing Spring Boot/MyBatis/MySQL, FastAPI, native mini-program, React; offline fixture provider only.

**Spec:** ../../data/catalog-review-standard.md and ../../data/canonical-catalog-v4-integration.md, incorporating the user's latest 2026-10-24 fixed-quantity decision. The 2026-10-22 design is historical context. Current runtime contract is v4, policy fixed-recipe-v1, revision eatwhat-catalog-20261024-data-review-4-local-fix1-fixed1, SHA256 2303a3dcd9362e922720fc94f9d4d3b80561e3a237a3e212ed949d450831aa42.

## Global constraints

### 2026-10-24 resumed implementation

The user approved the reviewed development order: adapt locally, import into an isolated database, then jointly validate. Production activation is a later step, not authorized by this resumed implementation. Current input is the reviewed 5,407-recipe v4 local-fix1 release, 1,779 ingredient definitions, 5,450 effective ID mappings; 1,102 quarantined mappings plus the earlier 113 retired IDs remain audit-only. Earlier v2/6,498 requirements below are historical and superseded by this paragraph.

Ordinary quantities may be discretionary (null plus 适量); unknown time, source servings, dietary facts and complete nutrition remain null. Every dish retains its listed fixed quantities for all diner counts. Explicit diners enable only equal-share nutrition reference; omitted diners mean no per-person value. Remove active scaling/scaleRule and batch enlargement. Optional ingredients still recompute facts. Do not demand exhaustive step links or fake numeric completeness. Keep a single runtime model combining clean presentation with full server calculation dependencies, derived read projections only. Nutrition review reports known menu nutrition and coverage from actual-meal snapshots; without personal consumed portions it must not claim personal intake. Existing ownership, idempotency, recovery, rotation and favorite-neutral behavior remain required.

Implementation ownership: Java calculator/enrichment and shopping preview; Python adapters; clients; root owns import/storage/runtime, actual-meal nutrition snapshots/reporting, API coordination and joint acceptance. Existing dirty feature checkout is preserved; isolation is in fresh loopback services/databases. No external model calls, production or push. User-facing behavior unchanged outside the adopted data semantics.

- Work in the canonical project checkout, current feature branch codex/v4-meal-workspace-green-20261003 at 171d90b02dc07fb7a4c743a6f4c0e931a8ba9ec0; existing documentation changes remain untouched.
- Source dataset is the reviewed 2026-10-24 clean/full pair. Retain originals; prepare_catalog_v4.py emits a new fixed-policy runtime file. Runtime outputs and full data remain outside Git.
- No production, provider credentials, real model calls, deployment or push. New exclusive loopback database only; external provider replaced at its boundary.
- No per-item old/new/verified/unverified business modes. One release contract, fail closed on invalid/missing canonical facts. Preserve ownership, request idempotency, historical snapshots, favorites and calendar references.
- Existing five menu types and three meal entry points remain; condiments excluded from automatic slots, vegetarian/allergy rules use ingredient facts, favorites remain weight neutral.
- JSON is transport/authoring format, not a per-request full-file read. Query pagination and bounded memory remain required.

## Review focus

1. Ingredient/step/whole-nutrition invariance at 1, 2 and 8 diners; accurate optional changes and equal-share reference, including unknown source servings.
2. Retired/merged IDs referenced by favorites, current plans and immutable historical snapshots.
3. Owner-scoped personal recipes and copy/edit paths must not write a second legacy representation.
4. Assistant index/tools and browser caches must not silently return another catalog revision.
5. Import failure, interrupted activation, repeat import and rollback must retain a coherent whole release.

## Tasks and acceptance ledger

- [x] Database/import: add canonical schema and guarded import using current document; full ID reconciliation, no production connections; reproducible local migration/rollback fixtures. Establish read projection contract for existing queries.
- [x] Java: canonical recipe DTO/enrichment and BigDecimal calculation; replace quality-state/text-based scaling, integrate shopping, recommendation facts and owner writes. Reject unsupported units/references rather than guessing.
- [x] Clients: mini-program and web consume canonical ingredients/steps/nutrition; preserve layout and interactions; fixed amounts and errors tested with real response fixtures.
- [x] Python: canonical tool/index adapters, shared server scale response, no fallback guessing or quality states; mock external model only.
- [x] Full acceptance: import all recipes into fresh owned MySQL, run real Java APIs and Python boundary, traverse every recipe, exercise generation/replacement/favorites/rounds/calendar/shopping and public web; build Java/web, run affected/full offline suites, report exact boundaries.
- [x] Independent review: review final actual patch and receipts, fix material findings, update project handoff and acceptance record. No automatic push/deploy.

## Activation states

Validate input before writes; stage in a new isolated database; activate only after full validation. Failed/cancelled import never partially switches active reads. Repeated import with the same revision is idempotent or rejected without mutation. Historical snapshots stay historical, unresolved retired current references receive explicit unavailable behavior. Account changes and late responses retain existing ownership/version guards.

## Rulings

- Isolation means a fresh owned service/database environment, not copying the formal repository into an export directory. Development stays in the existing feature checkout so approved uncommitted project rules apply.
- Common source fixtures are copied from the authoritative file into temporary test directories by hash; tests do not connect to production or fetch images.
- Final acceptance distinguishes native-device verification from offline UI simulation and real provider calls from mock-provider integration.

## Final local evidence — 2026-10-24

See [fixed recipe acceptance](../../testing/2026-10-24-fixed-recipe-local-acceptance.md). The final runtime-09 completed all seven real-API stages, 5,407 recipes and 16,221 sharing requests; Java 728 tests passed with no skips. Assistant diner-only adjustment, original manual selection, current-content guards and undo were repaired and reviewed. Production remains unchanged; live model and native-device validation are outside this local result.
