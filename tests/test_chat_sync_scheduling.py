"""Exercise the actual HTTP route without importing production credentials or I/O."""
import asyncio
import sys
import threading
import unittest
import importlib.util
import os
import tempfile
import json
from pathlib import Path
from unittest.mock import patch
from assistant_v4_isolation import isolated_service, load_main


class ChatSyncSchedulingTest(unittest.TestCase):
    def test_busy_rejection_keeps_event_loop_available_and_releases_after_failure(self):
        import httpx
        with asyncio.Runner() as runner, isolated_service():
            main = load_main()
            entered, release = threading.Event(), threading.Event()
            def blocked(*args):
                entered.set()
                if not release.wait(5): raise TimeoutError("fixture release missing")
                raise ValueError("synthetic failure")
            sys.modules["chat_handler"].chat = blocked
            async def check():
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app, raise_app_exceptions=False), base_url="http://isolated.invalid") as client:
                    first = asyncio.create_task(client.post('/chat/sync', json={'message':'first','user_id':'1'}))
                    try:
                        for _ in range(200):
                            if entered.is_set(): break
                            await asyncio.sleep(.005)
                        self.assertTrue(entered.is_set())
                        busy = await client.post('/chat/sync', json={'message':'second','user_id':'2'})
                        self.assertEqual(503,busy.status_code)
                        self.assertEqual('AI_CHAT_BUSY',busy.json()['errorCode'])
                        self.assertEqual('2',busy.headers['retry-after'])
                        self.assertEqual(200,(await client.get('/health')).status_code)
                    finally: release.set()
                    self.assertEqual(500,(await first).status_code)
                    sys.modules['chat_handler'].chat = lambda *args:'recovered'
                    self.assertEqual(200,(await client.post('/chat/sync',json={'message':'retry'})).status_code)
            runner.run(check())

    def test_cancelled_http_wait_does_not_release_busy_lock_before_worker_finishes(self):
        import httpx
        with asyncio.Runner() as runner, isolated_service():
            main = load_main()
            entered, release, finished = threading.Event(), threading.Event(), threading.Event()
            def blocked(*args):
                try:
                    entered.set()
                    if not release.wait(5): raise TimeoutError('fixture release missing')
                    return 'done'
                finally: finished.set()
            sys.modules['chat_handler'].chat = blocked
            async def check():
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app),base_url='http://isolated.invalid') as client:
                    first = asyncio.create_task(client.post('/chat/sync',json={'message':'first'}))
                    try:
                        for _ in range(200):
                            if entered.is_set(): break
                            await asyncio.sleep(.005)
                        self.assertTrue(entered.is_set())
                        first.cancel()
                        try: await first
                        except asyncio.CancelledError: pass
                        self.assertEqual(503,(await client.post('/chat/sync',json={'message':'still busy'})).status_code)
                    finally: release.set()
                    for _ in range(200):
                        if finished.is_set() and not main._chat_sync_lock.locked(): break
                        await asyncio.sleep(.005)
                    self.assertTrue(finished.is_set()); self.assertFalse(main._chat_sync_lock.locked())
                    self.assertEqual(200,(await client.post('/chat/sync',json={'message':'retry'})).status_code)
            runner.run(check())

    def test_history_snapshots_and_parallel_writes_use_only_temporary_storage(self):
        from concurrent.futures import ThreadPoolExecutor
        with tempfile.TemporaryDirectory() as temporary, isolated_service():
            memory = str(Path(temporary)/'history.json')
            with patch.dict(os.environ, {'CHAT_MEMORY_FILE':memory}):
                path = Path(__file__).resolve().parents[1]/'recommend-service/chat_handler.py'
                spec = importlib.util.spec_from_file_location('isolated_legacy_history',path)
                handler = importlib.util.module_from_spec(spec); spec.loader.exec_module(handler)
            def append(user):
                for i in range(12):
                    handler.append_history(user,'user',str(i))
                    handler.append_history(user,'assistant',str(i))
            with ThreadPoolExecutor(max_workers=4) as pool: list(pool.map(append,['a','b','c','d']))
            snapshot = handler.get_history('a'); snapshot[0]['content']='changed outside'
            self.assertNotEqual('changed outside',handler.get_history('a')[0]['content'])
            stored = json.loads(Path(memory).read_text())
            self.assertEqual({'a','b','c','d'},set(stored))
            self.assertTrue(all(len(rows)==20 for rows in stored.values()))
            handler._conversations={}; handler._load_memory()
            self.assertEqual(stored['a'][-10:],handler.get_history('a'))

    def test_sync_provider_runs_off_event_loop_and_keeps_contract(self):
        import httpx
        with asyncio.Runner() as runner, isolated_service():
            main = load_main()
            called_threads = []

            def provider(message, user):
                called_threads.append(threading.get_ident())
                return {"reply": "已找到菜谱", "dishes": [{"id": 9}], "action": {"type": "preview"}}

            sys.modules["chat_handler"].chat = provider

            async def check():
                loop_thread = threading.get_ident()
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://isolated.invalid") as client:
                    response = await client.post("/chat/sync", json={"message": "今晚吃什么", "user_id": "fixture"})
                self.assertEqual(200, response.status_code)
                self.assertEqual({"reply": "已找到菜谱", "dishes": [{"id": 9}], "action": {"type": "preview"}, "success": True}, response.json())
                self.assertEqual(1, len(called_threads))
                self.assertNotEqual(loop_thread, called_threads[0], "Blocking provider ran on the ASGI event loop")

            runner.run(check())

    def test_string_reply_contract_is_preserved(self):
        import httpx
        with asyncio.Runner() as runner, isolated_service():
            main = load_main()
            sys.modules["chat_handler"].chat = lambda *args: "请补充人数"

            async def check():
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://isolated.invalid") as client:
                    response = await client.post("/chat/sync", json={"message": "安排一下"})
                    self.assertEqual({"reply": "请补充人数", "dishes": [], "success": True}, response.json())

            runner.run(check())


if __name__ == "__main__":
    unittest.main()
