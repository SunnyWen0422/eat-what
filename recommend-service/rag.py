"""Release-checked, disposable canonical catalog retrieval index.

Retrieval ranks explicit search matches only. Menu selection belongs to Java's
shared recommendation policy; favorites do not change search weights.
"""
import json
import os
import re
import threading
from collections import Counter
from typing import Any, Dict, Iterable, List, Optional, Tuple
from canonical_catalog import satisfies_fact_filters, require_fixed_recipe, QUANTITY_POLICY

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
META_PATH = os.getenv("DISH_META_PATH", os.path.join(BASE_DIR, "dish_meta.json"))
INGREDIENT_PATH = os.getenv("INGREDIENT_MAP_PATH", os.path.join(BASE_DIR, "ingredient_map.json"))
_dish_meta = []
_ingredient_map = {}
_catalog_revision = None
_index_lock = threading.RLock()


def normalize_ingredient(value):
    # Identity aliases are supplied by the published ingredient registry.
    return str(value or "").strip().casefold()


def _values(value):
    if value is None or value == "":
        return []
    return list(value) if isinstance(value, (list, tuple, set)) else [value]


def _split_codes(value):
    return [str(item).strip().upper() for item in
            (value if isinstance(value, (list, tuple, set)) else str(value or "").split(",")) if str(item).strip()]


def _dish_ingredients(dish):
    return list(dish.get("ingredient_terms", []))


def _dish_tag_codes(dish):
    return _split_codes(dish.get("tag_codes"))


def _dish_cuisine_codes(dish):
    return _split_codes(dish.get("cuisine_code"))


def _cook_minutes(dish):
    return dish.get("cook_minutes")


def _make_doc(dish):
    return " ".join([str(dish.get("name", "")), *dish.get("ingredient_terms", []),
                     *dish.get("tags", []), *dish.get("methods", [])]).casefold()


def _install(rows, release):
    global _dish_meta, _ingredient_map, _catalog_revision
    index = {}
    for row in rows:
        if (row.get("catalogRevision") != release or row.get("catalogContractVersion") != 4
                or row.get("quantityPolicy") != QUANTITY_POLICY or not row.get("recipe")):
            raise ValueError("Incoherent canonical index release")
        require_fixed_recipe(row["recipe"])
        row["doc"] = _make_doc(row)
        for term in _dish_ingredients(row):
            index.setdefault(term, []).append(row["id"])
    _dish_meta, _ingredient_map, _catalog_revision = rows, index, release


def build_index(fast=False):
    from db import fetch_canonical_catalog, fetch_catalog_revision
    with _index_lock:
        metadata, rows = fetch_canonical_catalog()
        release = metadata["catalogRevision"]
        if fetch_catalog_revision() != release:
            raise ValueError("Catalog release changed while rebuilding index")
        _install(rows, release)
        # One envelope atomically publishes both index structures and revision.
        # Old unversioned index files are never read.
        temporary = META_PATH + ".tmp"
        with open(temporary, "w", encoding="utf-8") as stream:
            json.dump({"catalogContractVersion": 4, "quantityPolicy": QUANTITY_POLICY, "catalogRevision": release, "dishes": rows}, stream, ensure_ascii=False)
        os.replace(temporary, META_PATH)


def load_index():
    from db import fetch_catalog_revision
    with _index_lock:
        current = fetch_catalog_revision()
        if _catalog_revision == current and _dish_meta:
            return
        if os.path.exists(META_PATH):
            with open(META_PATH, encoding="utf-8") as stream:
                saved = json.load(stream)
            if (isinstance(saved, dict) and saved.get("catalogContractVersion") == 4
                    and saved.get("quantityPolicy") == QUANTITY_POLICY and saved.get("catalogRevision") == current):
                _install(saved["dishes"], current)
                return
        # Fail closed if the current release cannot be loaded; never return the old index.
        build_index()


def _ingredient_matches_exclusion(excluded, ingredient):
    return normalize_ingredient(excluded) == normalize_ingredient(ingredient)


def _normalised_set(values):
    return {str(value).strip().upper() for value in values or [] if str(value).strip()}


def _matches_filters(dish, filters):
    recipe = dish.get("recipe")
    if not isinstance(recipe, dict):
        return False, []
    codes = _normalised_set(_dish_tag_codes(dish))
    terms = set(_dish_ingredients(dish))
    if str(dish.get("id")) in {str(value) for value in _values(filters.get("exclude_ids"))}:
        return False, []
    if _normalised_set(_values(filters.get("exclude_tag_codes"))) & codes:
        return False, []
    include = _normalised_set(_values(filters.get("include_tag_codes")))
    if include and not include & codes:
        return False, []
    types = _normalised_set(_values(filters.get("types", filters.get("type"))))
    if types and dish["type"].upper() not in types:
        return False, []
    if dish["type"].upper() in _normalised_set(_values(filters.get("exclude_types"))):
        return False, []
    cuisines = _normalised_set(_values(filters.get("cuisine_codes")))
    if cuisines and not cuisines & _normalised_set(_dish_cuisine_codes(dish)):
        return False, []
    excluded = {normalize_ingredient(item) for item in _values(filters.get("exclude_ingredients", filters.get("excluded_ingredients")))}
    if terms & excluded:
        return False, []
    if not satisfies_fact_filters(recipe, {key: _normalised_set(_values(filters.get(key))) for key in
                                          ("excluded_allergen_codes", "exclude_tag_codes", "dietary_codes")}):
        return False, []
    meals = _normalised_set(_values(filters.get("meal_codes")))
    if meals and not meals & _normalised_set(recipe.get("mealCodes", [])):
        return False, []
    if filters.get("automatic_slots") and recipe.get("servingRole") != "dish":
        return False, []
    maximum = filters.get("max_cook_minutes")
    if maximum is not None and (dish.get("cook_minutes") is None or dish["cook_minutes"] > int(maximum)):
        return False, []
    return True, []


def search_by_ingredients(items, top_k=10):
    load_index()
    counts = Counter()
    for item in set(normalize_ingredient(value) for value in items):
        counts.update(_ingredient_map.get(item, []))
    by_id = {dish["id"]: dish for dish in _dish_meta}
    ranked = sorted(counts, key=lambda key: (-counts[key], by_id[key]["name"], key))
    return [dict(by_id[key]) for key in ranked[:max(1, min(30, int(top_k)))]]


def search_candidates(query="", filters=None, top_k=20):
    load_index()
    filters = dict(filters or {})
    tokens = [token.casefold() for token in re.split(r"\s+", str(query or "").strip()) if token]
    available = {normalize_ingredient(value) for value in _values(filters.get("available_ingredients"))}
    scored = []
    for row in _dish_meta:
        allowed, reasons = _matches_filters(row, filters)
        if not allowed:
            continue
        score = 0
        for token in tokens:
            if token == row["name"].casefold():
                score += 36; reasons.append("菜名完全匹配")
            elif token in row["name"].casefold():
                score += 14; reasons.append("菜名匹配")
            elif token in row.get("doc", ""):
                score += 4; reasons.append("菜谱内容匹配")
        if tokens and not score:
            continue
        score += len(available & set(_dish_ingredients(row))) * 8
        dish = dict(row, match_reasons=list(dict.fromkeys(reasons)), source_confidence="canonical_catalog")
        scored.append((-score, row["name"], row["id"], dish))
    scored.sort(key=lambda item: item[:3])
    return [item[3] for item in scored[:max(1, min(30, int(top_k or 20)))]]


def search_semantic(query, top_k=10):
    return search_candidates(query, top_k=top_k)
