import csv
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_backfill_generates_auditable_artifacts(tmp_path):
    source = tmp_path / "food.csv"
    with source.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id", "ingredients_amounts", "fl"])
        writer.writeheader()
        writer.writerow({"id": "1", "ingredients_amounts": "猪排|345|克|主料|切片###盐|3|克|调味料|###胡椒|1/2|茶匙|调味料|###水|2-3|升|液体|", "fl": "4名成年人总量+15%冗余"})
    output = tmp_path / "out"
    subprocess.run([sys.executable, str(ROOT / "scripts/backfill_shopping_ingredients.py"), "--input", str(source), "--output-dir", str(output)], check=True)
    report = json.loads((output / "audit-report.json").read_text(encoding="utf-8"))
    assert report["rows"] == 4
    assert "猪排" in (output / "ingredient_catalog_candidates.csv").read_text(encoding="utf-8-sig")
    sql = (output / "dish_ingredient.sql").read_text(encoding="utf-8")
    assert "quantity_min" in sql
    assert "'2.5'" in sql
