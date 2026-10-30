"""Canonical catalog v4 read adapters. No text-derived facts or scaling arithmetic."""
from __future__ import annotations

import copy
import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any

QUANTITY_POLICY = "fixed-recipe-v1"

class CatalogContractError(ValueError):
    pass


def document(value: Any) -> dict:
    value = json.loads(value) if isinstance(value, (str, bytes)) else value
    if not isinstance(value, dict):
        raise CatalogContractError("Canonical document is required")
    return value


def revision(metadata: dict) -> str:
    if (metadata.get("catalogContractVersion") != 4 or not metadata.get("catalogRevision")
            or metadata.get("quantityPolicy") != QUANTITY_POLICY):
        raise CatalogContractError("Unsupported or missing catalog release")
    return str(metadata["catalogRevision"])


def require_fixed_recipe(recipe: dict) -> None:
    nutrition = recipe.get("calculatedNutrition") or {}
    if (recipe.get("quantityPolicy", QUANTITY_POLICY) != QUANTITY_POLICY
            or "scaling" in recipe or any("scaleRule" in line for line in recipe.get("ingredients", []))
            or nutrition.get("perServing") is not None
            or nutrition.get("perServingUnavailableReason") not in (None, "diners_not_specified")):
        raise CatalogContractError("Recipe must use fixed quantities without inferred per-person nutrition")


def menu_type(category: str) -> str:
    for prefix, value in (("CAT_MEAT", "meat"), ("CAT_VEGETABLE", "veg"),
                          ("CAT_SOUP", "soup"), ("CAT_STAPLE", "staple"), ("CAT_DESSERT", "dessert")):
        if category == prefix or category.startswith(prefix + "_"):
            return value
    raise CatalogContractError("Unknown canonical recipe category")


def ingredient_terms(recipe: dict) -> set[str]:
    terms = set()
    def include(definition, path=()):
        if not isinstance(definition, dict) or not definition.get("id") or not definition.get("name"):
            raise CatalogContractError("Canonical ingredient identity is missing")
        if definition["id"] in path or len(path) >= 20:
            raise CatalogContractError("Invalid compound ingredient cycle")
        terms.update(str(value).strip().casefold() for value in
                     [definition["id"], definition["name"], *(definition.get("aliases") or [])])
        for child in definition.get("constituentIngredients") or []:
            include(child, (*path, definition["id"]))
    for line in recipe.get("ingredients", []):
        definition = line.get("ingredient")
        if not isinstance(definition, dict) or definition.get("id") != line.get("ingredientId"):
            raise CatalogContractError("Canonical ingredient definition is missing")
        if line.get("defaultEnabled", True):
            include(definition)
    return terms


def resolved_ingredient(identifier: str, definitions: dict, path=()) -> dict:
    if identifier in path or len(path) >= 20:
        raise CatalogContractError("Invalid compound ingredient cycle")
    source = definitions.get(identifier)
    if not isinstance(source, dict) or source.get("id") != identifier:
        raise CatalogContractError("Unresolved canonical ingredient")
    public_fields = {"id", "name", "aliases", "group", "unit", "specification", "animal", "animalOrigins", "allergens"}
    result = {key: copy.deepcopy(value) for key, value in source.items() if key in public_fields}
    result["constituentIngredients"] = [resolved_ingredient(child["ingredientId"], definitions, (*path, identifier))
                                       for child in (source.get("compositionSource") or {}).get("constituents", [])]
    return result


def tag_codes(recipe: dict) -> list[str]:
    flavor = recipe.get("flavor", {})
    codes = [*(flavor.get("baseCodes") or []), *(flavor.get("specialCodes") or []),
             *(recipe.get("methodCodes") or []), *(recipe.get("sceneCodes") or []),
             *(recipe.get("operationCodes") or []), *(recipe.get("dietaryCodes") or []),
             *(recipe.get("allergenCodes") or []), *(recipe.get("compositionCodes") or [])]
    if flavor.get("intensityCode"):
        codes.append(flavor["intensityCode"])
    return list(dict.fromkeys(codes))


def satisfies_fact_filters(recipe: dict, filters: dict) -> bool:
    """An unknown fact cannot establish that an explicit restriction is safe."""
    allergens = recipe.get("allergenCodes")
    excluded = set(filters.get("excluded_allergen_codes") or [])
    excluded.update(code for code in filters.get("exclude_tag_codes") or [] if code.startswith("ALLERGEN_"))
    if excluded and (allergens is None or excluded.intersection(allergens)):
        return False
    dietary = set(filters.get("dietary_codes") or [])
    if dietary and not dietary.issubset(recipe.get("dietaryCodes") or []):
        return False
    return True


def base_quantity_display(line: dict) -> str:
    """Format a recorded base amount, without calculating a new amount."""
    if line.get("quantityKind") == "discretionary" and line.get("quantity") is None:
        return "适量"
    try:
        value = Decimal(str(line.get("quantity")))
    except InvalidOperation:
        raise CatalogContractError("Invalid canonical quantity") from None
    if not value.is_finite() or value < 0 or isinstance(line.get("quantity"), bool):
        raise CatalogContractError("Invalid canonical quantity")
    quantity = format(value, "f")
    if "." in quantity:
        quantity = quantity.rstrip("0").rstrip(".")
    return quantity + {"g": "克", "ml": "毫升", "piece": "个"}.get(line["unit"], line["unit"])


