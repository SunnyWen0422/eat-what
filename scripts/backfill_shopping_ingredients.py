#!/usr/bin/env python3
"""Generate isolated shopping ingredient backfill artifacts without opening MySQL."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path


STRUCTURED = re.compile(r"^([^|]+)\|([^|]+)\|([^|]+)(?:\|([^|]*))?(?:\|([^|]*))?.*$")
RANGE = re.compile(r"(\d+(?:\.\d+)?)\s*[-~至]\s*(\d+(?:\.\d+)?)")
FRACTION = re.compile(r"(\d+)\s*/\s*(\d+)")
NUMBER = re.compile(r"(\d+(?:\.\d+)?)")


def parse_row(row: dict[str, str]) -> list[dict[str, object]]:
    raw = row.get("ingredients_amounts") or row.get("ingredientsAmounts") or row.get("cl") or ""
    allowance = row.get("fl") or ""
    dish_id = int(row.get("id") or row.get("ID") or 0)
    result = []
    for sequence, line in enumerate(re.split(r"###|\r?\n|#", raw), start=1):
        line = line.strip()
        if not line:
            continue
        match = STRUCTURED.match(line)
        if match:
            name, quantity, unit, category, preparation = match.groups()
        else:
            name, quantity, unit, category, preparation = line, "", "unknown", "", ""
        parsed = parse_quantity(quantity, unit)
        status = "PARSED" if parsed["quantity_value"] is not None else "NEEDS_ADJUSTMENT"
        source_hash = hashlib.sha256(line.encode("utf-8")).hexdigest()
        result.append({
            "dish_id": dish_id,
            "sequence_no": sequence,
            "source_text": line,
            "canonical_name": name.strip(),
            "quantity_kind": parsed["quantity_kind"],
            "quantity_value": parsed["quantity_value"],
            "quantity_min": parsed["quantity_min"],
            "quantity_max": parsed["quantity_max"],
            "unit_code": parsed["unit_code"],
            "unit_family": parsed["unit_family"],
            "category": category.strip() if category else None,
            "preparation": preparation.strip() if preparation else None,
            "base_people": parse_base_people(allowance),
            "source_allowance_percent": parse_allowance_percent(allowance),
            "parse_status": status,
            "parse_message": None if parsed["quantity_value"] is not None else "UNPARSED_QUANTITY",
            "source_hash": source_hash,
        })
    return result


def unit_family(unit: str) -> str:
    value = (unit or "").strip().lower()
    if value in {"克", "千克", "公斤", "g", "kg"}:
        return "mass"
    if value in {"毫升", "升", "ml", "l"}:
        return "volume"
    if any(token in value for token in ("个", "只", "枚", "根")):
        return "count"
    return "unknown"


def normalize_unit(unit: str, quantity: str) -> str:
    value = (unit or "").strip().lower()
    if not value:
        value = quantity.lower()
    if value in {"克", "g"} or ("克" in value and "千克" not in value and "公斤" not in value):
        return "g"
    if value in {"千克", "公斤", "kg"} or "千克" in value or "公斤" in value:
        return "kg"
    if value in {"毫升", "ml"} or "毫升" in value:
        return "ml"
    if value in {"升", "l"} or value.endswith("升"):
        return "l"
    if any(token in value for token in ("个", "只", "枚", "根")):
        return "count"
    return unit.strip() or "unknown"


def decimal_text(value: Decimal | None) -> str | None:
    if value is None:
        return None
    normalized = value.normalize()
    return format(normalized, "f")


def parse_quantity(quantity: str, unit: str) -> dict[str, object]:
    text = (quantity or "").strip()
    unit_code = normalize_unit(unit, text)
    family = unit_family(unit_code)
    if any(token in text for token in ("适量", "少许", "适当", "未知")):
        return {"quantity_kind": "QUALITATIVE", "quantity_value": None, "quantity_min": None,
                "quantity_max": None, "unit_code": unit_code, "unit_family": family}
    range_match = RANGE.search(text)
    if range_match:
        minimum = Decimal(range_match.group(1))
        maximum = Decimal(range_match.group(2))
        return {"quantity_kind": "RANGE", "quantity_value": decimal_text((minimum + maximum) / 2),
                "quantity_min": decimal_text(minimum), "quantity_max": decimal_text(maximum),
                "unit_code": unit_code, "unit_family": family}
    fraction_match = FRACTION.search(text)
    if fraction_match and int(fraction_match.group(2)) != 0:
        value = Decimal(fraction_match.group(1)) / Decimal(fraction_match.group(2))
        return {"quantity_kind": "FRACTION", "quantity_value": decimal_text(value),
                "quantity_min": None, "quantity_max": None, "unit_code": unit_code, "unit_family": family}
    number_match = NUMBER.search(text)
    if number_match:
        try:
            value = Decimal(number_match.group(1))
        except InvalidOperation:
            value = None
        return {"quantity_kind": "EXACT", "quantity_value": decimal_text(value),
                "quantity_min": None, "quantity_max": None, "unit_code": unit_code, "unit_family": family}
    return {"quantity_kind": "QUALITATIVE", "quantity_value": None, "quantity_min": None,
            "quantity_max": None, "unit_code": unit_code, "unit_family": family}


def parse_base_people(text: str) -> str:
    match = NUMBER.search(text or "")
    return match.group(1) if match else "2"


def parse_allowance_percent(text: str) -> str:
    match = re.search(r"(\d+(?:\.\d+)?)\s*%", text or "")
    return match.group(1) if match else "0"


def sql_quote(value: object) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("\\", "\\\\").replace("'", "''") + "'"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    records = []
    with Path(args.input).open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            records.extend(parse_row(row))
    sql_lines = ["START TRANSACTION;"]
    for record in records:
        columns = ", ".join(record.keys())
        values = ", ".join(sql_quote(record[key]) for key in record.keys())
        sql_lines.append(f"INSERT INTO dish_ingredient ({columns}) VALUES ({values});")
    sql_lines.append("COMMIT;")
    (output / "dish_ingredient.sql").write_text("\n".join(sql_lines) + "\n", encoding="utf-8")
    with (output / "ingredient_catalog_candidates.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["canonical_name", "unit_family"])
        writer.writeheader()
        seen = set()
        for record in records:
            key = (record["canonical_name"], record["unit_family"])
            if key not in seen:
                seen.add(key)
                writer.writerow({"canonical_name": key[0], "unit_family": key[1]})
    report = {
        "input": str(args.input),
        "rows": len(records),
        "statuses": {status: sum(1 for item in records if item["parse_status"] == status)
                     for status in ("PARSED", "PARTIAL", "NEEDS_ADJUSTMENT", "FAILED")},
        "unknown_units": sorted({item["unit_code"] for item in records if item["unit_family"] == "unknown"}),
    }
    (output / "audit-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
