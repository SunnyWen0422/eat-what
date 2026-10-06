"""Loopback-only development adapter reusing the V4 agent, with a persisted model budget."""
import json
import os
from pathlib import Path
import threading
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
import workspace_agent

if os.getenv('DB_HOST') != '127.0.0.1' or not os.getenv('DB_NAME','').startswith('eatwhat_v4_local_'):
    raise RuntimeError('Local agent requires the isolated local database')

app=FastAPI(title='EatWhat local V4 adapter')
lock=threading.Lock()
budget=Path(os.environ['LOCAL_MODEL_BUDGET_FILE'])

@app.on_event('startup')
def prepare_local_index():
    import rag
    root=budget.parent.resolve()
    if Path(rag.META_PATH).resolve().parent!=root or Path(rag.INGREDIENT_PATH).resolve().parent!=root:
        raise RuntimeError('Local indexes must stay in the private runtime directory')
    rag.build_index()

class BudgetedModel:
    def __init__(self,max_requests=None):
        from model_client import DeepSeekModelClient
        self.client=DeepSeekModelClient(timeout=10)
        self.timeout=10
        self.max_requests=max_requests
        self.requests=0
    def complete(self,*args):
        with lock:
            if self.max_requests is not None and self.requests>=self.max_requests:raise RuntimeError('Local evaluation request cap exhausted')
            value=json.loads(budget.read_text(encoding='utf-8'))
            if value['used']>=value['limit']:raise RuntimeError('Local model budget exhausted')
            self.requests+=1
            value['used']+=1;budget.write_text(json.dumps(value),encoding='utf-8')
        self.client.timeout=self.timeout
        try:
            result=self.client.complete(*args)
        except Exception as error:
            # Transport exceptions use fixed messages; never log vendor bodies or credentials.
            from model_client import ModelUnavailable, ModelProtocolError
            summary={'failureClass':type(error).__name__}
            if isinstance(error,(ModelUnavailable,ModelProtocolError)):summary['failure']=str(error)
            with lock:
                with budget.with_name('model-summary.jsonl').open('a',encoding='utf-8') as stream:stream.write(json.dumps(summary)+'\n')
            raise
        final=result.get('final') or {}
        summary={'responseKeys':list(result),'finalKeys':list(final) if isinstance(final,dict) else [],'date':final.get('date') if isinstance(final,dict) else None,'mealType':final.get('mealType') if isinstance(final,dict) else None,'needsInput':final.get('needsInput') if isinstance(final,dict) else None,'constraintsUnderstood':final.get('constraintsUnderstood') if isinstance(final,dict) else None,'tool':(result.get('tool_call')or{}).get('name')}
        with lock:
            with budget.with_name('model-summary.jsonl').open('a',encoding='utf-8') as stream:stream.write(json.dumps(summary,ensure_ascii=False)+'\n')
        return result

class Task(BaseModel):
    workspace:dict
    userId:int
    maxModelRequests:int | None=None

@app.get('/health')
def health():
    with lock:value=json.loads(budget.read_text(encoding='utf-8'))
    return {'status':'ok','local':True,'modelBudget':value}

@app.post('/internal/v4/meal-task')
def run(task:Task,x_service_token:str=Header(default='')):
    if not workspace_agent.authorized(x_service_token,os.getenv('MEAL_WORKSPACE_SERVICE_TOKEN','')):raise HTTPException(403)
    if task.userId<=0:raise HTTPException(400)
    if task.maxModelRequests is not None and not 1<=task.maxModelRequests<=20:raise HTTPException(400)
    try:
        catalog=Path(__file__).resolve().parents[1]/'backend/src/main/resources/recommendation-metadata.json'
        workspace={**task.workspace,'recommendationOptions':json.loads(catalog.read_text(encoding='utf-8'))['groups']}
        return workspace_agent.run_task(workspace,task.userId,model=BudgetedModel(task.maxModelRequests))
    except Exception as error:
        with lock:
            with budget.with_name('model-summary.jsonl').open('a',encoding='utf-8') as stream:stream.write(json.dumps({'taskFailureClass':type(error).__name__})+'\n')
        return {'needsInput':True,'executionStatus':'failed','failureClass':type(error).__name__,'message':'本地模型未完成理解或预算已用完，请使用明确筛选后重试','dishIds':[]}

# Keep the existing advanced assistant usable in the local project. Only these
# session routes are mounted; the old direct chat/model transports are excluded.
store_path=Path(os.environ['ASSISTANT_STORE_PATH']).resolve()
if store_path.parent!=budget.parent.resolve():
    raise RuntimeError('Assistant history must stay in the private runtime directory')
import main as existing_service
import agent_runtime
agent_runtime.RUNTIME.model_factory=BudgetedModel
for route in existing_service.app.routes:
    if route.path.startswith('/assistant/'):
        app.router.routes.append(route)
