"""Provider stage is local Python→mock supplier, never Java gateway or live latency."""
import asyncio
import unittest
from unittest.mock import patch
from assistant_v4_isolation import isolated_service


class ExperienceProviderMetricsTest(unittest.IsolatedAsyncioTestCase):
    async def test_real_logging_is_bounded_and_handler_failure_cannot_fail_http(self):
        with isolated_service():
            import assistant_v4_provider as module
            class Client:
                async def post(self, *args, **kwargs):
                    return type('Response', (), {'status_code': 200, 'json': lambda _: {'choices': [{'message': {'content': 'private body'}}]}})()
                async def aclose(self): pass
            async with module.ManagedV4Provider(client=Client()) as provider:
                with self.assertLogs(module._LOG, level='INFO') as captured:
                    await provider.complete_message_async([{'content': 'private prompt'}], [])
                self.assertEqual(1,len(captured.output)); self.assertIn('stage=provider_http outcome=success',captured.output[0]); self.assertNotIn('private',str(captured.output))
                with patch.object(module._LOG,'info',side_effect=RuntimeError('handler unavailable')):
                    self.assertEqual('private body',(await provider.complete_message_async([],[]))['content'])
            with self.assertRaises(ValueError): module.record_provider_stage('private user',0.1)
            with self.assertRaises(ValueError): module.record_provider_stage('success',float('nan'))

    async def test_real_managed_call_records_once_without_private_labels(self):
        with isolated_service():
            import assistant_v4_provider as module
            class Client:
                async def post(self, *args, **kwargs):
                    return type('Response', (), {'status_code': 200, 'json': lambda _: {'choices': [{'message': {'content': 'private response'}}]}})()
                async def aclose(self): pass
            events = []
            with patch.object(module, 'record_provider_stage', side_effect=lambda outcome, duration: events.append((outcome, duration))):
                async with module.ManagedV4Provider(client=Client()) as provider:
                    result = await provider.complete_message_async([{'role': 'user', 'content': 'private prompt'}], [])
            self.assertEqual('private response', result['content'])
            self.assertEqual(1, len(events)); self.assertEqual('success', events[0][0]); self.assertGreaterEqual(events[0][1], 0)
            self.assertNotIn('private', str(events))

    async def test_metrics_failure_preserves_response_and_releases_capacity(self):
        with isolated_service():
            import assistant_v4_provider as module
            class Client:
                async def post(self, *args, **kwargs):
                    return type('Response', (), {'status_code': 200, 'json': lambda _: {'choices': [{'message': {'content': '{}'}}]}})()
                async def aclose(self): pass
            with patch.object(module, 'record_provider_stage', side_effect=RuntimeError('sink')):
                async with module.ManagedV4Provider(client=Client(), capacity=1) as provider:
                    self.assertEqual('{}', (await provider.complete_message_async([], []))['content']); self.assertFalse(provider.active)

    async def test_timeout_and_cancel_are_fixed_and_do_not_retry(self):
        with isolated_service():
            import assistant_v4_provider as module
            class Client:
                calls = 0
                async def post(self, *args, **kwargs):
                    self.calls += 1
                    raise asyncio.TimeoutError()
                async def aclose(self): pass
            events=[]; client=Client()
            with patch.object(module, 'record_provider_stage', side_effect=lambda outcome, duration: events.append(outcome)):
                async with module.ManagedV4Provider(client=client) as provider:
                    with self.assertRaises(module.ProviderUnavailable): await provider.complete_message_async([], [])
                    with patch.object(client, 'post', side_effect=asyncio.CancelledError):
                        with self.assertRaises(asyncio.CancelledError): await provider.complete_message_async([], [])
                    self.assertFalse(provider.active)
            self.assertEqual(['timeout', 'cancel'], events); self.assertEqual(1, client.calls)


class SyncExperienceProviderMetricsTest(unittest.TestCase):
    def test_sync_real_http_entry_records_success_error_timeout_and_closes_client(self):
        with isolated_service():
            import assistant_v4_provider as module
            class Client:
                closed = 0
                failure = None
                async def __aenter__(self): return self
                async def __aexit__(self,*args): self.closed += 1
                async def post(self,*args,**kwargs):
                    if self.failure: raise self.failure
                    return type('Response', (), {'status_code': 200, 'json': lambda _: {'choices': [{'message': {'content': '{}'}}]}})()
            client=Client(); events=[]
            with patch.object(module.httpx,'AsyncClient',return_value=client), patch.object(module,'record_provider_stage',side_effect=lambda outcome,duration:events.append(outcome)):
                provider=module.AssistantV4Provider()
                self.assertEqual('{}',provider.complete_message([],[])['content'])
                client.failure=RuntimeError('private provider body')
                with self.assertRaises(module.ProviderUnavailable): provider.complete_message([],[])
                client.failure=asyncio.TimeoutError()
                with self.assertRaises(module.ProviderUnavailable): provider.complete_message([],[])
                client.failure=None
                with patch.object(module,'record_provider_stage',side_effect=RuntimeError('sink')):
                    self.assertEqual('{}',provider.complete_message([],[])['content'])
            self.assertEqual(['success','error','timeout'],events);self.assertEqual(4,client.closed)
