"""Offline coordinator contracts: no services, SDK, credentials or HTTP."""
import importlib.util,json,os,sys,tempfile,unittest
from contextlib import ExitStack,nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('e18_native',ROOT/'scripts/acceptance/experience_continuity_native.py')
native=importlib.util.module_from_spec(spec);spec.loader.exec_module(native)

def copy_case(status='observed-requires-db-count',closed=True):
    return {'route':'pages/custom-dishes/custom-dishes','role':'ordinary',
            'interaction':{'status':status,'name':'system cancel creates no copy','editorClosed':closed}}

class NativeCoordinatorTest(unittest.TestCase):
    def test_copy_cancel_requires_both_closed_editor_and_zero_delta(self):
        before={'910001':0,'910002':0}
        for cases,after,status,code in [([copy_case()],dict(before),'observed',0),
                ([copy_case()],{'910001':0,'910002':1},'failed',2),
                ([copy_case('not-run',False)],dict(before),'not-run',0),
                ([],dict(before),'not-run',0),
                ([copy_case('failed',False)],dict(before),'failed',2),
                ([copy_case('blocked',False)],dict(before),'blocked',2),
                ([copy_case()],{'910002':0},'blocked',2)]:
            with self.subTest(status=status,after=after),tempfile.TemporaryDirectory() as directory:
                receipt={'copyCountsBefore':before,'copyCountsAfter':after,'nativeExitCode':0}
                self.assertEqual(code,native.finish_receipt(Path(directory),receipt,cases))
                stored=json.loads((Path(directory)/'service-receipt.json').read_text())
                self.assertEqual(status,stored['copyCancel']['status'])
                self.assertEqual(code,stored['coordinatorExitCode'])
                self.assertEqual(0,stored['nativeExitCode'])
                self.assertEqual(after,stored['copyCountsAfter'])

    def test_python_to_native_spawn_filters_inherited_credentials_and_keeps_owned_nonce(self):
        captured=[]
        def popen(command,**kwargs):
            captured.append(kwargs)
            return SimpleNamespace(wait=lambda **_:0)
        with patch.dict(os.environ,{'SystemRoot':'C:/Windows','PATH':'D:/tools','TEMP':'C:/temp',
                'NODE_OPTIONS':'--require bad','SENTINEL_CREDENTIAL':'secret','DEEPSEEK_API_KEY':'secret',
                'HTTPS_PROXY':'secret','EATWHAT_E18_CHILD':'stale','PYTHONPATH':'bad'},clear=True),patch.object(native.subprocess,'Popen',side_effect=popen):
            self.assertEqual(0,native.run_native_child(['synthetic'], 'owned-nonce'))
        self.assertEqual(1,len(captured));env=captured[0]['env']
        self.assertEqual('C:/Windows',{key.lower():value for key,value in env.items()}['systemroot']);self.assertEqual('D:/tools',env['PATH'])
        self.assertEqual('owned-nonce',env['EATWHAT_E18_CHILD'])
        for key in ('NODE_OPTIONS','SENTINEL_CREDENTIAL','DEEPSEEK_API_KEY','HTTPS_PROXY','PYTHONPATH'):
            self.assertNotIn(key,env)

    def test_coordinator_reads_native_cancel_and_fails_saved_count_delta(self):
        counts=iter([0,0,0,1]);spawns=[]
        def sql(query,params=None):
            return [[next(counts)]] if 'COUNT(*)' in query else [[1],[2],[3]]
        api=SimpleNamespace(sql=sql,http=lambda path,*args,**kwargs:
                            {'user':{'id':kwargs['user']}} if path=='/users/info' else {})
        runtime=SimpleNamespace(api=api,state={})
        def popen(command,**kwargs):
            spawns.append(kwargs)
            output=Path(command[command.index('--out')+1]);output.mkdir()
            (output/'native-results.json').write_text(json.dumps({'cases':[copy_case()]}))
            return SimpleNamespace(wait=lambda **_:0)
        with tempfile.TemporaryDirectory() as directory,ExitStack() as patches:
            base=Path(directory);config=base/'config.json';out=base/'evidence'
            config.write_text(json.dumps(dict.fromkeys(
                ['sourceSha','loopbackApi','jarSha256','datasetHash','buildSourceFingerprint'],'synthetic')))
            args=SimpleNamespace(driver=str(ROOT/'scripts/acceptance/experience-continuity-native.cjs'),
                config=str(config),out=str(out),node='synthetic-node',python='synthetic-python',
                port='9431',width='320',widths='320',scales='2',sdk=None,cli=None,cases='custom-dishes',
                prepare_only=False,remote=False,remote_ui=False,manual_confirm=True,assistant_cards=False)
            for name,replacement in [('new_output',lambda value:Path(value)),('preflight',lambda *args:None),
                    ('owned_runtime',lambda *args:nullcontext(runtime)),('temporary_semantics',lambda _:{}),
                    ('bearer',lambda *args:'synthetic-token')]:
                patches.enter_context(patch.object(native,name,replacement))
            patches.enter_context(patch.object(native.subprocess,'Popen',side_effect=popen))
            patches.enter_context(patch.dict(os.environ,{'SystemRoot':'C:/Windows','PATH':'D:/tools',
                'SENTINEL_CREDENTIAL':'secret','NODE_OPTIONS':'--require bad','EATWHAT_E18_CHILD':'stale'},clear=True))
            self.assertEqual(2,native.run(args))
            receipt=json.loads((out/'service-receipt.json').read_text())
            self.assertEqual('failed',receipt['copyCancel']['status'])
            self.assertTrue(receipt['copyCancel']['editorClosed'])
            self.assertFalse(receipt['copyCancel']['countsEqual'])
            self.assertEqual(0,receipt['nativeExitCode']);self.assertEqual(2,receipt['coordinatorExitCode'])
            self.assertEqual({'910001':0,'910002':1},receipt['copyCountsAfter'])
            self.assertEqual(1,len(spawns));env=spawns[0]['env']
            self.assertTrue(env['EATWHAT_E18_CHILD']);self.assertNotEqual('stale',env['EATWHAT_E18_CHILD'])
            self.assertNotIn('NODE_OPTIONS',env);self.assertNotIn('SENTINEL_CREDENTIAL',env)

if __name__=='__main__':unittest.main()
