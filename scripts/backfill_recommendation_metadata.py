#!/usr/bin/env python3
"""Derive canonical recommendation metadata from the offline 6,665-dish export."""

from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from pathlib import Path


CUISINE_ALIASES = {
    "SICHUAN": {"川菜"},
    "CANTONESE": {"粤菜", "广东菜", "潮汕菜"},
    "NORTHEAST": {"东北菜"},
    "HUNAN": {"湘菜"},
    "JIANGNAN": {"苏菜", "淮扬菜", "浙菜", "上海菜", "本帮菜"},
    "SHANDONG": {"鲁菜"},
    "FUJIAN": {"闽菜"},
    "NORTHWEST": {"西北菜", "新疆菜"},
}

TAG_ALIASES = [
    ("HOME_STYLE", {"家常菜"}),
    ("SPICY", {"香辣"}),
    ("NUMB_SPICY", {"麻辣"}),
    ("SOUR_SPICY", {"酸辣"}),
    ("SWEET_SOUR", {"酸甜"}),
    ("TOMATO", {"番茄味"}),
    ("LIGHT", {"清淡"}),
    ("LOW_EFFORT", {"懒人食谱"}),
    ("VEGETARIAN", {"素食", "素食主义"}),
    ("HEALTHY", {"健康食谱"}),
    ("LUNCH", {"午餐"}),
    ("DINNER", {"晚餐"}),
    ("GATHERING", {"朋友聚餐"}),
]

METHOD_ALIASES = [
    ("STEAM", {"蒸", "清蒸"}),
    ("STIR_FRY", {"炒", "爆炒", "煸炒"}),
    ("BRAISE", {"烧", "红烧", "焖"}),
    ("STEW", {"炖", "煲", "煮"}),
    ("BAKE", {"烤", "烘焙"}),
    ("FRY", {"炸", "煎炸"}),
    ("COLD_MIX", {"拌", "凉拌"}),
]

KNOWN_CUISINE_CODES = set(CUISINE_ALIASES)
KNOWN_TAG_CODES = {code for code, _ in TAG_ALIASES + METHOD_ALIASES} | {"QUICK"}


def split_values(value: str) -> set[str]:
    return {item.strip() for item in re.split(r"[,，、/|;]+", value or "") if item.strip()}


def parse_minutes(value: str) -> int | None:
    match = re.search(r"\d+", value or "")
    return int(match.group()) if match else None


def derive_metadata(tags: str, methods: str, cook_time: str) -> dict[str, object]:
    raw_tags = split_values(tags)
    raw_methods = split_values(methods)
    cuisine_code = next((code for code, aliases in CUISINE_ALIASES.items() if raw_tags & aliases), None)
    codes: list[str] = []
    for code, aliases in TAG_ALIASES:
        if raw_tags & aliases:
            codes.append(code)
    minutes = parse_minutes(cook_time)
    if minutes is not None and minutes <= 20:
        codes.append("QUICK")
    for code, aliases in METHOD_ALIASES:
        if raw_methods & aliases:
            codes.append(code)
    return {
        "cuisine_code": cuisine_code,
        "tag_codes": list(dict.fromkeys(codes)),
        "cook_minutes": minutes,
        "metadata_version": 1,
    }


def build_audit(source: Path) -> str:
    rows = 0
    cuisines = Counter()
    tags = Counter()
    unknown_cuisine = 0
    with_cook_minutes = 0
    with_any_tag_code = 0
    duplicate_code_rows = 0
    invalid_codes: set[str] = set()
    with source.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            rows += 1
            result = derive_metadata(row.get("tags", ""), row.get("methods", ""), row.get("cook_time", ""))
            if result["cuisine_code"]:
                cuisines[str(result["cuisine_code"])] += 1
            else:
                unknown_cuisine += 1
            tag_codes = list(result["tag_codes"])
            tags.update(tag_codes)
            if tag_codes:
                with_any_tag_code += 1
            if result["cook_minutes"] is not None:
                with_cook_minutes += 1
            if len(tag_codes) != len(set(tag_codes)):
                duplicate_code_rows += 1
            invalid_codes.update(code for code in tag_codes if code not in KNOWN_TAG_CODES)
            if result["cuisine_code"] and result["cuisine_code"] not in KNOWN_CUISINE_CODES:
                invalid_codes.add(str(result["cuisine_code"]))

    lines = [
        "# Recommendation Metadata Audit",
        "",
        f"- Source: `{source.as_posix()}`",
        f"- Rows: {rows}",
        f"- Rows with known cuisine: {rows - unknown_cuisine}",
        f"- Unknown cuisine rows: {unknown_cuisine}",
        f"- Rows with canonical tags: {with_any_tag_code}",
        f"- Rows with parsed cook minutes: {with_cook_minutes}",
        f"- Rows with duplicate canonical codes: {duplicate_code_rows}",
        f"- Invalid canonical codes: {', '.join(sorted(invalid_codes)) if invalid_codes else 'none'}",
        "",
        "## Cuisine Counts",
        "",
        "| Code | Dishes |",
        "| --- | ---: |",
    ]
    lines.extend(f"| `{code}` | {count} |" for code, count in sorted(cuisines.items()))
    lines.extend(["", "## Tag Counts", "", "| Code | Dishes |", "| --- | ---: |"])
    lines.extend(f"| `{code}` | {count} |" for code, count in sorted(tags.items()))
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_audit(args.input), encoding="utf-8")


if __name__ == "__main__":
    main()
