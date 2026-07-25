#!/usr/bin/env python3
"""Repeatable local filter benchmark for the canonical 6,665-dish dataset."""

from __future__ import annotations

import argparse
import csv
import json
import math
import time
from pathlib import Path

from backfill_recommendation_metadata import derive_metadata


def load_dishes(source: Path) -> list[dict[str, object]]:
    dishes: list[dict[str, object]] = []
    with source.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            metadata = derive_metadata(row.get("tags", ""), row.get("methods", ""), row.get("cook_time", ""))
            dishes.append({
                "cuisine": metadata["cuisine_code"],
                "tags": set(metadata["tag_codes"]),
                "minutes": metadata["cook_minutes"],
                "ingredients": f"{row.get('cl', '')} {row.get('ingredients_amounts', '')}".lower(),
            })
    return dishes


def filter_dishes(dishes: list[dict[str, object]], criteria: dict[str, object]) -> int:
    cuisines = set(criteria.get("cuisines", []))
    include_tags = set(criteria.get("include_tags", []))
    exclude_tags = set(criteria.get("exclude_tags", []))
    excluded_ingredients = [str(value).lower() for value in criteria.get("excluded_ingredients", [])]
    max_minutes = criteria.get("max_minutes")
    matches = 0
    for dish in dishes:
        tags = dish["tags"]
        if cuisines and dish["cuisine"] not in cuisines:
            continue
        if include_tags and not tags.intersection(include_tags):
            continue
        if exclude_tags and tags.intersection(exclude_tags):
            continue
        if max_minutes and (not dish["minutes"] or dish["minutes"] > max_minutes):
            continue
        if any(value in dish["ingredients"] for value in excluded_ingredients):
            continue
        matches += 1
    return matches


def percentile(values: list[float], percent: float) -> float:
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(len(ordered) * percent) - 1))
    return ordered[index]


def run(source: Path, iterations: int, max_p95_ms: float) -> dict[str, object]:
    dishes = load_dishes(source)
    if len(dishes) != 6665:
        raise AssertionError(f"Expected 6665 dishes, found {len(dishes)}")
    cases = {
        "home_style": {"include_tags": ["HOME_STYLE"]},
        "sichuan": {"cuisines": ["SICHUAN"]},
        "cantonese": {"cuisines": ["CANTONESE"]},
        "quick_not_fried": {"include_tags": ["QUICK"], "exclude_tags": ["FRY"], "max_minutes": 30},
        "combined": {"cuisines": ["SICHUAN", "CANTONESE"], "include_tags": ["SPICY", "LIGHT"], "max_minutes": 45},
    }
    results: dict[str, object] = {}
    all_samples: list[float] = []
    for name, criteria in cases.items():
        samples: list[float] = []
        matches = 0
        for _ in range(iterations):
            start = time.perf_counter()
            matches = filter_dishes(dishes, criteria)
            samples.append((time.perf_counter() - start) * 1000)
        p95_ms = percentile(samples, 0.95)
        all_samples.extend(samples)
        results[name] = {"matches": matches, "p95Ms": round(p95_ms, 3)}
    overall_p95 = percentile(all_samples, 0.95)
    if overall_p95 >= max_p95_ms:
        raise AssertionError(f"Filter p95 {overall_p95:.3f}ms exceeds {max_p95_ms:.3f}ms")
    return {
        "datasetRows": len(dishes),
        "iterationsPerCase": iterations,
        "thresholdMs": max_p95_ms,
        "overallP95Ms": round(overall_p95, 3),
        "cases": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--iterations", type=int, default=30)
    parser.add_argument("--max-p95-ms", type=float, default=800.0)
    args = parser.parse_args()
    result = run(args.input, max(5, args.iterations), args.max_p95_ms)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
