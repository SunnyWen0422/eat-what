"""Experience receipts on a new owned runtime; never uses frontend API config.

Service transactions, isolated page regressions, browser persistence and native
proof are separate evidence scopes. Missing evidence is never a passing case.
"""
import argparse
from datetime import date, timedelta
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import uuid

from maturity_runtime import ROOT, available, digest, new_output, owned_runtime, preflight, validate_config
from run_maturity_acceptance import Journeys, require, run as run_database

STATUSES = {'passed', 'failed', 'blocked', 'not-run', 'not-applicable'}
PATHS = ('calendar', 'shopping', 'actual', 'copy')
FAULTS = ('precommit-failure', 'lost-response', 'restart', 'duplicate-confirmation', 'version-conflict')


def load_cases(path):
    value = json.loads(Path(path).read_text(encoding='utf-8'))
    if value.get('schemaVersion') != 1: raise ValueError('Unsupported experience case contract')
    if [c['id'] for c in value['journeys']] != ['J%02d' % n for n in range(1, 13)]:
        raise ValueError('All twelve named journeys required')
    if {(c.get('path'), c.get('fault')) for c in value['faults']} != {(p, f) for p in PATHS for f in FAULTS} or len(value['faults']) != 20:
        raise ValueError('Complete persistent-write fault matrix required')
    ids = []
    for case in value['journeys'] + value['faults']:
        ids.append(case['id'])
        if not all(isinstance(case.get(k), list) and case[k] for k in ('steps', 'assertions')):
            raise ValueError('Named steps and assertions required')
        if case.get('status') != 'not-run' or not isinstance(case.get('evidence'), list) or not isinstance(case.get('limits'), list) or case.get('sourceFingerprint') is not None:
            raise ValueError('Source cases must declare unexecuted evidence')
    if len(ids) != len(set(ids)): raise ValueError('Duplicate case IDs')
    return value


def fingerprints(config, config_hash):
    return {k: config[k] for k in ('sourceSha', 'jarSha256', 'buildSourceFingerprint', 'datasetHash', 'providerMode')} | {'configSha256': config_hash}


def result(case, status, evidence, fingerprint, limits):
    if status not in STATUSES or status == 'passed' and not evidence:
        raise ValueError('Passing status requires inspectable evidence')
    return {**case, 'sourceFingerprint': fingerprint, 'status': status,
            'evidence': evidence, 'limits': case.get('limits', []) + limits}


def assert_delta(before, after, expected):
    require(after == {k:v + expected.get(k,0) for k,v in before.items()},
            'Committed object counts differ from the exact expected delta')


