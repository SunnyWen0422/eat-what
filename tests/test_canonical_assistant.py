"""Canonical facts, release invalidation and single-calculator contract tests."""
import copy
import importlib
import json
import os
import sqlite3
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, Mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "recommend-service"))
import canonical_catalog as canonical
from canonical_catalog_fixture import canonical_row
import authorized_catalog
import rag


class CanonicalCatalogTest(unittest.TestCase):
    def test_fixed_policy_is_required_and_old_scaling_cannot_enter_any_reader(self):
        source = canonical_row()["recipe"]
        ingredient = source["ingredients"][0].pop("ingredient")
        definitions = {ingredient["id"]: ingredient}
        metadata = {"catalogContractVersion": 4, "catalogRevision": "fixed", "quantityPolicy": "fixed-recipe-v1"}
        canonical.project_recipe(source, definitions, metadata)
        with self.assertRaises(ValueError):
            canonical.project_recipe(source, definitions, {key: value for key, value in metadata.items() if key != "quantityPolicy"})
        for field in ("scaling", "scaleRule"):
            obsolete = copy.deepcopy(source)
            (obsolete if field == "scaling" else obsolete["ingredients"][0])[field] = {"type": "linear"}
            with self.assertRaises(ValueError):
                canonical.project_recipe(obsolete, definitions, metadata)
        obsolete = copy.deepcopy(source)
        obsolete["calculatedNutrition"] = {"perServing": None, "perServingUnavailableReason": "unknown_base_servings"}
        with self.assertRaises(ValueError):
            canonical.project_recipe(obsolete, definitions, metadata)
        for mutate in (lambda row: row.pop("quantityPolicy"),
                       lambda row: row["recipe"].update(quantityPolicy="scaled-recipe"),
                       lambda row: row["recipe"].update(scaling={"maxServingsPerBatch": 4})):
            row = canonical_row()
            mutate(row)
            with self.assertRaises(ValueError):
                rag._install([row], row["catalogRevision"])
            with self.assertRaises(ValueError):
                authorized_catalog.execute_read_tool({"ownerUserId": 7, "catalog": [row]}, 7, "search_dishes", {})

    def test_compound_ingredient_exclusions_use_resolved_constituents_and_optional_defaults(self):
        row = canonical_row(ingredients=("compound-sauce",))
        line = row["recipe"]["ingredients"][0]
        line["ingredient"]["constituentIngredients"] = [{"id": "shrimp", "name": "虾", "aliases": ["虾仁"]}]
        context = {"ownerUserId": 7, "catalog": [row]}
        filters = {"excluded_ingredients": ["虾仁"]}
        self.assertEqual([], authorized_catalog.execute_read_tool(context, 7, "search_dishes", {"filters": filters}))
        line.update(optional=True, defaultEnabled=False)
        self.assertEqual([row], authorized_catalog.execute_read_tool(context, 7, "search_dishes", {"filters": filters}))

    def test_projection_resolves_compound_definitions_and_rejects_cycles(self):
        recipe = canonical_row(ingredients=("sauce",))["recipe"]
        ingredient = recipe["ingredients"][0].pop("ingredient")
        ingredient["compositionSource"] = {"constituents": [{"ingredientId": "shrimp"}]}
        definitions = {"sauce": ingredient, "shrimp": {"id": "shrimp", "name": "虾", "aliases": ["虾仁"]}}
        metadata = {"catalogContractVersion": 4, "quantityPolicy": "fixed-recipe-v1", "catalogRevision": "fixture-v4"}
        projected = canonical.project_recipe(recipe, definitions, metadata)
        self.assertIn("虾仁", projected["ingredient_terms"])
        definitions["shrimp"]["compositionSource"] = {"constituents": [{"ingredientId": "sauce"}]}
        with self.assertRaises(ValueError):
            canonical.project_recipe(recipe, definitions, metadata)

    def test_consumer_projection_does_not_publish_partial_subtotal_or_maintenance_dependencies(self):
        recipe = canonical_row()["recipe"]
        definition = recipe["ingredients"][0].pop("ingredient")
        definition.update(nutritionPer100g={"energyKcal": 20}, gramsPerUnit=1,
                          compositionSource={"sourceId": "audit-only"}, conversionNote="maintenance")
        recipe["provenance"] = {"sourceSnapshot": "audit-only"}
        recipe["calculatedNutrition"] = {"completeness": "partial", "total": None, "perServing": None,
                                         "quantifiedSubtotal": {"total": {"energyKcal": 20}}, "unknownLineIds": ["i1"]}
        row = canonical.project_recipe(recipe, {definition["id"]: definition},
                                       {"catalogContractVersion": 4, "quantityPolicy": "fixed-recipe-v1", "catalogRevision": "fixture-v4"})
        self.assertNotIn("provenance", row["recipe"])
        self.assertEqual({"completeness": "partial", "total": None, "perServing": None}, row["recipe"]["calculatedNutrition"])
        for key in ("compositionSource", "conversionNote", "nutritionPer100g", "gramsPerUnit"):
            self.assertNotIn(key, row["recipe"]["ingredients"][0]["ingredient"])

    def test_recorded_base_steps_render_without_mutating_source_or_guessing_amounts(self):
        recipe = canonical_row()["recipe"]
        recipe["ingredients"].append({**copy.deepcopy(recipe["ingredients"][0]), "id": "i2", "quantity": None,
                                      "quantityKind": "discretionary", "quantityDisplay": "适量", "optional": True,
                                      "defaultEnabled": False})
        recipe["steps"][0]["text"] = "加入{{amount:i1}}青菜，调料{{amount:i2}}"
        original = copy.deepcopy(recipe)
        self.assertEqual("加入100克青菜，调料不添加", canonical.render_base_steps(recipe)[0]["text"])
        self.assertEqual(original, recipe)
        recipe["ingredients"][1]["defaultEnabled"] = True
        self.assertEqual("加入100克青菜，调料适量", canonical.render_base_steps(recipe)[0]["text"])
        recipe["steps"][0]["text"] = "加入{{amount:missing}}"
        with self.assertRaises(ValueError):
            canonical.render_base_steps(recipe)

    def test_read_catalog_pages_real_queries_and_rejects_invalid_id_batches(self):
        raw = sqlite3.connect(":memory:")
        raw.row_factory = sqlite3.Row
        queries = []
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, query, params=()):
                queries.append((query, list(params)))
                self.result = raw.execute(query.replace("%s", "?"), params)
            def fetchone(self): return self.result.fetchone()
            def fetchall(self): return self.result.fetchall()
        class Connection:
            def cursor(self): return Cursor()
        try:
            raw.execute("CREATE TABLE catalog_metadata (id INTEGER, document TEXT)")
            raw.execute("CREATE TABLE catalog_ingredient (id TEXT, document TEXT)")
            raw.execute("CREATE TABLE catalog_recipe (id INTEGER, document TEXT, owner_id INTEGER, is_published INTEGER)")
            raw.execute("INSERT INTO catalog_metadata VALUES (1, ?)", (json.dumps({"catalogContractVersion": 4, "quantityPolicy": "fixed-recipe-v1", "catalogRevision": "pages"}),))
            for identifier in range(1, 4):
                recipe = canonical_row(identifier, ingredients=("ingredient-" + str(identifier),))["recipe"]
                definition = recipe["ingredients"][0].pop("ingredient")
                raw.execute("INSERT INTO catalog_ingredient VALUES (?, ?)", (definition["id"], json.dumps(definition)))
                raw.execute("INSERT INTO catalog_recipe VALUES (?, ?, NULL, 1)", (identifier, json.dumps(recipe)))
            _, rows = canonical.read_catalog(Connection(), page_size=2)
            self.assertEqual([1, 2, 3], [row["id"] for row in rows])
            bounded = [(query, params) for query, params in queries if "catalog_metadata" not in query]
            self.assertEqual(4, len(bounded))
            self.assertTrue(all("LIMIT %s" in query and params[-1] == 2 for query, params in bounded))
            for ids in ([True], [1.5], [0], list(range(1, 502))):
                with self.assertRaises(ValueError):
                    canonical.read_catalog(Connection(), ids=ids, page_size=2)
        finally:
            raw.close()

    def test_legacy_scale_tool_can_request_original_batch_and_optional_selection(self):
        import agent_tools
        import agent_schemas
        result = {"recipeId": 1, "catalogRevision": "fixture-release-4", "diners": None, "baseServings": None,
                  "ingredients": [], "steps": []}
        call = {"name": "scale_recipe_ingredients", "arguments": {"dish": canonical_row(), "optional_overrides": {"i1": False}}}
        validated = agent_schemas.validate_tool_call(call, {call["name"]}, agent_tools.catalog()["tools"])
        with patch("catalog_service.scale_recipe", return_value=result) as remote:
            value = agent_tools.execute_tool(call["name"], validated["arguments"], "user:42")
            self.assertIsNone(value["target_people"])
            remote.assert_called_once_with(1, None, 42, optional_overrides={"i1": False})

    def test_v4_unknowns_remain_null_and_discretionary_quantity_is_not_zero(self):
        source = canonical_row()["recipe"]
        source.update(baseServings=None, dietaryCodes=None, allergenCodes=None,
                      calculatedNutrition={"total": None, "perServing": None})
        source["timing"]["totalMinutes"] = None
        line = source["ingredients"][0]
        definition = line.pop("ingredient")
        line.update(quantity=None, quantityKind="discretionary", quantityDisplay="适量")
        row = canonical.project_recipe(source, {definition["id"]: definition},
                                       {"catalogContractVersion": 4, "quantityPolicy": "fixed-recipe-v1", "catalogRevision": "fixture-v4"})
        self.assertEqual(4, row["catalogContractVersion"])
        self.assertIsNone(row["kcal"])
        self.assertIsNone(row["cook_minutes"])
        self.assertIsNone(row["fl"])
        self.assertIsNone(row["recipe"]["baseServings"])
        self.assertIsNone(row["recipe"]["allergenCodes"])
        self.assertEqual("青菜：适量", row["cl"])

    def test_unknown_allergens_cannot_satisfy_explicit_exclusions_in_both_readers(self):
        row = canonical_row()
        row["recipe"].update(allergenCodes=None, dietaryCodes=None)
        context = {"ownerUserId": 7, "catalog": [row]}
        for filters in ({"excluded_allergen_codes": ["ALLERGEN_SOY"]},
                        {"dietary_codes": ["DIET_VEGAN"]},
                        {"exclude_tag_codes": ["ALLERGEN_SOY"]}):
            self.assertEqual([], authorized_catalog.execute_read_tool(context, 7, "search_dishes", {"filters": filters}))
            with patch.object(rag, "load_index"), patch.object(rag, "_dish_meta", [row]):
                self.assertEqual([], rag.search_candidates("", filters))
        self.assertEqual([row], authorized_catalog.execute_read_tool(context, 7, "search_dishes", {}))

    def test_old_contract_rows_are_rejected_even_with_same_release(self):
        row = canonical_row()
        row["catalogContractVersion"] = 2
        with self.assertRaises(ValueError):
            authorized_catalog.execute_read_tool({"ownerUserId": 7, "catalog": [row]}, 7, "search_dishes", {})
        with self.assertRaises(ValueError):
            rag._install([row], row["catalogRevision"])

    def test_condiments_remain_browsable_but_never_occupy_automatic_slots(self):
        row = canonical_row()
        row["recipe"]["servingRole"] = "condiment"
        with patch.object(rag, "load_index"), patch.object(rag, "_dish_meta", [row]):
            self.assertEqual([], rag.search_candidates("", {"automatic_slots": True}))
            self.assertEqual([1], [item["id"] for item in rag.search_candidates("")])

    def test_structured_identity_does_not_split_cornstarch_or_infer_fish_from_name(self):
        row = canonical_row(name="鱼香玉米淀粉", ingredients=("cornstarch",))
        row["recipe"]["ingredients"][0]["ingredient"].update(name="玉米淀粉", aliases=["玉米淀粉"])
        context = {"ownerUserId": 7, "catalog": [row]}
        self.assertEqual([], authorized_catalog.execute_read_tool(context, 7, "search_by_ingredients", {"ingredients": ["玉米"]}))
        self.assertEqual([row], authorized_catalog.execute_read_tool(context, 7, "search_dishes", {"filters": {"excluded_ingredients": ["鱼"]}}))
        self.assertEqual([], authorized_catalog.execute_read_tool(context, 7, "search_dishes", {"filters": {"excluded_ingredients": ["cornstarch"]}}))
        with self.assertRaises(ValueError):
            authorized_catalog.execute_read_tool(context, 8, "get_dish_details", {"dish_ids": [1]})

    def test_release_and_missing_canonical_facts_fail_closed(self):
        rows = [canonical_row(), canonical_row(2, release="other-release")]
        for catalog in (rows, [{"id": 1, "name": "old", "cl": "鸡蛋"}]):
            with self.assertRaises(ValueError):
                authorized_catalog.execute_read_tool({"ownerUserId": 7, "catalog": catalog}, 7, "search_dishes", {})

    def test_meals_allergens_and_dietary_codes_are_structured(self):
        row = canonical_row()
        row["recipe"]["allergenCodes"] = ["ALLERGEN_SOY"]
        context = {"ownerUserId": 7, "catalog": [row]}
        for filters in ({"excluded_allergen_codes": ["ALLERGEN_SOY"]}, {"meal_codes": ["MEAL_SNACK"]}, {"dietary_codes": ["DIET_VEGETARIAN"]}):
            self.assertEqual([], authorized_catalog.execute_read_tool(context, 7, "search_dishes", {"filters": filters}))
        self.assertEqual([row], authorized_catalog.execute_read_tool(context, 7, "search_dishes", {"filters": {"meal_codes": ["MEAL_BREAKFAST"]}}))

    def test_index_rebuilds_when_release_changes_and_does_not_read_unversioned_cache(self):
        fake_db = Mock()
        row = canonical_row(release="new-release")
        fake_db.fetch_catalog_revision.return_value = "new-release"
        fake_db.fetch_canonical_catalog.return_value = ({"catalogRevision": "new-release"}, [row])
        with tempfile.TemporaryDirectory(dir=ROOT.parent / "work") as directory, patch.dict(sys.modules, {"db": fake_db}), patch.object(rag, "META_PATH", str(Path(directory) / "index.json")), patch.object(rag, "_catalog_revision", "old-release"), patch.object(rag, "_dish_meta", [canonical_row(release="old-release")]), patch.object(rag, "_ingredient_map", {}):
            Path(rag.META_PATH).write_text(json.dumps([{"id": 999}]), encoding="utf-8")
            rag.load_index()
            self.assertEqual("new-release", rag._dish_meta[0]["catalogRevision"])
            self.assertEqual(1, fake_db.fetch_canonical_catalog.call_count)
            fake_db.fetch_catalog_revision.side_effect = RuntimeError("database unavailable")
            with self.assertRaises(RuntimeError):
                rag.search_candidates("")

    def test_favorites_do_not_change_search_order(self):
        rows = [canonical_row(1, "A"), canonical_row(2, "B")]
        with patch.object(rag, "load_index"), patch.object(rag, "_dish_meta", rows):
            baseline = rag.search_candidates("")
            favored = rag.search_candidates("", {"favorite_dish_ids": [2]})
            self.assertEqual([d["id"] for d in baseline], [d["id"] for d in favored])

    def test_calculator_calls_java_with_identity_and_owner_only(self):
        import catalog_service
        result = {"recipeId": 1, "catalogRevision": "release", "catalogContractVersion": 4, "servings": 7, "baseServings": 3,
                  "diners": 7, "quantityPolicy": "fixed-recipe-v1", "quantityBasis": "fixed_recipe", "portionBasis": "equal_share_reference",
                  "ingredients": [{"ingredientId": "egg", "quantity": "5"}], "steps": [], "nutrition": {}}
        response = Mock(); response.json.return_value = result
        client = Mock(); client.__enter__ = Mock(return_value=client); client.__exit__ = Mock(return_value=False)
        client.post.return_value = response
        with patch.dict(os.environ, {"CATALOG_SERVICE_BASE_URL": "http://127.0.0.1:12345", "MEAL_WORKSPACE_SERVICE_TOKEN": "test-only"}), patch.object(catalog_service.httpx, "Client", return_value=client):
            self.assertEqual(result, catalog_service.scale_recipe(1, 7, 42))
            args, kwargs = client.post.call_args
            self.assertEqual("http://127.0.0.1:12345/api/internal/catalog/scale", args[0])
            self.assertEqual({"dishId": 1, "servings": "7", "userId": 42}, kwargs["json"])
            self.assertEqual({"X-Service-Token": "test-only"}, kwargs["headers"])
            for invalid in (0, "NaN", True):
                with self.assertRaises(ValueError):
                    catalog_service.scale_recipe(1, invalid, 42)
            for field in ("catalogContractVersion", "quantityPolicy", "quantityBasis", "portionBasis", "diners"):
                response.json.return_value = {key: value for key, value in result.items() if key != field}
                with self.assertRaises(ValueError):
                    catalog_service.scale_recipe(1, 7, 42)

    def test_calculator_original_batch_and_optional_overrides_preserve_nullable_response(self):
        import catalog_service
        result = {"recipeId": 1, "catalogRevision": "release", "catalogContractVersion": 4, "servings": None, "baseServings": None,
                  "diners": None, "quantityPolicy": "fixed-recipe-v1", "quantityBasis": "fixed_recipe", "portionBasis": "equal_share_reference",
                  "ingredients": [{"lineId": "i1", "quantity": None, "quantityKind": "discretionary", "quantityDisplay": "适量"}],
                  "steps": [], "nutrition": {"total": None, "perServing": None}}
        response = Mock(); response.json.return_value = result
        client = Mock(); client.__enter__ = Mock(return_value=client); client.__exit__ = Mock(return_value=False)
        client.post.return_value = response
        with patch.dict(os.environ, {"CATALOG_SERVICE_BASE_URL": "http://127.0.0.1:12345", "MEAL_WORKSPACE_SERVICE_TOKEN": "test-only"}), patch.object(catalog_service.httpx, "Client", return_value=client):
            self.assertEqual(result, catalog_service.scale_recipe(1, None, 42, optional_overrides={"i1": False}))
            self.assertEqual({"dishId": 1, "servings": None, "userId": 42, "optionalOverrides": {"i1": False}}, client.post.call_args.kwargs["json"])
            # The recorded base is unrelated to whether explicit diners may share the recipe.
            result.update(diners=5, servings=5)
            self.assertEqual(result, catalog_service.scale_recipe(1, 5, 42))
            result.update(diners=None, servings=None, baseServings=3)
            self.assertEqual(result, catalog_service.scale_recipe(1, None, 42))
            for invalid in ({"i1": 0}, {"i1": "false"}, {"": True}, []):
                with self.assertRaises(ValueError):
                    catalog_service.scale_recipe(1, None, 42, optional_overrides=invalid)

    @unittest.skipUnless(os.environ.get("CANONICAL_CATALOG_FIXTURE"), "Set CANONICAL_CATALOG_FIXTURE for owned full-catalog input")
    def test_full_catalog_projection(self):
        source = json.loads(Path(os.environ["CANONICAL_CATALOG_FIXTURE"]).read_text(encoding="utf-8-sig"))
        definitions = {item["id"]: item for item in source["ingredients"]}
        self.assertEqual(5407, len(source["recipes"]))
        for recipe in source["recipes"]:
            row = canonical.project_recipe(recipe, definitions, source)
            self.assertEqual(recipe["id"], row["id"])
            self.assertEqual(recipe["baseServings"], row["recipe"]["baseServings"])
            self.assertEqual(source["catalogRevision"], row["catalogRevision"])
            self.assertEqual(len(recipe["steps"]), len(row["steps"]))
            self.assertFalse(any("{{" in step["text"] for step in row["steps"]))
            self.assertEqual(len(recipe["ingredients"]), len(row["ingredient_ids"]))


if __name__ == "__main__":
    unittest.main()
