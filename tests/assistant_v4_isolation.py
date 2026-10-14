"""Synthetic-only service imports and socket-free ASGI driver for contract tests."""
import importlib
import importlib.util
import json
from contextlib import ExitStack, contextmanager
from pathlib import Path
import sys
import types
import socket
from unittest.mock import patch

SERVICE = Path(__file__).resolve().parents[1] / "recommend-service"


@contextmanager
def isolated_service():
    """Never load .env, connect to DB, read live indexes, or contact a provider."""
    names = ("config", "db", "rag", "chat_handler", "assistant_engine", "agent_runtime",
             "model_client", "workspace_agent", "agent_tools", "agent_schemas", "authorized_catalog")
    saved = {name: sys.modules.get(name) for name in names}
    attempts = []
    real_connect = socket.socket.connect

    def local_socketpair(family=socket.AF_INET, type=socket.SOCK_STREAM, proto=0):
        # Windows asyncio needs a private loopback wakeup pair. Never restore the
        # global connect method: only this constructor's own socket may connect,
        # synchronously on this thread, to its own listener's exact ephemeral port.
        if family not in (socket.AF_INET, socket.AF_INET6) or type != socket.SOCK_STREAM or proto != 0:
            raise ValueError("Only loopback TCP socketpairs are supported")
        host = "127.0.0.1" if family == socket.AF_INET else "::1"
        connector = accepted = None
        try:
            with socket.socket(family, type, proto) as listener:
                listener.bind((host, 0)); listener.listen()
                address = listener.getsockname()[:2]
                connector = socket.socket(family, type, proto)
                connector.setblocking(False)
                try: real_connect(connector, address)
                except (BlockingIOError, InterruptedError): pass
                connector.setblocking(True)
                accepted, _ = listener.accept()
            if accepted.getsockname() != connector.getpeername() or connector.getsockname() != accepted.getpeername():
                raise ConnectionError("Unexpected socketpair peer")
            return accepted, connector
        except BaseException:
            if accepted is not None: accepted.close()
            if connector is not None: connector.close()
            raise

    def denied(*args, **kwargs):
        attempts.append("network operation")
        raise AssertionError("Network/DB access forbidden in isolated contract tests")

    config = types.ModuleType("config")
    for key in ("DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"):
        setattr(config, key, "synthetic-unused")
    config.DEEPSEEK_API_KEY = "synthetic-unused-key"
    config.DEEPSEEK_BASE_URL = "https://fixture.invalid"
    config.DEEPSEEK_MODEL = "synthetic-model"
    db = types.ModuleType("db")
    db._get_connection = denied
    db._map_type = lambda value: value
    with ExitStack() as stack:
        for name in names:
            sys.modules.pop(name, None)
        sys.modules.update({"config": config, "db": db})
        for name in ("chat_handler", "assistant_engine", "agent_runtime"):
            sys.modules[name] = types.ModuleType(name)
        sys.path.insert(0, str(SERVICE))
        for target in ("socket.socket.connect", "socket.socket.connect_ex",
                       "socket.create_connection", "socket.getaddrinfo"):
            stack.enter_context(patch(target, side_effect=denied))
        stack.enter_context(patch.object(socket, "socketpair", side_effect=local_socketpair))
        try:
            rag = importlib.import_module("rag")
            # Non-empty synthetic index prevents load_index from reading source artifacts.
            rag._dish_meta = [{"id": 999, "name": "synthetic placeholder", "type": "veg", "cl": ""}]
            rag._ingredient_map = {}
            yield types.SimpleNamespace(
                client=importlib.import_module("model_client"),
                agent=importlib.import_module("workspace_agent"),
                tools=importlib.import_module("agent_tools"),
                schemas=importlib.import_module("agent_schemas"), rag=rag,
                network_attempts=attempts)
            if attempts:
                raise AssertionError("Unexpected network/DB attempts: " + str(len(attempts)))
        finally:
            sys.path.remove(str(SERVICE))
            for name, module in saved.items():
                if module is None:
                    sys.modules.pop(name, None)
                else:
                    sys.modules[name] = module


def load_main():
    spec = importlib.util.spec_from_file_location("isolated_v4_main", SERVICE / "main.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def asgi_post(app, path, body, headers):
    """Run real ASGI HTTP middleware/router; inline only the sync threadpool."""
    import fastapi.routing
    import httpx
    sent = []
    raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
             "scheme": "http", "method": "POST", "path": path, "raw_path": path.encode("ascii"),
             "query_string": b"", "root_path": "", "headers": [
                 (b"host", b"asgi-fixture.invalid"), (b"content-type", b"application/json")
             ] + [(key.lower().encode("ascii"), value.encode("ascii")) for key, value in headers.items()],
             "client": ("127.0.0.1", 1), "server": ("asgi-fixture.invalid", 80)}

    async def receive():
        return {"type": "http.request", "body": raw, "more_body": False}

    async def send(message):
        sent.append(message)

    async def inline(function, *args, **kwargs):
        return function(*args, **kwargs)

    coroutine = app(scope, receive, send)
    with patch.object(fastapi.routing, "run_in_threadpool", inline):
        try:
            coroutine.send(None)
            raise AssertionError("Unexpected async wait in isolated synchronous route")
        except StopIteration:
            pass
        finally:
            coroutine.close()
    start = next(item for item in sent if item["type"] == "http.response.start")
    content = b"".join(item.get("body", b"") for item in sent if item["type"] == "http.response.body")
    return httpx.Response(start["status"], content=content, headers=start["headers"])
