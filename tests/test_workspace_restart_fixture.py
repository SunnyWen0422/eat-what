import contextlib
import importlib.util
import pathlib
import sqlite3
import tempfile
import types
import unittest
from unittest.mock import patch


ROOT = pathlib.Path(__file__).resolve().parents[1]


class WorkspaceRestartFixtureTest(unittest.TestCase):
    def test_restart_prepares_owned_meat_and_vegetable_without_restoring_system_catalog(self):
        spec = importlib.util.spec_from_file_location("workspace_restart", ROOT / "scripts/check_workspace_restart.py")
        restart = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(restart)
        database = sqlite3.connect(":memory:")
        try:
            database.executescript("""
                CREATE TABLE users(id INTEGER PRIMARY KEY,open_id TEXT);
                CREATE TABLE food(id INTEGER PRIMARY KEY,NAME TEXT,TYPE TEXT,CL TEXT,FL TEXT,STEP TEXT,COOK_MINUTES INTEGER,METADATA_VERSION INTEGER,IS_PUBLISHED INTEGER,is_custom INTEGER,user_id INTEGER);
                CREATE TABLE meal_workspace(id TEXT,user_id INTEGER,meal_date TEXT,meal_type TEXT,revision INTEGER,state_json TEXT);
                CREATE TABLE workspace_task(id TEXT,workspace_id TEXT,user_id INTEGER,base_revision INTEGER,status TEXT,input_json TEXT,lease_token TEXT);
            """)
            class ParameterCursor:
                def execute(self, statement, parameters=()):
                    return database.execute(statement.replace("%s", "?"), parameters)
            @contextlib.contextmanager
            def cursor():
                yield ParameterCursor()
            connection = types.SimpleNamespace(cursor=cursor)
            environment = {"V4_TEST_JDBC": "jdbc:mysql://127.0.0.1:1/eatwhat_v4_test_fixture?useSSL=false", "V4_TEST_PASSWORD": "unused-test-value"}
            scratch = ROOT / ".mysql-test-data"
            scratch.mkdir(exist_ok=True)
            with tempfile.TemporaryDirectory(prefix="restart-fixture-unit-", dir=scratch) as temporary:
                output = pathlib.Path(temporary)
                self.assertTrue(output.resolve().is_relative_to(scratch.resolve()))
                with patch.object(restart.Path, "is_file", return_value=True), \
                        patch.object(restart.shutil, "which", return_value="java"), \
                        patch.object(restart.subprocess, "Popen", side_effect=RuntimeError("stop before private JVM")):
                    with self.assertRaisesRegex(RuntimeError, "stop before private JVM"):
                        restart.probe(connection, environment, output, ROOT)
            rows = database.execute("SELECT TYPE,user_id,is_custom,IS_PUBLISHED,COOK_MINUTES,FL FROM food ORDER BY TYPE").fetchall()
            self.assertEqual(2, len(rows), "Restart must not depend on system dishes surviving the HTTP deletion scenario")
            self.assertEqual({"meat", "veg"}, {row[0] for row in rows})
            for row in rows:
                self.assertEqual((5, 1, 1), row[1:4])
                self.assertGreater(row[4], 0)
                self.assertEqual("2人基础份量", row[5])
            self.assertEqual(0, database.execute("SELECT COUNT(*) FROM food WHERE user_id IS NULL").fetchone()[0])
        finally:
            database.close()


if __name__ == "__main__":
    unittest.main()
