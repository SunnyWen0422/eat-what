"""Bounded exclusive-loopback benchmark; the model is always a local substitute."""
import argparse
import concurrent.futures
from datetime import date,timedelta
import json
from pathlib import Path
import statistics
import threading
import time
import uuid
from maturity_runtime import owned_runtime,validate_config


def summary(values):
    ordered=sorted(values)
    def percentile(q):return round(ordered[min(len(ordered)-1,max(0,int((len(ordered)-1)*q)))],2) if ordered else None
    return {'count':len(ordered),'p50Ms':percentile(.5),'p95Ms':percentile(.95),'p99Ms':percentile(.99),'maxMs':round(max(ordered),2) if ordered else None}


def bench(runtime,concurrency,seconds):
    a=runtime.api;end=time.monotonic()+seconds;records=[];gauges=[];lock=threading.Lock();stopped=threading.Event()
    def observe():
        names=['jvm.memory.used','jvm.threads.live','jvm.gc.pause','hikaricp.connections.active','hikaricp.connections.pending']
        while not stopped.is_set():
            sample={'at':round(time.monotonic(),2)}
            for name in names:
                try:sample[name]=a.http('/actuator/metrics/'+name).get('measurements')
                except Exception:sample[name]=None
            # Separate connection per thread; never share a PyMySQL connection.
            import pymysql
            try:
                with pymysql.connect(host='127.0.0.1',port=runtime.state['dbPort'],user='root',password=runtime.state['password'],database=runtime.state['database'],connect_timeout=2) as db:
                    with db.cursor() as c:
                        c.execute("SHOW STATUS LIKE 'Threads_connected'");sample['mysqlConnections']=int(c.fetchone()[1])
                        c.execute("SELECT status,COUNT(*) FROM workspace_task GROUP BY status");sample['taskQueue']=dict(c.fetchall())
            except Exception:sample['databaseObservationUnavailable']=True
            gauges.append(sample);stopped.wait(2)
    observer=threading.Thread(target=observe,daemon=True);observer.start()
    def worker(index):
        # Every worker has its own workspace; lock contention is still measured
        # on the two fixture users, matching a small-user/high-load boundary.
        user=910001+index%2;day=date(2031,1,1)+timedelta(days=index)
        w=a.http('/meal-workspaces',{'requestId':str(uuid.uuid4()),'expectedWorkspaceRevision':0,
            'context':{'date':str(day),'mealType':'dinner','people':2,'compositionMode':'auto','requirements':'','ownedIngredients':[]}},user)
        iteration=0
        while time.monotonic()<end:
            mode=('list','complexList','meal')[iteration%3];iteration+=1;start=time.monotonic();error=None
            try:
                if mode=='list':
                    result=a.http('/dishes?page=1&pageSize=20',user=user)
                    if len(result['list'])!=20 or result['total']!=runtime.dataset['rows']:raise AssertionError('Catalog count/page drift')
                elif mode=='complexList':
                    result=a.http('/dishes?page=1&pageSize=20&excludedIngredients=%E8%8A%B1%E7%94%9F',user=user)
                    if any('花生' in ((d.get('cl') or '')+(d.get('ingredientsAmounts') or '')) for d in result['list']):raise AssertionError('Hard exclusion drift')
                else:
                    result=a.http('/meal-workspaces/'+w['id']+'/commands',{'requestId':str(uuid.uuid4()),'command':'generate' if not w['draft']['dishes'] else 'regenerate',
                        'expectedWorkspaceRevision':w['revision'],'planVersion':w['draft']['planVersion']},user)
                    until=time.monotonic()+45
                    while True:
                        w=a.http(f'/meal-workspaces/current?date={day}&mealType=dinner',user=user)['workspace']
                        if w['status']!='generating':break
                        if time.monotonic()>until:raise TimeoutError('Rule task deadline')
                        time.sleep(.05)
                    if w['status']!='draft' or not w['draft']['dishes']:raise AssertionError('Rule generation failed')
            except Exception as e:error=type(e).__name__
            with lock:records.append({'kind':mode,'ms':round((time.monotonic()-start)*1000,2),'error':error})
            # Explicit bounded offer, no unlimited request queue or tight spin.
            time.sleep(.05)
    started=time.monotonic()
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:list(pool.map(worker,range(concurrency)))
    finally:stopped.set();observer.join(timeout=20)
    groups={kind:dict(summary([r['ms'] for r in records if r['kind']==kind]),errors=sum(bool(r['error']) for r in records if r['kind']==kind)) for kind in ('list','complexList','meal')}
    return {'concurrency':concurrency,'requestedSeconds':seconds,'elapsedSeconds':round(time.monotonic()-started,2),'requests':len(records),'errors':sum(bool(r['error']) for r in records),'groups':groups,'samples':records,'resourceSamples':gauges,
        'healthUnderFailure':'not part of steady-state load; separate lifecycle/integration checks','workerUsers':2,'offerPacingMs':50}


