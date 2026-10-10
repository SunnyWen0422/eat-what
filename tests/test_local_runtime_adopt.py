"""Recover only a proven local listener; all process boundaries are mocked."""
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
import test_local_runtime_guard as guards
from test_local_runtime_jar import jar

runtime=guards.runtime


class RuntimeAdoptTest(unittest.TestCase):
    def setUp(self):
        self.fixture=guards.RuntimeGuardTest('test_missing_private_config_keeps_old_backend_running')
        self.fixture.setUp()
        self.state=self.fixture.state.copy();self.data=self.fixture.data;self.source=self.fixture.source
        self.record=self.data/'runtime.json'
        self.original=json.dumps(self.state,ensure_ascii=False,indent=2).encode('utf-8')
        self.record.write_bytes(self.original)
    def tearDown(self):self.fixture.tearDown()
    def command(self,source=None,config=None):
        return '"fixture-java" -jar "'+str(source or self.source)+'" --spring.profiles.active=local-v4 --spring.config.location='+(config or self.fixture.config).as_uri()+' --management.endpoint.health.group.local-ready.include=db,ping'
    def adopt(self,command=None,owners=None):
        with patch.object(runtime,'api_listener_pids',return_value=owners if owners is not None else {444}), \
                patch.object(runtime,'process_command',return_value=command or self.command()), \
                patch.object(runtime,'stop_owned') as stop,patch.object(runtime.subprocess,'Popen') as spawn:
            result=runtime.adopt_running()
        stop.assert_not_called();spawn.assert_not_called()
        return result

    def test_wrong_recorded_pid_is_recovered_only_from_a_matching_legacy_listener(self):
        result=self.adopt()
        saved=json.loads(self.record.read_text(encoding='utf-8'))
        self.assertEqual(saved['javaPid'],444)
        retained={key:value for key,value in saved.items() if key!='javaPid'}
        self.assertEqual(retained,{key:value for key,value in self.state.items() if key!='javaPid'})
        self.assertEqual(result['layout'],'legacy-canonical')
        self.assertEqual(Path(result['backup']).read_bytes(),self.original)
        self.assertEqual((self.data/'application-local.yml').read_text(encoding='utf-8'),self.fixture.config.read_text(encoding='utf-8'))

    def test_existing_saved_snapshot_can_be_adopted_without_changing_its_hash(self):
        pinned=runtime.prepare_java_jar()
        self.state.update(javaJarPath=pinned['path'],javaJarSha256=pinned['sha256'])
        self.original=json.dumps(self.state).encode();self.record.write_bytes(self.original)
        result=self.adopt(self.command(Path(pinned['path'])))
        saved=json.loads(self.record.read_text(encoding='utf-8'))
        self.assertEqual(saved['javaJarPath'],pinned['path']);self.assertEqual(saved['javaJarSha256'],pinned['sha256'])
        self.assertEqual(result['layout'],'saved-snapshot')
        self.assertEqual(Path(result['backup']).read_bytes(),self.original)

    def test_canonical_listener_does_not_masquerade_as_the_saved_newer_snapshot(self):
        newer=self.fixture.root/'newer-build.jar';jar(newer,b'newer inactive build')
        pinned=runtime.prepare_java_jar(explicit=str(newer))
        self.state.update(javaJarPath=pinned['path'],javaJarSha256=pinned['sha256'])
        self.original=json.dumps(self.state).encode();self.record.write_bytes(self.original)
        result=self.adopt()
        saved=json.loads(self.record.read_text(encoding='utf-8'))
        self.assertNotIn('javaJarPath',saved);self.assertNotIn('javaJarSha256',saved)
        self.assertNotEqual(result['jarSha256'],pinned['sha256'])
        self.assertEqual(Path(result['backup']).read_bytes(),self.original)

    def test_foreign_jar_or_private_configuration_is_refused_without_writing_backup(self):
        foreign=self.fixture.root/'foreign.jar';jar(foreign)
        for command in [self.command(foreign),self.command(config=self.fixture.root/'other-runtime/application-local.yml')]:
            with self.subTest(command=command),self.assertRaisesRegex(RuntimeError,'listener'):
                self.adopt(command)
            self.assertEqual(self.record.read_bytes(),self.original)
            self.assertEqual(list(self.data.glob('runtime-before-adopt-*.json')),[])

    def test_extra_datasource_argument_is_refused_even_when_markers_match(self):
        with self.assertRaisesRegex(RuntimeError,'listener'):
            self.adopt(self.command()+' --spring.datasource.url=jdbc:mysql://remote.example/food')
        self.assertEqual(self.record.read_bytes(),self.original)

    def test_missing_or_multiple_listeners_cannot_be_adopted(self):
        for owners in [set(),{444,555}]:
            with self.subTest(owners=owners),self.assertRaisesRegex(RuntimeError,'listener'):
                self.adopt(owners=owners)
        self.assertEqual(self.record.read_bytes(),self.original)

    def test_repeated_explicit_adoptions_preserve_separate_original_backups(self):
        first=self.adopt();second=self.adopt()
        self.assertNotEqual(first['backup'],second['backup'])
        self.assertEqual(Path(first['backup']).read_bytes(),self.original)
        self.assertEqual(len(list(self.data.glob('runtime-before-adopt-*.json'))),2)

    def test_listener_change_during_recovery_never_overwrites_original_state(self):
        with patch.object(runtime,'api_listener_pids',side_effect=[{444},{555}]), \
                patch.object(runtime,'process_command',return_value=self.command()),patch.object(runtime,'stop_owned') as stop:
            with self.assertRaisesRegex(RuntimeError,'changed during recovery'):runtime.adopt_running()
        self.assertEqual(self.record.read_bytes(),self.original)
        self.assertEqual(list(self.data.glob('runtime-before-adopt-*.json')),[])
        stop.assert_not_called()

    def test_listener_change_after_backup_preserves_backup_and_original_state(self):
        with patch.object(runtime,'api_listener_pids',side_effect=[{444},{444},{555}]), \
                patch.object(runtime,'process_command',return_value=self.command()),patch.object(runtime,'stop_owned') as stop:
            with self.assertRaisesRegex(RuntimeError,'changed before saving'):runtime.adopt_running()
        self.assertEqual(self.record.read_bytes(),self.original)
        backups=list(self.data.glob('runtime-before-adopt-*.json'))
        self.assertEqual(len(backups),1);self.assertEqual(backups[0].read_bytes(),self.original)
        stop.assert_not_called()

    def test_windows_command_parser_keeps_quoted_owned_paths_as_single_arguments(self):
        value='"C:\\Program Files\\Java\\bin\\java.exe" -jar "C:\\Owned Project\\backend\\target\\app.jar"'
        self.assertEqual(runtime.windows_command_arguments(value),['C:\\Program Files\\Java\\bin\\java.exe','-jar','C:\\Owned Project\\backend\\target\\app.jar'])


if __name__=='__main__':unittest.main()
