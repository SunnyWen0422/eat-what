#!/usr/bin/env python3
"""Check assistant index coverage without touching the production database."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List


def _read_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def build_report(meta_path: Path, ingredient_path: Path) -> Dict[str, Any]:
    dishes: List[Dict[str, Any]] = _read_json(meta_path)
    ingredient_map: Dict[str, List[Any]] = _read_json(ingredient_path)
    missing_id = [dish for dish in dishes if not dish.get("id")]
    missing_name = [dish for dish in dishes if not str(dish.get("name") or "").strip()]
    missing_ingredients = [dish for dish in dishes if not dish.get("ingredients")]
    unpublished = [dish for dish in dishes if dish.get("is_published") is False]
    return {
        "success": not missing_id and not missing_name,
        "dishCount": len(dishes),
        "ingredientTokenCount": len(ingredient_map),
        "missingIdCount": len(missing_id),
        "missingNameCount": len(missing_name),
        "missingIngredientCount": len(missing_ingredients),
        "unpublishedLeakCount": len(unpublished),
        "notes": [
            "Food preparation steps, cuisine and duration can be incomplete in the source data; absence is surfaced instead of invented.",
            "Ingredient aliases are canonicalization only and do not imply substitutions.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit meal assistant retrieval index files")
    parser.add_argument("--meta-path", type=Path, required=True)
    parser.add_argument("--ingredient-path", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = build_report(args.meta_path, args.ingredient_path)
    encoded = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded + "\n", encoding="utf-8")
    print(encoded)
    if not report["success"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
