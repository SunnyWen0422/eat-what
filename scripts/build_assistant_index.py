#!/usr/bin/env python3
"""Rebuild the assistant's read-only dish retrieval index.

Run this after importing, editing, publishing, unpublishing, or deleting
system dishes.  It reads only published system dishes from MySQL and writes
two replaceable local files (`dish_meta.json` and `ingredient_map.json`) used
by the recommendation service.  It never changes application tables.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SERVICE_ROOT = PROJECT_ROOT / "recommend-service"
sys.path.insert(0, str(SERVICE_ROOT))

import rag  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Rebuild the meal assistant retrieval index from MySQL")
    parser.add_argument(
        "--fast",
        action="store_true",
        help="index at most 8,000 published system dishes for a quick local validation",
    )
    parser.add_argument("--meta-path", type=Path, help="optional output path for dish metadata JSON")
    parser.add_argument("--ingredient-path", type=Path, help="optional output path for ingredient map JSON")
    args = parser.parse_args()

    if args.meta_path:
        os.environ["DISH_META_PATH"] = str(args.meta_path.resolve())
        rag.META_PATH = os.environ["DISH_META_PATH"]
    if args.ingredient_path:
        os.environ["INGREDIENT_MAP_PATH"] = str(args.ingredient_path.resolve())
        rag.INGREDIENT_PATH = os.environ["INGREDIENT_MAP_PATH"]

    for output in (Path(rag.META_PATH), Path(rag.INGREDIENT_PATH)):
        output.parent.mkdir(parents=True, exist_ok=True)
    rag.build_index(fast=args.fast)
    print("Assistant retrieval index rebuilt successfully.")


if __name__ == "__main__":
    main()
