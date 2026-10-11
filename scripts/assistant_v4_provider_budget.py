"""Opt-in instrumentation for the coordinator's approved live HTTP attempts.

No credentials are read here. Install around the real provider's httpx.post only
after isolated mock acceptance passes. Reservation is atomic and happens before
HTTP; failures and timeouts are never refunded. Only numeric usage/timing is kept.
"""
import json
import os
from pathlib import Path
import time
import uuid

class BudgetExhausted(RuntimeError): pass

class ProviderBudget:
    def __init__(self,path,authorization_date='2026-10-11'):
        self.path=Path(path).resolve();self.authorization_date=authorization_date
    def validate(self):
        ledger=json.loads(self.path.read_text(encoding='utf-8'))
        if (ledger.get('authorizationDate')!=self.authorization_date or ledger.get('limit')!=20
            or ledger.get('scope')!='new V4 assistant synthetic local integration tests'
            or ledger.get('providerRequestsCountedPerHttpAttempt') is not True
            or type(ledger.get('used')) is not int or not 0<=ledger['used']<=20):
            raise BudgetExhausted('Explicit approved live budget unavailable or invalid')
        return ledger
    def reserve(self):
        lock=self.path.with_suffix(self.path.suffix+'.lock')
        try: fd=os.open(str(lock),os.O_CREAT|os.O_EXCL|os.O_WRONLY)
        except FileExistsError: raise BudgetExhausted('Budget ledger locked; no HTTP attempt sent') from None
        try:
            os.close(fd);ledger=self.validate()
            if ledger['used']>=20:
                raise BudgetExhausted('Explicit approved live budget unavailable or exhausted')
            ledger['used']+=1
            ledger.setdefault('attempts',[]).append({'ordinal':ledger['used'],'reservedAt':time.time(),'status':'reserved'})
            temporary=self.path.with_name(self.path.name+'.'+str(uuid.uuid4())+'.tmp')
            with temporary.open('x',encoding='utf-8') as output:
                json.dump(ledger,output,ensure_ascii=False,indent=2);output.flush();os.fsync(output.fileno())
            os.replace(temporary,self.path)
            return ledger['used']
        finally: lock.unlink()
    def wrap(self,post,metrics):
        def counted(*args,**kwargs):
            ordinal=self.reserve();start=time.monotonic();metric={'ordinal':ordinal,'status':'failed'}
            try:
                response=post(*args,**kwargs);metric['httpStatus']=response.status_code
                metric['status']='responded'
                try:
                    usage=response.json().get('usage',{})
                    metric['usage']={name:value for name,value in usage.items()
                                     if name in ('prompt_tokens','completion_tokens','total_tokens') and isinstance(value,int) and value>=0}
                except Exception: pass
                return response
            finally:
                metric['latencyMs']=round((time.monotonic()-start)*1000,2);metrics.append(metric)
        return counted
