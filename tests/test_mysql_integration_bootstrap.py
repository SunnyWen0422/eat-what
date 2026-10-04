import contextlib
import importlib.util
import io
import pathlib
import shutil
import sys
import tempfile
import types
import unittest
from unittest.mock import MagicMock, patch


ROOT = pathlib.Path(__file__).resolve().parents[1]


class MysqlIntegrationBootstrapTest(unittest.TestCase):
    def test_private_bootstrap_executes_existing_favorites_schema_before_java_tests(self):
        # Run the actual bootstrap control flow without starting a server or JVM.
        driver = types.SimpleNamespace(Error=RuntimeError, connect=MagicMock())
        spec = importlib.util.spec_from_file_location("mysql_integration", ROOT / "scripts/run_mysql_integration.py")
        runner = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"pymysql": driver}):
            spec.loader.exec_module(runner)
        connection = driver.connect.return_value
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.nextset.return_value = None
        process = MagicMock()
        process.poll.return_value = None
        java_result = types.SimpleNamespace(returncode=1, stdout=b"[ERROR] test stops after bootstrap")
        scratch = ROOT / ".mysql-test-data"
        scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="bootstrap-unit-", dir=scratch) as temporary:
            sandbox = pathlib.Path(temporary)
            self.assertTrue(sandbox.resolve().is_relative_to(scratch.resolve()))
            for source in (ROOT / "backend").rglob("*.sql"):
                if "target" in source.relative_to(ROOT / "backend").parts:
                    continue
                target = sandbox / source.relative_to(ROOT)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
            shutil.copyfile(ROOT / "backend/db/migration-manifest.json", sandbox / "backend/db/migration-manifest.json")
            # The mocked binary is never run; Windows sandbox strict realpath is unrelated to schema preparation.
            with patch.object(runner, "ROOT", sandbox), \
                    patch.object(runner.Path, "resolve", lambda path, strict=False: path.absolute()), \
                    patch.object(runner.subprocess, "Popen", return_value=process), \
                    patch.object(runner.subprocess, "run", side_effect=[None, java_result]) as commands, \
                    patch.object(sys, "argv", ["runner", "--mysqld", str(pathlib.Path(__file__))]), \
                    contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, "MySQL transaction tests failed"):
                    runner.main()
                self.assertEqual(2, commands.call_count)
            executed = [call.args[0] for call in cursor.execute.call_args_list]
            existing_schema = list(runner.statements((ROOT / "backend/create_favorite_dishes_table.sql").read_text(encoding="utf-8")))
            self.assertTrue(existing_schema)
            for statement in existing_schema:
                self.assertEqual(1, executed.count(statement), "Existing favorites DDL must execute once before the Java test command")


if __name__ == "__main__":
    unittest.main()
