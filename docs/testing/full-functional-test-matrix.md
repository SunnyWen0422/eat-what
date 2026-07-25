# Full Functional Test Matrix

Test date: 2026-07-23

| Area | Scope | Verification | Result |
|---|---|---|---|
| Mini-program structure | 18 registered pages | Every page has `js/json/wxml/wxss`, WXML handlers resolve, navigation targets exist | Pass, 18/18 |
| Home quick filters | Home style, Sichuan, Cantonese only | Exact option list, toggle/cancel, selected feedback, haptic call, criteria forwarding | Pass |
| Full recommendation filters | Cuisine, flavor, scene, diet, method, excluded ingredients, 10/20/30/45/60 minutes | Criteria normalization and filter-page contracts | Pass |
| Preference settings | Backend sync, per-user cache, offline save, legacy migration, metadata-version cleanup | Focused Node tests | Pass |
| Recommendation flow | Backend-first, 2.5-second fallback, hard-filter parity, no silent replacement | Focused Node tests | Pass |
| Recommendation result UX | Applied summary, shortage warning, filtered single-dish replacement | Page behavior and contract tests | Pass |
| Dish browsing | Canonical filters, search, pagination and selection preservation | Frontend behavior plus Java service tests | Pass |
| Custom dishes | Optional cuisine/tags/time and ownership isolation | Frontend form, Java validation, mapper and isolated MySQL checks | Pass |
| Mini-program total | Utilities, pages, storage, API, recommendation and preferences | Node test runner with coverage | Pass, 67/67 |
| Java API contract | User, preference, dish, recommendation, record, favorite, admin, chat | Endpoint inventory and controller behavior | Pass |
| Java recommendation logic | Validation, criteria merge, hard exclusions, scoring, seeded weighted sampling, warnings | JUnit 5 + Mockito | Pass |
| Java total | Controllers, services, metadata, authentication and authorization | Maven local functional profile | Pass, 50/50 |
| Python service | Health, chat, DB helpers, RAG and graph nodes | Pytest + FastAPI TestClient | Pass |
| Data pipeline | 6,665-row import, source manifest, canonical metadata, audit output | Pytest + CSV/openpyxl | Pass |
| Python/data total | Service and data pipeline | coverage.py + pytest | Pass, 38/38 |
| Metadata quality | Canonical codes, duplicates, time parsing and unknown-cuisine policy | Generated audit and data tests | Pass, 0 invalid and 0 duplicate-code rows |
| MySQL integration | Schema, 6,665 import, custom preservation/ownership, preference JSON, hard filter | Isolated local MySQL 8.0 | Pass |
| Filter performance | Five representative filters over all 6,665 dishes, 30 iterations each | Repeatable benchmark, p95 gate below 800 ms | Pass, overall p95 1.849 ms |
| Feature rollback | `recommendation.preferences.enabled=false` legacy count-only behavior | Controller and frontend feature-state tests | Pass |
| Unsupported feature cleanup | Shopping list and dead endpoint wrappers | Route, directory and API-family contracts | Pass, absent |
| Repository checks | JSON, JavaScript, Python, credential markers, replacement bundle, Maven | `scripts/verify.ps1` | Pass |
| Browser visual/responsive | Native WeChat page rendering | Requires WeChat Developer Tools; not covered by headless Node contracts | Manual verification required |

## Reproduction

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-all.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

`test-all.ps1` requires the local `.test-venv` and MySQL 8.0 binaries under `C:\Program Files\MySQL\MySQL Server 8.0\bin`. It creates an isolated temporary MySQL data directory on port 3307 and does not connect to production.
