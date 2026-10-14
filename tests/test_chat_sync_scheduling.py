"""Exercise the actual HTTP route without importing production credentials or I/O."""
import asyncio
import sys
import threading
import unittest
from assistant_v4_isolation import isolated_service, load_main


class ChatSyncSchedulingTest(unittest.TestCase):
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