def write_report(root, report):
    (root / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


def page_regression(case, root, node):
    """Explicit VM/platform doubles; these files never use configured production HTTP."""
    files = case.get('pageTests', [])
    if not files: return None
    if any(not p.startswith('tests/') or not p.endswith('.test.js') or not (ROOT / p).is_file() for p in files):
        raise ValueError('Only declared repository page regressions allowed')
    log = root / (case['id'] + '-pages.tap')
    with log.open('wb') as output:
        process = subprocess.run([node, '--test', '--test-reporter=tap', *files], cwd=ROOT,
                                 stdout=output, stderr=subprocess.STDOUT, timeout=90)
    text = log.read_text(encoding='utf-8')
    passing = re.search(r'^# pass ([0-9]+)$',text,re.M)
    passed = process.returncode == 0 and passing is not None and int(passing[1]) > 0 and '# fail 0' in text
    return {'scope': 'isolated real page/module code with platform and HTTP doubles',
            'passed': passed, 'testsPassed':int(passing[1]) if passing else 0,
            'log': log.name, 'sha256': digest(log), 'files': files}


def browser_restart(root, node):
    cli = ROOT / 'web/node_modules/@playwright/test/cli.js'
    if not cli.is_file(): return {'status':'blocked', 'reason':'Locked browser dependencies unavailable'}
    available(4173)  # Do not accept a foreign development server.
    log = root / 'J11-browser.json'
    env = dict(os.environ, CI='1', EATWHAT_E17_BROWSER_PROFILE=str(root / 'browser-profile'),
               PLAYWRIGHT_HTML_OPEN='never')
    env.pop('EATWHAT_E2E_EXTERNAL_SERVER', None)
    with log.open('wb') as output:
        process = subprocess.run([node, str(cli), 'test', 'e2e/experience-continuity.spec.ts',
            '--project=chromium', '--reporter=json', '--output=' + str(root / 'browser-results')],
            cwd=ROOT / 'web', env=env, stdout=output, stderr=subprocess.STDOUT, timeout=180)
    try: stats = json.loads(log.read_text(encoding='utf-8'))['stats']
    except (ValueError, KeyError): stats = {}
    passed = process.returncode == 0 and stats.get('expected') == 1 and all(stats.get(k)==0 for k in ('unexpected','skipped','flaky'))
    return {'status':'passed' if passed else 'failed', 'log':log.name,'stats':stats,
            'sha256':digest(log), 'scope':'real Chromium process restart, IndexedDB and UI; isolated catalog'}


def partial_completion(runtime, suite):
    a, user = runtime.api, suite.user
    w = suite.current()['workspace']; target = str(suite.target + timedelta(days=3))
    before = a.counts(user)
    turn = a.turn(user,w,suite.session,'E17 部分完成 '+str(uuid.uuid4()),steps=[
        {'kind':'calendar_save','arguments':{'targetDate':target,'targetMealType':'dinner'}},
        {'kind':'shopping_preview','arguments':{'sourceRef':{'kind':'draft','workspaceId':w['id']}}}])
    require(turn['status']=='awaiting_confirmation' and a.counts(user)==before,'Preview wrote business state')
    require(a.confirm(user,turn)['status']=='completed','First calendar confirmation failed')
    continued = a.poll(user,turn['turnId']); after = a.counts(user)
    require(continued['status']=='awaiting_confirmation' and after['recipe_records']==before['recipe_records']+1,'Partial calendar receipt absent')
    a.sql('UPDATE shopping_list SET version=version+1 WHERE user_id=%s',(user,))
    failed = a.confirm(user,continued)
    require(failed['status']!='completed','Stale procurement claimed completed')
    runtime.restart()
    reread = a.http('/assistant/v4/turns/'+turn['turnId'],user=user)
    require(a.counts(user)==after,'Restart/failed step erased or duplicated completed part')
    steps = reread['continuation']['steps']
    require(steps[0]['status']=='completed' and steps[0].get('receiptRef') and steps[1]['status']!='completed','Partial receipts misreported')
    return {'turnId':turn['turnId'],'savedReceipt':steps[0]['receiptRef'],'remainingStatus':steps[1]['status'],
        'savedMealCountRetained':after['recipe_records'],'procurementCountUnchanged':True,'realJvmRestart':True}


def deleted_plan_actual(runtime, suite):
    a, user = runtime.api, suite.user
    before = a.sql('SELECT revision,actual_dishes_json,planned_snapshot_json FROM meal_consumption WHERE user_id=%s AND meal_date=%s AND meal_type=%s',(user,str(suite.target),'lunch'))
    require(bool(before),'Actual snapshot absent before delete')
    a.http('/recipe-records/date/'+str(suite.target)+'/meal/lunch',user=user,method='DELETE')
    slot = a.http('/meal-workspaces/current?date='+str(suite.target)+'&mealType=lunch',user=user)
    after = a.sql('SELECT revision,actual_dishes_json,planned_snapshot_json FROM meal_consumption WHERE user_id=%s AND meal_date=%s AND meal_type=%s',(user,str(suite.target),'lunch'))
    require(slot.get('plan') is None and slot.get('actual') and after==before,'Deleting plan erased actual snapshot')
    return {'planDeleted':True,'actualSnapshotUnchanged':True,'actualRevision':after[0][0]}


class FaultMatrix:
    """Faults target only newly created owned tables/accounts; no product test hooks."""
    def __init__(self, runtime):
        self.r = runtime
        self.a = runtime.api
        self.operations = {}
        self.evidence = {}

    def prepare(self, user, path):
        a = self.a
        suite = Journeys(self.r); suite.user = user
        suite.day = date.today() - timedelta(days=20)
        suite.target = suite.day + timedelta(days=1)
        suite.generate_keep_replace()
        w = suite.current()['workspace']
        source = w['draft']['dishes'][0]['id']
        if path == 'calendar':
            url = '/meal-workspaces/' + w['id'] + '/confirm'
            body = {'requestId':str(uuid.uuid4()), 'expectedWorkspaceRevision':w['revision'],
                'planVersion':w['draft']['planVersion'], 'expectedPlanRevision':0,
                'targetDate':str(suite.target), 'targetMealType':'lunch'}
            table, method = 'recipe_records', 'POST'
        elif path == 'shopping':
            preview = a.http('/shopping-list/preview', {'dishIds':[source], 'targetPeople':2}, user)
            listing = a.http('/shopping-list', user=user)
            groups = [{'selectionKey':str(uuid.uuid4()), 'dishId':g['dishId'], 'items':g['items'],
                'sourceDate':str(suite.target), 'sourceMealType':'lunch', 'targetPeople':2} for g in preview['dishes']]
            require(groups and groups[0]['items'], 'Shopping fault fixture has no ingredient')
            url, table, method = '/shopping-list/items:batch-add', 'shopping_item', 'POST'
            body = {'requestId':str(uuid.uuid4()), 'expectedListVersion':listing['version'], 'dishes':groups, 'targetPeople':2}
        elif path == 'actual':
            url, table, method = '/meal-consumptions/' + str(suite.target) + '/lunch', 'meal_consumption', 'PUT'
            body = {'requestId':str(uuid.uuid4()), 'expectedRevision':0, 'expectedPlanRevision':0,
                'status':'eaten', 'usePlan':False, 'dishes':[{'name':'隔离故障实吃面条', 'type':'staple'}]}
        else:
            dish = a.http('/dishes/' + str(source), user=user)
            url, table, method = '/dishes/' + str(source) + '/copy-edited', 'food', 'POST'
            body = {'requestId':str(uuid.uuid4()), 'expectedVersion':dish['contentVersion'],
                'name':'隔离故障复制', 'type':dish['type'], 'cl':dish.get('cl') or '青菜少许',
                'step':dish.get('step') or '洗净后煮熟'}
        op = {'user':user, 'url':url, 'body':body, 'method':method, 'table':table,
              'source':source, 'day':str(suite.target), 'suite':suite,
              'dishIds':[d['id'] for d in w['draft']['dishes']]}
        op['receiptTable'] = {'calendar':'workspace_request_log','shopping':'shopping_request_log',
                              'actual':'meal_mutation_log','copy':'meal_mutation_log'}[path]
        op['expectedDelta'] = {'calendar':{'recipe_records':1},'actual':{'meal_consumption':1},
            'copy':{'copies':1},'shopping':{'shopping_item':sum(len(g['items']) for g in body.get('dishes',[]) if 'items' in g)}}[path]
        op['expectedDelta']['originalReceipt'] = 1
        self.operations[path] = op
        return op

    def snapshot(self, op):
        a, user = self.a, op['user']
        counts = a.counts(user)
        counts['copies'] = a.sql('SELECT COUNT(*) FROM food WHERE user_id=%s', (user,))[0][0]
        counts['originalReceipt'] = a.sql('SELECT COUNT(*) FROM '+op['receiptTable']+' WHERE user_id=%s AND request_id=%s',(user,op['body']['requestId']))[0][0]
        return counts

    def identity(self, path):
        op = self.operations[path]; a = self.a; user = op['user']
        if path == 'calendar':
            rows = a.sql('SELECT RECORD_DATE,MEAL_TYPE,DISH_IDS FROM recipe_records WHERE USER_ID=%s AND is_deleted=0',(user,))
            require(len(rows)==1 and str(rows[0][0])==op['day'] and rows[0][1]=='lunch' and json.loads(rows[0][2])==op['dishIds'],'Calendar target/dish identity changed')
        elif path == 'actual':
            rows = a.sql('SELECT meal_date,meal_type,status,actual_dishes_json FROM meal_consumption WHERE user_id=%s',(user,))
            require(len(rows)==1 and str(rows[0][0])==op['day'] and rows[0][1:3]==('lunch','eaten') and json.loads(rows[0][3])[0]['name']==op['body']['dishes'][0]['name'],'Actual target/snapshot identity changed')
        elif path == 'shopping':
            rows = a.sql('SELECT d.dish_id,d.source_date,d.source_meal_type,i.source_line_no,i.normalized_variant,i.source_quantity_text FROM shopping_dish d JOIN shopping_list l ON l.id=d.shopping_list_id JOIN shopping_item i ON i.shopping_dish_id=d.id WHERE l.user_id=%s',(user,))
            actual = sorted((r[0],str(r[1]),r[2],r[3],r[4] or '',r[5] or '') for r in rows)
            expected = sorted((g['dishId'],g['sourceDate'],g['sourceMealType'],i['sourceLineNo'],i.get('normalizedVariant') or '',i.get('sourceQuantityText') or '') for g in op['body']['dishes'] for i in g['items'])
            require(actual==expected,'Shopping changed source meal, line, variant or original quantity')
        else:
            rows = a.sql('SELECT ID,NAME,TYPE FROM food WHERE user_id=%s',(user,))
            require(rows==((op['response']['id'],op['body']['name'],op['body']['type']),),'Copy identity/content differs from original receipt')
        return hashlib.sha256(json.dumps(rows,ensure_ascii=False,default=str).encode()).hexdigest()

    def call(self, op, body=None, allowed=(200, 201, 202, 204)):
        return self.a.http(op['url'], body or op['body'], op['user'], op['method'], allowed=allowed)

    def before_commit(self, path):
        op = self.operations[path]; before = self.snapshot(op)
        trigger = 'e17_reject_' + path
        # SIGNAL inside MySQL forces the actual Spring transaction to roll back.
        self.a.sql('CREATE TRIGGER `' + trigger + '` BEFORE INSERT ON `' + op['table'] +
                   "` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='owned E17 before commit'")
        try: self.call(op, allowed=(500,))
        finally: self.a.sql('DROP TRIGGER `' + trigger + '`')
        require(self.snapshot(op) == before, 'Failed transaction leaked a persistent object')
        if path == 'calendar':
            require(op['suite'].current()['workspace']['revision'] == op['body']['expectedWorkspaceRevision'], 'Failed save advanced workspace')
        op['before'] = before
        return {'requestId':op['body']['requestId'], 'rollbackCounts':before, 'injection':'MySQL BEFORE INSERT SIGNAL; actual Spring transaction rollback'}

    def lost_response(self, path):
        op = self.operations[path]
        # Drop the response at a local HTTP relay after upstream commit. The client
        # sees a real disconnected socket, without a server-side testing endpoint.
        import http.server
        import threading
        import urllib.request
        from assistant_v4_acceptance import bearer
        committed = []
        class Relay(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers['Content-Length']))
                request = urllib.request.Request(self.server.target, data=body,
                    headers={'Content-Type':'application/json','Authorization':self.headers['Authorization']}, method=self.server.method)
                with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=40) as response:
                    response.read(); committed.append(response.status)
                self.close_connection = True
            def log_message(self, *args): pass
        server = http.server.HTTPServer(('127.0.0.1', 0), Relay)
        server.timeout = 45
        server.target = self.r.state['api'] + op['url']; server.method = op['method']
        thread = threading.Thread(target=server.handle_request); thread.start()
        disconnected = False
        try:
            request = urllib.request.Request('http://127.0.0.1:' + str(server.server_port),
                data=json.dumps(op['body']).encode(), headers={'Content-Type':'application/json',
                'Authorization':'Bearer ' + bearer(self.r.state, op['user'])})
            try:
                with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=45) as response: response.read()
            except (OSError, __import__('http.client').client.RemoteDisconnected): disconnected = True
        finally:
            thread.join(timeout=45); server.server_close()
        require(disconnected and committed == [200], 'Relay did not lose exactly one committed response')
        after = self.snapshot(op)
        assert_delta(op['before'],after,op['expectedDelta'])
        recovered = self.call(op)
        require(self.snapshot(op) == after, 'Original request replay duplicated the write')
        op['response'] = recovered; op['after'] = after
        op['identitySha256'] = self.identity(path)
        return {'requestId':op['body']['requestId'], 'clientDisconnected':True, 'upstreamCommitStatus':200,
                'recoveredOriginalRequest':True, 'counts':after, 'persistedIdentitySha256':op['identitySha256']}

    def replay(self, path):
        op = self.operations[path]
        require(self.call(op) == op['response'], 'Original response changed on replay')
        require(self.snapshot(op) == op['after'], 'Replay changed persistent counts')
        require(self.identity(path)==op['identitySha256'],'Replay changed original persisted source/content')
        return {'requestId':op['body']['requestId'], 'originalResponseMatched':True, 'counts':op['after'],'persistedIdentitySha256':op['identitySha256']}

    def conflict(self, path):
        op = self.operations[path]; body = dict(op['body'], requestId=str(uuid.uuid4()))
        if path == 'copy': body['expectedVersion'] = 'stale-content-version'
        self.call(op, body, allowed=(409,))
        require(self.snapshot(op) == op['after'], 'Version conflict changed persistent objects')
        require(self.identity(path)==op['identitySha256'],'Conflict changed original persisted source/content')
        return {'originalRequestId':op['body']['requestId'], 'conflictStatus':409, 'countsUnchanged':True}