def main():
    p=argparse.ArgumentParser();p.add_argument('--config',required=True);p.add_argument('--out',required=True);p.add_argument('--seconds-per-scenario',type=int,default=300);args=p.parse_args()
    if not 10<=args.seconds_per_scenario<=600:raise ValueError('Scenario duration must be 10..600 seconds')
    config=validate_config(json.loads(Path(args.config).read_text(encoding='utf-8')))
    out=Path(args.out).absolute()
    from maturity_runtime import new_output
    new_output(out);out.mkdir(parents=True)
    report={'sourceSha':config['sourceSha'],'datasetHash':config['datasetHash'],'jarSha256':config['jarSha256'],'providerMode':'mock','productionTouched':False,'scenarios':[]}
    # New instance for each dataset; concurrency stages reuse its buffer pool and
    # record their order explicitly. Cold starts are separate from warm latency.
    variants=['baseline','candidate'] if config.get('baselineJar') else ['candidate']
    for variant in variants:
        for size in (6665,50000):
            cfg=dict(config,rows=size,privateDb='eatwhat_maturity_local_'+uuid.uuid4().hex[:8])
            if variant=='baseline':
                receipt=json.loads(Path(config['baselineBuildManifest']).read_text(encoding='utf-8'))
                cfg.update(jar=config['baselineJar'],buildManifest=config['baselineBuildManifest'],jarSha256=receipt['jarSha256'],buildSourceFingerprint=receipt['backendFingerprint'])
            with owned_runtime(cfg,out/(variant+'-rows-'+str(size)),baseline=variant=='baseline') as runtime:
                for concurrency in (1,10,25):
                    result=bench(runtime,concurrency,20 if variant=='baseline' else args.seconds_per_scenario);result.update(rows=size,variant=variant);report['scenarios'].append(result)
                    (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
                    print(json.dumps({'variant':variant,'rows':size,'concurrency':concurrency,'requests':result['requests'],'errors':result['errors'],'groups':result['groups']},ensure_ascii=False),flush=True)
    report['sustainedLoadSeconds']=sum(r['requestedSeconds'] for r in report['scenarios'] if r['variant']=='candidate')
    report['thirtyMinuteGate']=report['sustainedLoadSeconds']>=1800
    report['targets']={'listP95Ms':300,'mealP95Ms':1000,'errorRate':.01}
    report['latencyTargetsMet']=all(s['groups']['list']['p95Ms'] is not None and s['groups']['list']['p95Ms']<=300 and s['groups']['meal']['p95Ms'] is not None and s['groups']['meal']['p95Ms']<=1000 and s['errors']/max(1,s['requests'])<.01 for s in report['scenarios'] if s['variant']=='candidate')
    (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return 0 if report['thirtyMinuteGate'] and report['latencyTargetsMet'] else 2


if __name__=='__main__':raise SystemExit(main())
