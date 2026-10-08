"""Fixed corpus evaluation. Dry-run never connects; execution uses the budgeted local adapter."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.request
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
MEALS={'breakfast','lunch','dinner'}

def validate_fixture(case):
 errors=[]
 for field in ('caseId','context','request','expectedTarget','requiredConstraints','expectedWritePolicy','expectedOutcomeClass'):
  if field not in case:errors.append('missing '+field)
 context=case.get('context',{})
 if not isinstance(context,dict) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',str(context.get('date',''))) or context.get('mealType') not in MEALS:errors.append('invalid context')
 if not isinstance(case.get('request'),str) or not case.get('request'):errors.append('invalid request')
 target=case.get('expectedTarget',{})
 if not isinstance(target,dict) or target.get('mealType') not in MEALS or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',str(target.get('date',''))):errors.append('invalid expected target')
 if not isinstance(case.get('requiredConstraints'),dict):errors.append('invalid constraints')
 if case.get('expectedWritePolicy')!='proposal_only':errors.append('execution must not write business state')
 if case.get('expectedOutcomeClass') not in {'proposal','needs_input','different_target'}:errors.append('invalid outcome')
 return errors

def read_cases(path):
 cases=[json.loads(line) for line in Path(path).read_text(encoding='utf-8').splitlines() if line.strip()]
 if len({case.get('caseId') for case in cases})!=len(cases):raise ValueError('Duplicate case IDs')
 for case in cases:
  errors=validate_fixture(case)
  if errors:raise ValueError(str(case.get('caseId'))+': '+', '.join(errors))
 return cases

def validate_execution(manifest,budget,max_requests):
 import importlib.util
 spec=importlib.util.spec_from_file_location('check_test_environment',ROOT/'scripts/check_test_environment.py');guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
 if not guard.validate(manifest)['safe'] or Path(manifest.get('root','')).resolve()!=ROOT:raise ValueError('Unsafe evaluation environment')
 if manifest['api']!='http://127.0.0.1:18780/api':raise ValueError('Unexpected local API')
 if not isinstance(max_requests,int) or isinstance(max_requests,bool) or not 1<=max_requests<=20:raise ValueError('Invalid request cap')
 if budget.get('limit')!=20 or type(budget.get('used')) is not int or not 0<=budget['used']<=20:raise ValueError('Invalid persistent budget')

def check_result(case,result,sourced_ids):
 errors=[]
 if not isinstance(result,dict):return {'passed':False,'errors':['invalid JSON object']}
 if result.get('executionStatus')=='failed' or result.get('failureClass'):return {'passed':False,'errors':['model_execution_failed']}
 if case['expectedOutcomeClass']!='proposal':
  if result.get('needsInput') is not True:errors.append('clarification required')
  if case['expectedOutcomeClass']=='different_target' and result.get('suggestedTarget')!=case['expectedTarget']:errors.append('wrong suggested target')
 else:
  if result.get('needsInput') is not False or result.get('constraintsUnderstood') is not True:errors.append('no understood proposal')
  if {k:result.get(k) for k in ('date','mealType')}!=case['expectedTarget']:errors.append('wrong target')
  ids=result.get('dishIds',[])
  if not ids or any(type(i) is not int or i not in sourced_ids for i in ids):errors.append('foreign or missing dish ID')
  for key,wanted in case['requiredConstraints'].items():
   actual=result.get('totalCookMinutes') if key=='totalCookMinutes' else (result.get('criteria') or {}).get(key)
   if isinstance(wanted,list):
    if not isinstance(actual,list) or not set(wanted)<=set(actual):errors.append('missing constraint '+key)
   elif actual!=wanted:errors.append('missing constraint '+key)
 return {'passed':not errors,'errors':errors}

def evaluate(cases,execute=False,manifest=None,budget=None,max_requests=1,send=None):
 report={'corpusSha256':hashlib.sha256(json.dumps(cases,ensure_ascii=False,sort_keys=True).encode()).hexdigest(),'validated':len(cases),'executed':0,'modelRequests':0,'qualityPassRate':None,'results':[],'evidenceLayer':'stateless Python proposal; no Java/business writes','priceAvailability':'not evaluated'}
 if not execute:
  report['results']=[{'caseId':c['caseId'],'status':'not_executed','reason':'dry_run'} for c in cases];return report
 validate_execution(manifest,budget,max_requests)
 if budget['used']>=20:
  report['results']=[{'caseId':c['caseId'],'status':'not_executed','reason':'persistent_budget_exhausted'} for c in cases];return report
 remaining=min(max_requests,20-budget['used'])
 for case in cases:
  if remaining<=0:
   report['results'].append({'caseId':case['caseId'],'status':'not_executed','reason':'run_budget_exhausted'});continue
  started=time.monotonic()
  try:
   result,used,ids=send(case,remaining)
   # The local adapter enforces this before each model request, including failures.
   if not 0<=used<=remaining:raise ValueError('Adapter exceeded run request cap')
   remaining-=used;report['modelRequests']+=used
   check=check_result(case,result,ids)
   entry={'caseId':case['caseId'],'status':'executed',**check,'latencyMs':round((time.monotonic()-started)*1000),'target':case['expectedTarget']}
  except Exception as error:
   # A transport failure may have consumed the request. Stop, never infer zero usage or retry.
   entry={'caseId':case['caseId'],'status':'executed','passed':False,'errors':[type(error).__name__],'budgetConsumptionUnknown':True};remaining=0
  report['executed']+=1;report['results'].append(entry)
 report['qualityPassRate']=sum(r.get('passed',False) for r in report['results'])/report['executed'] if report['executed'] else None
 return report

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--fixtures',default=str(ROOT/'tests/fixtures/workspace-evaluation.jsonl'));mode=parser.add_mutually_exclusive_group();mode.add_argument('--dry-run',action='store_true');mode.add_argument('--execute',action='store_true');parser.add_argument('--manifest');parser.add_argument('--max-model-requests',type=int,default=1);parser.add_argument('--case-id',action='append');parser.add_argument('--out',required=True);args=parser.parse_args()
 cases=read_cases(args.fixtures)
 if args.case_id:
  cases=[c for c in cases if c['caseId'] in args.case_id]
  if len(cases)!=len(set(args.case_id)):raise ValueError('Unknown case ID')
 manifest=budget=None
 if args.execute:
  if not args.manifest:raise ValueError('Execution requires an isolation manifest')
  manifest=json.loads(Path(args.manifest).read_text(encoding='utf-8'));budget_file=ROOT/'.local-v4/model-budget.json';budget=json.loads(budget_file.read_text(encoding='utf-8'))
  validate_execution(manifest,budget,args.max_model_requests)
 def send(case,allowance):
  before=json.loads(budget_file.read_text(encoding='utf-8'))['used']
  config=(ROOT/'.local-v4/application-local.yml').read_text(encoding='utf-8');token=config.split('service-token: ',1)[1].splitlines()[0]
  payload={'userId':910002,'workspace':{'context':{**case['context'],'requirements':case['request']},'draft':{'lockedDishIds':[]}},'maxModelRequests':allowance}
  req=urllib.request.Request('http://127.0.0.1:18781/internal/v4/meal-task',data=json.dumps(payload,ensure_ascii=False).encode(),headers={'Content-Type':'application/json','x-service-token':token})
  with urllib.request.urlopen(req,timeout=25) as response:result=json.load(response)
  import pymysql
  connection=pymysql.connect(host='127.0.0.1',port=manifest['dbPort'],user='root',password=manifest['password'],database=manifest['database'])
  try:
   with connection.cursor() as cursor:cursor.execute('SELECT id FROM food WHERE IS_PUBLISHED=1');ids={row[0] for row in cursor.fetchall()}
  finally:connection.close()
  after=json.loads(budget_file.read_text(encoding='utf-8'))['used'];return result,after-before,ids
 report=evaluate(cases,args.execute,manifest,budget,args.max_model_requests,send)
 Path(args.out).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k!='results'}))

if __name__=='__main__':main()
