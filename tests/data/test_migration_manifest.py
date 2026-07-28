import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "backend" / "db" / "migration-manifest.json"
MIGRATION_ROOT = MANIFEST.parent / "migrations"


def test_production_migrations_are_versioned_and_non_destructive():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert manifest["policy"]["productionMigrationsMustBeNonDestructive"] is True
    assert manifest["policy"]["databaseIsSelectedByInvoker"] is True
    assert manifest["migrations"]
    for migration in manifest["migrations"]:
        sql_path = MIGRATION_ROOT / migration["file"]
        sql = sql_path.read_text(encoding="utf-8")
        assert "USE food;" not in sql.upper()
        assert "DROP TABLE" not in sql.upper()
        assert "TRUNCATE TABLE" not in sql.upper()
        digest = hashlib.sha256(sql_path.read_bytes()).hexdigest()
        assert digest == migration["checksumSha256"]
        assert migration["rollback"]
