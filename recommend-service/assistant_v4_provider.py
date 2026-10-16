"""Single bounded HTTP call for V4; legacy model_client return shapes stay intact."""
from __future__ import annotations

import copy
import asyncio
import math
import logging
import time
import httpx
from assistant_v4_transport import (BoundedDNS, LimitedProviderStream, ProviderTransport,
                                    TransportUnavailable)


ProviderUnavailable = TransportUnavailable
_LOG = logging.getLogger(__name__)
_OUTCOMES = frozenset(("success", "error", "timeout", "cancel", "recover"))


def record_provider_stage(outcome, duration_seconds):
    """Fixed Python supplier stage; separate from Java's complete gateway envelope."""
    if outcome not in _OUTCOMES or not math.isfinite(duration_seconds) or duration_seconds < 0:
        raise ValueError("invalid provider metric")
    _LOG.info("experience_stage stage=provider_http outcome=%s duration_ms=%.3f count=1",
              outcome, duration_seconds * 1000)


def _observe_provider(outcome, started):
    try:
        record_provider_stage(outcome, max(0.0, time.monotonic() - started))
    except Exception:
        pass  # Even a failed logging handler cannot alter results/cancellation/cleanup.


def provider_payload(model, messages, tools, final_round):
    payload = {"model": model, "messages": messages, "tool_choice": "none" if final_round else "auto",
               "temperature": .2, "max_tokens": 4096, "response_format": {"type": "json_object"}}
    if tools and not final_round:
        payload["tools"] = [{"type": "function", "function": {"name": tool["name"],
            "description": tool["description"], "parameters": tool["input_schema"]}} for tool in tools]
    if not tools: payload["tool_choice"] = "none"
    return payload


class AssistantV4Provider:
    def __init__(self, api_key=None, base_url=None, model=None):
        # Lazy config import keeps schemas and injected-provider runs independent of .env.
        from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
        self.api_key = str(DEEPSEEK_API_KEY if api_key is None else api_key).strip()
        self.base_url = str(DEEPSEEK_BASE_URL if base_url is None else base_url).rstrip("/")
        self.model = str(DEEPSEEK_MODEL if model is None else model).strip()

    def complete_message(self, messages, tools, *, final_round=False, timeout_seconds=10):
        if not self.api_key or self.api_key.lower().startswith("your_"):
            raise ProviderUnavailable("provider not configured")
        if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, (int, float)) or not math.isfinite(timeout_seconds) or not 3.5 <= timeout_seconds <= 23:
            raise ProviderUnavailable("invalid provider deadline")
        # This synchronous entry runs in FastAPI's def worker. Reject accidental event-loop
        # use before creating a coroutine; never nest asyncio.run or spawn unbounded threads.
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            pass
        else:
            raise ProviderUnavailable("synchronous provider called from event loop")
        provider_seconds = min(20.0, timeout_seconds - 3.0)
        payload = provider_payload(self.model,messages,tools,final_round)
        async def request():
            async with httpx.AsyncClient() as client:
                response = await client.post(self.base_url + "/v1/chat/completions",
                    headers={"Authorization": "Bearer " + self.api_key, "Content-Type": "application/json"},
                    json=payload, timeout=httpx.Timeout(provider_seconds, connect=min(2.0, provider_seconds), pool=min(.5, provider_seconds)))
                if response.status_code >= 400: raise ProviderUnavailable("provider request failed")
                message = response.json()["choices"][0]["message"]
                if not isinstance(message, dict): raise ValueError()
                return copy.deepcopy(message)
        async def bounded_request():
            # Bound cancellable async HTTP work, including slow response bodies, and
            # close its client on cancellation. asyncio.run may still wait for an OS DNS
            # executor thread to finish during cleanup; Java retains the outer hard deadline.
            return await asyncio.wait_for(request(), timeout=provider_seconds)
        started, outcome = time.monotonic(), "error"
        try:
            result = asyncio.run(bounded_request())
            outcome = "success"
            return result
        except (asyncio.TimeoutError, httpx.TimeoutException):
            outcome = "timeout"
            raise ProviderUnavailable("provider unavailable") from None
        except asyncio.CancelledError:
            outcome = "cancel"
            raise
        except Exception:
            # No retry and no raw request, provider text, key or reasoning in errors/logs.
            raise ProviderUnavailable("provider unavailable") from None
        finally:
            _observe_provider(outcome, started)


class ManagedV4Provider(AssistantV4Provider):
    """One event-loop-owned client per FastAPI lifespan; immediate bounded admission."""
    def __init__(self, *args, client=None, capacity=4, resolver=None, **kwargs):
        super().__init__(*args, **kwargs)
        if not isinstance(capacity,int) or not 1 <= capacity <= 8: raise ValueError("invalid provider capacity")
        self.capacity, self.client = capacity, client
        self.resolver = resolver or BoundedDNS()
        self.active = set()
        self.loop = None
        self.closing = False

    async def __aenter__(self):
        self.loop = asyncio.get_running_loop()
        if self.client is None:
            self.client = httpx.AsyncClient(transport=ProviderTransport(self.resolver,self.base_url,self.capacity))
        return self

    async def __aexit__(self, *args):
        self.closing = True
        tasks = list(self.active)
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        try:
            if self.client is not None: await self.client.aclose()
        finally: await self.resolver.aclose()

    async def complete_message_async(self,messages,tools,*,final_round=False,timeout_seconds=10):
        if self.closing or self.loop is not asyncio.get_running_loop() or self.client is None:
            raise ProviderUnavailable("provider lifecycle unavailable")
        if not self.api_key or self.api_key.lower().startswith("your_"):
            raise ProviderUnavailable("provider not configured")
        if isinstance(timeout_seconds,bool) or not isinstance(timeout_seconds,(int,float)) or not math.isfinite(timeout_seconds) or not 3.5 <= timeout_seconds <= 23:
            raise ProviderUnavailable("invalid provider deadline")
        if len(self.active) >= self.capacity: raise ProviderUnavailable("provider capacity reached")
        task = asyncio.current_task()
        self.active.add(task)
        seconds = min(20.0, timeout_seconds-3.0)
        async def request():
            response = await self.client.post(self.base_url+"/v1/chat/completions",
                headers={"Authorization":"Bearer "+self.api_key,"Content-Type":"application/json","Accept-Encoding":"identity"},
                json=provider_payload(self.model,messages,tools,final_round),
                timeout=httpx.Timeout(seconds,connect=min(2.0,seconds),pool=min(.1,seconds)))
            if response.status_code >= 400: raise ProviderUnavailable("provider request failed")
            message = response.json()["choices"][0]["message"]
            if not isinstance(message,dict): raise ValueError()
            return copy.deepcopy(message)
        started, outcome = time.monotonic(), "error"
        try:
            result = await asyncio.wait_for(request(),timeout=seconds)
            outcome = "success"
            return result
        except (asyncio.TimeoutError, httpx.TimeoutException):
            outcome = "timeout"
            raise ProviderUnavailable("provider unavailable") from None
        except asyncio.CancelledError:
            outcome = "cancel"
            raise
        except Exception: raise ProviderUnavailable("provider unavailable") from None
        finally:
            self.active.discard(task)
            _observe_provider(outcome, started)
