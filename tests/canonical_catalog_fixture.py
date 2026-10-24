"""Small, fully structured fixtures for Python canonical boundaries."""
import copy


def canonical_row(identifier=1, name="测试菜", ingredients=("青菜",), category="CAT_VEGETABLE_LEAF",
                  codes=("INTENSITY_LIGHT",), cuisine="CUISINE_HOME_STYLE", minutes=10, release="fixture-release-4"):
    lines = [{"id": "i" + str(index), "ingredientId": ingredient, "quantity": 100, "unit": "g",
              "role": "main", "optional": False, "defaultEnabled": True, "preparation": "切块",
              "quantityKind": "exact", "ingredient": {"id": ingredient, "name": ingredient,
              "aliases": [], "animal": False, "allergens": []}} for index, ingredient in enumerate(ingredients, 1)]
    recipe = {"id": identifier, "name": name, "baseServings": 3, "quantityPolicy": "fixed-recipe-v1", "categoryCode": category,
              "mealCodes": ["MEAL_BREAKFAST", "MEAL_LUNCH", "MEAL_DINNER"], "cuisineCode": cuisine,
              "flavor": {"baseCodes": [], "specialCodes": []}, "operationCodes": list(codes),
              "dietaryCodes": ["DIET_VEGAN"], "allergenCodes": [], "methodCodes": ["METHOD_STIR_FRY"],
              "ingredients": lines, "steps": [{"id": "s1", "text": "炒熟", "ingredientLineIds": [line["id"] for line in lines]}],
              "timing": {"totalMinutes": minutes}, "servingRole": "dish", "dishGroupId": "group-" + str(identifier)}
    kind = {"CAT_VEGETABLE_LEAF": "veg", "CAT_SOUP_CLEAR": "soup", "CAT_MEAT_AQUATIC": "meat"}[category]
    return {"id": identifier, "name": name, "type": kind, "recipe": recipe, "catalogRevision": release, "catalogContractVersion": 4, "quantityPolicy": "fixed-recipe-v1",
            "ingredient_terms": list(ingredients), "ingredients": list(ingredients), "tag_codes": list(codes),
            "cuisine_code": cuisine, "cook_minutes": minutes, "tags": list(codes), "methods": [],
            "doc": name + " " + " ".join(ingredients)}
