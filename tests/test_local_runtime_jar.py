"""Local file/process boundaries only: no existing runtime is stopped or contacted."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import zipfile

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / 'scripts'))
spec = importlib.util.spec_from_file_location('local_jar_under_test', PROJECT / 'scripts/local_v4.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


def jar(path, payload=b'fixture'):
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, 'w') as archive:
        archive.writestr(zipfile.ZipInfo('META-INF/MANIFEST.MF'), 'Main-Class: org.springframework.boot.loader.JarLauncher\nStart-Class: com.eatwhat.EatWhatApplication\n')
        archive.writestr(zipfile.ZipInfo('BOOT-INF/classes/com/eatwhat/EatWhatApplication.class'), payload)
    return hashlib.sha256(path.read_bytes()).hexdigest()


class JarRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(dir=PROJECT / '.test-artifacts')
        self.root = Path(self.temporary.name)
        self.data = self.root / '.local-v4'
        self.data.mkdir()
        (self.data / 'application-local.yml').write_text('fixture: local\n', encoding='utf-8')
        self.source = self.root / 'backend/target/eatwhat-backend-1.0.0.jar'
        jar(self.source)
        self.state = {'environment': 'local', 'api': 'http://127.0.0.1:18780/api', 'dbHost': '127.0.0.1',
                      'database': 'eatwhat_v4_local_fixture', 'root': str(self.root), 'dataDir': '.local-v4/mysql',
                      'javaPid': 123, 'javaExecutable': 'fixture-java', 'dbPort': 12345, 'password': 'fixture', 'tokenSecret': 'fixture-token-secret'}
        (self.data / 'application-local.yml').write_text('server:\n  address: 127.0.0.1\n  port: 18780\n  servlet:\n    context-path: /api\nspring:\n  datasource:\n    url: jdbc:mysql://127.0.0.1:12345/eatwhat_v4_local_fixture?useSSL=false\n    username: root\n    password: fixture\nsecurity:\n  token:\n    secret: fixture-token-secret\n', encoding='utf-8')
        (self.data / 'model-budget.json').write_text('{"limit":20,"used":13}', encoding='utf-8')
        self.root_patch = patch.object(runtime, 'ROOT', self.root); self.root_patch.start()
        self.data_patch = patch.object(runtime, 'DATA', self.data); self.data_patch.start()
        self.port_patch = patch.object(runtime, 'available'); self.port_patch.start()
        self.listener_patch = patch.object(runtime, 'api_listener_pids', return_value=set()); self.listener_patch.start()
    def tearDown(self):
        self.listener_patch.stop(); self.port_patch.stop(); self.data_patch.stop(); self.root_patch.stop(); self.temporary.cleanup()

    def test_invalid_source_jar_is_rejected_before_stopping_old_backend(self):
        self.source.write_bytes(b'not a built backend')
        with patch.object(runtime.sys, 'argv', ['local_v4.py', 'restart']), patch.object(runtime, 'read_state', return_value=self.state), \
                patch.object(runtime, 'executable_path', return_value='fixture-java'), patch.object(runtime, 'stop_owned') as stop, \
                patch.object(runtime, 'start_java') as start, patch.object(runtime.pymysql, 'connect', return_value=Mock()):
            with self.assertRaisesRegex(RuntimeError, 'JAR'):
                runtime.main()
        stop.assert_not_called(); start.assert_not_called()

    def test_java_runs_a_hash_named_private_copy_instead_of_locking_the_build_target(self):
        process = Mock(pid=999)
        with patch.object(runtime.subprocess, 'Popen', return_value=process) as spawn:
            runtime.start_java(self.state, 'fixture-java')
        args = spawn.call_args.args[0]
        selected = Path(args[args.index('-jar') + 1])
        self.assertNotEqual(selected, self.source)
        self.assertTrue(selected.is_relative_to(self.data / 'jars'))
        self.assertEqual(self.state['javaJarSha256'], hashlib.sha256(self.source.read_bytes()).hexdigest())
        self.assertEqual(self.state['javaJarPath'], str(selected))
        self.assertEqual(selected.read_bytes(), self.source.read_bytes())

    def test_restart_keeps_recorded_jar_even_if_build_target_changes(self):
        pinned = self.data / 'jars' / ('eatwhat-backend-' + hashlib.sha256(self.source.read_bytes()).hexdigest() + '.jar')
        checksum = jar(pinned)
        self.state.update(javaJarPath=str(pinned), javaJarSha256=checksum)
        jar(self.source, b'new build that was not selected')
        with patch.object(runtime.subprocess, 'Popen', return_value=Mock(pid=999)) as spawn:
            runtime.start_java(self.state, 'fixture-java')
        self.assertIn(str(pinned), spawn.call_args.args[0])
        self.assertEqual(self.state['javaJarSha256'], checksum)

    def test_recorded_hash_drift_is_rejected_before_stopping_or_restarting_services(self):
        pinned = self.data / 'jars' / ('eatwhat-backend-' + hashlib.sha256(self.source.read_bytes()).hexdigest() + '.jar')
        checksum = jar(pinned)
        self.state.update(javaJarPath=str(pinned), javaJarSha256=checksum)
        (self.data / 'runtime.json').write_text(json.dumps(self.state), encoding='utf-8')
        jar(pinned, b'modified')
        with patch.object(runtime.sys, 'argv', ['local_v4.py', 'restart']), patch.object(runtime, 'stop_owned') as stop, \
                patch.object(runtime, 'executable_path', return_value='fixture-java'), patch.object(runtime, 'start_java'), \
                patch.object(runtime.pymysql, 'connect', return_value=Mock()):
            with self.assertRaisesRegex(RuntimeError, 'JAR'):
                runtime.main()
        stop.assert_not_called()

    def test_foreign_private_jar_in_a_record_is_refused(self):
        foreign = self.root / 'other-project/.local-v4/jars/foreign.jar'
        checksum = jar(foreign)
        self.state.update(javaJarPath=str(foreign), javaJarSha256=checksum)
        (self.data / 'runtime.json').write_text(json.dumps(self.state), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'JAR'):
            runtime.read_state()

    def test_serve_does_not_start_the_deferred_model_adapter(self):
        with patch.object(runtime.sys, 'argv', ['local_v4.py', 'serve']), patch.object(runtime.subprocess, 'run'), \
                patch.object(runtime, 'wait_for_basic_api'), patch.object(runtime, 'start_optional_model') as model, \
                patch.object(runtime.time, 'sleep', side_effect=RuntimeError('end local serve')):
            with self.assertRaisesRegex(RuntimeError, 'end local serve'):
                runtime.main()
        model.assert_not_called()

    def test_explicit_replacement_is_prepared_without_changing_existing_state_or_snapshot(self):
        original = runtime.prepare_java_jar()
        self.state.update(javaJarPath=original['path'], javaJarSha256=original['sha256'])
        retained = dict(self.state)
        newer = self.root / 'reviewed-build/backend.jar'
        newer_hash = jar(newer, b'new reviewed build')
        replacement = runtime.prepare_java_jar(self.state, str(newer))
        self.assertEqual(replacement['sha256'], newer_hash)
        self.assertEqual(self.state, retained)
        self.assertEqual(runtime.jar_digest(original['path']), original['sha256'])
        self.assertIn(original['path'].replace('\\', '/'), runtime.java_process_markers(self.state))

    def test_explicit_missing_jar_does_not_stop_current_backend(self):
        with patch.object(runtime.sys, 'argv', ['local_v4.py', 'restart', '--jar', str(self.root / 'missing.jar')]), \
                patch.object(runtime, 'read_state', return_value=self.state), patch.object(runtime, 'executable_path', return_value='fixture-java'), \
                patch.object(runtime, 'stop_owned') as stop:
            with self.assertRaisesRegex(RuntimeError, 'JAR'):
                runtime.main()
        stop.assert_not_called()

    def test_foreign_runtime_cannot_be_used_as_an_explicit_jar_source(self):
        foreign = self.root / 'other-project/.local-maturity-active/jars/foreign.jar'
        jar(foreign)
        with self.assertRaisesRegex(RuntimeError, 'JAR source is inside a different private runtime'):
            runtime.prepare_java_jar(explicit=str(foreign))

    def test_restarting_saved_jar_does_not_require_the_original_build_target(self):
        selected = runtime.prepare_java_jar()
        self.state.update(javaJarPath=selected['path'], javaJarSha256=selected['sha256'])
        self.source.unlink()
        with patch.object(runtime.subprocess, 'Popen', return_value=Mock(pid=999)) as spawn:
            runtime.start_java(self.state, 'fixture-java')
        self.assertIn(selected['path'], spawn.call_args.args[0])

    def test_maturity_restart_uses_same_preflight_and_retains_database_and_credentials(self):
        spec = importlib.util.spec_from_file_location('maturity_jar_under_test', PROJECT / 'scripts/local_maturity.py')
        maturity = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'local_v4': runtime}), patch.object(runtime, 'DATA', self.data):
            spec.loader.exec_module(maturity)
        # The module selects its normal DATA at import; this test keeps all files in its own fixture.
        with patch.object(runtime, 'DATA', self.data):
            (self.data / 'runtime.json').write_text(json.dumps(self.state), encoding='utf-8')
            replacement = self.root / 'reviewed-build/backend.jar'
            checksum = jar(replacement, b'new reviewed build')
            with patch.object(maturity.runtime.sys, 'argv', ['local_maturity.py', 'restart', '--jar', str(replacement)]), \
                    patch.object(runtime, 'executable_path', return_value='fixture-java'), patch.object(runtime, 'stop_owned') as stop, \
                    patch.object(runtime.pymysql, 'connect', return_value=Mock()) as connect, \
                    patch.object(runtime.subprocess, 'Popen', return_value=Mock(pid=999)), patch.object(runtime, 'wait_for_basic_api'):
                maturity.main()
            saved = json.loads((self.data / 'runtime.json').read_text(encoding='utf-8'))
            self.assertEqual(saved['password'], self.state['password'])
            self.assertEqual(saved['tokenSecret'], self.state['tokenSecret'])
            self.assertEqual(saved['database'], self.state['database'])
            self.assertEqual((self.data / 'model-budget.json').read_text(encoding='utf-8'), '{"limit":20,"used":13}')
            self.assertEqual(saved['javaJarSha256'], checksum)
            self.assertEqual(connect.call_args.kwargs['dbPort'] if 'dbPort' in connect.call_args.kwargs else connect.call_args.kwargs['port'], self.state['dbPort'])
            self.assertIn(self.source.as_posix(), stop.call_args.args[1])

    def test_maturity_powershell_wrapper_preflights_jar_before_bootstrap_stop(self):
        wrapper = (PROJECT / 'scripts/start_local_maturity.ps1').read_text(encoding='utf-8')
        self.assertLess(wrapper.index('check-jar @runtimeArgs'), wrapper.index('Stop-Process'))
        self.assertIn("if($JarPath){$runtimeArgs+=@('--jar',$JarPath)}", wrapper)

    def test_existing_snapshot_hash_mismatch_is_never_overwritten(self):
        selected = runtime.prepare_java_jar()
        Path(selected['path']).write_bytes(b'retain damaged file as evidence')
        with self.assertRaisesRegex(RuntimeError, 'JAR'):
            runtime.prepare_java_jar()
        self.assertEqual(Path(selected['path']).read_bytes(), b'retain damaged file as evidence')

    def test_private_configuration_in_source_package_is_rejected_before_process_stop(self):
        with zipfile.ZipFile(self.source, 'a') as archive:
            archive.writestr('BOOT-INF/classes/application-prod.yml', 'fixture: private\n')
        with patch.object(runtime.sys, 'argv', ['local_v4.py', 'restart']), patch.object(runtime, 'read_state', return_value=self.state), \
                patch.object(runtime, 'executable_path', return_value='fixture-java'), patch.object(runtime, 'stop_owned') as stop:
            with self.assertRaisesRegex(RuntimeError, 'private application configuration'):
                runtime.main()
        stop.assert_not_called()

    def test_saved_state_cannot_have_an_incomplete_jar_identity(self):
        self.state['javaJarPath'] = str(self.source)
        (self.data / 'runtime.json').write_text(json.dumps(self.state), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'JAR runtime identity is incomplete'):
            runtime.read_state()


if __name__ == '__main__': unittest.main()
