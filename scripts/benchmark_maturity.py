"""Bounded exclusive-loopback benchmark; the model is always a local substitute."""
import argparse
import concurrent.futures
from datetime import date,timedelta,datetime,timezone
import json
from pathlib import Path
import re
import statistics
import threading
import time
import uuid
from maturity_runtime import owned_runtime,validate_config,digest


class BenchmarkHttpError(RuntimeError):
    def __init__(self,status):self.status=status;super().__init__('Owned benchmark HTTP failure')


class PersistentAPI:
    """One keep-alive client per load thread, never one TCP socket per poll."""
    def __init__(self,state):
        if state['api']!='http://127.0.0.1:18780/api':raise ValueError('Only owned loopback API allowed')
        self.state=state;self.local=threading.local();self.clients=[];self.lock=threading.Lock()
    def __call__(self,path,body=None,user=910001,timeout=None):
        if not path.startswith('/') or path.startswith('//') or '://' in path:raise ValueError('Relative owned API path required')
        import httpx
        from assistant_v4_acceptance import bearer
        if not hasattr(self.local,'client'):
            self.local.client=httpx.Client(trust_env=False,follow_redirects=False,timeout=40,limits=httpx.Limits(max_connections=1,max_keepalive_connections=1,keepalive_expiry=30))
            with self.lock:self.clients.append(self.local.client)
        budget=timeout if timeout is not None else 2 if path.startswith('/actuator/metrics/') else 40
        if not 0<budget<=40:raise TimeoutError('Owned request deadline exhausted')
        r=self.local.client.request('POST' if body is not None else 'GET',self.state['api']+path,json=body if body is not None else None,headers={'Authorization':'Bearer '+bearer(self.state,user)},timeout=budget)
        if r.status_code not in (200,201,202,204):raise BenchmarkHttpError(r.status_code)
        return r.json() if r.content else None
    def close(self):
        for client in self.clients:client.close()


def summary(values):
    ordered=sorted(values)
    def percentile(q):return round(ordered[min(len(ordered)-1,max(0,int((len(ordered)-1)*q)))],2) if ordered else None
    return {'count':len(ordered),'p50Ms':percentile(.5),'p95Ms':percentile(.95),'p99Ms':percentile(.99),'maxMs':round(max(ordered),2) if ordered else None}


def elapsed_ms(start):
    # Windows monotonic() may use the 15.625ms tick clock. QPC retains useful
    # sub-millisecond latency instead of quantizing fast local operations to 0.
    return round((time.perf_counter()-start)*1000,2)


def sustained_seconds(scenarios):
    # A requested duration is not evidence that a failed worker actually ran.
    # Do not credit baseline time or shutdown/drain beyond the scheduled offer.
    return round(sum(min(max(0,r['elapsedSeconds']),r['requestedSeconds'])
                     for r in scenarios if r['variant']=='candidate'
                     and r.get('allWorkersCompletedOffer',True)
                     and not r.get('workersStoppedAfterFailedRecovery')
                     and not r.get('residualWorkers',0)),2)


def prepare_population(runtime,concurrency,user_mode,http):
    if not 1<=concurrency<=25:raise ValueError('Concurrency must be 1..25')
    if user_mode=='per-worker':
        accounts=runtime.create_benchmark_users(concurrency)
        if len(accounts)!=concurrency or len(set(accounts))!=concurrency:raise ValueError('Independent population differs')
    elif user_mode=='two-shared':accounts=[910001,910002]
    else:raise ValueError('Unknown benchmark user mode')
    for user in accounts:
        result=http('/users/info',user=user)
        if not result or result.get('user',{}).get('id')!=user:raise ValueError('Account authorization was not verified')
    return [accounts[index%len(accounts)] for index in range(concurrency)]


def stages(http):
    result={}
    for stage in ('candidate_scan','candidate_details','assistant_queue','task_execution'):
        try:result[stage]=http('/actuator/metrics/eatwhat.experience.duration?tag=stage:'+stage)
        except BenchmarkHttpError as error:
            if error.status!=404:raise
            result[stage]=None
    return result


