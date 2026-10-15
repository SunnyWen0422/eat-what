"""No provider, database or DNS network access: explicit in-memory transports/processes."""
import asyncio
import json
import time
import unittest
from unittest.mock import patch
from assistant_v4_isolation import isolated_service


class ProviderLifecycleTest(unittest.IsolatedAsyncioTestCase):
    async def test_encoded_response_rejected_before_decompression_and_closed(self):
        with isolated_service():
            import httpx
            from assistant_v4_provider import BoundedDNS, ProviderTransport, ProviderUnavailable
            class Response:
                status=200; headers=[(b"content-encoding",b"gzip")]; extensions={}; closed=False
                async def aiter_stream(self):
                    import gzip
                    yield gzip.compress(b"{}")
                async def aclose(self): self.closed=True
            response=Response()
            class Pool:
                async def handle_async_request(self, request): return response
                async def aclose(self): pass
            resolver=BoundedDNS()
            async with httpx.AsyncClient(transport=ProviderTransport(resolver,"https://fixture.invalid",pool=Pool())) as client:
                with self.assertRaises(ProviderUnavailable): await client.post("https://fixture.invalid/test",json={})
            self.assertTrue(response.closed)
            await resolver.aclose()

    async def test_reuses_one_client_and_closes_it_on_lifespan_exit(self):
        with isolated_service():
            from assistant_v4_provider import ManagedV4Provider
            class Client:
                calls = 0
                closed = False
                async def post(self, *args, **kwargs):
                    self.calls += 1
                    return type("Response", (), {"status_code": 200, "json": lambda _: {"choices": [{"message": {"role": "assistant", "content": "{}"}}]}})()
                async def aclose(self): self.closed = True
            client = Client()
            async with ManagedV4Provider(client=client) as provider:
                for _ in range(2): self.assertEqual("{}", (await provider.complete_message_async([], [], timeout_seconds=3.5))["content"])
                self.assertEqual(2, client.calls)
            self.assertTrue(client.closed)

    async def test_body_timeout_cancels_work_and_does_not_retry(self):
        with isolated_service():
            from assistant_v4_provider import ManagedV4Provider, ProviderUnavailable
            calls = []
            class Client:
                async def post(self, *args, **kwargs):
                    calls.append("post")
                    try: await asyncio.sleep(60)
                    except asyncio.CancelledError: calls.append("cancelled"); raise
                async def aclose(self): calls.append("closed")
            started = time.monotonic()
            async with ManagedV4Provider(client=Client()) as provider:
                with self.assertRaises(ProviderUnavailable): await provider.complete_message_async([], [], timeout_seconds=3.5)
            self.assertLess(time.monotonic()-started, 1.5)
            self.assertEqual(["post", "cancelled", "closed"], calls)

    async def test_capacity_rejects_excess_without_queue_or_hidden_http_attempt(self):
        with isolated_service():
            from assistant_v4_provider import ManagedV4Provider, ProviderUnavailable
            release = asyncio.Event()
            class Client:
                calls = 0
                async def post(self, *args, **kwargs):
                    self.calls += 1
                    await release.wait()
                    return type("Response", (), {"status_code": 200, "json": lambda _: {"choices": [{"message": {"content": "{}"}}]}})()
                async def aclose(self): pass
            client = Client()
            async with ManagedV4Provider(client=client, capacity=2) as provider:
                tasks = [asyncio.create_task(provider.complete_message_async([], [], timeout_seconds=10)) for _ in range(2)]
                await asyncio.sleep(0)
                with self.assertRaises(ProviderUnavailable): await provider.complete_message_async([], [], timeout_seconds=10)
                self.assertEqual(2, client.calls)
                release.set(); await asyncio.gather(*tasks)

    async def test_dns_timeout_and_shutdown_kill_owned_children_and_bound_admission(self):
        with isolated_service():
            from assistant_v4_provider import BoundedDNS, ProviderUnavailable
            children = []
            class Process:
                returncode = None
                killed = False
                async def communicate(self): await asyncio.sleep(60)
                def kill(self): self.killed = True; self.returncode = -9
                async def wait(self): return self.returncode
            async def spawn(*args, **kwargs):
                child = Process(); children.append(child); return child
            resolver = BoundedDNS(capacity=2, timeout=.05, spawn=spawn)
            tasks = [asyncio.create_task(resolver.resolve(f"host{i}.invalid", 443)) for i in range(2)]
            await asyncio.sleep(.01)
            with self.assertRaises(ProviderUnavailable): await resolver.resolve("third.invalid", 443)
            await asyncio.gather(*tasks, return_exceptions=True)
            self.assertEqual(2, len(children)); self.assertTrue(all(child.killed for child in children))
            task = asyncio.create_task(resolver.resolve("new.invalid",443)); await asyncio.sleep(.01); await resolver.aclose(); await asyncio.gather(task,return_exceptions=True)
            self.assertTrue(all(child.killed for child in children))
            with self.assertRaises(ProviderUnavailable): await resolver.resolve("closed.invalid",443)

    async def test_network_stream_rejects_overlarge_provider_body(self):
        with isolated_service():
            from assistant_v4_provider import LimitedProviderStream, ProviderUnavailable
            class Response:
                closed = False
                async def aiter_stream(self):
                    yield b"a" * 8
                    yield b"b" * 8
                async def aclose(self): self.closed=True
            response=Response();stream=LimitedProviderStream(response,limit=10)
            with self.assertRaises(ProviderUnavailable):
                async for _ in stream: pass
            await stream.aclose();self.assertTrue(response.closed)

    async def test_real_pool_and_http_adapter_preserve_the_json_protocol_without_network(self):
        with isolated_service():
            import httpcore, httpx
            from assistant_v4_provider import ManagedV4Provider, ProviderTransport
            body=json.dumps({"choices":[{"message":{"role":"assistant","content":"{}"}}]}).encode()
            wire=b"HTTP/1.1 200 OK\r\nContent-Length: "+str(len(body)).encode()+b"\r\n\r\n"+body
            pool=httpcore.AsyncConnectionPool(network_backend=httpcore.AsyncMockBackend([wire]))
            transport=ProviderTransport(None,"https://fixture.invalid",pool=pool)
            async with ManagedV4Provider(client=httpx.AsyncClient(transport=transport)) as provider:
                self.assertEqual("{}",(await provider.complete_message_async([],[],timeout_seconds=10))["content"])
                self.assertEqual(0,len(provider.active))

    async def test_shutdown_cancels_active_http_before_closing_the_shared_client(self):
        with isolated_service():
            from assistant_v4_provider import ManagedV4Provider, ProviderUnavailable
            events=[]
            class Client:
                async def post(self,*args,**kwargs):
                    try: await asyncio.sleep(60)
                    except asyncio.CancelledError: events.append("cancelled");raise
                async def aclose(self): events.append("closed")
            async with ManagedV4Provider(client=Client()) as provider:
                task=asyncio.create_task(provider.complete_message_async([],[],timeout_seconds=10))
                await asyncio.sleep(0)
            self.assertTrue(task.cancelled());self.assertEqual(["cancelled","closed"],events)
            with self.assertRaises(ProviderUnavailable):await provider.complete_message_async([],[],timeout_seconds=10)

    async def test_preparation_deadline_is_deducted_in_the_async_route_too(self):
        with isolated_service():
            from unittest.mock import AsyncMock
            import assistant_v4_step as step
            from test_assistant_v4_step import body
            model=type("Model",(),{"complete_message_async":AsyncMock()})()
            with patch.object(step,"monotonic",side_effect=[100,109]):
                self.assertEqual("need_input",(await step.run_step_async(body(),model))["type"])
            model.complete_message_async.assert_not_called()

    async def test_resolved_tcp_keeps_original_tls_hostname_and_required_certificate_verification(self):
        with isolated_service():
            import httpcore,httpx,ssl
            from assistant_v4_transport import ResolverBackend,ProviderTransport
            from unittest.mock import AsyncMock
            resolver=type("Resolver",(),{"resolve":AsyncMock(return_value=["192.0.2.1"])})()
            capture=[]
            class Backend:
                async def connect_tcp(self,host,*args):
                    self_host=host
                    stream=await httpcore.AsyncMockBackend([b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}"]).connect_tcp(host,*args)
                    start=stream.start_tls
                    async def tls(ssl_context,server_hostname=None,timeout=None):
                        capture.append((self_host,server_hostname,ssl_context.verify_mode,ssl_context.check_hostname))
                        return await start(ssl_context,server_hostname,timeout)
                    stream.start_tls=tls
                    return stream
            backend=ResolverBackend(resolver);backend.backend=Backend()
            pool=httpcore.AsyncConnectionPool(network_backend=backend)
            async with httpx.AsyncClient(transport=ProviderTransport(resolver,"https://fixture.invalid",pool=pool)) as client:
                self.assertEqual({},(await client.post("https://fixture.invalid/v1/test",json={})).json())
            self.assertEqual([("192.0.2.1","fixture.invalid",ssl.CERT_REQUIRED,True)],capture)

    async def test_dns_cache_coalesces_requests_and_child_environment_omits_credentials(self):
        with isolated_service():
            from assistant_v4_provider import BoundedDNS
            launches=[]
            class Process:
                returncode=0
                async def communicate(self): await asyncio.sleep(.01);return b'["192.0.2.1"]',b''
            async def spawn(*args,**kwargs):launches.append((args,kwargs));return Process()
            resolver=BoundedDNS(spawn=spawn)
            with patch.dict("os.environ",{"DEEPSEEK_API_KEY":"synthetic","DB_PASSWORD":"synthetic"}):
                a,b=await asyncio.gather(resolver.resolve("fixture.invalid",443),resolver.resolve("fixture.invalid",443))
                self.assertEqual(a,b);await resolver.resolve("fixture.invalid",443)
            self.assertEqual(1,len(launches));self.assertNotIn("DEEPSEEK_API_KEY",launches[0][1]["env"]);self.assertNotIn("DB_PASSWORD",launches[0][1]["env"]);await resolver.aclose()


if __name__ == "__main__": unittest.main()
