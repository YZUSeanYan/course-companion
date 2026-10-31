from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path


class QuotaExceeded(RuntimeError):
    pass


class Database:
    """Stores device credentials and analysis metadata, never learning content."""

    def __init__(self, path: str) -> None:
        self.path = path
        if path != ":memory:":
            Path(path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=5.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS devices (
                    id TEXT PRIMARY KEY,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS daily_usage (
                    device_id TEXT NOT NULL REFERENCES devices(id),
                    usage_date TEXT NOT NULL,
                    analysis_count INTEGER NOT NULL CHECK (analysis_count >= 0),
                    PRIMARY KEY (device_id, usage_date)
                );
                CREATE TABLE IF NOT EXISTS analyses (
                    id TEXT PRIMARY KEY,
                    device_id TEXT NOT NULL REFERENCES devices(id),
                    input_sha256 TEXT NOT NULL,
                    prompt_version TEXT NOT NULL,
                    schema_version TEXT NOT NULL,
                    model TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS lecsync_usage (
                    device_id TEXT NOT NULL REFERENCES devices(id),
                    usage_date TEXT NOT NULL,
                    text_characters INTEGER NOT NULL DEFAULT 0 CHECK (text_characters >= 0),
                    audio_seconds REAL NOT NULL DEFAULT 0 CHECK (audio_seconds >= 0),
                    PRIMARY KEY (device_id, usage_date)
                );
                CREATE TABLE IF NOT EXISTS lecsync_tasks (
                    id TEXT PRIMARY KEY,
                    device_id TEXT NOT NULL REFERENCES devices(id),
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    upstream_request_id TEXT,
                    reserved_seconds REAL NOT NULL DEFAULT 0,
                    actual_seconds REAL NOT NULL DEFAULT 0,
                    settled_seconds REAL NOT NULL DEFAULT 0,
                    usage_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS lecsync_tasks_device
                    ON lecsync_tasks(device_id, created_at);
                CREATE TABLE IF NOT EXISTS lecsync_webhook_secrets (
                    webhook_id TEXT NOT NULL,
                    secret_version TEXT NOT NULL,
                    ciphertext TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (webhook_id, secret_version)
                );
                CREATE TABLE IF NOT EXISTS lecsync_webhook_events (
                    event_id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    received_at TEXT NOT NULL
                );
                """
            )
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(lecsync_tasks)")}
            if "settled_seconds" not in columns:
                connection.execute("ALTER TABLE lecsync_tasks ADD COLUMN settled_seconds REAL NOT NULL DEFAULT 0")

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def reserve_lecsync_text(self, device_id: str, characters: int, limit: int) -> None:
        if characters < 0:
            raise ValueError("characters cannot be negative")
        self._adjust_usage(device_id, text_characters=characters, text_limit=limit)

    def release_lecsync_text(self, device_id: str, characters: int) -> None:
        self._adjust_usage(device_id, text_characters=-characters)

    def reserve_lecsync_audio(self, device_id: str, seconds: float, limit: float) -> None:
        if seconds < 0:
            raise ValueError("seconds cannot be negative")
        self._adjust_usage(device_id, audio_seconds=seconds, audio_limit=limit)

    def settle_lecsync_audio(self, device_id: str, reserved: float, actual: float) -> None:
        self._adjust_usage(device_id, audio_seconds=actual - reserved)

    def _adjust_usage(
        self,
        device_id: str,
        *,
        text_characters: int = 0,
        audio_seconds: float = 0,
        text_limit: int | None = None,
        audio_limit: float | None = None,
    ) -> None:
        usage_date = datetime.now(timezone.utc).date().isoformat()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "INSERT OR IGNORE INTO lecsync_usage(device_id, usage_date) VALUES (?, ?)",
                (device_id, usage_date),
            )
            row = connection.execute(
                "SELECT text_characters, audio_seconds FROM lecsync_usage "
                "WHERE device_id = ? AND usage_date = ?",
                (device_id, usage_date),
            ).fetchone()
            new_text = int(row["text_characters"]) + text_characters
            new_audio = float(row["audio_seconds"]) + audio_seconds
            if new_text < 0 or new_audio < 0:
                raise ValueError("usage adjustment would become negative")
            if text_limit is not None and new_text > text_limit:
                raise QuotaExceeded("Daily text quota exceeded")
            if audio_limit is not None and new_audio > audio_limit:
                raise QuotaExceeded("Daily audio quota exceeded")
            connection.execute(
                "UPDATE lecsync_usage SET text_characters = ?, audio_seconds = ? "
                "WHERE device_id = ? AND usage_date = ?",
                (new_text, new_audio, device_id, usage_date),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def create_lecsync_task(
        self,
        device_id: str,
        task_id: str,
        kind: str,
        *,
        status: str = "accepted",
        upstream_request_id: str | None = None,
        reserved_seconds: float = 0,
    ) -> None:
        now = self._now()
        with self.connect() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO lecsync_tasks(id, device_id, kind, status, upstream_request_id, "
                "reserved_seconds, settled_seconds, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (task_id, device_id, kind, status, upstream_request_id, reserved_seconds, reserved_seconds, now, now),
            )
        if self.own_lecsync_task(device_id, task_id) is None:
            raise PermissionError("The upstream task belongs to another device")

    def own_lecsync_task(self, device_id: str, task_id: str) -> dict | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM lecsync_tasks WHERE id = ? AND device_id = ?",
                (task_id, device_id),
            ).fetchone()
        return None if row is None else dict(row)

    def settle_lecsync_task_audio(self, device_id: str, task_id: str, actual_seconds: float, limit: float | None = None) -> None:
        """Settle only the delta not already reconciled for this task; polling is idempotent."""
        if actual_seconds < 0:
            raise ValueError("actual seconds cannot be negative")
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT reserved_seconds, actual_seconds, settled_seconds FROM lecsync_tasks "
                "WHERE id = ? AND device_id = ?", (task_id, device_id),
            ).fetchone()
            if row is None:
                connection.rollback()
                return
            reported = max(float(row["actual_seconds"]), actual_seconds)
            adjustment = reported - float(row["settled_seconds"])
            connection.execute(
                "UPDATE lecsync_tasks SET actual_seconds = ?, settled_seconds = ?, updated_at = ? "
                "WHERE id = ? AND device_id = ?",
                (reported, reported, self._now(), task_id, device_id),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
        if adjustment:
            self._adjust_usage(device_id, audio_seconds=adjustment, audio_limit=limit)

    def update_lecsync_task(
        self,
        device_id: str,
        task_id: str,
        *,
        status: str,
        upstream_request_id: str | None = None,
        actual_seconds: float | None = None,
        usage: dict | None = None,
    ) -> None:
        import json

        current = self.own_lecsync_task(device_id, task_id)
        if current is None:
            return
        seconds = current["actual_seconds"] if actual_seconds is None else actual_seconds
        with self.connect() as connection:
            connection.execute(
                "UPDATE lecsync_tasks SET status = ?, upstream_request_id = ?, actual_seconds = ?, "
                "usage_json = ?, updated_at = ? WHERE id = ? AND device_id = ?",
                (
                    status,
                    upstream_request_id or current["upstream_request_id"],
                    seconds,
                    json.dumps(usage or {}, separators=(",", ":")),
                    self._now(),
                    task_id,
                    device_id,
                ),
            )

    def save_webhook_secret(self, webhook_id: str, version: str, ciphertext: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO lecsync_webhook_secrets(webhook_id, secret_version, ciphertext, created_at) "
                "VALUES (?, ?, ?, ?)", (webhook_id, version, ciphertext, self._now()),
            )

    def webhook_secret(self, version: str) -> str | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT ciphertext FROM lecsync_webhook_secrets WHERE secret_version = ?", (version,),
            ).fetchone()
        return None if row is None else str(row["ciphertext"])

    def record_lecsync_webhook(self, event_id: str, job_id: str, status: str) -> bool:
        if not event_id:
            return False
        with self.connect() as connection:
            cursor = connection.execute(
                "INSERT OR IGNORE INTO lecsync_webhook_events(event_id, job_id, status, received_at) "
                "VALUES (?, ?, ?, ?)",
                (event_id, job_id, status, self._now()),
            )
            return cursor.rowcount == 1

    def create_device(self, token_hash: str) -> str:
        device_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO devices (id, token_hash, created_at) VALUES (?, ?, ?)",
                (device_id, token_hash, now),
            )
        return device_id

    def find_device_by_token_hash(self, token_hash: str) -> str | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT id FROM devices WHERE token_hash = ?", (token_hash,)
            ).fetchone()
        return None if row is None else str(row["id"])

    def reserve_analysis(self, device_id: str, daily_quota: int) -> str:
        analysis_id = str(uuid.uuid4())
        usage_date = datetime.now(timezone.utc).date().isoformat()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT analysis_count FROM daily_usage "
                "WHERE device_id = ? AND usage_date = ?",
                (device_id, usage_date),
            ).fetchone()
            count = 0 if row is None else int(row["analysis_count"])
            if count >= daily_quota:
                raise QuotaExceeded
            connection.execute(
                """
                INSERT INTO daily_usage (device_id, usage_date, analysis_count)
                VALUES (?, ?, 1)
                ON CONFLICT(device_id, usage_date) DO UPDATE SET
                    analysis_count = analysis_count + 1
                """,
                (device_id, usage_date),
            )
            connection.commit()
            return analysis_id
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def release_analysis(self, device_id: str) -> None:
        usage_date = datetime.now(timezone.utc).date().isoformat()
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE daily_usage
                SET analysis_count = analysis_count - 1
                WHERE device_id = ? AND usage_date = ? AND analysis_count > 0
                """,
                (device_id, usage_date),
            )

    def record_analysis(
        self,
        analysis_id: str,
        device_id: str,
        input_sha256: str,
        prompt_version: str,
        schema_version: str,
        model: str,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO analyses (
                    id, device_id, input_sha256, prompt_version,
                    schema_version, model, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    analysis_id,
                    device_id,
                    input_sha256,
                    prompt_version,
                    schema_version,
                    model,
                    now,
                ),
            )
