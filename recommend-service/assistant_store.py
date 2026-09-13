"""Durable, user-scoped storage for the meal-planning assistant.

The recommendation service is intentionally read-only with respect to the
application database.  Assistant conversations therefore live in a small
SQLite sidecar database.  Every operation includes the authenticated scope so
a guessed session id cannot reveal another user's messages or plan drafts.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional


_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


class AssistantStore:
    """A minimal SQLite store with explicit ownership checks on every query."""

    def __init__(self, path: Optional[os.PathLike] = None, retention_days: int = 30):
        default_path = Path(__file__).resolve().parent / "assistant_sessions.sqlite3"
        self.path = Path(path or os.getenv("ASSISTANT_STORE_PATH", default_path))
        self.retention_days = max(1, int(retention_days))
        self._lock = threading.RLock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(str(self.path), timeout=5, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        # SQLite foreign-key enforcement is connection-local.  Enabling it
        # here (not only during initialisation) guarantees deleted/expired
        # sessions also remove their message rows.
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with self._lock, self._connect() as connection:
            connection.execute("PRAGMA foreign_keys = ON")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS assistant_sessions (
                    session_id TEXT PRIMARY KEY,
                    user_scope TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    state_json TEXT NOT NULL DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_assistant_sessions_owner_updated
                    ON assistant_sessions(user_scope, updated_at);
                CREATE TABLE IF NOT EXISTS assistant_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    user_scope TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES assistant_sessions(session_id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_assistant_messages_session
                    ON assistant_messages(session_id, user_scope, id);
                CREATE TABLE IF NOT EXISTS assistant_tasks (
                    task_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    user_scope TEXT NOT NULL,
                    parent_task_id TEXT,
                    idempotency_key TEXT NOT NULL,
                    status TEXT NOT NULL,
                    message TEXT NOT NULL,
                    result_json TEXT NOT NULL DEFAULT '{}',
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    UNIQUE(user_scope, session_id, idempotency_key),
                    FOREIGN KEY(session_id) REFERENCES assistant_sessions(session_id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_assistant_tasks_scope_status
                    ON assistant_tasks(user_scope, session_id, status, updated_at);
                CREATE TABLE IF NOT EXISTS assistant_task_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL,
                    user_scope TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    message TEXT NOT NULL,
                    progress REAL NOT NULL DEFAULT 0,
                    payload_json TEXT NOT NULL DEFAULT '{}',
                    created_at REAL NOT NULL,
                    FOREIGN KEY(task_id) REFERENCES assistant_tasks(task_id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_assistant_task_events_task
                    ON assistant_task_events(task_id, id);
                """
            )

    @staticmethod
    def _scope(value: Optional[str]) -> str:
        scope = str(value or "").strip()
        if not scope:
            raise ValueError("user scope is required")
        return scope[:160]

    @staticmethod
    def _session_id(value: Optional[str]) -> str:
        if value and _SESSION_ID_RE.fullmatch(str(value)):
            return str(value)
        if value:
            raise ValueError("invalid assistant session id")
        return uuid.uuid4().hex

    @staticmethod
    def _decode_state(value: Optional[str]) -> Dict[str, Any]:
        try:
            decoded = json.loads(value or "{}")
            return decoded if isinstance(decoded, dict) else {}
        except (TypeError, ValueError):
            return {}

    def _row_to_session(self, connection: sqlite3.Connection, row: sqlite3.Row) -> Dict[str, Any]:
        messages = connection.execute(
            """
            SELECT role, content, created_at
            FROM assistant_messages
            WHERE session_id = ? AND user_scope = ?
            ORDER BY id ASC
            """,
            (row["session_id"], row["user_scope"]),
        ).fetchall()
        return {
            "session_id": row["session_id"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "state": self._decode_state(row["state_json"]),
            "messages": [
                {"role": message["role"], "content": message["content"], "created_at": message["created_at"]}
                for message in messages
            ],
        }

    def cleanup(self, now: Optional[float] = None) -> int:
        """Remove expired conversations and their messages; return session count."""
        cutoff = (time.time() if now is None else now) - self.retention_days * 24 * 60 * 60
        with self._lock, self._connect() as connection:
            cursor = connection.execute("DELETE FROM assistant_sessions WHERE updated_at < ?", (cutoff,))
            return int(cursor.rowcount or 0)

    def create(self, user_scope: str, session_id: Optional[str] = None, state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        scope = self._scope(user_scope)
        identifier = self._session_id(session_id)
        now = time.time()
        encoded_state = json.dumps(state or {}, ensure_ascii=False, separators=(",", ":"))
        with self._lock, self._connect() as connection:
            self._cleanup_locked(connection, now)
            connection.execute(
                """
                INSERT OR IGNORE INTO assistant_sessions(session_id, user_scope, created_at, updated_at, state_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (identifier, scope, now, now, encoded_state),
            )
            row = connection.execute(
                "SELECT * FROM assistant_sessions WHERE session_id = ? AND user_scope = ?",
                (identifier, scope),
            ).fetchone()
            if row is None:
                # The same opaque id already belongs to another scope. Do not
                # disclose that scope through a different error shape.
                raise ValueError("assistant session id is unavailable")
            return self._row_to_session(connection, row)

    def get(self, session_id: str, user_scope: str) -> Optional[Dict[str, Any]]:
        scope = self._scope(user_scope)
        identifier = self._session_id(session_id)
        with self._lock, self._connect() as connection:
            self._cleanup_locked(connection, time.time())
            row = connection.execute(
                "SELECT * FROM assistant_sessions WHERE session_id = ? AND user_scope = ?",
                (identifier, scope),
            ).fetchone()
            return self._row_to_session(connection, row) if row else None

    def append_message(self, session_id: str, user_scope: str, role: str, content: Optional[str] = None) -> bool:
        scope = self._scope(user_scope)
        identifier = self._session_id(session_id)
        if content is None:
            content = role
            role = "user"
        normalized_role = str(role or "").strip()
        if normalized_role not in {"user", "assistant", "system"}:
            raise ValueError("invalid assistant message role")
        normalized_content = str(content or "").strip()
        if not normalized_content:
            raise ValueError("assistant message content is required")
        now = time.time()
        with self._lock, self._connect() as connection:
            updated = connection.execute(
                "UPDATE assistant_sessions SET updated_at = ? WHERE session_id = ? AND user_scope = ?",
                (now, identifier, scope),
            )
            if updated.rowcount != 1:
                return False
            connection.execute(
                """
                INSERT INTO assistant_messages(session_id, user_scope, role, content, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (identifier, scope, normalized_role, normalized_content[:4000], now),
            )
            return True

    def update_state(self, session_id: str, user_scope: str, state: Dict[str, Any]) -> bool:
        scope = self._scope(user_scope)
        identifier = self._session_id(session_id)
        encoded_state = json.dumps(state or {}, ensure_ascii=False, separators=(",", ":"))
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE assistant_sessions
                SET state_json = ?, updated_at = ?
                WHERE session_id = ? AND user_scope = ?
                """,
                (encoded_state, time.time(), identifier, scope),
            )
            return cursor.rowcount == 1

    def delete(self, session_id: str, user_scope: str) -> bool:
        scope = self._scope(user_scope)
        identifier = self._session_id(session_id)
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                "DELETE FROM assistant_sessions WHERE session_id = ? AND user_scope = ?",
                (identifier, scope),
            )
            return cursor.rowcount == 1

    def _cleanup_locked(self, connection: sqlite3.Connection, now: float) -> None:
        cutoff = now - self.retention_days * 24 * 60 * 60
        connection.execute("DELETE FROM assistant_sessions WHERE updated_at < ?", (cutoff,))

    def create_task(self, session_id: str, user_scope: str, message: str,
                    idempotency_key: str, parent_task_id: Optional[str] = None) -> Dict[str, Any]:
        """Create a task or return the same task for an idempotent retry."""
        scope = self._scope(user_scope)
        session = self._session_id(session_id)
        task_id = "task_" + uuid.uuid4().hex
        now = time.time()
        with self._lock, self._connect() as connection:
            self._cleanup_locked(connection, now)
            owner = connection.execute(
                "SELECT 1 FROM assistant_sessions WHERE session_id = ? AND user_scope = ?",
                (session, scope),
            ).fetchone()
            if owner is None:
                raise ValueError("assistant session not found")
            existing = connection.execute(
                "SELECT * FROM assistant_tasks WHERE session_id = ? AND user_scope = ? AND idempotency_key = ?",
                (session, scope, str(idempotency_key or "")),
            ).fetchone()
            if existing:
                task = self._task_row(connection, existing)
                task["_existing"] = True
                return task
            active = connection.execute(
                "SELECT * FROM assistant_tasks WHERE session_id = ? AND user_scope = ? AND status IN ('queued','understanding','querying','planning','validating') ORDER BY updated_at DESC LIMIT 1",
                (session, scope),
            ).fetchone()
            if active:
                raise RuntimeError("assistant task already in progress")
            connection.execute(
                "INSERT INTO assistant_tasks(task_id, session_id, user_scope, parent_task_id, idempotency_key, status, message, result_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'queued', ?, '{}', ?, ?)",
                (task_id, session, scope, parent_task_id, str(idempotency_key or task_id), str(message or "")[:4000], now, now),
            )
            row = connection.execute("SELECT * FROM assistant_tasks WHERE task_id = ?", (task_id,)).fetchone()
            self._insert_task_event(connection, task_id, scope, "queued", "任务已创建", 0.0, {})
            task = self._task_row(connection, row)
            task["_existing"] = False
            return task

    def _task_row(self, connection: sqlite3.Connection, row: sqlite3.Row) -> Dict[str, Any]:
        events = connection.execute(
            "SELECT stage, message, progress, payload_json, created_at FROM assistant_task_events WHERE task_id = ? AND user_scope = ? ORDER BY id ASC",
            (row["task_id"], row["user_scope"]),
        ).fetchall()
        return {
            "task_id": row["task_id"], "session_id": row["session_id"], "user_scope": row["user_scope"],
            "parent_task_id": row["parent_task_id"], "idempotency_key": row["idempotency_key"],
            "status": row["status"], "message": row["message"],
            "result": self._decode_state(row["result_json"]),
            "created_at": row["created_at"], "updated_at": row["updated_at"],
            "events": [{"stage": item["stage"], "message": item["message"], "progress": item["progress"], "payload": self._decode_state(item["payload_json"]), "created_at": item["created_at"]} for item in events],
        }

    def get_task(self, task_id: str, user_scope: str) -> Optional[Dict[str, Any]]:
        scope = self._scope(user_scope)
        identifier = str(task_id or "")
        with self._lock, self._connect() as connection:
            row = connection.execute("SELECT * FROM assistant_tasks WHERE task_id = ? AND user_scope = ?", (identifier, scope)).fetchone()
            return self._task_row(connection, row) if row else None

    def update_task(self, task_id: str, user_scope: str, status: Optional[str] = None,
                    result: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        scope = self._scope(user_scope)
        now = time.time()
        with self._lock, self._connect() as connection:
            row = connection.execute("SELECT * FROM assistant_tasks WHERE task_id = ? AND user_scope = ?", (str(task_id), scope)).fetchone()
            if not row:
                return None
            next_status = status or row["status"]
            encoded = json.dumps(result if result is not None else self._decode_state(row["result_json"]), ensure_ascii=False, separators=(",", ":"))
            connection.execute("UPDATE assistant_tasks SET status = ?, result_json = ?, updated_at = ? WHERE task_id = ? AND user_scope = ?", (next_status, encoded, now, str(task_id), scope))
            row = connection.execute("SELECT * FROM assistant_tasks WHERE task_id = ? AND user_scope = ?", (str(task_id), scope)).fetchone()
            return self._task_row(connection, row)

    def append_task_event(self, task_id: str, user_scope: str, stage: str, message: str,
                          progress: float = 0.0, payload: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        scope = self._scope(user_scope)
        with self._lock, self._connect() as connection:
            row = connection.execute("SELECT 1 FROM assistant_tasks WHERE task_id = ? AND user_scope = ?", (str(task_id), scope)).fetchone()
            if not row:
                return None
            self._insert_task_event(connection, str(task_id), scope, str(stage), str(message), max(0.0, min(1.0, float(progress))), payload or {})
            return self.get_task(str(task_id), scope)

    @staticmethod
    def _insert_task_event(connection: sqlite3.Connection, task_id: str, scope: str, stage: str, message: str, progress: float, payload: Dict[str, Any]) -> None:
        connection.execute("INSERT INTO assistant_task_events(task_id, user_scope, stage, message, progress, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", (task_id, scope, stage, message[:500], progress, json.dumps(payload, ensure_ascii=False, separators=(",", ":")), time.time()))

    def cancel_task(self, task_id: str, user_scope: str) -> Optional[Dict[str, Any]]:
        task = self.get_task(task_id, user_scope)
        if not task:
            return None
        if task["status"] not in {"completed", "failed", "cancelled"}:
            self.update_task(task_id, user_scope, status="cancelled")
            self.append_task_event(task_id, user_scope, "cancelled", "任务已停止", 1.0)
        return self.get_task(task_id, user_scope)
