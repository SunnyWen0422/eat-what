"""Read only the canonical rows authorized by Java for this owner and task."""
import copy
from canonical_catalog import ingredient_terms, menu_type, tag_codes, satisfies_fact_filters, require_fixed_recipe, QUANTITY_POLICY


def execute_read_tool(context, user_id, name, args):
    if (not isinstance(context, dict) or isinstance(user_id, bool) or not isinstance(user_id, int)
            or user_id < 1 or context.get("ownerUserId") != user_id):
        raise ValueError("Authorized task scope is missing or different")
    rows = context.get("catalog")
    if not isinstance(rows, list) or len(rows) > 500:
        raise ValueError("Invalid authorized catalog")
    index = {}
    releases = set()
    for row in rows:
        if (not isinstance(row, dict) or isinstance(row.get("id"), bool)
                or not isinstance(row.get("id"), int) or row["id"] <= 0 or row["id"] in index):
            raise ValueError("Invalid catalog identity")
        recipe = row.get("recipe")
        if (not isinstance(recipe, dict) or recipe.get("id") != row["id"] or not row.get("catalogRevision")
                or row.get("catalogContractVersion") != 4 or row.get("quantityPolicy") != QUANTITY_POLICY):
            raise ValueError("Canonical task catalog is required")
        require_fixed_recipe(recipe)
        ingredient_terms(recipe)
        releases.add(row["catalogRevision"])
        index[row["id"]] = row
    if len(releases) > 1 or (releases and context.get("catalogRevision") and releases != {context["catalogRevision"]}):
        raise ValueError("Task catalog contains inconsistent releases")
    if name in ("get_dish_details", "get_dish_methods"):
        ids = args.get("dish_ids") if name == "get_dish_details" else [args.get("dish_id")]
        if not isinstance(ids, list) or not 1 <= len(ids) <= 30:
            raise ValueError("Invalid read ID list")
        if any(isinstance(value, bool) or not isinstance(value, (str, int)) for value in ids):
            raise ValueError("Invalid read ID")
        try:
            ids = [int(value) for value in ids]
        except (TypeError, ValueError):
            raise ValueError("Invalid read ID") from None
        if any(value not in index for value in ids):
            raise ValueError("Recipe was not authorized in this task")
        return [copy.deepcopy(index[value]) for value in ids]
    if name not in ("search_dishes", "search_by_ingredients"):
        raise ValueError("Only four read tools are available")
    filters = args.get("filters") or {}
    allowed = {"type", "cuisine_codes", "include_tag_codes", "exclude_tag_codes", "excluded_ingredients",
               "max_cook_minutes", "meal_codes", "dietary_codes", "excluded_allergen_codes"}
    if not isinstance(filters, dict) or set(filters) - allowed:
        raise ValueError("Unsupported filter; do not silently relax a constraint")
    query = str(args.get("query") or "").strip().casefold()
    ingredients = args.get("ingredients") or []
    if not isinstance(ingredients, list):
        raise ValueError("Invalid ingredient list")
    selected = []
    for row in rows:
        recipe = row["recipe"]
        terms = ingredient_terms(recipe)
        codes = set(tag_codes(recipe))
        if query and query not in (recipe["name"] + " " + " ".join(terms)).casefold():
            continue
        if ingredients and not all(str(value).strip().casefold() in terms for value in ingredients):
            continue
        if filters.get("type") and menu_type(recipe["categoryCode"]) != filters["type"]:
            continue
        if filters.get("cuisine_codes") and recipe.get("cuisineCode") not in filters["cuisine_codes"]:
            continue
        if filters.get("include_tag_codes") and not set(filters["include_tag_codes"]) & codes:
            continue
        if set(filters.get("exclude_tag_codes") or []) & codes:
            continue
        if any(str(value).strip().casefold() in terms for value in filters.get("excluded_ingredients") or []):
            continue
        if not satisfies_fact_filters(recipe, filters):
            continue
        if filters.get("meal_codes") and not set(filters["meal_codes"]) & set(recipe.get("mealCodes", [])):
            continue
        minutes = recipe.get("timing", {}).get("totalMinutes")
        if filters.get("max_cook_minutes") is not None and (minutes is None or minutes > int(filters["max_cook_minutes"])):
            continue
        selected.append(copy.deepcopy(row))
    limit = args.get("top_k", 10)
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 30:
        raise ValueError("Invalid read limit")
    return selected[:limit]
