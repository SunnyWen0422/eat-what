import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('update', Path(__file__).resolve().parents[1] / 'scripts/update_catalog_nutrition.py')
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)


class NutritionUpdatePreparation(unittest.TestCase):
    def bundles(self):
        old = {'quantityPolicy': 'fixed-recipe-v1', 'catalogContractVersion': 4,
               'catalogRevision': 'old', 'nutritionRuleVersion': 'old', 'sourceCatalogRevision': 'original',
               'idMapping': [{'oldDishId': 1, 'dishId': 1}],
               'ingredients': [{'id': 'rice', 'name': '米', 'nutritionPer100g': None}],
               'recipes': [{'id': 1, 'name': '饭', 'ingredients': [{'ingredientId': 'rice', 'quantity': 100}],
                            'steps': [{'text': '煮熟'}], 'calculatedNutrition': {'total': None}}]}
        new = copy.deepcopy(old)
        new.update(catalogRevision='new', nutritionRuleVersion='main')
        new['recipes'][0]['calculatedNutrition'] = {'scope': 'main_ingredients', 'total': None}
        new['ingredients'][0]['nutritionPer100g'] = {'energyKcal': 100}
        return old, new

    def test_nutrition_only_patch_and_mysql_numeric_roundtrip(self):
        old, new = self.bundles()
        patch = update.prepare(old, new)
        self.assertEqual(len(patch['recipes']), 1)
        self.assertEqual(patch['ingredients'][0]['changes'], {'nutritionPer100g': {'energyKcal': 100}})
        self.assertEqual(update.fingerprint(100), update.fingerprint(100.0))
        self.assertEqual(update.fingerprint(10.000000000000004), update.fingerprint(10))

    def test_recipe_edits_are_rejected(self):
        for field in ('name', 'steps', 'ingredients'):
            old, new = self.bundles()
            new['recipes'][0][field] = 'unexpected'
            with self.subTest(field=field), self.assertRaises(AssertionError):
                update.prepare(old, new)

    def test_ingredient_identity_edits_are_rejected(self):
        old, new = self.bundles()
        new['ingredients'][0]['name'] = '另一种材料'
        with self.assertRaises(AssertionError): update.prepare(old, new)

    def test_duplicates_and_id_mapping_changes_are_rejected(self):
        old, new = self.bundles()
        new['recipes'].append(copy.deepcopy(new['recipes'][0]))
        with self.assertRaises(AssertionError): update.prepare(old, new)
        old, new = self.bundles()
        new['idMapping'][0]['dishId'] = 9
        with self.assertRaises(AssertionError): update.prepare(old, new)

    def test_scope_and_unrelated_metadata_changes_are_rejected(self):
        old, new = self.bundles()
        new['recipes'][0]['calculatedNutrition']['scope'] = 'whole'
        with self.assertRaises(AssertionError): update.prepare(old, new)
        old, new = self.bundles()
        new['taxonomyVersion'] = 'unexpected'
        with self.assertRaises(AssertionError): update.prepare(old, new)


if __name__ == '__main__': unittest.main()
