"""Check startup safety before mocked process stops; never contact or stop live services."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import os
import subprocess
import unittest
from unittest.mock import Mock, patch
from test_local_runtime_jar import jar

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / 'scripts'))
spec = importlib.util.spec_from_file_location('local_guard_under_test', PROJECT / 'scripts/local_v4.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class RuntimeGuardTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(dir=PROJECT / '.test-artifacts')
        self.root = Path(self.temporary.name)
        self.data = self.root / '.local-v4'; self.data.mkdir()
        self.config = self.data / 'application-local.yml'
        self.config.write_text('server:\n  address: 127.0.0.1\n  port: 18780\n  servlet:\n    context-path: /api\nspring:\n  datasource:\n    url: jdbc:mysql://127.0.0.1:12345/eatwhat_v4_local_fixture?useSSL=false\n    username: root\n    password: fixture\nsecurity:\n  token:\n    secret: fixture-token\n', encoding='utf-8')
        self.source = self.root / 'backend/target/eatwhat-backend-1.0.0.jar'; jar(self.source)
        self.state = {'environment': 'local', 'api': 'http://127.0.0.1:18780/api', 'dbHost': '127.0.0.1',
                      'database': 'eatwhat_v4_local_fixture', 'root': str(self.root), 'dataDir': '.local-v4/mysql',
                      'javaPid': 123, 'javaExecutable': 'fixture-java', 'dbPort': 12345, 'password': 'fixture', 'tokenSecret': 'fixture-token'}
        self.patches = [patch.object(runtime, 'ROOT', self.root), patch.object(runtime, 'DATA', self.data)]
        for item in self.patches: item.start()
    def tearDown(self):
        for item in reversed(self.patches): item.stop()
        self.temporary.cleanup()

    def restart_failure(self, pattern):
        with patch.object(runtime.sys, 'argv', ['local_v4.py', 'restart']), patch.object(runtime, 'read_state', return_value=self.state), \
                patch.object(runtime, 'executable_path', return_value='fixture-java'), patch.object(runtime, 'stop_owned') as stop, \
                patch.object(runtime, 'start_java'), patch.object(runtime.pymysql, 'connect', return_value=Mock()):
            with self.assertRaisesRegex(RuntimeError, pattern): runtime.main()
        stop.assert_not_called()

    def test_missing_private_config_keeps_old_backend_running(self):
        self.config.unlink(); self.restart_failure('configuration')

    def test_symlink_private_config_keeps_old_backend_running(self):
        original = Path.is_symlink
        with patch.object(Path, 'is_symlink', lambda value: True if value == self.config else original(value)):
            self.restart_failure('configuration')

    def test_datasource_pointing_at_another_database_keeps_old_backend_running(self):
        self.config.write_text(self.config.read_text(encoding='utf-8').replace('/eatwhat_v4_local_fixture?', '/food?'), encoding='utf-8')
        self.restart_failure('configuration')

    def test_another_runtime_listening_on_api_port_is_never_stopped(self):
        with patch.object(runtime, 'api_listener_pids', return_value={999}, create=True):
            self.restart_failure('API port')

    def test_foreign_healthy_http_response_cannot_pass_readiness(self):
        response = Mock(status=200); response.__enter__ = Mock(return_value=response); response.__exit__ = Mock(return_value=False)
        with patch.object(runtime, 'read_state', return_value=self.state), \
                patch.object(runtime, 'process_command', return_value='fixture-command', create=True), \
                patch.object(runtime, 'verify_java_running', return_value=True, create=True), \
                patch.object(runtime, 'api_listener_pids', return_value={999}, create=True), \
                patch.object(runtime.urllib.request, 'urlopen', return_value=response) as request:
            with self.assertRaisesRegex(RuntimeError, 'API port'): runtime.wait_for_basic_api()
        request.assert_not_called()

    def test_new_java_exit_does_not_pass_on_another_servers_health_response(self):
        response = Mock(status=200); response.__enter__ = Mock(return_value=response); response.__exit__ = Mock(return_value=False)
        with patch.object(runtime, 'read_state', return_value=self.state), \
                patch.object(runtime, 'process_command', return_value='', create=True), \
                patch.object(runtime, 'api_listener_pids', return_value={999}, create=True), \
                patch.object(runtime.urllib.request, 'urlopen', return_value=response) as request:
            with self.assertRaisesRegex(RuntimeError, 'Java process'): runtime.wait_for_basic_api()
        request.assert_not_called()

    def test_readiness_accepts_only_the_recorded_live_java_listener(self):
        command='fixture-java -jar '+self.source.as_posix()+' --spring.profiles.active=local-v4 --spring.config.location='+self.config.as_uri()
        response=Mock(status=200);response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False)
        with patch.object(runtime,'read_state',return_value=self.state),patch.object(runtime,'process_command',return_value=command), \
                patch.object(runtime,'api_listener_pids',return_value={123}),patch.object(runtime.urllib.request,'urlopen',return_value=response) as request:
            runtime.wait_for_basic_api()
        self.assertTrue(request.call_args.args[0].endswith('/actuator/health/local-ready'))

    def test_api_listener_with_reused_pid_and_wrong_command_is_not_accepted(self):
        with patch.object(runtime,'api_listener_pids',return_value={123}),patch.object(runtime,'process_command',return_value='another-server.exe'):
            self.restart_failure('Java process identity')

    def test_ready_response_followed_by_java_exit_is_not_accepted(self):
        command='fixture-java -jar '+self.source.as_posix()+' --spring.profiles.active=local-v4 --spring.config.location='+self.config.as_uri()
        response=Mock(status=200);response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False)
        with patch.object(runtime,'read_state',return_value=self.state),patch.object(runtime,'process_command',side_effect=[command,command,'']), \
                patch.object(runtime,'api_listener_pids',return_value={123}),patch.object(runtime.urllib.request,'urlopen',return_value=response):
            with self.assertRaisesRegex(RuntimeError,'Java process exited'):runtime.wait_for_basic_api()

    def test_java_start_rechecks_that_the_api_port_has_not_been_claimed(self):
        with patch.object(runtime,'available',side_effect=OSError('port now busy')),patch.object(runtime.subprocess,'Popen') as spawn:
            with self.assertRaisesRegex(RuntimeError,'API port is unavailable'):runtime.start_java(self.state,'fixture-java')
        spawn.assert_not_called()

    def test_netstat_recognises_exact_ipv4_and_ipv6_listener_owners(self):
        text='  TCP 127.0.0.1:18780 0.0.0.0:0 LISTENING 123\n  TCP [::]:18780 [::]:0 LISTENING 123\n  TCP 127.0.0.1:18780 127.0.0.1:53000 ESTABLISHED 999\n  TCP 0.0.0.0:18781 0.0.0.0:0 LISTENING 777\n'
        self.assertEqual(runtime.parse_netstat_listeners(text),{123})
        with self.assertRaises(ValueError):runtime.parse_netstat_listeners('TCP 127.0.0.1:18780 0.0.0.0:0 LISTENING unknown')

    def test_cim_denial_uses_readonly_netstat_without_concealing_owner(self):
        failure=subprocess.CalledProcessError(1,['powershell'])
        response=subprocess.CompletedProcess([],0,'TCP 127.0.0.1:18780 0.0.0.0:0 LISTENING 999\n','')
        with patch.object(runtime.subprocess,'run',side_effect=[failure,response]) as run:
            self.assertEqual(runtime.api_listener_pids(),{999})
        self.assertEqual(run.call_args.args[0],['netstat.exe','-ano','-p','tcp'])

    def test_failure_of_both_listener_read_methods_is_not_treated_as_free_port(self):
        with patch.object(runtime.subprocess,'run',side_effect=subprocess.CalledProcessError(1,['fixture'])):
            with self.assertRaisesRegex(RuntimeError,'API port ownership could not be verified'):runtime.api_listener_pids()

    @unittest.skipUnless(os.name=='nt','Native limited process queries are Windows-specific')
    def test_native_command_query_can_read_only_the_test_process_without_cim(self):
        command=runtime.native_process_command(os.getpid())
        self.assertIn('python',command.lower())

    def test_native_query_unavailable_falls_back_only_to_the_requested_pid(self):
        with patch.object(runtime,'native_process_command',side_effect=RuntimeError('limited access unavailable')), \
                patch.object(runtime.subprocess,'run',return_value=subprocess.CompletedProcess([],0,'owned fixture command','')) as run:
            self.assertEqual(runtime.process_command(123),'owned fixture command')
        self.assertIn('ProcessId=123',run.call_args.args[0][-1])

    def test_parent_environment_cannot_override_the_private_datasource_or_inject_jvm_options(self):
        injected={'SPRING_DATASOURCE_URL':'jdbc:mysql://remote.example/food','SPRING_APPLICATION_JSON':'{}',
                  'SERVER_PORT':'8080','JAVA_TOOL_OPTIONS':'-Dspring.datasource.url=foreign',
                  'JDK_JAVA_OPTIONS':'-Dserver.address=0.0.0.0','_JAVA_OPTIONS':'-Dsecurity.token.secret=foreign'}
        with patch.dict(runtime.os.environ,injected),patch.object(runtime,'available'), \
                patch.object(runtime.subprocess,'Popen',return_value=Mock(pid=999)) as spawn:
            runtime.start_java(self.state,'fixture-java')
        environment=spawn.call_args.kwargs['env']
        self.assertTrue(all(key not in environment for key in injected))
        self.assertEqual(environment['TENCENT_ASR_ENABLED'],'false')

    def test_config_import_cannot_override_the_checked_private_datasource(self):
        self.config.write_text(self.config.read_text(encoding='utf-8').replace('spring:\n','spring:\n  config:\n    import: file:foreign.yml\n'),encoding='utf-8')
        self.restart_failure('configuration')


if __name__ == '__main__': unittest.main()