def bench(runtime,concurrency,seconds,user_mode='two-shared'):
    http=PersistentAPI(runtime.state);records=[];gauges=[];lock=threading.Lock();stopped=threading.Event();workers_stopped=[];completed=[]
    setup_start=time.perf_counter()
    try:
        users=prepare_population(runtime,concurrency,user_mode,http)
        workspaces=[]
        for index,user in enumerate(users):
            day=date(2031,1,1)+timedelta(days=index)
            w=http('/meal-workspaces',{'requestId':str(uuid.uuid4()),'expectedWorkspaceRevision':0,
                'context':{'date':str(day),'mealType':'dinner','people':2,'compositionMode':'auto','requirements':'','ownedIngredients':[]}},user)
            workspaces.append((day,w))
        before=stages(http)
    except BaseException:
        http.close();raise
    setup_ms=elapsed_ms(setup_start);started_at=datetime.now(timezone.utc).isoformat();started=time.perf_counter();end=time.monotonic()+seconds
    def observe():
        names=['jvm.memory.used','jvm.memory.used?tag=area:heap','jvm.threads.live','jvm.gc.pause','hikaricp.connections.active','hikaricp.connections.pending']
        next_progress=time.monotonic()+60
        while not stopped.is_set():
            sample={'at':round(time.monotonic(),2)}
            for name in names:
                try:sample[name]=http('/actuator/metrics/'+name).get('measurements')
                except Exception:sample[name]=None
            # Separate connection per thread; never share a PyMySQL connection.
            import pymysql
            try:
                with pymysql.connect(host='127.0.0.1',port=runtime.state['dbPort'],user='root',password=runtime.state['password'],database=runtime.state['database'],connect_timeout=2,read_timeout=2,write_timeout=2) as db:
                    with db.cursor() as c:
                        c.execute("SHOW STATUS LIKE 'Threads_connected'");sample['mysqlConnections']=int(c.fetchone()[1])
                        c.execute("SHOW GLOBAL STATUS WHERE Variable_name IN ('Questions','Innodb_rows_read','Threads_running','Slow_queries')");sample['sqlCounters']={k:int(v) for k,v in c.fetchall()}
                        c.execute("SELECT status,COUNT(*) FROM workspace_task GROUP BY status");sample['taskQueue']=dict(c.fetchall())
            except Exception:sample['databaseObservationUnavailable']=True
            gauges.append(sample)
            if time.monotonic()>=next_progress:
                print(json.dumps({'progressSeconds':round(time.perf_counter()-started,1),'rows':runtime.dataset['rows'],'concurrency':concurrency,'userMode':user_mode,'completedOperations':len(records),'stoppedWorkers':len(workers_stopped)}),flush=True)
                next_progress=time.monotonic()+60
            stopped.wait(2)
    observer=threading.Thread(target=observe,daemon=True);observer.start()
    def worker(index):
        user=users[index];day,w=workspaces[index]
        iteration=0
        while time.monotonic()<end:
            mode=('list','complexList','meal')[iteration%3];iteration+=1;start=time.perf_counter();error=None;status=None;recovered=None;request_id=str(uuid.uuid4())
            try:
                if mode=='list':
                    result=http('/dishes?page=1&pageSize=20',user=user)
                    if len(result['list'])!=20 or result['total']!=runtime.dataset['rows']:raise AssertionError('Catalog count/page drift')
                elif mode=='complexList':
                    result=http('/dishes?page=1&pageSize=20&excludedIngredients=%E8%8A%B1%E7%94%9F',user=user)
                    if any('花生' in ((d.get('cl') or '')+(d.get('ingredientsAmounts') or '')) for d in result['list']):raise AssertionError('Hard exclusion drift')
                else:
                    result=http('/meal-workspaces/'+w['id']+'/commands',{'requestId':request_id,'command':'generate' if not w['draft']['dishes'] else 'regenerate',
                        'expectedWorkspaceRevision':w['revision'],'planVersion':w['draft']['planVersion']},user)
                    until=time.monotonic()+45
                    while True:
                        w=http(f'/meal-workspaces/current?date={day}&mealType=dinner',user=user,timeout=min(40,until-time.monotonic()))['workspace']
                        if w['status']!='generating':break
                        if time.monotonic()>until:raise TimeoutError('Rule task deadline')
                        time.sleep(.05)
                    if w['status']!='draft' or not w['draft']['dishes']:raise AssertionError('Rule generation failed')
            except Exception as e:
                error=type(e).__name__;status=getattr(e,'status',None)
            elapsed=elapsed_ms(start)
            if error and mode=='meal':
                # No write retry and no endless stale-version spin. Read the
                # original receipt/current draft before the next independent job.
                try:
                    http('/meal-workspaces/'+w['id']+'/requests/'+request_id,user=user)
                    until=time.monotonic()+45
                    while True:
                        w=http(f'/meal-workspaces/current?date={day}&mealType=dinner',user=user,timeout=min(40,until-time.monotonic()))['workspace']
                        if w['status']!='generating':break
                        if time.monotonic()>until:raise TimeoutError('Recovery deadline')
                        time.sleep(.05)
                    recovered=True
                except Exception:recovered=False
            with lock:records.append({'kind':mode,'ms':elapsed,'error':error,'httpStatus':status,'recoveredBeforeNextJob':recovered})
            if recovered is False:
                with lock:workers_stopped.append(index)
                return
            # Explicit bounded offer, no unlimited request queue or tight spin.
            time.sleep(.05)
        with lock:completed.append(index)
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency,thread_name_prefix='owned-benchmark') as pool:list(pool.map(worker,range(concurrency)))
        offered_elapsed=round(time.perf_counter()-started,2)
        after=stages(http)
        with runtime.db.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM workspace_task WHERE status IN ('queued','running')")
            remaining_tasks=int(cursor.fetchone()[0])
    finally:stopped.set();observer.join(timeout=20);http.close()
    groups={kind:dict(summary([r['ms'] for r in records if r['kind']==kind and not r['error']]),totalCount=sum(r['kind']==kind for r in records),errors=sum(bool(r['error']) for r in records if r['kind']==kind)) for kind in ('list','complexList','meal')}
    return {'concurrency':concurrency,'requestedSeconds':seconds,'elapsedSeconds':offered_elapsed,'requests':len(records),'errors':sum(bool(r['error']) for r in records),'groups':groups,'samples':records,'resourceSamples':gauges,
        'startedAt':started_at,'finishedAt':datetime.now(timezone.utc).isoformat(),
        'setupMs':setup_ms,'stageBefore':before,'stageAfter':after,'userMode':user_mode,'workerUserIds':users,'remainingActiveTasks':remaining_tasks,
        'allWorkersCompletedOffer':len(completed)==concurrency,'completedOfferWorkers':completed,
        'residualWorkers':sum(t.is_alive() for t in pool._threads)+int(observer.is_alive()),
        'healthUnderFailure':'not part of steady-state load; separate lifecycle/integration checks','workerUsers':concurrency if user_mode=='per-worker' else 2,'activeWorkerUsers':len(set(users)),'offerPacingMs':50,'latencyPopulation':'successful complete operations; failures counted separately','latencyClock':dict(implementation=time.get_clock_info('perf_counter').implementation,resolutionSeconds=time.get_clock_info('perf_counter').resolution),'workersStoppedAfterFailedRecovery':workers_stopped,'transport':'per-thread keep-alive, no proxy, no redirects'}


