"""Single bounded HTTP call for V4; legacy model_client return shapes stay intact."""
from __future__ import annotations

import copy
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
        payload = {"model": self.model, "messages": messages, "tool_choice": "none" if final_round else "auto",
                   "temperature": .2, "max_tokens": 4096, "response_format": {"type": "json_object"}}
        if tools and not final_round:
            payload["tools"] = [{"type": "function", "function": {"name": tool["name"],
                "description": tool["description"], "parameters": tool["input_schema"]}} for tool in tools]
        if not tools: payload["tool_choice"] = "none"
        try:
            response = httpx.post(self.base_url + "/v1/chat/completions",
                headers={"Authorization": "Bearer " + self.api_key, "Content-Type": "application/json"},
                json=payload, timeout=timeout_seconds)
            if response.status_code >= 400: raise ProviderUnavailable("provider request failed")
            message = response.json()["choices"][0]["message"]
            if not isinstance(message, dict): raise ValueError()
            return copy.deepcopy(message)
        except Exception:
            # No retry and no raw request, provider text, key or reasoning in errors/logs.
            raise ProviderUnavailable("provider unavailable") from None