def render_base_steps(recipe: dict) -> list[dict]:
    """Resolve recorded recipe amounts only; Java owns optional-selection calculations."""
    lines = {line["id"]: line for line in recipe["ingredients"]}
    def replace(match):
        line = lines.get(match.group(1))
        if line is None:
            raise CatalogContractError("Unresolved canonical step amount")
        return base_quantity_display(line) if line.get("defaultEnabled", True) else "不添加"
    steps = copy.deepcopy(recipe["steps"])
    for step in steps:
        step["text"] = re.sub(r"\{\{amount:([^}]+)\}\}", replace, step["text"])
        if "{{" in step["text"] or "}}" in step["text"]:
            raise CatalogContractError("Unsupported canonical step placeholder")
    return steps


def project_recipe(source: dict, definitions: dict, metadata: dict) -> dict:
    """Return a disposable compatibility projection of the single current recipe."""
    release = revision(metadata)
    require_fixed_recipe(source)
    recipe = copy.deepcopy(source)
    recipe["quantityPolicy"] = QUANTITY_POLICY
    required = ("id", "name", "baseServings", "categoryCode", "mealCodes", "ingredients", "steps", "timing")
    if (any(key not in recipe for key in required) or
            (recipe["baseServings"] is not None and
             (isinstance(recipe["baseServings"], bool) or recipe["baseServings"] <= 0))):
        raise CatalogContractError("Incomplete canonical recipe")
    for line in recipe["ingredients"]:
        line["ingredient"] = resolved_ingredient(line.get("ingredientId"), definitions)
    terms = ingredient_terms(recipe)
    codes = tag_codes(recipe)
    taxonomy = metadata.get("taxonomy", {}).get("entries", {})
    labels = [taxonomy.get(code, {}).get("label", code) for code in codes]
    ingredient_names = [line["ingredient"]["name"] for line in recipe["ingredients"]]
    recipe["steps"] = render_base_steps(recipe)
    recipe.pop("provenance", None)
    if isinstance(recipe.get("calculatedNutrition"), dict):
        recipe["calculatedNutrition"] = {key: value for key, value in recipe["calculatedNutrition"].items()
                                         if key in {"completeness", "total", "perServing", "perServingUnavailableReason", "scope", "ruleVersion", "description", "includedMainCount", "unavailableReason"}}
    steps = [step["text"] for step in recipe["steps"]]
    return {"id": recipe["id"], "name": recipe["name"], "type": menu_type(recipe["categoryCode"]),
            "catalogRevision": release, "catalogContractVersion": 4, "quantityPolicy": QUANTITY_POLICY, "recipe": recipe,
            "categoryCode": recipe["categoryCode"], "mealCodes": recipe["mealCodes"],
            "servingRole": recipe.get("servingRole"), "dishGroupId": recipe.get("dishGroupId"),
            "ingredient_ids": [line["ingredientId"] for line in recipe["ingredients"]],
            "ingredient_terms": sorted(terms), "ingredients": ingredient_names,
            "tag_codes": codes, "tags": labels, "cuisine_code": recipe.get("cuisineCode"),
            "cook_minutes": recipe["timing"]["totalMinutes"], "methods": recipe.get("methodCodes", []),
            "image": recipe.get("imageUrl"), "step": "#".join(steps), "steps": recipe["steps"],
            "cl": "#".join(f"{line['ingredient']['name']}：{base_quantity_display(line)}" for line in recipe["ingredients"]),
            "fl": str(recipe["baseServings"]) if recipe["baseServings"] is not None else None,
            "kcal": ((recipe.get("calculatedNutrition") or {}).get("perServing") or {}).get("energyKcal")}


def read_metadata(connection) -> dict:
    with connection.cursor() as cursor:
        cursor.execute("SELECT document FROM catalog_metadata WHERE id = 1")
        row = cursor.fetchone()
    if not row:
        raise CatalogContractError("No active canonical catalog")
    result = document(row["document"])
    revision(result)
    return result


def read_catalog(connection, ids=None, page_size=256) -> tuple[dict, list[dict]]:
    """Read a coherent release in one DB snapshot; public rows only, bounded pages."""
    if isinstance(page_size, bool) or not isinstance(page_size, int) or not 1 <= page_size <= 500:
        raise CatalogContractError("Invalid catalog page size")
    if ids is not None:
        if not isinstance(ids, (list, tuple)) or len(ids) > 500 or any(
                isinstance(value, bool) or not isinstance(value, int) or value <= 0 for value in ids):
            raise CatalogContractError("Invalid catalog ID batch")
        ids = list(dict.fromkeys(ids))
    metadata = read_metadata(connection)
    if ids == []:
        return metadata, []
    definitions = {}
    last_ingredient = ""
    while True:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, document FROM catalog_ingredient WHERE id > %s ORDER BY id LIMIT %s",
                           [last_ingredient, page_size])
            rows = cursor.fetchall()
        for row in rows:
            definition = document(row["document"])
            if definition.get("id") != row["id"]:
                raise CatalogContractError("Canonical ingredient identity mismatch")
            definitions[row["id"]] = definition
        if len(definitions) > 20000:
            raise CatalogContractError("Catalog ingredient size limit exceeded")
        if len(rows) < page_size:
            break
        last_ingredient = rows[-1]["id"]
    output = []
    last_id = 0
    while True:
        params = [last_id]
        condition = ""
        if ids is not None:
            condition = " AND id IN (" + ",".join(["%s"] * len(ids)) + ")"
            params.extend(ids)
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, document FROM catalog_recipe WHERE owner_id IS NULL "
                           "AND is_published = 1 AND id > %s" + condition + " ORDER BY id LIMIT %s",
                           [*params, page_size])
            rows = cursor.fetchall()
        for row in rows:
            source = document(row["document"])
            if source.get("id") != row["id"]:
                raise CatalogContractError("Canonical row identity mismatch")
            output.append(project_recipe(source, definitions, metadata))
        if len(output) > 20000:
            raise CatalogContractError("Catalog index size limit exceeded")
        if len(rows) < page_size:
            break
        last_id = rows[-1]["id"]
    return metadata, output
