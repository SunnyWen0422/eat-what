"""Bounded provider transport. No user URLs, resolver threads, TLS bypass or retries."""
from __future__ import annotations
import asyncio
import ipaddress
import json
import os
import re
import ssl
import sys
from urllib.parse import unquote, urlsplit, urlunsplit
from urllib.request import getproxies, proxy_bypass
import httpcore
import httpx


class TransportUnavailable(RuntimeError):
    pass


class BoundedDNS:
    # The child only receives a configured host/port. It cannot inherit model/DB secrets.
    CODE = "import socket,json,sys; print(json.dumps(list(dict.fromkeys(x[4][0] for x in socket.getaddrinfo(sys.argv[1],int(sys.argv[2]),type=socket.SOCK_STREAM)))[:8]))"
    def __init__(self, capacity=2, timeout=2.0, spawn=None):
        self.capacity, self.timeout = capacity, timeout
        self.spawn = spawn or asyncio.create_subprocess_exec
        self.pending, self.cache = {}, {}
        self.closed = False
        self.loop = None

    async def resolve(self, host, port):
        loop = asyncio.get_running_loop()
        if self.closed or self.loop is not None and self.loop is not loop:
            raise TransportUnavailable("resolver unavailable")
        self.loop = loop
        try: return [str(ipaddress.ip_address(host))]
        except ValueError: pass
        if not isinstance(host, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,253}", host) or not 1 <= port <= 65535:
            raise TransportUnavailable("invalid provider address")
        key = (host, port)
        cached = self.cache.get(key)
        if cached and cached[0] > loop.time(): return cached[1][:]
        if key not in self.pending:
            if len(self.pending) >= self.capacity: raise TransportUnavailable("resolver capacity reached")
            task = asyncio.create_task(self._lookup(host, port))
            self.pending[key] = task
            def finish(done):
                if self.pending.get(key) is done: self.pending.pop(key, None)
                if not done.cancelled(): done.exception()  # Consume timed-out callers' completed lookup errors.
            task.add_done_callback(finish)
        # A cancelled waiter cannot orphan an unbounded OS resolver. The shared
        # child has its own <=2s deadline and is killed at timeout/shutdown.
        addresses = await asyncio.shield(self.pending[key])
        if not self.closed:
            if len(self.cache) >= 128: self.cache.pop(next(iter(self.cache)))
            self.cache[key] = (loop.time() + 60, addresses[:])
        return addresses[:]

    async def _lookup(self, host, port):
        process = None
        async def lookup():
            nonlocal process
            environment = {key: value for key, value in os.environ.items() if key.upper() in
                           {"SYSTEMROOT", "WINDIR", "PATH", "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH", "LANG", "LC_ALL"}}
            process = await self.spawn(sys.executable, "-I", "-c", self.CODE, host, str(port),
                stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL, env=environment)
            output, _ = await process.communicate()
            if process.returncode != 0 or len(output) > 4096: raise TransportUnavailable("resolver unavailable")
            values = json.loads(output)
            if not isinstance(values, list) or not 1 <= len(values) <= 8: raise ValueError()
            return [str(ipaddress.ip_address(value)) for value in values]
        try:
            return await asyncio.wait_for(lookup(), timeout=self.timeout)
        except asyncio.CancelledError: raise
        except Exception: raise TransportUnavailable("resolver unavailable") from None
        finally:
            if process is not None and process.returncode is None:
                try:
                    process.kill()
                    await asyncio.wait_for(process.wait(), timeout=1)
                except ProcessLookupError: pass
                except Exception:
                    # Stop admission if cleanup cannot be confirmed; never grow children.
                    self.closed = True
                    raise TransportUnavailable("resolver cleanup incomplete") from None

    async def aclose(self):
        self.closed = True
        tasks = list(self.pending.values())
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.cache.clear()


class ResolverBackend(httpcore.AsyncNetworkBackend):
    def __init__(self, resolver):
        self.resolver = resolver
        self.backend = httpcore.AnyIOBackend()

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        loop = asyncio.get_running_loop()
        deadline = loop.time() + (2 if timeout is None else timeout)
        addresses = await self.resolver.resolve(host, port)
        for address in addresses:
            remaining = deadline - loop.time()
            if remaining <= 0: raise httpcore.ConnectTimeout()
            try:
                # Only TCP resolution changes. httpcore retains the original origin
                # for Host and TLS SNI/certificate validation on start_tls.
                return await self.backend.connect_tcp(address, port, remaining, local_address, socket_options)
            except (httpcore.ConnectError, httpcore.ConnectTimeout): pass
        raise httpcore.ConnectError("provider connection unavailable")

    async def connect_unix_socket(self, *args, **kwargs):
        raise TransportUnavailable("unix provider transport unavailable")

    async def sleep(self, seconds): await asyncio.sleep(seconds)


class LimitedProviderStream(httpx.AsyncByteStream):
    def __init__(self, response, limit=512 * 1024): self.response, self.limit = response, limit
    async def __aiter__(self):
        count = 0
        async for part in self.response.aiter_stream():
            count += len(part)
            if count > self.limit: raise TransportUnavailable("provider response exceeds limit")
            yield part
    async def aclose(self): await self.response.aclose()


def configured_proxy(base_url):
    target = urlsplit(base_url)
    if proxy_bypass(target.hostname or ""): return None
    proxies = getproxies()
    value = proxies.get(target.scheme) or proxies.get("all")
    if not value: return None
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise TransportUnavailable("provider proxy unavailable")
    auth = (unquote(parsed.username), unquote(parsed.password or "")) if parsed.username else None
    host = "["+parsed.hostname+"]" if ":" in parsed.hostname else parsed.hostname
    clean = urlunsplit((parsed.scheme, host+(":"+str(parsed.port) if parsed.port else ""), parsed.path, "", ""))
    return httpcore.Proxy(clean, auth=auth, ssl_context=ssl.create_default_context() if parsed.scheme == "https" else None)


class ProviderTransport(httpx.AsyncBaseTransport):
    def __init__(self, resolver, base_url, capacity=4, pool=None):
        self.pool = pool or httpcore.AsyncConnectionPool(ssl_context=ssl.create_default_context(),
            proxy=configured_proxy(base_url), max_connections=capacity,
            max_keepalive_connections=capacity, keepalive_expiry=30, retries=0,
            network_backend=ResolverBackend(resolver))
    async def handle_async_request(self, request):
        response = await self.pool.handle_async_request(httpcore.Request(method=request.method,
            url=httpcore.URL(scheme=request.url.raw_scheme, host=request.url.raw_host,
                            port=request.url.port, target=request.url.raw_path),
            headers=request.headers.raw, content=request.stream, extensions=request.extensions))
        # Bound bytes before HTTPX can expand compressed content. Providers are
        # requested with identity encoding; unexpected compression fails closed.
        if any(key.lower() == b"content-encoding" and value.strip().lower() not in (b"", b"identity")
               for key, value in response.headers):
            await response.aclose()
            raise TransportUnavailable("provider content encoding unavailable")
        return httpx.Response(response.status, headers=response.headers,
            stream=LimitedProviderStream(response), extensions=response.extensions)
    async def aclose(self): await self.pool.aclose()
