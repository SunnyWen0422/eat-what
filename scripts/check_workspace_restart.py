"""Probe actual JVM restart against the caller's private loopback test database."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import uuid


def probe(connection, environment, output, root):
    jdbc = environment.get("V4_TEST_JDBC", "")
    if not re.fullmatch(r"jdbc:mysql://127\.0\.0\.1:[0-9]+/eatwhat_v4_test_[a-z0-9]+\?.*", jdbc):
        raise ValueError("Restart probe requires the isolated integration database")
    jar = root / "backend/target/eatwhat-backend-1.0.0.jar"
    if not jar.is_file():
        raise ValueError("Run scripts/verify.ps1 to build the backend jar first")
    java = shutil.which("java")
    if java is None:
        raise ValueError("Java 8 executable is required on PATH")
    workspace_id, task_id = str(uuid.uuid4()), str(uuid.uuid4())
    old_lease = "interrupted-process"
    context = {"date": "2026-10-27", "mealType": "lunch", "people": 2,
               "compositionMode": "auto", "counts": {"meat": 1, "veg": 1},
               "requirements": "", "ownedIngredients": [], "criteria": {}}
    draft = {"planVersion": 0, "dishes": [], "lockedDishIds": [], "history": [],
             "source": "rules", "explanations": []}
    before = {"id": workspace_id, "revision": 0, "context": context, "draft": draft, "status": "empty"}
    after = {**before, "revision": 1, "status": "generating", "taskId": task_id}
    task_input = {"workspace": before, "request": {"command": "generate", "planVersion": 0,
                  "expectedWorkspaceRevision": 0, "requestId": "restart-task"}}
    with connection.cursor() as cursor:
        cursor.execute("INSERT INTO users(id,open_id) VALUES(5,'restart-test')")
        cursor.execute("INSERT INTO meal_workspace(id,user_id,meal_date,meal_type,revision,state_json) VALUES(%s,5,%s,'lunch',1,%s)",
                       (workspace_id, context["date"], json.dumps(after)))
        cursor.execute("INSERT INTO workspace_task(id,workspace_id,user_id,base_revision,status,input_json,lease_token) VALUES(%s,%s,5,1,'running',%s,%s)",
                       (task_id, workspace_id, json.dumps(task_input), old_lease))
    secret = secrets.token_urlsafe(48)
    encoded = base64.urlsafe_b64encode(f"5:{int(time.time()*1000)+600000}".encode()).decode().rstrip("=")
    signature = base64.urlsafe_b64encode(hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    token = encoded + "." + signature
    config = {"spring.datasource.url": jdbc, "spring.datasource.username": "root",
              "spring.datasource.password": environment["V4_TEST_PASSWORD"],
              "security.token.secret": secret, "wechat.miniapp.appid": "test-local",
              "wechat.miniapp.secret": "test-local", "server.address": "127.0.0.1",
              "server.servlet.context-path": "", "meal-workspace.enabled": True,
              "mybatis.configuration.map-underscore-to-camel-case": True,
              "recommend.service.base-url": "http://127.0.0.1:1",
              "logging.level.com.eatwhat.mapper": "WARN"}
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    processes = []
    logs = []

    def start(number):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        config["server.port"] = port
        env = environment.copy()
        env["SPRING_APPLICATION_JSON"] = json.dumps(config)
        log = (output / f"restart-jvm-{number}.log").open("wb")
        logs.append(log)
        process = subprocess.Popen([java, "-jar", str(jar)], cwd=root, env=env,
                                   creationflags=flags, stdout=log, stderr=subprocess.STDOUT)
        processes.append(process)
        return process, port

    def read(port):
        request = Request(f"http://127.0.0.1:{port}/meal-workspaces/current?date={context['date']}&mealType=lunch",
                          headers={"Authorization": "Bearer " + token})
        with urlopen(request, timeout=2) as response:
            return json.load(response)["workspace"]

    def wait(process, port, expected):
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError("Private JVM exited; inspect restart log")
            try:
                value = read(port)
                if value["status"] == expected:
                    return value
            except HTTPError as error:
                if error.code not in (502, 503):
                    raise RuntimeError(f"Restart probe HTTP {error.code}") from None
            except (URLError, TimeoutError):
                pass  # Startup is polled until the bounded deadline; final failure is explicit.
            time.sleep(.1)
        raise RuntimeError(f"Private JVM did not reach {expected}")

    try:
        first, port = start(1)
        waiting = wait(first, port, "generating")
        assert waiting["revision"] == 1
        first.kill()
        first.wait(timeout=10)
        # Advance only the private fixture's lease age, avoiding a 30-second idle wait.
        with connection.cursor() as cursor:
            cursor.execute("UPDATE workspace_task SET updated_at=DATE_SUB(NOW(),INTERVAL 31 SECOND) WHERE id=%s", (task_id,))
        second, port = start(2)
        recovered = wait(second, port, "draft")
        assert recovered["revision"] == 2 and recovered["draft"]["planVersion"] == 1
        assert len(recovered["draft"]["dishes"]) == 2 and recovered["taskId"] is None
        with connection.cursor() as cursor:
            cursor.execute("SELECT status,lease_token FROM workspace_task WHERE id=%s", (task_id,))
            status, lease = cursor.fetchone()
        assert status == "draft" and lease != old_lease
        assert first.pid != second.pid
        report = {"status": "passed", "scope": "two real JVM processes; stale running lease fixture reclaimed after crash",
                  "firstPid": first.pid, "secondPid": second.pid, "revisionBefore": 1,
                  "revisionAfter": recovered["revision"], "draftDishCount": 2,
                  "leaseAgeAdvancedSeconds": 31}
        (output / "restart-evidence.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        return report
    finally:
        for process in processes:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=10)
        for log in logs:
            log.close()
