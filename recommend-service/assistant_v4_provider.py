"""Single bounded HTTP call for V4; legacy model_client return shapes stay intact."""
from __future__ import annotations

import copy
import asyncio
import math
import httpx


class ProviderUnavailable(RuntimeError):
    pass


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
        payload = {"model": self.model, "messages": messages, "tool_choice": "none" if final_round else "auto",
                   "temperature": .2, "max_tokens": 4096, "response_format": {"type": "json_object"}}
        if tools and not final_round:
            payload["tools"] = [{"type": "function", "function": {"name": tool["name"],
                "description": tool["description"], "parameters": tool["input_schema"]}} for tool in tools]
        if not tools: payload["tool_choice"] = "none"
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
        try:
            return asyncio.run(bounded_request())
        except Exception:
            # No retry and no raw request, provider text, key or reasoning in errors/logs.
            raise ProviderUnavailable("provider unavailable") from None
