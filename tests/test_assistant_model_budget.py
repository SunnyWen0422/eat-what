"""Deadline regression: synthetic provider only; no real credentials or network."""
import asyncio
import json
import time
import unittest
from unittest.mock import Mock, patch
import test_assistant_v4_step as step_contract
from assistant_v4_isolation import isolated_service


class AssistantModelBudgetTest(unittest.TestCase):
    def test_route_accepts_larger_bounded_budget_and_keeps_network_headroom(self):
        request = step_contract.body(); request["timeoutSeconds"] = 23
        status, result, calls = step_contract.AssistantV4StepTest().route(
            step_contract.final({"type": "final", "reply": "ok"}), request)
        self.assertEqual(200, status); self.assertEqual("final", result["type"])
        self.assertEqual(1, len(calls))
        timeout = calls[0]["timeout"]
        self.assertLessEqual(timeout.read, 20); self.assertGreater(timeout.read, 19)
        self.assertLessEqual(timeout.connect, 2)

    def test_expired_absolute_deadline_never_starts_provider(self):
        request = step_contract.body(); request.update(timeoutSeconds=23, deadlineEpochMillis=1)
        status, result, calls = step_contract.AssistantV4StepTest().route(
            step_contract.final({"type": "final", "reply": "ok"}), request)
        self.assertEqual(200, status); self.assertEqual("need_input", result["type"]); self.assertEqual([], calls)

    def test_absolute_deadline_cannot_expand_relative_budget(self):
        request = step_contract.body(); request.update(timeoutSeconds=5, deadlineEpochMillis=int(time.time()*1000)+600000)
        status, _, calls = step_contract.AssistantV4StepTest().route(step_contract.final({"type": "final", "reply": "ok"}), request)
        self.assertEqual(200, status); self.assertEqual(1, len(calls)); self.assertLessEqual(calls[0]["timeout"].read, 2)

    def test_preparation_time_reduces_budget_and_short_remaining_skips_provider(self):
        with isolated_service():
            import assistant_v4_step as step
            model = Mock(); model.complete_message.return_value = step_contract.final({"type": "final", "reply": "ok"})
            request = step_contract.body(); request["timeoutSeconds"] = 10
            with patch.object(step, "monotonic", side_effect=[100, 102], create=True):
                self.assertEqual("final", step.run_step(request, model)["type"])
            self.assertEqual(8, model.complete_message.call_args.kwargs["timeout_seconds"])
            model.reset_mock()
            with patch.object(step, "monotonic", side_effect=[100, 107], create=True):
                self.assertEqual("need_input", step.run_step(request, model)["type"])
            model.complete_message.assert_not_called()

    def test_provider_total_deadline_cancels_slow_body_and_closes_client_without_retry(self):
        with isolated_service():
            import assistant_v4_provider as provider
            events = []
            class Client:
                async def __aenter__(self): events.append("open"); return self
                async def __aexit__(self, *args): events.append("closed")
                async def post(self, *args, **kwargs):
                    events.append("request")
                    try: await asyncio.sleep(5)
                    except asyncio.CancelledError: events.append("cancelled"); raise
            model = provider.AssistantV4Provider(api_key="synthetic", base_url="https://fixture.invalid", model="fixture")
            start = time.monotonic()
            with patch.object(provider.httpx, "AsyncClient", return_value=Client()), patch.object(provider.httpx, "post", side_effect=RuntimeError("legacy transport")):
                with self.assertRaises(provider.ProviderUnavailable): model.complete_message([], [], timeout_seconds=3.5)
            self.assertLess(time.monotonic()-start, 2)
            self.assertEqual(["open", "request", "cancelled", "closed"], events)

    def test_provider_rejects_sync_entry_inside_running_event_loop(self):
        with isolated_service():
            import assistant_v4_provider as provider
            model = provider.AssistantV4Provider(api_key="synthetic", base_url="https://fixture.invalid", model="fixture")
            async def invoke():
                with self.assertRaises(provider.ProviderUnavailable): model.complete_message([], [], timeout_seconds=10)
            with patch.object(provider.httpx, "post", side_effect=RuntimeError("must not send")) as sync_send, patch.object(provider.httpx.AsyncClient, "post") as async_send:
                asyncio.run(invoke()); sync_send.assert_not_called(); async_send.assert_not_called()

    def test_dns_executor_cleanup_is_a_known_limit_of_provider_wall_clock_cancellation(self):
        # No DNS is performed: a sleeping default-executor task models a blocking
        # resolver. Java's outer deadline must remain independent of this cleanup.
        with isolated_service():
            import assistant_v4_provider as provider
            events = []
            class Client:
                async def __aenter__(self): return self
                async def __aexit__(self, *args): events.append("closed")
                async def post(self, *args, **kwargs):
                    try: await asyncio.to_thread(time.sleep, 1.2)
                    except asyncio.CancelledError: events.append("cancelled"); raise
            model = provider.AssistantV4Provider(api_key="synthetic", base_url="https://fixture.invalid", model="fixture")
            started = time.monotonic()
            with patch.object(provider.httpx, "AsyncClient", return_value=Client()):
                with self.assertRaises(provider.ProviderUnavailable): model.complete_message([], [], timeout_seconds=3.5)
            elapsed = time.monotonic() - started
            self.assertGreaterEqual(elapsed, 1.1)  # Effective HTTP deadline was only 0.5s.
            self.assertLess(elapsed, 3)
            self.assertEqual(["cancelled", "closed"], events)

    def test_provider_closes_client_on_success_http_failure_and_bad_response_shapes(self):
        with isolated_service():
            import assistant_v4_provider as provider
            for status, body in ((200, {"choices": [{"message": {"role": "assistant", "content": "{}"}}]}),
                                 (503, {}), (200, {}), (200, {"choices": []}),
                                 (200, {"choices": [{"message": []}]})):
                with self.subTest(status=status, body=body):
                    events = []; response = Mock(status_code=status); response.json.return_value = body
                    class Client:
                        async def __aenter__(self): events.append("open"); return self
                        async def __aexit__(self, *args): events.append("closed")
                        async def post(self, *args, **kwargs): events.append("request"); return response
                    model = provider.AssistantV4Provider(api_key="synthetic", base_url="https://fixture.invalid", model="fixture")
                    with patch.object(provider.httpx, "AsyncClient", return_value=Client()):
                        if status == 200 and body.get("choices") and isinstance(body["choices"][0]["message"], dict):
                            self.assertEqual(body["choices"][0]["message"], model.complete_message([], [], timeout_seconds=10))
                        else:
                            with self.assertRaises(provider.ProviderUnavailable): model.complete_message([], [], timeout_seconds=10)
                    self.assertEqual(["open", "request", "closed"], events)


if __name__ == "__main__": unittest.main()