def run(config, cases_path, out, stage, config_hash=None, node='node', **database_options):
    # Validation precedes output creation and every process/write.
    validate_config(config); cases = load_cases(cases_path); root = new_output(out)
    if stage not in ('database', 'journey'): raise ValueError('Unknown experience stage')
    # Reuse the full read-only runtime boundary for both stages, not only shape
    # validation. The owned context repeats it immediately before launch.
    preflight(config,root)
    fp = fingerprints(config, config_hash or hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest())
    fp.update(casesSha256=digest(cases_path),runnerSha256=digest(__file__),
        browserScenarioSha256=digest(ROOT/'web/e2e/experience-continuity.spec.ts'),
        claimMysqlTestSha256=digest(ROOT/'backend/src/isolated-test/java/com/eatwhat/service/WorkspaceTaskCancellationMysqlIT.java'))
    root.mkdir(parents=True)
    report = {'stage':stage, 'sourceFingerprint':fp, 'realProviderRequests':0, 'productionTouched':False,
              'nativeDeviceStatus':'not-run', 'cases':[], 'faults':[], 'limits':['No native WeChat/device proof; provider is a local substitute']}
    if stage == 'database':
        legacy = run_database(config, root/'maturity-database', **database_options)
        report['database'] = legacy
        for dataset in legacy['datasets']:
            for case in dataset['cases']:
                contract = {'id':str(dataset['rows'])+'-'+case['id'],'steps':['Existing owned maturity database journey'],
                    'assertions':['Original service assertions retained'],'limits':[]}
                report['cases'].append(result(contract,'passed' if case['passed'] else 'not-run' if case.get('notRun') else 'failed',[case],fp,legacy['limits']))
        report['status'] = 'passed' if legacy['passed'] == legacy['total'] else 'failed'
        write_report(root, report); return report
    node = shutil.which(node) or node
    backend = {}; matrix_results = {}
    with owned_runtime(config, root/'service') as runtime:
        report['environment'] = {'api':'http://127.0.0.1:18780/api','dbHost':'127.0.0.1',
            'dbPort':runtime.state['dbPort'], 'database':runtime.state['database'],
            'accounts':'generated synthetic only', 'ownedManifestSha256':digest(runtime.data/'runtime.json'),
            'dataset':runtime.dataset, 'ownership':'created in this invocation; Popen handles only'}
        report['environment'].update(runtimeDirectory='service',ownedManifest='service/private/runtime.json',dbAccount='root on new private mysqld only')
        # This API intentionally requires its original Popen handle to be alive;
        # allocate owned users before the restart scenarios terminate that handle.
        fault_users = runtime.create_benchmark_users(4)
        suite = Journeys(runtime)
        for name in ('login_catalog','generate_keep_replace','save_target_replay','procurement_expense','actual_correct','copy_recovery','assistant_personal','original_request'):
            try: backend[name] = {'status':'passed','detail':getattr(suite,name)()}
            except Exception as error: backend[name] = {'status':'failed','failureType':type(error).__name__,'failure':str(error)[:500]}
        for name, action in [('partial_completion',partial_completion),('deleted_plan_actual',deleted_plan_actual)]:
            try: backend[name] = {'status':'passed','detail':action(runtime,suite)}
            except Exception as error: backend[name] = {'status':'failed','failureType':type(error).__name__,'failure':str(error)[:500]}
        matrix = FaultMatrix(runtime)
        report['backendEvidence'] = backend; write_report(root,report)
        for user, path in zip(fault_users, PATHS):
            try:
                matrix.prepare(user,path)
                for fault, action in [('precommit-failure',matrix.before_commit),('lost-response',matrix.lost_response),('duplicate-confirmation',matrix.replay),('version-conflict',matrix.conflict)]:
                    try: matrix_results[(path,fault)] = ('passed',action(path))
                    except Exception as error: matrix_results[(path,fault)] = ('failed',{'failureType':type(error).__name__,'failure':str(error)[:500]})
            except Exception as error:
                for fault in FAULTS: matrix_results[(path,fault)] = ('blocked',{'failureType':type(error).__name__,'failure':'Fault fixture unavailable: '+str(error)[:400]})
        runtime.restart()
        for path in PATHS:
            if (path,'restart') in matrix_results: continue
            try: matrix_results[(path,'restart')] = ('passed',matrix.replay(path))
            except Exception as error: matrix_results[(path,'restart')] = ('failed',{'failureType':type(error).__name__,'failure':str(error)[:500]})
        report['environment']['ownedManifestSha256'] = digest(runtime.data/'runtime.json')
        report['mockHttpCalls'] = len(runtime.model.calls)
        # Partial completion remains grounded in real service receipts; VM tests
        # separately exercise return/handoff and presentation, with no conflation.
        report['backendEvidence'] = backend
        for case in cases['faults']:
            status, evidence = matrix_results[(case['path'],case['fault'])]
            report['faults'].append(result(case,status,[evidence],fp,['Synthetic accounts on real MySQL; no production/private history']))
        write_report(root,report)
    for case in cases['journeys']:
        evidence = []; status = 'passed'; limits = ['Page lifecycle evidence uses isolated platform/HTTP doubles; native gestures not verified']
        for name in case.get('serviceChecks', []):
            item = backend[name]; evidence.append({'check':name,**item})
            if item['status'] != 'passed': status = 'failed'
        try:
            page = page_regression(case,root,node)
            if page:
                evidence.append(page)
                if not page['passed']: status = 'failed'
            if case['id'] == 'J11':
                browser = browser_restart(root,node); evidence.append(browser)
                if browser['status'] != 'passed': status = browser['status']
                limits.append('Chromium desktop only; Firefox/WebKit/native not rerun here; isolated public catalog')
        except (OSError, subprocess.TimeoutExpired) as error:
            status = 'blocked'; limits.append(type(error).__name__ + ': required local verifier unavailable')
        report['cases'].append(result(case,status,evidence,fp,limits)); write_report(root,report)
    report['status'] = 'passed' if all(c['status'] == 'passed' for c in report['cases']+report['faults']) else 'failed'
    write_report(root,report); return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True); parser.add_argument('--cases', required=True)
    parser.add_argument('--out', required=True); parser.add_argument('--stage', choices=['database','journey'], required=True)
    parser.add_argument('--node', default='node'); parser.add_argument('--maven', default='mvn')
    parser.add_argument('--maven-repository'); parser.add_argument('--rehearsal-backup'); parser.add_argument('--rehearsal-receipt')
    args = parser.parse_args()
    if bool(args.rehearsal_backup) != bool(args.rehearsal_receipt): raise ValueError('Backup and receipt required together')
    config = json.loads(Path(args.config).read_text(encoding='utf-8'))
    report = run(config,args.cases,args.out,args.stage,digest(args.config),args.node,
        backup=args.rehearsal_backup,backup_receipt=args.rehearsal_receipt,maven=args.maven,repository=args.maven_repository)
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__': raise SystemExit(main())