def cancellation_probe(runtime,user_mode):
    """Separate from latency load: cancel A by its persisted task, then finish B."""
    http=PersistentAPI(runtime.state);started=time.perf_counter()
    try:
        users=prepare_population(runtime,2,user_mode,http);workspaces=[]
        for index,user in enumerate(users):
            day=str(date(2041,1,1)+timedelta(days=index))
            w=http('/meal-workspaces',{'requestId':str(uuid.uuid4()),'expectedWorkspaceRevision':0,
                'context':{'date':day,'mealType':'dinner','people':2,'compositionMode':'auto','requirements':'','ownedIngredients':[]}},user)
            w=http('/meal-workspaces/'+w['id']+'/commands',{'requestId':str(uuid.uuid4()),'expectedWorkspaceRevision':w['revision'],'planVersion':w['draft']['planVersion'],'command':'generate'},user)
            workspaces.append((day,w))
        day,a=workspaces[0];cancelled_task=a['taskId'];b_task=workspaces[1][1]['taskId']
        raced_completion=False
        try:
            a=http('/meal-workspaces/'+a['id']+'/commands',{'requestId':str(uuid.uuid4()),'expectedWorkspaceRevision':a['revision'],'planVersion':a['draft']['planVersion'],'command':'cancel'},users[0])
        except BenchmarkHttpError as error:
            if error.status!=409:raise
            raced_completion=True
        until=time.monotonic()+45
        while True:
            a=http('/meal-workspaces/current?date='+day+'&mealType=dinner',user=users[0])['workspace']
            b=http('/meal-workspaces/current?date='+workspaces[1][0]+'&mealType=dinner',user=users[1])['workspace']
            with runtime.db.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) FROM workspace_task WHERE status IN ('queued','running')")
                remaining=int(cursor.fetchone()[0])
            if remaining==0 and b['status']!='generating':break
            if time.monotonic()>until:raise TimeoutError('Cancellation drain deadline')
            time.sleep(.05)
        with runtime.db.cursor() as cursor:
            cursor.execute('SELECT status FROM workspace_task WHERE id=%s AND user_id=%s',(b_task,users[1]))
            other_status=cursor.fetchone()
        if a['status']=='generating' or a.get('taskId') is not None or b['status']!='draft' or not b['draft']['dishes'] or other_status!=('draft',):
            raise AssertionError('Cancellation scope or other-account completion drift')
        return dict(passed=True,cancelledTaskId=cancelled_task,otherTaskId=b_task,racedCompletion=raced_completion,remainingActiveTasks=remaining,elapsedMs=elapsed_ms(started),
            limitation='Cancel may race completed work; task-scoped queued/running guards separately regression-tested')
    finally:http.close()


