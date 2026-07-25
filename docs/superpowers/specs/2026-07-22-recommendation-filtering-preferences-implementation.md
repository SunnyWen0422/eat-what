# Recommendation Filtering and Preferences Implementation

## Delivered

- Home has exactly three session quick filters: `HOME_STYLE`, `SICHUAN`, and `CANTONESE`.
- A dedicated recommendation filter page supports cuisine, include/exclude tags, ingredients to avoid, and a cooking-time limit.
- Settings persist server-backed preferences with a local cache for offline use: preferred cuisine/tags, permanent exclusions, recent-repeat window, and maximum cooking time.
- Recommendation requests apply hard filters before ranking. Preferred cuisine/tags, favourites, and recent dishes only affect ranking.
- Permanent exclusions and maximum cooking time remain active even when one request disables saved preference ranking.
- The backend response returns effective applied criteria, metadata version, preference version, and user-facing warnings.
- The frontend waits for the backend recommendation first; cached/local recommendations are only a timeout or failure fallback and never replace an already visible result.

## Data Contract

The offline 6,665-dish import adds these `food` columns:

```text
cuisine_code
tag_codes
cook_minutes
metadata_version
```

Canonical metadata is stored in `backend/src/main/resources/recommendation-metadata.json`.
User preferences are stored in `user_preference` and exposed by:

```text
GET /api/recommend/options
GET /api/users/preferences
PUT /api/users/preferences
POST /api/recommend
```

## Migration Package

The offline migration is intentionally not applied to production. The release script uses MySQL `source` statements so Chinese text stays UTF-8 on Windows:

```powershell
./scripts/apply_dish_replacement.ps1
```

It applies the food schema, imports the offline CSV, creates preference storage, backfills recommendation metadata, and verifies system/custom-dish counts. Back up the target database before any separately authorized production rollout.

## Verification

`scripts/test-all.ps1` verifies:

- Node frontend behaviour, including quick filters, the full filter page, persisted preferences, backend-first fallback, and custom-dish metadata.
- Java unit/controller behaviour, using the local functional-test Maven profile.
- Python data import and metadata checks.
- Isolated MySQL import: 6,665 system dishes, one preserved custom dish, 6,035 `HOME_STYLE`, 162 `SICHUAN`, 65 `CANTONESE`, and preference JSON round-trip.
