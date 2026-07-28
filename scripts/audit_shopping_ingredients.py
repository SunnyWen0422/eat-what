#!/usr/bin/env python3
"""Validate generated backfill artifacts without contacting a database."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    args = parser.parse_args()
    directory = Path(args.input_dir)
    report_path = directory / "audit-report.json"
    sql_path = directory / "dish_ingredient.sql"
    if not report_path.exists() or not sql_path.exists():
        print("missing backfill artifacts")
        return 1
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if report.get("rows", 0) == 0:
        print("no ingredient rows")
        return 1
    with (directory / "ingredient_catalog_candidates.csv").open("r", encoding="utf-8-sig", newline="") as handle:
        candidates = list(csv.DictReader(handle))
    if not candidates:
        print("no ingredient candidates")
        return 1
    statuses = report.get("statuses", {})
    parsed = statuses.get("PARSED", 0)
    total = report.get("rows", 0)
    if total and parsed / total < 0.98:
        print(f"parsed rate below 98%: {parsed}/{total}")
        return 1
    print(json.dumps({"ok": True, "rows": total, "parsed": parsed}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
