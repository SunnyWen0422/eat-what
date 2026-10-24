"""Offline checks that the full-runtime acceptance cannot bless wrong facts."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import canonical_catalog_acceptance as acceptance


class CanonicalAcceptanceContractTest(unittest.TestCase):
    def test_assistant_fixed_menu_observes_quantities_steps_nutrition_and_policy(self):
        import canonical_assistant_acceptance as assistant
        dish = {'id': 1, 'quantityPolicy': 'fixed-recipe-v1', 'recipe': {
            'quantityPolicy': 'fixed-recipe-v1', 'ingredients': [{'quantity': 100}],
            'steps': [{'text': '煮熟'}], 'calculatedNutrition': {'total': {'energyKcal': 80}}}}
        original = assistant.fixed_menu_facts([dish])
        for field, replacement in (('ingredients', [{'quantity': 800}]),
                                   ('steps', [{'text': '多做八份'}]),
                                   ('calculatedNutrition', {'total': {'energyKcal': 640}})):
            changed = copy.deepcopy(dish)
            changed['recipe'][field] = replacement
            self.assertNotEqual(original, assistant.fixed_menu_facts([changed]))
        dish['recipe']['quantityPolicy'] = 'scaled'
        with self.assertRaises(AssertionError):
            assistant.fixed_menu_facts([dish])

    def test_assistant_waits_for_real_java_capabilities_before_one_business_turn(self):
        import canonical_assistant_acceptance as assistant
        runner = Mock()
        observed = []
        ready = {'enabled': True, 'reads': ['read_favorites'], 'supportedUiFeatures': ['clarification_v1']}
        capabilities = iter([{'enabled': True, 'reads': [], 'supportedUiFeatures': []}, ready])
        def http(path, *args, **kwargs):
            observed.append(path)
            if path == '/assistant/v4/capabilities':
                return next(capabilities)
            self.assertEqual(observed[:2], ['/assistant/v4/capabilities'] * 2)
            return {'id': 'owned-workspace'} if path == '/meal-workspaces' else {'sessionId': 'owned-session'}
        runner.http.side_effect = http
        runner.turn.return_value = {'status': 'completed'}
        with patch.object(assistant.time, 'sleep'), patch.object(assistant.time, 'monotonic', return_value=0):
            _, _, turn, readiness = assistant.begin_shared_generation(runner, 910001, {})
        self.assertEqual(turn['status'], 'completed')
        self.assertEqual(readiness['attempts'], 2)
        runner.turn.assert_called_once()

    def test_assistant_negotiation_timeout_does_not_create_a_workspace_or_turn(self):
        import canonical_assistant_acceptance as assistant
        runner = Mock()
        runner.http.return_value = {'enabled': True, 'reads': [], 'supportedUiFeatures': []}
        with patch.object(assistant.time, 'monotonic', side_effect=[0, 16]), patch.object(assistant.time, 'sleep'):
            with self.assertRaisesRegex(AssertionError, 'capability negotiation'):
                assistant.begin_shared_generation(runner, 910001, {}, readiness_timeout=15)
        runner.http.assert_called_once_with('/assistant/v4/capabilities', user=910001)
        runner.turn.assert_not_called()

    def test_actual_nutrition_summary_requires_six_totals_and_does_not_invent_missing_entries(self):
        known = {"calculatedNutrition": {"total": {key: 6 for key in acceptance.NUTRIENTS}}}
        unknown = {"calculatedNutrition": {"total": None}}
        summary = {"entryCount": 2, "coveredCount": 1, "unknownCount": 1, "complete": False,
                   "personalIntakeAvailable": False, "knownTotal": {key: 6 for key in acceptance.NUTRIENTS}, "total": None}
        acceptance.check_nutrition_summary([known, unknown], summary)
        for bad in ({**summary, "total": summary["knownTotal"]},
                    {**summary, "knownTotal": {**summary["knownTotal"], "sodiumMg": 7}},
                    {**summary, "personalIntakeAvailable": True}):
            with self.assertRaises(AssertionError):
                acceptance.check_nutrition_summary([known, unknown], bad)
        summary.update(coveredCount=2, unknownCount=0, complete=True,
                       knownTotal={key: 12 for key in acceptance.NUTRIENTS}, total={key: 12 for key in acceptance.NUTRIENTS})
        acceptance.check_nutrition_summary([known, known], summary)

    def fixture(self):
        nutrition = {"completeness": "partial", "total": None, "perServing": None}
        recipe = {"id": 1, "name": "空值配方", "catalogContractVersion": 4, "quantityPolicy": "fixed-recipe-v1", "baseServings": None,
                  "categoryCode": "CAT_VEGETABLE_LEAF", "servingRole": "dish", "mealCodes": ["MEAL_DINNER"],
                  "dietaryCodes": None, "allergenCodes": None, "timing": {"totalMinutes": None},
                  "ingredients": [{"id": "i1", "ingredientId": "greens", "quantity": None, "defaultEnabled": True}],
                  "steps": [{"text": "加入青菜适量"}], "calculatedNutrition": nutrition}
        detail = {"id": 1, "name": recipe["name"], "catalogRevision": "test-v4", "recipe": copy.deepcopy(recipe),
                  "quantityPolicy": "fixed-recipe-v1",
                  "scaledRecipe": {"recipeId": 1, "diners": None, "baseServings": None, "nutrition": copy.deepcopy(nutrition),
                    "quantityPolicy": "fixed-recipe-v1", "quantityBasis": "fixed_recipe", "portionBasis": "equal_share_reference",
                    "ingredients": [{"lineId": "i1", "ingredientId": "greens", "enabled": True,
                                     "quantity": None, "quantityDisplay": "适量", "grams": None}],
                    "steps": [{"text": "加入青菜适量"}]}}
        return recipe, detail

    def test_sharing_keeps_fixed_quantities_and_whole_nutrition_even_without_known_base(self):
        source, detail = self.fixture()
        source["ingredients"][0]["quantity"] = 100
        source["calculatedNutrition"] = {"completeness": "complete", "total": {key: 80 for key in acceptance.NUTRIENTS}, "perServing": None}
        baseline = detail["scaledRecipe"]
        baseline["ingredients"][0].update(quantity=100, quantityDisplay="100克", grams=100, procurementQuantity=125)
        baseline["nutrition"] = copy.deepcopy(source["calculatedNutrition"])
        for diners in (1, 2, 8):
            shared = copy.deepcopy(baseline)
            shared["diners"] = diners
            shared["nutrition"]["perServing"] = {key: 80 / diners for key in acceptance.NUTRIENTS}
            acceptance.check_fixed_calculation(source, shared, diners, baseline)
            for field in ("quantity", "procurementQuantity"):
                wrong = copy.deepcopy(shared)
                wrong["ingredients"][0][field] *= 2
                with self.assertRaises(AssertionError):
                    acceptance.check_fixed_calculation(source, wrong, diners, baseline)
            wrong = copy.deepcopy(shared)
            wrong["nutrition"]["total"]["energyKcal"] *= diners + 1
            with self.assertRaises(AssertionError):
                acceptance.check_fixed_calculation(source, wrong, diners, baseline)
        baseline["nutrition"]["perServing"] = {key: 80 for key in acceptance.NUTRIENTS}
        with self.assertRaises(AssertionError):
            acceptance.check_fixed_calculation(source, baseline)

    def test_nulls_are_valid_but_numeric_replacements_and_unknown_safety_replacements_fail(self):
        source, detail = self.fixture()
        acceptance.check_detail(source, detail, "test-v4")
        for field, value in (("baseServings", 1), ("allergenCodes", []), ("dietaryCodes", [])):
            invalid = copy.deepcopy(detail)
            invalid["recipe"][field] = value
            with self.assertRaises(AssertionError):
                acceptance.check_detail(source, invalid, "test-v4")
        for key in ("quantity", "grams"):
            invalid = copy.deepcopy(detail)
            invalid["scaledRecipe"]["ingredients"][0][key] = 0
            with self.assertRaises(AssertionError):
                acceptance.check_detail(source, invalid, "test-v4")

    def test_default_nutrition_cannot_be_replaced_by_zero_or_maintenance_subtotal(self):
        source, detail = self.fixture()
        for bad in ({"total": {"energyKcal": 0}}, {"quantifiedSubtotal": {"total": {"energyKcal": 3}}}):
            invalid = copy.deepcopy(detail)
            invalid["scaledRecipe"]["nutrition"].update(bad)
            with self.assertRaises(AssertionError):
                acceptance.check_detail(source, invalid, "test-v4")

    def test_runtime_guard_rejects_external_or_unowned_services_before_database_access(self):
        db = Mock()
        state = {"purpose": "canonical-catalog-isolated", "providerMode": "mock", "database": "eatwhat_catalog_local_1234abcd"}
        for endpoint in ("https://example.com/api", "http://localhost:8080/api", "http://127.0.0.1:8080/api?target=remote"):
            with self.assertRaises(AssertionError):
                acceptance.validate_owned({**state, "api": endpoint}, db, ROOT.parent / "work")
        db.ping.assert_not_called()

    def test_preliminary_can_collect_diagnostics_but_never_reports_final_success(self):
        bundle = {"catalogRevision": "fixture", "recipes": [], "ingredients": []}
        checks = Mock(count=0, recipes={1: {}, 2: {}})
        for method in ("all_details", "scaling", "filters", "workspace", "shopping"):
            getattr(checks, method).return_value = {"diagnostic": True}
        checks.pages.return_value = [1]
        state = {"catalogSha256": "fixture", "sourceFingerprint": "old", "jarSha256": "actual-jar", "publicCatalogAllowedIds": [1]}
        with tempfile.TemporaryDirectory(dir=ROOT.parent / "work") as directory:
            Path(directory, "preliminary.json").write_text('{"enabled":true}', encoding="utf-8")
            with patch.object(acceptance, "validate_owned", return_value=bundle), patch.object(acceptance, "Checks", return_value=checks), \
                    patch("maturity_runtime.backend_fingerprint", return_value="editing"), \
                    patch("canonical_assistant_acceptance.run", return_value={"diagnostic": True}):
                report = acceptance.run(state, Mock(), directory)
                self.assertTrue(report["completed"])
                self.assertTrue(report["preliminary"])
                self.assertFalse(report["passed"])
                self.assertFalse(report["finalAcceptance"])
                self.assertEqual("actual-jar", report["jarSha256"])
                Path(directory, "preliminary.json").unlink()
                with self.assertRaises(AssertionError):
                    acceptance.run(state, Mock(), directory)


if __name__ == "__main__":
    unittest.main()
