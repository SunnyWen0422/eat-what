# Personal recipes and reusable menus

## Scope

This is a single-account foundation. Users can add a private recipe manually, copy a published public recipe or their own recipe into a separate editable private recipe, and save a named combination of public/private dishes as a reusable menu. Copying never edits the source or publishes the copy.

Menus open the existing meal-workspace draft for a chosen date and breakfast/lunch/dinner. They do not write a calendar plan themselves. The existing workspace confirmation, expected workspace/plan revisions, locked current recipe checks and historical snapshots remain authoritative.

## User flows

- Recipe detail: **复制到我的私房菜** creates a private copy and opens its editor.
- **我的私房菜**: edit the name, type, ingredients, steps and cooking minutes; delete with confirmation. Copied image, tips, serving description and metadata are retained.
- Recipe browse: choose dishes; open **我的菜单** from the header or **存为菜单** in the selected-dishes panel. Enter a name and default people count, then save.
- Menu sheet: list, edit composition, delete, or choose date/meal and add a menu to that meal's draft. Close the sheet to change selected dishes and reopen it to save.
- On a timeout, the new UI stores the exact original request in account-scoped storage. Retrying sends its original request ID and body, including the original expected version. It does not mint a second creation request. Authentication/authorization failures, timeout and throttling retain the pending request; other definite 4xx failures release it.
- If a dish was changed/deleted/unpublished, menu use fails clearly and the old plan remains untouched. The menu editor reloads each currently visible dish, displays changed recipe contents for explicit review, and keeps unavailable dishes visible until the user removes or replaces them. Save the reviewed menu before applying it again. If old workspace locked dishes introduce extra dishes, the menu application asks the user to release them first.

## API

All routes use the authenticated `currentUserId`, never a client-supplied owner. `/menus/**` is registered with the existing authentication interceptor and the controller also fails closed without identity.

### Personal dishes

- `POST /dishes/custom`: normal editable dish fields plus `requestId` for idempotency. The returned dish includes a read-only `contentVersion`.
- `POST /dishes/{id}/copy`: `{requestId, expectedVersion}`. Server reads the public/own source under a row lock, checks the content version and copies all persisted recipe fields into a new owned row.
- `PUT /dishes/custom/{id}`: `{requestId, expectedVersion, name, type, cl, step, cookMinutes}`. Only an owned custom dish can change.
- `DELETE /dishes/custom/{id}`: `{requestId, expectedVersion}`. Existing plan/actual snapshots are unchanged.
- `GET /dishes/custom` now returns the full persisted recipe representation for owned dishes, including rich fields and `contentVersion`.

`contentVersion` is a SHA-256 fingerprint of the persisted recipe content, excluding transport metadata, row identity, ownership and timestamps. It therefore detects content changes made through admin/legacy writers without requiring every writer to increment a new food-table column. Client-supplied `contentVersion` cannot override the getter.

Manual create/edit canonicalizes `CL` and `INGREDIENTS_AMOUNTS` to the submitted ingredient text and `STEP` and `STEPS` to the submitted step text. Name/time-only edits retain the exact original rich fields and step images when the normalized editor text is unchanged. Ingredient changes update both ingredient fields; actual step changes update both step fields and clear old step images so they cannot remain attached to the wrong steps. Changing cooking minutes synchronizes the legacy time label; explicitly clearing minutes clears that label. Detail prefers numeric minutes and otherwise falls back to legacy text. Copying itself preserves the full original rich ingredients, steps, step images, tips and servings.

Compatibility: `CustomDishService.createDish/updateDish/removeCustomDish` remain available for existing admin callers. Legacy `POST /dishes/custom` without a request ID remains accepted and retains its weaker, non-idempotent behavior. New UI always supplies a stable request ID. Personal edit/delete now require request ID and expected content version; older clients need the coordinated frontend update. Admin/legacy mutation concurrency behavior is otherwise unchanged.

### Menus

- `GET /menus`, `GET /menus/{id}`: owned nondeleted menus.
- `POST /menus`: `{requestId, expectedVersion:0, name, people, dishIds, dishVersions?}`.
- `PUT /menus/{id}`: same fields, with the last read `expectedVersion`.
- `DELETE /menus/{id}`: `{requestId, expectedVersion}`; leaves a versioned tombstone.
- `POST /menus/{id}/resolve`: `{expectedVersion, date, mealType}`; checks ownership, menu version, dish accessibility and saved content fingerprints.

Menu names are 1–100 characters; people are 1–50; composition is 1–10 distinct positive dish IDs. Optional `dishVersions` detects changes since browse/selection. The server always stores full authoritative dish snapshots, not client-provided recipe snapshots.

Resolve returns `{menuId, menuVersion, menuDate, menuMealType, people, dishIds}`. The frontend stores these plus `date/mealType` in the account-scoped `workspaceSelectedDishes` handoff. The existing workspace client sends the menu fields with the ordinary `select` command. Before the generated selection becomes a workspace draft, a server-side hook validates menu ownership/version, date/meal/people, exact dish IDs and generated recipe content against saved snapshots, then restores the saved menu order if workspace locks reordered the same dishes. A resolve-only check would not be sufficient.

Both recipe and menu mutations serialize on the authenticated user row and use the existing `meal_mutation_log` within the same transaction. Request hashes include the operation and target; repeated identical requests replay their original result, and reusing a key for different content fails with 409.

## Schema and release

`backend/db/migrations/V6_10__personal_menus.sql` creates/extends the previously orphaned `custom_recipes` table with `version`, `is_deleted`, `dish_snapshots_json` and an owner index. It is additive and reentrant. Old rows without a snapshot can be inspected/edited but cannot be applied until saved with a current composition. No food-table migration is needed.

The migration has not been executed. Its exact checksum is registered in the central migration manifest; apply it only through the authorized release process. Deploy frontend/backend/schema together because edit/delete request contracts changed. Keep snapshots and receipt tables on application rollback. No deployment, merge, production access or database execution was performed. Branch/PR publication and full-round validation are recorded in the final integration summary.

## Module development verification

This section describes this module's development checks, not every command run during the entire round. See [the final integration summary](testing/2026-10-08-product-foundations-results.md) for the integrated results and the disclosed earlier Java test-scope deviation.

- Node: `node --test tests/personal-recipes.test.js tests/personal-recipe-pages.test.js` covers exact-body retry, reload recovery, synchronous transport failure, repeated clicks, account switches, copy navigation, rich editor fields and target/version-bound menu handoff.
- Java, explicitly selected: `-Dtest=PersonalRecipeFoundationTest test` covers private/source ownership, stale versions, rich-field canonicalization, source immutability, content fingerprints, receipt replay/conflicting intent, menu limits/snapshots, changed/deleted dish rejection, target/people/selection checks, anonymous fail-closed behavior and mapper SQL boundaries.
- The Java validation snapshot includes only these changes over the verified baseline; final shared-tree integration is separate.
- No recommendation/model-service behavioral tests were run for this work. No paid provider or live service was called. SQL execution and native WeChat rendering remain unverified here; Node page tests run mocked native APIs and are not a device screenshot test.
