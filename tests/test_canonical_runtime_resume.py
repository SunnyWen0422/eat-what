"""Pure owner-resume guard/orchestration tests; all processes, DB and HTTP mocked."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/canonical_catalog_runtime.py"
SPEC = importlib.util.spec_from_file_location("canonical_runtime_resume", SCRIPT)
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)


class Process:
    def __init__(self, pid):
        self.pid, self.code = pid, None
    def poll(self): return self.code
    def terminate(self): self.code = 0
    def kill(self): self.code = -1
    def wait(self, timeout=None):
        if self.code is None: raise runtime.subprocess.TimeoutExpired("synthetic", timeout)
        return self.code


class ResumeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.out = self.root / "owned"
        self.private = self.out / "private"
        self.data = self.private / "mysql"
        (self.data / "mysql").mkdir(parents=True)
        (self.data / "auto.cnf").write_text("synthetic-owned", encoding="utf-8")
        self.catalog = self.root / "catalog.json"
        self.catalog.write_text('{"recipes":[{"id":1}]}', encoding="utf-8")
        (self.private / "candidate.jar").write_bytes(b"old-synthetic-jar")
        self.jar = self.root / "new.jar"
        self.jar.write_bytes(b"new-synthetic-jar")
        self.manifest = self.root / "new-build.json"
        self.state = dict(api="http://127.0.0.1:15001/api", database="eatwhat_catalog_local_1234abcd",
                          dbPort=15002, pythonPort=15003, password="synthetic-password-000",
                          tokenSecret="synthetic-token-000000", serviceToken="synthetic-service-0000",
                          catalogPath=str(self.catalog.resolve()), catalogSha256=runtime.digest(self.catalog),
                          purpose="canonical-catalog-isolated", providerMode="mock", sourceFingerprint="1"*64,
                          jarSha256=runtime.digest(self.private / "candidate.jar"), naturalRepliesEnabled=True,
                          mysqlPid=1001, javaPid=1002)
        (self.data / self.state["database"]).mkdir()
        self.old_build = dict(purpose="canonical-catalog-isolated-build", sourceBefore="1"*64,
                              sourceAfter="1"*64, jarSha256=self.state["jarSha256"])
        self.new_build = dict(purpose="canonical-catalog-isolated-build", sourceBefore="2"*64,
                              sourceAfter="2"*64, jarSha256=runtime.digest(self.jar))
        self.write(self.manifest, self.new_build)
        self.write(self.private / "runtime.json", self.state)
        self.write(self.out / "build-manifest.json", self.old_build)
        self.write(self.out / "ready.json", {key:self.state[key] for key in ("api","jarSha256","sourceFingerprint")})
        self.write(self.out / "cleanup.json", {"allOwnedProcessesExited":True})
        self.write(self.out / "import-report.json", dict(catalogSha256=self.state["catalogSha256"], productionTouched=False, realModelRequests=0))
        self.verify, self.ports = Mock(return_value=self.new_build), Mock()

    def write(self, path, value): path.write_text(json.dumps(value), encoding="utf-8")
    def guard(self):
        return runtime.validate_resume_owned(self.out, self.catalog, self.jar, self.manifest, self.verify, self.ports)
    def mutate_state(self, **fields):
        state = dict(self.state, **fields)
        self.write(self.private / "runtime.json", state)

    def test_complete_stopped_owner_and_new_verified_build_pass_without_mutation(self):
        before = {path:path.read_bytes() for path in self.out.rglob("*") if path.is_file()}
        out, state, build = self.guard()
        self.assertEqual(self.out, out)
        self.assertEqual(self.state, state)
        self.assertEqual(self.new_build, build)
        self.verify.assert_called_once_with(self.jar, self.manifest)
        self.ports.assert_called_once_with([15001,15002,15003])
        self.assertEqual(before, {path:path.read_bytes() for path in self.out.rglob("*") if path.is_file()})

    def test_missing_or_failed_cleanup_and_missing_receipts_refuse(self):
        cleanup = self.out / "cleanup.json"
        cleanup.unlink()
        with self.assertRaises(ValueError): self.guard()
        self.write(cleanup, {"allOwnedProcessesExited":False})
        with self.assertRaises(ValueError): self.guard()
        self.write(cleanup, {"allOwnedProcessesExited":True,"databaseIdentityVerified":False})
        with self.assertRaises(ValueError): self.guard()
        self.verify.assert_not_called()

    def test_ambient_hosts_database_injection_ports_and_missing_secrets_refuse(self):
        for change in [dict(api="http://example.org:15001/api"), dict(api="http://127.0.0.1:15001/other"),
                       dict(api="http://user:secret@127.0.0.1:15001/api"), dict(database="eatwhat; DROP DATABASE x"),
                       dict(dbPort=15001), dict(pythonPort=80), dict(dbPort=True), dict(password=""),
                       dict(serviceToken="injected\nproperty=value"), dict(providerMode="real")]:
            self.mutate_state(**change)
            with self.subTest(change=list(change)):
                with self.assertRaises(ValueError): self.guard()
        self.verify.assert_not_called()

    def test_catalog_path_hash_and_prior_candidate_chain_are_mandatory(self):
        self.mutate_state(catalogSha256="0"*64)
        with self.assertRaisesRegex(ValueError,"catalog"): self.guard()
        self.mutate_state(catalogPath=str(self.root / "other.json"))
        with self.assertRaisesRegex(ValueError,"catalog"): self.guard()
        self.mutate_state()
        (self.private / "candidate.jar").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError,"candidate/build"): self.guard()

    def test_new_build_failure_or_busy_port_refuses_before_archival(self):
        self.verify.side_effect = ValueError("bad build")
        with self.assertRaisesRegex(ValueError,"bad build"): self.guard()
        self.verify.side_effect = None
        self.ports.side_effect = OSError("busy")
        with self.assertRaises(OSError): self.guard()
        self.assertTrue((self.out / "cleanup.json").exists())
        self.assertFalse((self.out / "history").exists())

    def test_inside_repo_and_datadir_link_are_rejected(self):
        with patch.object(runtime,"ROOT",self.root):
            with self.assertRaises(ValueError): self.guard()
        real = Path.is_symlink
        with patch.object(Path,"is_symlink",lambda path: path == self.data or real(path)):
            with self.assertRaisesRegex(ValueError,"links"): self.guard()

    def test_exclusive_lock_and_unique_history_preserve_old_evidence_and_retire_cleanup(self):
        old = {name:(self.out / name).read_bytes() for name in ("private/candidate.jar","private/runtime.json","build-manifest.json","ready.json","cleanup.json")}
        with runtime.resume_lock(self.out):
            with self.assertRaises(FileExistsError):
                with runtime.resume_lock(self.out): pass
            history = runtime.archive_resume_receipts(self.out)
            self.assertTrue((self.out / ".resume-owned.lock").exists())
            self.assertFalse((self.out / "cleanup.json").exists())
            self.assertFalse((self.out / "ready.json").exists())
            for name, value in old.items(): self.assertEqual(value,(history / name).read_bytes())
        self.assertFalse((self.out / ".resume-owned.lock").exists())
        with self.assertRaises(ValueError): self.guard()

    def test_resume_mysql_uses_original_password_database_and_only_identity_select(self):
        mysql, db, cursor = Process(2001), Mock(), Mock()
        db.cursor.return_value.__enter__ = Mock(return_value=cursor)
        db.cursor.return_value.__exit__ = Mock(return_value=False)
        cursor.fetchone.return_value = (str(self.data),15002,self.state["database"])
        connect = Mock(return_value=db)
        with patch.object(runtime.subprocess,"Popen",return_value=mysql) as popen, patch.object(runtime.subprocess,"run") as initialize:
            processes = []
            actual, _ = runtime.start_owned_mysql("synthetic-mysqld",self.data,self.private,self.state,processes,connect,ConnectionError,resume=True)
        self.assertIs(mysql,actual)
        self.assertEqual([mysql],processes)
        initialize.assert_not_called()
        connect.assert_called_once_with(host="127.0.0.1",port=15002,user="root",password=self.state["password"],charset="utf8mb4",autocommit=True,connect_timeout=2,database=self.state["database"])
        self.assertIn("--datadir="+str(self.data),popen.call_args.args[0])
        cursor.execute.assert_called_once_with("SELECT @@datadir,@@port,DATABASE()")

    def test_wrong_database_identity_is_never_shutdown(self):
        mysql, db, cursor = Process(2001), Mock(), Mock()
        db.cursor.return_value.__enter__ = Mock(return_value=cursor)
        db.cursor.return_value.__exit__ = Mock(return_value=False)
        cursor.fetchone.return_value = (str(self.root / "foreign"),15002,self.state["database"])
        with self.assertRaisesRegex(RuntimeError,"identity"):
            runtime.cleanup_owned([mysql],mysql,db,self.data,self.state)
        self.assertNotIn(unittest.mock.call("SHUTDOWN"),cursor.execute.call_args_list)
        self.assertIsNotNone(mysql.poll())
        db.close.assert_called_once()

    def test_fresh_mysql_still_initializes_and_connects_with_empty_password(self):
        mysql, connect = Process(2001), Mock(return_value=Mock())
        with patch.object(runtime.subprocess,"Popen",return_value=mysql), patch.object(runtime.subprocess,"run") as initialize:
            runtime.start_owned_mysql("synthetic-mysqld",self.data,self.private,self.state,[],connect,ConnectionError)
        self.assertIn("--initialize-insecure",initialize.call_args.args[0])
        self.assertEqual("",connect.call_args.kwargs["password"])
        self.assertNotIn("database",connect.call_args.kwargs)

    def test_windows_server_disables_monitor_for_fresh_and_resume_but_not_initialization(self):
        for resume in (False,True):
            server=Process(3001)
            with patch.object(runtime.sys,"platform","win32"), \
                 patch.object(runtime.subprocess,"Popen",return_value=server) as launch, \
                 patch.object(runtime.subprocess,"run") as initialize:
                with self.assertRaisesRegex(RuntimeError,"synthetic auth failure"):
                    runtime.start_owned_mysql("synthetic-mysqld",self.data,self.private,self.state,[],Mock(side_effect=RuntimeError("synthetic auth failure")),ConnectionError,resume=resume)
            self.assertEqual(1,launch.call_args.args[0].count("--no-monitor"))
            self.assertEqual("--no-defaults",launch.call_args.args[0][1])
            if resume:initialize.assert_not_called()
            else:self.assertNotIn("--no-monitor",initialize.call_args.args[0])

    def test_non_windows_start_does_not_send_windows_only_no_monitor(self):
        with patch.object(runtime.sys,"platform","linux"), \
             patch.object(runtime.subprocess,"Popen",return_value=Process(3001)) as launch, \
             patch.object(runtime.subprocess,"run"):
            runtime.start_owned_mysql("synthetic-mysqld",self.data,self.private,self.state,[],Mock(return_value=Mock()),ConnectionError)
        self.assertNotIn("--no-monitor",launch.call_args.args[0])

    def test_windows_auth_failure_cleanup_terminates_owned_actual_server_handle(self):
        server=Process(3001);processes=[]
        with patch.object(runtime.sys,"platform","win32"), \
             patch.object(runtime.subprocess,"Popen",return_value=server) as launch, \
             patch.object(runtime.subprocess,"run") as initialize:
            with self.assertRaisesRegex(RuntimeError,"synthetic auth failure"):
                runtime.start_owned_mysql("synthetic-mysqld",self.data,self.private,self.state,processes,Mock(side_effect=RuntimeError("synthetic auth failure")),ConnectionError,resume=True)
        self.assertIn("--no-monitor",launch.call_args.args[0]);initialize.assert_not_called()
        self.assertEqual([server],processes)
        with patch.object(server,"terminate",wraps=server.terminate) as terminate:
            cleanup=runtime.cleanup_owned(processes,None,None,self.data,self.state)
        terminate.assert_called_once();self.assertIsNotNone(server.poll())
        self.assertTrue(cleanup["allOwnedProcessesExited"]);self.assertFalse(cleanup["databaseIdentityVerified"])

    def test_main_resume_mock_chain_preserves_data_secrets_and_history_without_import(self):
        mysql, java = Process(2001), Process(2002)
        db, cursor = Mock(), Mock()
        db.cursor.return_value.__enter__ = Mock(return_value=cursor)
        db.cursor.return_value.__exit__ = Mock(return_value=False)
        cursor.fetchone.return_value = (str(self.data),15002,self.state["database"])
        def execute(sql):
            if sql == "SHUTDOWN": mysql.code=0
        cursor.execute.side_effect = execute
        importer, statements = Mock(), Mock()
        modules = {"pymysql":types.SimpleNamespace(connect=Mock(return_value=db),Error=ConnectionError,connections=types.SimpleNamespace(_auth=types.SimpleNamespace(_have_cryptography=True))),
                   "canonical_catalog_import":types.SimpleNamespace(install=importer),
                   "run_mysql_integration":types.SimpleNamespace(statements=statements),
                   "maturity_runtime":types.SimpleNamespace(backend_fingerprint=lambda:"2"*64),
                   "build_canonical_catalog":types.SimpleNamespace(verify_build=self.verify)}
        argv = [str(SCRIPT),"--resume-owned","--output",str(self.out),"--catalog",str(self.catalog),
                "--retired",str(self.root / "never-read-retired.json"),"--mysqld","synthetic-mysqld",
                "--java","synthetic-java","--jar",str(self.jar),"--build-manifest",str(self.manifest)]
        response=Mock(status=200)
        response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False)
        before=(self.data / "auto.cnf").read_bytes()
        with patch.dict(runtime.sys.modules,modules), patch.object(runtime.sys,"argv",argv), \
             patch.object(runtime,"assert_ports_available",self.ports), \
             patch.object(runtime.subprocess,"Popen",side_effect=[mysql,java]), \
             patch.object(runtime.subprocess,"run") as initialize, \
             patch.object(runtime.urllib.request,"urlopen",return_value=response), \
             patch.object(runtime.time,"sleep",side_effect=lambda _:self.write(self.out / "control.json",{"action":"stop"})):
            runtime.main()
        initialize.assert_not_called();importer.assert_not_called();statements.assert_not_called()
        self.assertEqual(before,(self.data / "auto.cnf").read_bytes())
        current=json.loads((self.private / "runtime.json").read_text("utf-8"))
        for key in ("password","tokenSecret","serviceToken","catalogPath","catalogSha256","database","api","dbPort","pythonPort"):
            self.assertEqual(self.state[key],current[key],key)
        self.assertEqual(2001,current["mysqlPid"]);self.assertEqual(2002,current["javaPid"])
        self.assertEqual("2"*64,current["sourceFingerprint"])
        self.assertEqual(runtime.digest(self.jar),current["jarSha256"])
        history=list((self.out / "history").iterdir())
        self.assertEqual(1,len(history));self.assertEqual(b"old-synthetic-jar",(history[0]/"private/candidate.jar").read_bytes())
        self.assertTrue(json.loads((self.out / "cleanup.json").read_text("utf-8"))["allOwnedProcessesExited"])
        self.assertFalse((self.out / ".resume-owned.lock").exists())
        self.assertTrue(all(call.args[0] in ("SELECT @@datadir,@@port,DATABASE()","SHUTDOWN") for call in cursor.execute.call_args_list))

    def test_rsa_preflight_checks_actual_auth_module_backend(self):
        for fake in (types.SimpleNamespace(),types.SimpleNamespace(connections=types.SimpleNamespace(_auth=types.SimpleNamespace(_have_cryptography=False)))):
            with self.assertRaisesRegex(RuntimeError,"cryptography/RSA"): runtime.assert_resume_rsa_support(fake)
        runtime.assert_resume_rsa_support(types.SimpleNamespace(connections=types.SimpleNamespace(_auth=types.SimpleNamespace(_have_cryptography=True))))

    def test_missing_rsa_backend_fails_before_archival_without_retiring_ready_or_cleanup(self):
        fake_mysql=types.SimpleNamespace(connect=Mock(),Error=ConnectionError,connections=types.SimpleNamespace(_auth=types.SimpleNamespace(_have_cryptography=False)))
        importer,statements=Mock(),Mock()
        modules={"pymysql":fake_mysql,"canonical_catalog_import":types.SimpleNamespace(install=importer),
                 "run_mysql_integration":types.SimpleNamespace(statements=statements),
                 "maturity_runtime":types.SimpleNamespace(backend_fingerprint=lambda:"2"*64),
                 "build_canonical_catalog":types.SimpleNamespace(verify_build=self.verify)}
        argv=[str(SCRIPT),"--resume-owned","--output",str(self.out),"--catalog",str(self.catalog),
              "--retired",str(self.root/"never-read-retired.json"),"--mysqld","synthetic-mysqld",
              "--java","synthetic-java","--jar",str(self.jar),"--build-manifest",str(self.manifest)]
        before={path:path.read_bytes() for path in self.out.rglob("*") if path.is_file()}
        with patch.dict(runtime.sys.modules,modules),patch.object(runtime.sys,"argv",argv), \
             patch.object(runtime,"assert_ports_available",self.ports), \
             patch.object(runtime.subprocess,"Popen") as launch,patch.object(runtime.subprocess,"run") as initialize:
            with self.assertRaisesRegex(RuntimeError,"cryptography/RSA"):runtime.main()
        self.assertEqual(before,{path:path.read_bytes() for path in self.out.rglob("*") if path.is_file()})
        self.assertFalse((self.out/"history").exists());self.assertFalse((self.out/".resume-owned.lock").exists())
        launch.assert_not_called();initialize.assert_not_called();fake_mysql.connect.assert_not_called()
        importer.assert_not_called();statements.assert_not_called()


if __name__ == "__main__": unittest.main()
