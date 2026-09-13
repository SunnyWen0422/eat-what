"""OpenAI-compatible DeepSeek client used by the Agent Runtime."""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

import httpx

from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL


class ModelUnavailable(RuntimeError):
    pass


class ModelProtocolError(RuntimeError):
    pass


def _json_content(content: str) -> Dict[str, Any]:
    text = str(content or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
    text = re.sub(r"\s*```$", "", text)
    try:
        value = json.loads(text)
    except (TypeError, json.JSONDecodeError) as error:
        raise ModelProtocolError("model returned invalid JSON") from error
    if not isinstance(value, dict):
        raise ModelProtocolError("model JSON must be an object")
    return value


class DeepSeekModelClient:
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None,
                 model: Optional[str] = None, timeout: float = 12.0):
        self.api_key = str(api_key if api_key is not None else DEEPSEEK_API_KEY or "").strip()
        self.base_url = str(base_url if base_url is not None else DEEPSEEK_BASE_URL).rstrip("/")
        self.model = str(model if model is not None else DEEPSEEK_MODEL).strip()
        self.timeout = float(timeout)

    def complete(self, messages: List[Dict[str, Any]], tools: List[Dict[str, Any]], response_schema: Dict[str, Any]) -> Dict[str, Any]:
        if not self.api_key or self.api_key.lower().startswith("your_"):
            raise ModelUnavailable("DeepSeek API key is not configured")
        # DeepSeek JSON-object mode requires an explicit JSON instruction in
        # the prompt.  Keep this guard at the transport boundary so callers
        # cannot accidentally receive a 400 when they provide a non-English
        # or very short prompt.
        request_messages = list(messages)
        if response_schema and str(response_schema.get("type", "")).lower() == "object":
            prompt_text = "\n".join(str(item.get("content", "")) for item in request_messages if isinstance(item, dict))
            if "json" not in prompt_text.lower():
                request_messages.insert(0, {"role": "system", "content": "Return the final response as a valid JSON object."})
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": request_messages,
            "tools": [{"type": "function", "function": {
                "name": item["name"], "description": item.get("description", ""), "parameters": item.get("input_schema", {"type": "object"})
            }} for item in tools],
            "tool_choice": "auto",
            "temperature": 0.2,
            # Flash may spend part of the output budget on reasoning_content;
            # leave enough room for the structured final response.
            "max_tokens": 2048,
            # DeepSeek's OpenAI-compatible endpoint supports JSON-object mode;
            # tool-call turns remain function messages and final turns are
            # parsed again by agent_schemas before they can reach the user.
            "response_format": {"type": "json_object"},
        }
        try:
            response = httpx.post(
                f"{self.base_url}/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=self.timeout,
            )
        except Exception as error:
            raise ModelUnavailable("DeepSeek network request failed") from error
        if response.status_code in {401, 402, 403, 408, 409, 429, 500, 502, 503, 504}:
            raise ModelUnavailable(f"DeepSeek request failed with status {response.status_code}")
        if response.status_code >= 400:
            raise ModelProtocolError(f"DeepSeek request rejected with status {response.status_code}")
        try:
            body = response.json()
            message = body["choices"][0]["message"]
        except (ValueError, KeyError, IndexError, TypeError) as error:
            raise ModelProtocolError("DeepSeek response shape is invalid") from error
        tool_calls = message.get("tool_calls") or []
        if tool_calls:
            call = tool_calls[0]
            function = call.get("function") or {}
            raw_args = function.get("arguments") or "{}"
            try:
                arguments = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
            except json.JSONDecodeError as error:
                raise ModelProtocolError("tool arguments are invalid JSON") from error
            return {"tool_call": {"id": call.get("id"), "name": function.get("name"), "arguments": arguments}}
        return {"final": _json_content(message.get("content", ""))}


def default_model_client() -> DeepSeekModelClient:
    return DeepSeekModelClient()
