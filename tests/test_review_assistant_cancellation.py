"""Only in-memory ASGI and a cancellable provider client; no external traffic."""
import asyncio,json,unittest
from unittest.mock import patch
from assistant_v4_isolation import isolated_service,load_main
from test_assistant_v4_step import body,TOKEN

class ReviewAssistantCancellationTest(unittest.IsolatedAsyncioTestCase):
 async def test_disconnect_cancels_only_its_provider_work_and_releases_capacity(self):
  with isolated_service():
   from assistant_v4_provider import ManagedV4Provider
   main=load_main();entered=asyncio.Event();disconnected=asyncio.Event();cancelled=[];calls=[];second=asyncio.Event()
   class Client:
    async def post(self,*args,**kwargs):
     calls.append(1);entered.set()
     if len(calls)==2:second.set()
     try:await asyncio.Event().wait()
     except asyncio.CancelledError:cancelled.append(1);raise
    async def aclose(self):pass
   async with ManagedV4Provider(client=Client(),capacity=2) as provider:
    main.app.state.v4_provider=provider
    raw=json.dumps(body()).encode();received=False;sent=[]
    async def receive():
     nonlocal received
     if not received:received=True;return {'type':'http.request','body':raw,'more_body':False}
     await disconnected.wait();return {'type':'http.disconnect'}
    async def send(message):sent.append(message)
    scope={'type':'http','asgi':{'version':'3.0'},'http_version':'1.1','scheme':'http','method':'POST','path':'/internal/v4/assistant/step','raw_path':b'/internal/v4/assistant/step','query_string':b'','root_path':'','headers':[(b'content-type',b'application/json'),(b'x-service-token',TOKEN.encode())],'client':('127.0.0.1',1),'server':('isolated',80)}
    with patch.dict('os.environ',{'MEAL_WORKSPACE_SERVICE_TOKEN':TOKEN}):
     task=asyncio.create_task(main.app(scope,receive,send));await asyncio.wait_for(entered.wait(),1);self.assertEqual(1,len(provider.active))
     unrelated=asyncio.create_task(provider.complete_message_async([],[],timeout_seconds=10));await asyncio.wait_for(second.wait(),1);self.assertEqual(2,len(provider.active));disconnected.set()
     done,_=await asyncio.wait({task},timeout=.5)
     try:
      self.assertIn(task,done,'disconnected request must release provider work promptly')
      await task;self.assertEqual(1,len(provider.active));self.assertFalse(unrelated.done());self.assertEqual([1],cancelled);self.assertEqual([1,1],calls)
     finally:
      task.cancel();unrelated.cancel();await asyncio.gather(task,unrelated,return_exceptions=True)
      self.assertEqual(0,len(provider.active))

if __name__=='__main__':unittest.main()