def parser():
    p=argparse.ArgumentParser()
    p.add_argument('--config',required=True);p.add_argument('--out',required=True)
    p.add_argument('--seconds-per-scenario',type=int,default=300)
    p.add_argument('--user-mode',choices=['two-shared','per-worker'],default='two-shared')
    p.add_argument('--comparison-duration',choices=['equal','legacy-20s'],default='equal')
    return p


def scenario_seconds(variant,seconds,comparison_duration):
    if comparison_duration not in ('equal','legacy-20s'):raise ValueError('Unknown duration mode')
    return 20 if variant=='baseline' and comparison_duration=='legacy-20s' else seconds


def main():
    args=parser().parse_args()
    if not 10<=args.seconds_per_scenario<=600:raise ValueError('Scenario duration must be 10..600 seconds')
    config=validate_config(json.loads(Path(args.config).read_text(encoding='utf-8')))
    out=Path(args.out).absolute()
    from maturity_runtime import new_output
    new_output(out);out.mkdir(parents=True)
    report={'sourceSha':config['sourceSha'],'datasetHash':config['datasetHash'],'jarSha256':config['jarSha256'],'providerMode':'mock','productionTouched':False,'scenarios':[],
            'configSha256':digest(args.config),'userMode':args.user_mode,'comparisonDuration':args.comparison_duration,
            'comparableImprovementEvidence':bool(config.get('baselineJar')) and args.comparison_duration=='equal',
            'comparisonLabel':'equal duration' if args.comparison_duration=='equal' else 'historical diagnostic only; no improvement claim',
            'coldStarts':[],'warmups':[],'cancellationProbes':[],'runtimeCleanup':[],
            'harnessHashes':{name:digest(Path(__file__).parent/name) for name in ('benchmark_maturity.py','maturity_runtime.py','assistant_v4_acceptance.py')}}
    # New instance for each dataset; concurrency stages reuse its buffer pool and
    # record their order explicitly. Cold starts are separate from warm latency.
    variants=['baseline','candidate'] if config.get('baselineJar') else ['candidate']
    def save():
        (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    try:
        for variant in variants:
            for size in (6665,50000):
                cfg=dict(config,rows=size,privateDb='eatwhat_maturity_local_'+uuid.uuid4().hex[:8])
                if variant=='baseline':
                    receipt=json.loads(Path(config['baselineBuildManifest']).read_text(encoding='utf-8'))
                    cfg.update(jar=config['baselineJar'],buildManifest=config['baselineBuildManifest'],jarSha256=receipt['jarSha256'],buildSourceFingerprint=receipt['backendFingerprint'])
                runtime_out=out/(variant+'-rows-'+str(size));cold_start=time.perf_counter()
                with owned_runtime(cfg,runtime_out,baseline=variant=='baseline') as runtime:
                    report['coldStarts'].append(dict(variant=variant,rows=size,startupMs=elapsed_ms(cold_start)))
                    binding=dict(rows=size,variant=variant,migrations=runtime.dataset['migrations'],
                        executableSourceSha=cfg['baselineSha'] if variant=='baseline' else cfg['sourceSha'],
                        jarSha256=cfg['jarSha256'],backendFingerprint=cfg['buildSourceFingerprint'],
                        datasetHash=cfg['datasetHash'],buildReceiptSha256=digest(cfg['buildManifest']),
                        runtimeConfigSha256=digest(runtime.data/'application.json'),
                        fixedRuntimeProfile={'heapMiB':[128,512],'hikariMax':10,'hikariMin':2,'taskThreads':2,'taskQueueCapacity':8,'warmupSeconds':10,'offerPacingMs':50})
                    probe=cancellation_probe(runtime,args.user_mode);probe.update(binding);report['cancellationProbes'].append(probe);save()
                    for concurrency in (1,10,25):
                        # Same warmup and arrival policy for each variant/user model.
                        warmup=bench(runtime,concurrency,10,args.user_mode);warmup.update(binding)
                        report['warmups'].append(warmup);save()
                        result=bench(runtime,concurrency,scenario_seconds(variant,args.seconds_per_scenario,args.comparison_duration),args.user_mode)
                        result.update(binding);report['scenarios'].append(result);save()
                        print(json.dumps({'variant':variant,'rows':size,'concurrency':concurrency,'userMode':args.user_mode,'requests':result['requests'],'errors':result['errors'],'groups':result['groups'],'residualWorkers':result['residualWorkers']},ensure_ascii=False),flush=True)
                report['runtimeCleanup'].append(dict(variant=variant,rows=size,**json.loads((runtime_out/'cleanup.json').read_text(encoding='utf-8'))));save()
    except BaseException as error:
        report['failure']={'type':type(error).__name__,'completedScenarios':len(report['scenarios'])}
        report['comparableImprovementEvidence']=False
        save();raise
    report['sustainedLoadSeconds']=sustained_seconds(report['scenarios'])
    candidate=[r for r in report['scenarios'] if r['variant']=='candidate']
    report['thirtyMinuteGate']=len(candidate)==6 and {(r['rows'],r['concurrency']) for r in candidate}=={(size,c) for size in (6665,50000) for c in (1,10,25)} and report['sustainedLoadSeconds']>=1800
    report['targets']={'listP95Ms':300,'mealP95Ms':1000,'errorRate':.01}
    report['latencyTargetsMet']=bool(candidate) and all(s['allWorkersCompletedOffer'] and not s['residualWorkers'] and not s['workersStoppedAfterFailedRecovery'] and all(s['groups'][kind]['p95Ms'] is not None and s['groups'][kind]['p95Ms']<=300 for kind in ('list','complexList')) and s['groups']['meal']['p95Ms'] is not None and s['groups']['meal']['p95Ms']<=1000 and s['errors']/max(1,s['requests'])<.01 for s in candidate)
    report['resourceCleanupMet']=all(r['residualProcesses']==0 and r['residualPythonServerThreads']==0 for r in report['runtimeCleanup']) and all(not r['residualWorkers'] and not r['remainingActiveTasks'] for r in report['scenarios'])
    (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return 0 if report['thirtyMinuteGate'] and report['latencyTargetsMet'] and report['resourceCleanupMet'] else 2


if __name__=='__main__':raise SystemExit(main())
