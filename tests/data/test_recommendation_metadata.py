import csv
import importlib.util
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "backfill_recommendation_metadata.py"
SPEC = importlib.util.spec_from_file_location("recommendation_metadata", SCRIPT)
metadata = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(metadata)


def test_metadata_mapping_uses_high_confidence_catalog_codes():
    result = metadata.derive_metadata(
        tags="川菜,麻辣,家常菜",
        methods="炒",
        cook_time="20分钟",
    )

    assert result["cuisine_code"] == "SICHUAN"
    assert result["tag_codes"] == ["HOME_STYLE", "NUMB_SPICY", "QUICK", "STIR_FRY"]
    assert result["cook_minutes"] == 20


def test_unknown_cuisine_remains_unknown_instead_of_using_name_guessing():
    result = metadata.derive_metadata(tags="热菜,午餐", methods="炖", cook_time="45分钟")

    assert result["cuisine_code"] is None
    assert "STEW" in result["tag_codes"]


def test_offline_6665_row_dataset_has_expected_home_sichuan_cantonese_counts():
    source = ROOT / "outputs" / "dish-replacement-20260718" / "food_import.csv"
    counts = Counter()
    rows = 0
    with source.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            rows += 1
            result = metadata.derive_metadata(row["tags"], row["methods"], row["cook_time"])
            assert len(result["tag_codes"]) == len(set(result["tag_codes"]))
            assert set(result["tag_codes"]) <= metadata.KNOWN_TAG_CODES
            assert result["cuisine_code"] is None or result["cuisine_code"] in metadata.KNOWN_CUISINE_CODES
            counts.update(result["tag_codes"])
            if result["cuisine_code"]:
                counts[result["cuisine_code"]] += 1

    assert rows == 6665
    assert counts["HOME_STYLE"] == 6035
    assert counts["SICHUAN"] == 162
    assert counts["CANTONESE"] == 65


def test_metadata_audit_reports_coverage_and_validity():
    source = ROOT / "outputs" / "dish-replacement-20260718" / "food_import.csv"
    audit = metadata.build_audit(source)

    assert "- Rows: 6665" in audit
    assert "- Rows with duplicate canonical codes: 0" in audit
    assert "- Invalid canonical codes: none" in audit
    assert "| `HOME_STYLE` | 6035 |" in audit
    assert "| `SICHUAN` | 162 |" in audit
    assert "| `CANTONESE` | 65 |" in audit


def test_schema_scripts_define_offline_metadata_and_preference_storage():
    schema = (ROOT / "backend" / "recommendation_preferences_schema.sql").read_text(encoding="utf-8")
    backfill = (ROOT / "backend" / "recommendation_metadata_backfill.sql").read_text(encoding="utf-8")

    for column in ("cuisine_code", "tag_codes", "cook_minutes", "metadata_version"):
        assert column in schema
    assert "CREATE TABLE IF NOT EXISTS user_preference" in schema
    assert "HOME_STYLE" in backfill
    assert "SICHUAN" in backfill
    assert "CANTONESE" in backfill
    for _, aliases in metadata.METHOD_ALIASES:
        for alias in aliases:
            assert f"CAST('{alias}' AS BINARY)" in backfill
    assert "CAST('煎' AS BINARY)" not in backfill
