from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

APP_CONFIG_KEY = "app_config"


class QuotaExceeded(RuntimeError):
    def __init__(
        self,
        message: str = "Daily quota exceeded",
        *,
        scope: str = "",
        limit: float | None = None,
        used: float | None = None,
    ) -> None:
        super().__init__(message)
        self.scope = scope
        self.limit = limit
        self.used = used


class AccountError(RuntimeError):
    code = "account_error"
    status_code = 403

    def __init__(self, message: str) -> None:
        super().__init__(message)


class AccountRequired(AccountError):
    code = "account_required"

    def __init__(self) -> None:
        # 网页版与 App 共用这段文案：不指向任何单一客户端，避免浏览器用户被要求「去 App」。
        super().__init__("需要先激活试用额度：在「设置 → 试用额度」用手机号激活即可")


class AccountDisabled(AccountError):
    code = "account_disabled"

    def __init__(self) -> None:
        super().__init__("试用账号已停用，请联系管理员")


class AccountExpired(AccountError):
    code = "account_expired"

    def __init__(self, valid_until: str) -> None:
        super().__init__(f"试用额度已到期（{valid_until}），请联系管理员续期")


class DeviceLimitReached(AccountError):
    code = "device_limit_reached"

    def __init__(self, limit: int) -> None:
        super().__init__(f"该手机号最多绑定 {limit} 台设备，请联系管理员解绑")


class DeviceBoundElsewhere(AccountError):
    code = "device_bound_elsewhere"
    status_code = 409

    def __init__(self) -> None:
        super().__init__("该设备已绑定其他手机号，请联系管理员解绑后再试")


class Database:
    """Stores credentials, metadata, and job outcomes, never request content."""

    def __init__(self, path: str, usage_timezone: str = "Asia/Shanghai") -> None:
        self.path = path
        self.timezone = ZoneInfo(usage_timezone)
        if path != ":memory:":
            Path(path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=5.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def today(self) -> str:
        return datetime.now(self.timezone).date().isoformat()

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
                CREATE TABLE IF NOT EXISTS learning_pack_jobs (
                    id TEXT PRIMARY KEY,
                    device_id TEXT NOT NULL REFERENCES devices(id),
                    input_sha256 TEXT NOT NULL,
                    status TEXT NOT NULL CHECK (
                        status IN ('queued', 'processing', 'succeeded', 'failed')
                    ),
                    result_json TEXT,
                    error_code TEXT,
                    error_message TEXT,
                    model TEXT,
                    analysis_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS learning_pack_jobs_device_input
                    ON learning_pack_jobs(device_id, input_sha256, status, updated_at);
                CREATE TABLE IF NOT EXISTS access_accounts (
                    id TEXT PRIMARY KEY,
                    phone_hash TEXT NOT NULL UNIQUE,
                    phone_ciphertext TEXT NOT NULL,
                    display_name TEXT NOT NULL DEFAULT '',
                    note TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
                    valid_until TEXT,
                    ai_pack_daily_limit INTEGER NOT NULL DEFAULT 5 CHECK (ai_pack_daily_limit >= 0),
                    audio_minutes_daily_limit INTEGER NOT NULL DEFAULT 60 CHECK (audio_minutes_daily_limit >= 0),
                    text_chars_daily_limit INTEGER NOT NULL DEFAULT 20000 CHECK (text_chars_daily_limit >= 0),
                    document_daily_limit INTEGER NOT NULL DEFAULT 5 CHECK (document_daily_limit >= 0),
                    max_devices INTEGER NOT NULL DEFAULT 3 CHECK (max_devices >= 0),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS access_accounts_status
                    ON access_accounts(status, valid_until);
                CREATE TABLE IF NOT EXISTS account_devices (
                    account_id TEXT NOT NULL REFERENCES access_accounts(id) ON DELETE CASCADE,
                    device_id TEXT NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
                    activated_at TEXT NOT NULL,
                    last_seen_at TEXT,
                    PRIMARY KEY (account_id, device_id)
                );
                CREATE INDEX IF NOT EXISTS account_devices_account
                    ON account_devices(account_id);
                CREATE TABLE IF NOT EXISTS account_daily_usage (
                    account_id TEXT NOT NULL REFERENCES access_accounts(id) ON DELETE CASCADE,
                    usage_date TEXT NOT NULL,
                    analysis_count INTEGER NOT NULL DEFAULT 0 CHECK (analysis_count >= 0),
                    document_count INTEGER NOT NULL DEFAULT 0 CHECK (document_count >= 0),
                    PRIMARY KEY (account_id, usage_date)
                );
                CREATE TABLE IF NOT EXISTS account_lecsync_usage (
                    account_id TEXT NOT NULL REFERENCES access_accounts(id) ON DELETE CASCADE,
                    usage_date TEXT NOT NULL,
                    text_characters INTEGER NOT NULL DEFAULT 0 CHECK (text_characters >= 0),
                    audio_seconds REAL NOT NULL DEFAULT 0 CHECK (audio_seconds >= 0),
                    PRIMARY KEY (account_id, usage_date)
                );
                CREATE TABLE IF NOT EXISTS api_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_id TEXT,
                    account_id TEXT,
                    method TEXT NOT NULL,
                    route TEXT NOT NULL,
                    status INTEGER NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS api_requests_created ON api_requests(created_at);
                CREATE INDEX IF NOT EXISTS api_requests_account ON api_requests(account_id, created_at);
                CREATE INDEX IF NOT EXISTS api_requests_device ON api_requests(device_id, created_at);
                CREATE TABLE IF NOT EXISTS sms_verification_codes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone_hash TEXT NOT NULL,
                    code_hash TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
                    consumed_at TEXT,
                    request_ip_hash TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS sms_verification_codes_phone
                    ON sms_verification_codes(phone_hash, created_at);
                CREATE TABLE IF NOT EXISTS trial_applications (
                    id TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL,
                    phone_hash TEXT NOT NULL,
                    request_ip_hash TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS trial_applications_phone
                    ON trial_applications(phone_hash, created_at);
                CREATE TABLE IF NOT EXISTS activation_codes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone_hash TEXT NOT NULL,
                    code_hash TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
                    consumed_at TEXT,
                    request_ip_hash TEXT,
                    device_id TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS activation_codes_phone
                    ON activation_codes(phone_hash, created_at);
                CREATE TABLE IF NOT EXISTS sync_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id TEXT NOT NULL,
                    entity TEXT NOT NULL,
                    client_uid TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    client_updated_at INTEGER NOT NULL,
                    deleted INTEGER NOT NULL DEFAULT 0,
                    server_updated_at TEXT NOT NULL,
                    UNIQUE(account_id, entity, client_uid)
                );
                CREATE INDEX IF NOT EXISTS sync_records_account_entity
                    ON sync_records(account_id, entity);
                CREATE TABLE IF NOT EXISTS app_config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS document_access (
                    document_id TEXT NOT NULL,
                    owner_key TEXT NOT NULL,
                    PRIMARY KEY (document_id, owner_key)
                );
                """
            )
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(lecsync_tasks)")}
            if "settled_seconds" not in columns:
                connection.execute("ALTER TABLE lecsync_tasks ADD COLUMN settled_seconds REAL NOT NULL DEFAULT 0")
            if "account_id" not in columns:
                connection.execute("ALTER TABLE lecsync_tasks ADD COLUMN account_id TEXT")
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(learning_pack_jobs)")}
            if "account_id" not in columns:
                connection.execute("ALTER TABLE learning_pack_jobs ADD COLUMN account_id TEXT")
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(daily_usage)")}
            if "document_count" not in columns:
                connection.execute("ALTER TABLE daily_usage ADD COLUMN document_count INTEGER NOT NULL DEFAULT 0")

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def reserve_lecsync_text(
        self, device_id: str, characters: int, limit: int, account_id: str | None = None
    ) -> None:
        if characters < 0:
            raise ValueError("characters cannot be negative")
        if account_id:
            self._adjust_account_usage(account_id, text_characters=characters, text_limit=limit)
        else:
            self._adjust_usage(device_id, text_characters=characters, text_limit=limit)

    def release_lecsync_text(
        self, device_id: str, characters: int, account_id: str | None = None
    ) -> None:
        if account_id:
            self._adjust_account_usage(account_id, text_characters=-characters)
        else:
            self._adjust_usage(device_id, text_characters=-characters)

    def reserve_lecsync_audio(
        self, device_id: str, seconds: float, limit: float, account_id: str | None = None
    ) -> None:
        if seconds < 0:
            raise ValueError("seconds cannot be negative")
        if account_id:
            self._adjust_account_usage(account_id, audio_seconds=seconds, audio_limit=limit)
        else:
            self._adjust_usage(device_id, audio_seconds=seconds, audio_limit=limit)

    def settle_lecsync_audio(
        self,
        device_id: str,
        reserved: float,
        actual: float,
        account_id: str | None = None,
    ) -> None:
        if account_id is None:
            account = self.account_for_device(device_id)
            account_id = None if account is None else str(account["id"])
        if account_id:
            self._adjust_account_usage(account_id, audio_seconds=actual - reserved)
        else:
            self._adjust_usage(device_id, audio_seconds=actual - reserved)

    def _adjust_usage(
        self,
        device_id: str,
        *,
        text_characters: int = 0,
        audio_seconds: float = 0,
        text_limit: int | None = None,
        audio_limit: float | None = None,
        record_overage: bool = False,
    ) -> None:
        usage_date = self.today()
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
            exceeded = self._overage(new_text, new_audio, text_limit, audio_limit)
            if exceeded is not None and not record_overage:
                raise exceeded
            connection.execute(
                "UPDATE lecsync_usage SET text_characters = ?, audio_seconds = ? "
                "WHERE device_id = ? AND usage_date = ?",
                (new_text, new_audio, device_id, usage_date),
            )
            connection.commit()
            if exceeded is not None:
                raise exceeded
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _adjust_account_usage(
        self,
        account_id: str,
        *,
        text_characters: int = 0,
        audio_seconds: float = 0,
        text_limit: int | None = None,
        audio_limit: float | None = None,
        record_overage: bool = False,
    ) -> None:
        usage_date = self.today()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "INSERT OR IGNORE INTO account_lecsync_usage(account_id, usage_date) VALUES (?, ?)",
                (account_id, usage_date),
            )
            row = connection.execute(
                "SELECT text_characters, audio_seconds FROM account_lecsync_usage "
                "WHERE account_id = ? AND usage_date = ?",
                (account_id, usage_date),
            ).fetchone()
            new_text = int(row["text_characters"]) + text_characters
            new_audio = float(row["audio_seconds"]) + audio_seconds
            if new_text < 0 or new_audio < 0:
                raise ValueError("usage adjustment would become negative")
            exceeded = self._overage(new_text, new_audio, text_limit, audio_limit)
            if exceeded is not None and not record_overage:
                raise exceeded
            connection.execute(
                "UPDATE account_lecsync_usage SET text_characters = ?, audio_seconds = ? "
                "WHERE account_id = ? AND usage_date = ?",
                (new_text, new_audio, account_id, usage_date),
            )
            connection.commit()
            if exceeded is not None:
                raise exceeded
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def _overage(
        text_used: int,
        audio_used: float,
        text_limit: int | None,
        audio_limit: float | None,
    ) -> QuotaExceeded | None:
        if text_limit is not None and text_used > text_limit:
            return QuotaExceeded(
                "Daily text quota exceeded",
                scope="text",
                limit=text_limit,
                used=text_used,
            )
        if audio_limit is not None and audio_used > audio_limit:
            return QuotaExceeded(
                "Daily audio quota exceeded",
                scope="audio",
                limit=audio_limit,
                used=audio_used,
            )
        return None

    def create_lecsync_task(
        self,
        device_id: str,
        task_id: str,
        kind: str,
        *,
        status: str = "accepted",
        upstream_request_id: str | None = None,
        reserved_seconds: float = 0,
        account_id: str | None = None,
    ) -> None:
        if account_id is None:
            account = self.account_for_device(device_id)
            account_id = None if account is None else str(account["id"])
        now = self._now()
        with self.connect() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO lecsync_tasks(id, device_id, kind, status, upstream_request_id, "
                "reserved_seconds, settled_seconds, account_id, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    task_id,
                    device_id,
                    kind,
                    status,
                    upstream_request_id,
                    reserved_seconds,
                    reserved_seconds,
                    account_id,
                    now,
                    now,
                ),
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
        account_id: str | None = None
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT reserved_seconds, actual_seconds, settled_seconds, account_id FROM lecsync_tasks "
                "WHERE id = ? AND device_id = ?", (task_id, device_id),
            ).fetchone()
            if row is None:
                connection.rollback()
                return
            account_id = row["account_id"]
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
            # Always record overage so the next request is blocked and the dashboard is truthful.
            if account_id:
                self._adjust_account_usage(
                    account_id,
                    audio_seconds=adjustment,
                    audio_limit=limit,
                    record_overage=True,
                )
            else:
                self._adjust_usage(
                    device_id,
                    audio_seconds=adjustment,
                    audio_limit=limit,
                    record_overage=True,
                )

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

    def reserve_analysis(
        self, device_id: str, daily_quota: int, account_id: str | None = None
    ) -> str:
        analysis_id = str(uuid.uuid4())
        usage_date = self.today()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            if account_id:
                row = connection.execute(
                    "SELECT analysis_count FROM account_daily_usage "
                    "WHERE account_id = ? AND usage_date = ?",
                    (account_id, usage_date),
                ).fetchone()
            else:
                row = connection.execute(
                    "SELECT analysis_count FROM daily_usage "
                    "WHERE device_id = ? AND usage_date = ?",
                    (device_id, usage_date),
                ).fetchone()
            count = 0 if row is None else int(row["analysis_count"])
            if count >= daily_quota:
                raise QuotaExceeded(
                    "Daily analysis quota exceeded",
                    scope="ai_pack",
                    limit=daily_quota,
                    used=count,
                )
            if account_id:
                connection.execute(
                    """
                    INSERT INTO account_daily_usage (account_id, usage_date, analysis_count)
                    VALUES (?, ?, 1)
                    ON CONFLICT(account_id, usage_date) DO UPDATE SET
                        analysis_count = analysis_count + 1
                    """,
                    (account_id, usage_date),
                )
            else:
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

    def release_analysis(self, device_id: str, account_id: str | None = None) -> None:
        usage_date = self.today()
        with self.connect() as connection:
            if account_id:
                connection.execute(
                    """
                    UPDATE account_daily_usage
                    SET analysis_count = analysis_count - 1
                    WHERE account_id = ? AND usage_date = ? AND analysis_count > 0
                    """,
                    (account_id, usage_date),
                )
            else:
                connection.execute(
                    """
                    UPDATE daily_usage
                    SET analysis_count = analysis_count - 1
                    WHERE device_id = ? AND usage_date = ? AND analysis_count > 0
                    """,
                    (device_id, usage_date),
                )


    def grant_document_access(self, document_id: str, owner_key: str) -> None:
        with self.connect() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO document_access (document_id, owner_key) VALUES (?, ?)",
                (document_id, owner_key),
            )

    def has_document_access(self, document_id: str, owner_key: str) -> bool:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT 1 FROM document_access WHERE document_id = ? AND owner_key = ?",
                (document_id, owner_key),
            ).fetchone()
        return row is not None

    def reserve_document(
        self, device_id: str, daily_quota: int, account_id: str | None = None
    ) -> None:
        usage_date = self.today()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            if account_id:
                row = connection.execute(
                    "SELECT document_count FROM account_daily_usage "
                    "WHERE account_id = ? AND usage_date = ?",
                    (account_id, usage_date),
                ).fetchone()
            else:
                row = connection.execute(
                    "SELECT document_count FROM daily_usage "
                    "WHERE device_id = ? AND usage_date = ?",
                    (device_id, usage_date),
                ).fetchone()
            count = 0 if row is None else int(row["document_count"])
            if count >= daily_quota:
                raise QuotaExceeded(
                    "Daily document quota exceeded",
                    scope="document",
                    limit=daily_quota,
                    used=count,
                )
            if account_id:
                connection.execute(
                    """
                    INSERT INTO account_daily_usage (account_id, usage_date, analysis_count, document_count)
                    VALUES (?, ?, 0, 1)
                    ON CONFLICT(account_id, usage_date) DO UPDATE SET
                        document_count = document_count + 1
                    """,
                    (account_id, usage_date),
                )
            else:
                connection.execute(
                    """
                    INSERT INTO daily_usage (device_id, usage_date, analysis_count, document_count)
                    VALUES (?, ?, 0, 1)
                    ON CONFLICT(device_id, usage_date) DO UPDATE SET
                        document_count = document_count + 1
                    """,
                    (device_id, usage_date),
                )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def release_document(self, device_id: str, account_id: str | None = None) -> None:
        usage_date = self.today()
        with self.connect() as connection:
            if account_id:
                connection.execute(
                    """
                    UPDATE account_daily_usage
                    SET document_count = document_count - 1
                    WHERE account_id = ? AND usage_date = ? AND document_count > 0
                    """,
                    (account_id, usage_date),
                )
            else:
                connection.execute(
                    """
                    UPDATE daily_usage
                    SET document_count = document_count - 1
                    WHERE device_id = ? AND usage_date = ? AND document_count > 0
                    """,
                    (device_id, usage_date),
                )

    def create_account(
        self,
        *,
        phone_hash: str,
        phone_ciphertext: str,
        display_name: str = "",
        note: str = "",
        valid_until: str | None = None,
        ai_pack_daily_limit: int,
        audio_minutes_daily_limit: int,
        text_chars_daily_limit: int,
        document_daily_limit: int,
        max_devices: int,
    ) -> dict:
        account_id = str(uuid.uuid4())
        now = self._now()
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO access_accounts(
                    id, phone_hash, phone_ciphertext, display_name, note, status, valid_until,
                    ai_pack_daily_limit, audio_minutes_daily_limit, text_chars_daily_limit,
                    document_daily_limit, max_devices, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    account_id,
                    phone_hash,
                    phone_ciphertext,
                    display_name,
                    note,
                    valid_until,
                    ai_pack_daily_limit,
                    audio_minutes_daily_limit,
                    text_chars_daily_limit,
                    document_daily_limit,
                    max_devices,
                    now,
                    now,
                ),
            )
        account = self.account_by_id(account_id)
        if account is None:
            raise RuntimeError("Account creation failed")
        return account

    def update_account(self, account_id: str, fields: dict) -> dict | None:
        allowed = {
            "phone_hash",
            "phone_ciphertext",
            "display_name",
            "note",
            "status",
            "valid_until",
            "ai_pack_daily_limit",
            "audio_minutes_daily_limit",
            "text_chars_daily_limit",
            "document_daily_limit",
            "max_devices",
        }
        updates = {key: value for key, value in fields.items() if key in allowed}
        if not updates:
            return self.account_by_id(account_id)
        updates["updated_at"] = self._now()
        assignments = ", ".join(f"{key} = ?" for key in updates)
        with self.connect() as connection:
            connection.execute(
                f"UPDATE access_accounts SET {assignments} WHERE id = ?",
                (*updates.values(), account_id),
            )
        return self.account_by_id(account_id)

    def delete_account(self, account_id: str) -> bool:
        with self.connect() as connection:
            connection.execute(
                "UPDATE api_requests SET account_id = NULL WHERE account_id = ?",
                (account_id,),
            )
            cursor = connection.execute(
                "DELETE FROM access_accounts WHERE id = ?", (account_id,)
            )
            return cursor.rowcount == 1

    def account_by_id(self, account_id: str) -> dict | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM access_accounts WHERE id = ?", (account_id,)
            ).fetchone()
        return None if row is None else dict(row)

    def account_by_phone_hash(self, phone_hash: str) -> dict | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM access_accounts WHERE phone_hash = ?", (phone_hash,)
            ).fetchone()
        return None if row is None else dict(row)

    def account_for_device(self, device_id: str) -> dict | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT a.* FROM access_accounts a
                INNER JOIN account_devices d ON d.account_id = a.id
                WHERE d.device_id = ?
                """,
                (device_id,),
            ).fetchone()
        return None if row is None else dict(row)

    def account_devices(self, account_id: str) -> list[dict]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT ad.device_id, ad.activated_at,
                       COALESCE(
                           (SELECT MAX(r.created_at) FROM api_requests r
                            WHERE r.device_id = ad.device_id),
                           ad.last_seen_at
                       ) AS last_seen_at
                FROM account_devices ad
                WHERE ad.account_id = ?
                ORDER BY ad.activated_at ASC
                """,
                (account_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def bind_device(self, account_id: str, device_id: str, max_devices: int) -> None:
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT account_id FROM account_devices WHERE device_id = ?",
                (device_id,),
            ).fetchone()
            if existing is not None and existing["account_id"] != account_id:
                raise DeviceBoundElsewhere()
            if existing is None:
                if max_devices > 0:
                    count = connection.execute(
                        "SELECT COUNT(*) AS total FROM account_devices WHERE account_id = ?",
                        (account_id,),
                    ).fetchone()["total"]
                    if int(count) >= max_devices:
                        raise DeviceLimitReached(max_devices)
                connection.execute(
                    "INSERT INTO account_devices(account_id, device_id, activated_at) VALUES (?, ?, ?)",
                    (account_id, device_id, self._now()),
                )
            connection.execute(
                """
                INSERT OR IGNORE INTO document_access (document_id, owner_key)
                SELECT document_id, ? FROM document_access WHERE owner_key = ?
                """,
                (f"account:{account_id}", f"device:{device_id}"),
            )
            connection.execute(
                "DELETE FROM document_access WHERE owner_key = ?",
                (f"device:{device_id}",),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def unbind_device(self, account_id: str, device_id: str) -> bool:
        with self.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM account_devices WHERE account_id = ? AND device_id = ?",
                (account_id, device_id),
            )
            return cursor.rowcount == 1

    def unbind_all_devices(self, account_id: str) -> int:
        with self.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM account_devices WHERE account_id = ?", (account_id,)
            )
            return cursor.rowcount

    def account_usage_today(self, account_id: str | None, usage_date: str) -> dict:
        if account_id is None:
            return {
                "date": usage_date,
                "aiPacks": 0,
                "audioMinutes": 0.0,
                "textCharacters": 0,
                "documents": 0,
            }
        with self.connect() as connection:
            daily = connection.execute(
                "SELECT analysis_count, document_count FROM account_daily_usage "
                "WHERE account_id = ? AND usage_date = ?",
                (account_id, usage_date),
            ).fetchone()
            lecsync = connection.execute(
                "SELECT text_characters, audio_seconds FROM account_lecsync_usage "
                "WHERE account_id = ? AND usage_date = ?",
                (account_id, usage_date),
            ).fetchone()
        return {
            "date": usage_date,
            "aiPacks": 0 if daily is None else int(daily["analysis_count"]),
            "documents": 0 if daily is None else int(daily["document_count"]),
            "textCharacters": 0 if lecsync is None else int(lecsync["text_characters"]),
            "audioMinutes": 0.0 if lecsync is None else round(float(lecsync["audio_seconds"]) / 60.0, 1),
        }

    def create_sms_code(
        self,
        phone_hash: str,
        code_hash: str,
        expires_at: str,
        request_ip_hash: str | None,
    ) -> int:
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO sms_verification_codes(
                    phone_hash, code_hash, expires_at, request_ip_hash, created_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (phone_hash, code_hash, expires_at, request_ip_hash, self._now()),
            )
            return int(cursor.lastrowid)

    def last_sms_code_created_at(self, phone_hash: str) -> str | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT created_at FROM sms_verification_codes "
                "WHERE phone_hash = ? ORDER BY id DESC LIMIT 1",
                (phone_hash,),
            ).fetchone()
        return None if row is None else str(row["created_at"])

    def check_sms_code(
        self,
        phone_hash: str,
        code_hash: str,
        max_attempts: int,
    ) -> tuple[str, dict | None]:
        """Atomically consume a matching code and count failed attempts."""
        import hmac

        now = self._now()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                """
                SELECT * FROM sms_verification_codes
                WHERE phone_hash = ? ORDER BY id DESC LIMIT 1
                """,
                (phone_hash,),
            ).fetchone()
            if row is None:
                connection.commit()
                return "not_found", None
            current = dict(row)
            if current["consumed_at"] is not None:
                connection.commit()
                return "consumed", current
            if str(current["expires_at"]) < now:
                connection.commit()
                return "expired", current
            if int(current["attempts"]) >= max_attempts:
                connection.commit()
                return "attempts_exhausted", current
            if not hmac.compare_digest(str(current["code_hash"]), code_hash):
                connection.execute(
                    "UPDATE sms_verification_codes SET attempts = attempts + 1 WHERE id = ?",
                    (current["id"],),
                )
                connection.commit()
                return "mismatch", current
            connection.execute(
                "UPDATE sms_verification_codes SET consumed_at = ? WHERE id = ?",
                (now, current["id"]),
            )
            connection.commit()
            return "ok", current
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def invalidate_sms_code(self, code_id: int) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE sms_verification_codes SET consumed_at = ? "
                "WHERE id = ? AND consumed_at IS NULL",
                (self._now(), code_id),
            )

    def create_activation_code(
        self,
        phone_hash: str,
        code_hash: str,
        expires_at: str,
        request_ip_hash: str | None,
        device_id: str | None,
    ) -> int:
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO activation_codes(
                    phone_hash, code_hash, expires_at, request_ip_hash, device_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (phone_hash, code_hash, expires_at, request_ip_hash, device_id, self._now()),
            )
            return int(cursor.lastrowid)

    def last_activation_code_created_at(self, phone_hash: str) -> str | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT created_at FROM activation_codes "
                "WHERE phone_hash = ? ORDER BY id DESC LIMIT 1",
                (phone_hash,),
            ).fetchone()
        return None if row is None else str(row["created_at"])

    def check_activation_code(
        self,
        phone_hash: str,
        code_hash: str,
        max_attempts: int,
    ) -> tuple[str, dict | None]:
        """Atomically consume a matching activation code and count failed attempts."""
        import hmac

        now = self._now()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                """
                SELECT * FROM activation_codes
                WHERE phone_hash = ? ORDER BY id DESC LIMIT 1
                """,
                (phone_hash,),
            ).fetchone()
            if row is None:
                connection.commit()
                return "not_found", None
            current = dict(row)
            if current["consumed_at"] is not None:
                connection.commit()
                return "consumed", current
            if str(current["expires_at"]) < now:
                connection.commit()
                return "expired", current
            if int(current["attempts"]) >= max_attempts:
                connection.commit()
                return "attempts_exhausted", current
            if not hmac.compare_digest(str(current["code_hash"]), code_hash):
                connection.execute(
                    "UPDATE activation_codes SET attempts = attempts + 1 WHERE id = ?",
                    (current["id"],),
                )
                connection.commit()
                return "mismatch", current
            connection.execute(
                "UPDATE activation_codes SET consumed_at = ? WHERE id = ?",
                (now, current["id"]),
            )
            connection.commit()
            return "ok", current
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def invalidate_activation_code(self, code_id: int) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE activation_codes SET consumed_at = ? "
                "WHERE id = ? AND consumed_at IS NULL",
                (self._now(), code_id),
            )

    def record_trial_application(
        self,
        application_id: str,
        account_id: str,
        phone_hash: str,
        request_ip_hash: str | None,
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO trial_applications(
                    id, account_id, phone_hash, request_ip_hash, created_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    application_id,
                    account_id,
                    phone_hash,
                    request_ip_hash,
                    self._now(),
                ),
            )

    def upsert_sync_records(self, account_id: str, changes: list[dict]) -> list[bool]:
        """Apply last-write-wins upserts; returns one accepted flag per change, in order.

        Each change dict carries entity, client_uid, payload (serialized JSON text),
        client_updated_at (epoch millis) and deleted. A change is ignored when the
        stored row already has client_updated_at >= the incoming value.
        """
        now = self._now()
        connection = self.connect()
        results: list[bool] = []
        try:
            connection.execute("BEGIN IMMEDIATE")
            for change in changes:
                entity = str(change["entity"])
                client_uid = str(change["client_uid"])
                client_updated_at = int(change["client_updated_at"])
                row = connection.execute(
                    "SELECT client_updated_at FROM sync_records "
                    "WHERE account_id = ? AND entity = ? AND client_uid = ?",
                    (account_id, entity, client_uid),
                ).fetchone()
                if row is not None and int(row["client_updated_at"]) >= client_updated_at:
                    results.append(False)
                    continue
                connection.execute(
                    """
                    INSERT INTO sync_records(
                        account_id, entity, client_uid, payload,
                        client_updated_at, deleted, server_updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(account_id, entity, client_uid) DO UPDATE SET
                        payload = excluded.payload,
                        client_updated_at = excluded.client_updated_at,
                        deleted = excluded.deleted,
                        server_updated_at = excluded.server_updated_at
                    """,
                    (
                        account_id,
                        entity,
                        client_uid,
                        str(change["payload"]),
                        client_updated_at,
                        1 if change["deleted"] else 0,
                        now,
                    ),
                )
                results.append(True)
            connection.commit()
            return results
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def list_sync_records(self, account_id: str, entities: list[str]) -> list[dict]:
        query = (
            "SELECT entity, client_uid, payload, client_updated_at, deleted "
            "FROM sync_records WHERE account_id = ?"
        )
        params: list[object] = [account_id]
        if entities:
            placeholders = ", ".join("?" for _ in entities)
            query += f" AND entity IN ({placeholders})"
            params.extend(entities)
        query += " ORDER BY id ASC"
        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def list_accounts(self) -> list[dict]:
        today = self.today()
        week_ago = self._since_utc(7)
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT a.*,
                       (SELECT COUNT(*) FROM account_devices d WHERE d.account_id = a.id) AS device_count,
                       COALESCE(u.analysis_count, 0) AS today_ai_packs,
                       COALESCE(u.document_count, 0) AS today_documents,
                       COALESCE(l.text_characters, 0) AS today_text_characters,
                       COALESCE(l.audio_seconds, 0) AS today_audio_seconds,
                       (SELECT MAX(r.created_at) FROM api_requests r
                        WHERE r.account_id = a.id) AS last_active_at,
                       (SELECT COUNT(*) FROM api_requests r
                        WHERE r.account_id = a.id AND r.created_at >= ?) AS requests_7d,
                       (SELECT COUNT(*) FROM api_requests r
                        WHERE r.account_id = a.id AND r.created_at >= ?
                          AND r.status >= 400) AS errors_7d
                FROM access_accounts a
                LEFT JOIN account_daily_usage u
                    ON u.account_id = a.id AND u.usage_date = ?
                LEFT JOIN account_lecsync_usage l
                    ON l.account_id = a.id AND l.usage_date = ?
                ORDER BY a.created_at DESC
                """,
                (week_ago, week_ago, today, today),
            ).fetchall()
        return [dict(row) for row in rows]

    def list_devices(
        self,
        limit: int = 200,
        *,
        account_id: str | None = None,
        unbound_only: bool = False,
    ) -> list[dict]:
        with self.connect() as connection:
            if account_id is not None:
                rows = connection.execute(
                    """
                    SELECT d.id, d.created_at,
                           ad.account_id, ad.activated_at,
                           a.phone_ciphertext, a.display_name,
                           (SELECT MAX(r.created_at) FROM api_requests r
                            WHERE r.device_id = d.id) AS last_seen_at,
                           (SELECT COUNT(*) FROM api_requests r
                            WHERE r.device_id = d.id) AS request_count
                    FROM devices d
                    LEFT JOIN account_devices ad ON ad.device_id = d.id
                    LEFT JOIN access_accounts a ON a.id = ad.account_id
                    WHERE ad.account_id = ?
                    ORDER BY d.created_at DESC
                    LIMIT ?
                    """,
                    (account_id, limit),
                ).fetchall()
            elif unbound_only:
                rows = connection.execute(
                    """
                    SELECT d.id, d.created_at,
                           ad.account_id, ad.activated_at,
                           a.phone_ciphertext, a.display_name,
                           (SELECT MAX(r.created_at) FROM api_requests r
                            WHERE r.device_id = d.id) AS last_seen_at,
                           (SELECT COUNT(*) FROM api_requests r
                            WHERE r.device_id = d.id) AS request_count
                    FROM devices d
                    LEFT JOIN account_devices ad ON ad.device_id = d.id
                    LEFT JOIN access_accounts a ON a.id = ad.account_id
                    WHERE ad.account_id IS NULL
                    ORDER BY d.created_at DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            else:
                rows = connection.execute(
                    """
                    SELECT d.id, d.created_at,
                           ad.account_id, ad.activated_at,
                           a.phone_ciphertext, a.display_name,
                           (SELECT MAX(r.created_at) FROM api_requests r
                            WHERE r.device_id = d.id) AS last_seen_at,
                           (SELECT COUNT(*) FROM api_requests r
                            WHERE r.device_id = d.id) AS request_count
                    FROM devices d
                    LEFT JOIN account_devices ad ON ad.device_id = d.id
                    LEFT JOIN access_accounts a ON a.id = ad.account_id
                    ORDER BY d.created_at DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
        return [dict(row) for row in rows]

    def delete_unbound_devices(self, older_than_days: int | None = None) -> dict:
        """清掉未绑定账号的匿名设备及其全部附属记录。

        只处理 account_devices 中没有绑定的设备；已绑定设备必须先在后台解绑。
        通过临时表避免 SQLite 变量数量上限，并保证整批删除在同一事务内完成。
        """
        cutoff = None
        if older_than_days is not None:
            cutoff = (
                datetime.now(timezone.utc) - timedelta(days=older_than_days)
            ).isoformat()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "CREATE TEMP TABLE IF NOT EXISTS _purge_devices (id TEXT PRIMARY KEY)"
            )
            connection.execute("DELETE FROM _purge_devices")
            if cutoff is None:
                connection.execute(
                    "INSERT INTO _purge_devices(id) SELECT d.id FROM devices d "
                    "WHERE NOT EXISTS (SELECT 1 FROM account_devices ad "
                    "WHERE ad.device_id = d.id)"
                )
            else:
                connection.execute(
                    "INSERT INTO _purge_devices(id) SELECT d.id FROM devices d "
                    "WHERE NOT EXISTS (SELECT 1 FROM account_devices ad "
                    "WHERE ad.device_id = d.id) AND d.created_at < ?",
                    (cutoff,),
                )
            total = connection.execute(
                "SELECT COUNT(*) AS total FROM _purge_devices"
            ).fetchone()["total"]
            deleted = {
                "api_requests": 0,
                "learning_pack_jobs": 0,
                "lecsync_tasks": 0,
                "lecsync_usage": 0,
                "daily_usage": 0,
                "analyses": 0,
                "devices": 0,
            }
            if total:
                deleted["api_requests"] = connection.execute(
                    "DELETE FROM api_requests WHERE device_id IN "
                    "(SELECT id FROM _purge_devices)"
                ).rowcount
                deleted["learning_pack_jobs"] = connection.execute(
                    "DELETE FROM learning_pack_jobs WHERE device_id IN "
                    "(SELECT id FROM _purge_devices)"
                ).rowcount
                deleted["lecsync_tasks"] = connection.execute(
                    "DELETE FROM lecsync_tasks WHERE device_id IN "
                    "(SELECT id FROM _purge_devices)"
                ).rowcount
                deleted["lecsync_usage"] = connection.execute(
                    "DELETE FROM lecsync_usage WHERE device_id IN "
                    "(SELECT id FROM _purge_devices)"
                ).rowcount
                deleted["daily_usage"] = connection.execute(
                    "DELETE FROM daily_usage WHERE device_id IN "
                    "(SELECT id FROM _purge_devices)"
                ).rowcount
                deleted["analyses"] = connection.execute(
                    "DELETE FROM analyses WHERE device_id IN "
                    "(SELECT id FROM _purge_devices)"
                ).rowcount
                deleted["devices"] = connection.execute(
                    "DELETE FROM devices WHERE id IN "
                    "(SELECT id FROM _purge_devices)"
                ).rowcount
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
        return {"devices": int(total), "details": deleted}

    def delete_unbound_device(self, device_id: str) -> bool:
        with self.connect() as connection:
            bound = connection.execute(
                "SELECT 1 FROM account_devices WHERE device_id = ?", (device_id,)
            ).fetchone()
            if bound is not None:
                return False
            exists = connection.execute(
                "SELECT 1 FROM devices WHERE id = ?", (device_id,)
            ).fetchone()
            if exists is None:
                return False
            connection.execute(
                "DELETE FROM api_requests WHERE device_id = ?", (device_id,)
            )
            connection.execute(
                "DELETE FROM learning_pack_jobs WHERE device_id = ?", (device_id,)
            )
            connection.execute(
                "DELETE FROM lecsync_tasks WHERE device_id = ?", (device_id,)
            )
            connection.execute(
                "DELETE FROM lecsync_usage WHERE device_id = ?", (device_id,)
            )
            connection.execute(
                "DELETE FROM daily_usage WHERE device_id = ?", (device_id,)
            )
            connection.execute(
                "DELETE FROM analyses WHERE device_id = ?", (device_id,)
            )
            connection.execute("DELETE FROM devices WHERE id = ?", (device_id,))
            return True

    def purge_api_requests(self, older_than_days: int | None = None) -> int:
        with self.connect() as connection:
            if older_than_days is None:
                cursor = connection.execute("DELETE FROM api_requests")
            else:
                cutoff = (
                    datetime.now(timezone.utc) - timedelta(days=older_than_days)
                ).isoformat()
                cursor = connection.execute(
                    "DELETE FROM api_requests WHERE created_at < ?", (cutoff,)
                )
            return cursor.rowcount

    def purge_orphan_sync_records(self) -> int:
        with self.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM sync_records WHERE account_id NOT IN "
                "(SELECT id FROM access_accounts)"
            )
            return cursor.rowcount

    def purge_expired_codes(self, older_than_days: int = 7) -> dict:
        cutoff = (
            datetime.now(timezone.utc) - timedelta(days=older_than_days)
        ).isoformat()
        with self.connect() as connection:
            sms = connection.execute(
                "DELETE FROM sms_verification_codes WHERE created_at < ?", (cutoff,)
            ).rowcount
            activation = connection.execute(
                "DELETE FROM activation_codes WHERE created_at < ?", (cutoff,)
            ).rowcount
        return {"smsCodes": sms, "activationCodes": activation}

    def cleanup_old_metrics(
        self,
        *,
        anonymous_device_days: int = 7,
        request_days: int = 90,
        code_days: int = 7,
    ) -> dict:
        """启动时的轻量保留策略：匿名设备、调用记录、过期验证码不会无限累积。"""
        devices = self.delete_unbound_devices(anonymous_device_days)
        requests = self.purge_api_requests(request_days)
        codes = self.purge_expired_codes(code_days)
        orphans = self.purge_orphan_sync_records()
        return {
            "anonymousDevices": devices["devices"],
            "apiRequests": requests,
            "smsCodes": codes["smsCodes"],
            "activationCodes": codes["activationCodes"],
            "orphanSyncRecords": orphans,
        }

    def record_api_request(
        self,
        *,
        device_id: str | None,
        account_id: str | None,
        method: str,
        route: str,
        status: int,
        duration_ms: int,
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO api_requests(device_id, account_id, method, route, status, duration_ms, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (device_id, account_id, method, route, status, duration_ms, self._now()),
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

    def create_or_get_learning_pack_job(
        self,
        device_id: str,
        input_sha256: str,
        succeeded_since: str,
        account_id: str | None = None,
    ) -> tuple[dict, bool]:
        """Atomically deduplicate jobs while never persisting request content."""
        now = self._now()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                """
                SELECT * FROM learning_pack_jobs
                WHERE device_id = ? AND input_sha256 = ?
                  AND status IN ('queued', 'processing')
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (device_id, input_sha256),
            ).fetchone()
            if row is None:
                row = connection.execute(
                    """
                    SELECT * FROM learning_pack_jobs
                    WHERE device_id = ? AND input_sha256 = ?
                      AND status = 'succeeded' AND updated_at >= ?
                    ORDER BY updated_at DESC
                    LIMIT 1
                    """,
                    (device_id, input_sha256, succeeded_since),
                ).fetchone()
            if row is not None:
                connection.commit()
                return dict(row), False
            job_id = str(uuid.uuid4())
            connection.execute(
                """
                INSERT INTO learning_pack_jobs(
                    id, device_id, account_id, input_sha256, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'queued', ?, ?)
                """,
                (job_id, device_id, account_id, input_sha256, now, now),
            )
            row = connection.execute(
                "SELECT * FROM learning_pack_jobs WHERE id = ?", (job_id,)
            ).fetchone()
            connection.commit()
            return dict(row), True
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def get_learning_pack_job(self, device_id: str, job_id: str) -> dict | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM learning_pack_jobs WHERE id = ? AND device_id = ?",
                (job_id, device_id),
            ).fetchone()
        return None if row is None else dict(row)

    def mark_learning_pack_job_processing(self, device_id: str, job_id: str) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE learning_pack_jobs
                SET status = 'processing', updated_at = ?
                WHERE id = ? AND device_id = ? AND status = 'queued'
                """,
                (self._now(), job_id, device_id),
            )

    def set_learning_pack_job_analysis(
        self, device_id: str, job_id: str, analysis_id: str
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE learning_pack_jobs
                SET analysis_id = ?, updated_at = ?
                WHERE id = ? AND device_id = ? AND status = 'processing'
                """,
                (analysis_id, self._now(), job_id, device_id),
            )

    def complete_learning_pack_job(
        self,
        device_id: str,
        job_id: str,
        result_json: str,
        model: str,
        analysis_id: str,
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE learning_pack_jobs
                SET status = 'succeeded', result_json = ?, error_code = NULL,
                    error_message = NULL, model = ?, analysis_id = ?, updated_at = ?
                WHERE id = ? AND device_id = ?
                  AND status IN ('queued', 'processing')
                """,
                (
                    result_json,
                    model,
                    analysis_id,
                    self._now(),
                    job_id,
                    device_id,
                ),
            )

    def fail_learning_pack_job(
        self,
        device_id: str,
        job_id: str,
        error_code: str,
        error_message: str,
        model: str | None = None,
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE learning_pack_jobs
                SET status = 'failed', result_json = NULL, error_code = ?,
                    error_message = ?, model = ?, updated_at = ?
                WHERE id = ? AND device_id = ?
                  AND status IN ('queued', 'processing')
                """,
                (
                    error_code,
                    error_message,
                    model,
                    self._now(),
                    job_id,
                    device_id,
                ),
            )

    def fail_interrupted_learning_pack_jobs(
        self, error_code: str, error_message: str
    ) -> list[dict]:
        now = self._now()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            rows = connection.execute(
                """
                SELECT id, device_id, account_id, analysis_id FROM learning_pack_jobs
                WHERE status IN ('queued', 'processing')
                """
            ).fetchall()
            connection.execute(
                """
                UPDATE learning_pack_jobs
                SET status = 'failed', result_json = NULL, error_code = ?,
                    error_message = ?, updated_at = ?
                WHERE status IN ('queued', 'processing')
                """,
                (error_code, error_message, now),
            )
            connection.commit()
            return [dict(row) for row in rows]
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _date_range(self, days: int) -> list[str]:
        today = datetime.now(self.timezone).date()
        return [(today - timedelta(days=offset)).isoformat() for offset in range(days - 1, -1, -1)]

    def _local_offset(self) -> str:
        offset = datetime.now(self.timezone).utcoffset() or timedelta(0)
        return f"{int(offset.total_seconds() // 60):+d} minutes"

    def _since_utc(self, days: int) -> str:
        first = datetime.now(self.timezone).date() - timedelta(days=days - 1)
        start = datetime.combine(first, datetime.min.time(), tzinfo=self.timezone)
        return start.astimezone(timezone.utc).isoformat()

    def api_overview(self, days: int) -> dict:
        dates = self._date_range(days)
        since = self._since_utc(days)
        modifier = self._local_offset()
        with self.connect() as connection:
            request_rows = connection.execute(
                """
                SELECT date(created_at, ?) AS day,
                       COUNT(*) AS requests,
                       SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors,
                       COUNT(DISTINCT device_id) AS devices,
                       COUNT(DISTINCT account_id) AS accounts
                FROM api_requests WHERE created_at >= ?
                GROUP BY day
                """,
                (modifier, since),
            ).fetchall()
            analysis_rows = connection.execute(
                """
                SELECT date(created_at, ?) AS day, COUNT(*) AS ai_packs
                FROM analyses WHERE created_at >= ?
                GROUP BY day
                """,
                (modifier, since),
            ).fetchall()
            audio_rows = connection.execute(
                """
                SELECT date(created_at, ?) AS day,
                       SUM(MAX(settled_seconds, actual_seconds)) AS seconds
                FROM lecsync_tasks WHERE created_at >= ?
                GROUP BY day
                """,
                (modifier, since),
            ).fetchall()
            text_rows = connection.execute(
                """
                SELECT usage_date AS day, SUM(text_characters) AS characters FROM (
                    SELECT usage_date, text_characters FROM account_lecsync_usage WHERE usage_date >= ?
                    UNION ALL
                    SELECT usage_date, text_characters FROM lecsync_usage WHERE usage_date >= ?
                ) GROUP BY day
                """,
                (dates[0], dates[0]),
            ).fetchall()
            totals_row = connection.execute(
                """
                SELECT COUNT(*) AS requests,
                       SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors,
                       COUNT(DISTINCT device_id) AS active_devices,
                       COUNT(DISTINCT account_id) AS active_accounts
                FROM api_requests WHERE created_at >= ?
                """,
                (since,),
            ).fetchone()
            account_total = connection.execute(
                "SELECT COUNT(*) AS total FROM access_accounts"
            ).fetchone()["total"]
            device_total = connection.execute(
                "SELECT COUNT(*) AS total FROM devices"
            ).fetchone()["total"]
            bound_device_total = connection.execute(
                "SELECT COUNT(*) AS total FROM account_devices"
            ).fetchone()["total"]
        requests_by_day = {row["day"]: row for row in request_rows}
        analyses_by_day = {row["day"]: int(row["ai_packs"]) for row in analysis_rows}
        audio_by_day = {row["day"]: float(row["seconds"] or 0.0) for row in audio_rows}
        text_by_day = {row["day"]: int(row["characters"] or 0) for row in text_rows}
        series = []
        for day in dates:
            row = requests_by_day.get(day)
            series.append({
                "date": day,
                "requests": 0 if row is None else int(row["requests"]),
                "errors": 0 if row is None else int(row["errors"] or 0),
                "aiPacks": analyses_by_day.get(day, 0),
                "audioMinutes": round(audio_by_day.get(day, 0.0) / 60.0, 1),
                "textCharacters": text_by_day.get(day, 0),
            })
        requests = int(totals_row["requests"] or 0)
        errors = int(totals_row["errors"] or 0)
        return {
            "rangeDays": days,
            "totals": {
                "requests": requests,
                "errors": errors,
                "errorRate": round(errors / requests, 4) if requests else 0.0,
                "aiPacks": sum(item["aiPacks"] for item in series),
                "audioMinutes": round(sum(item["audioMinutes"] for item in series), 1),
                "textCharacters": sum(item["textCharacters"] for item in series),
                "activeDevices": int(totals_row["active_devices"] or 0),
                "activeAccounts": int(totals_row["active_accounts"] or 0),
                "accounts": int(account_total),
                "devices": int(bound_device_total),
                "unboundDevices": max(0, int(device_total) - int(bound_device_total)),
            },
            "series": series,
        }

    def api_endpoint_breakdown(self, days: int, limit: int = 30) -> list[dict]:
        since = self._since_utc(days)
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT route, COUNT(*) AS requests,
                       SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors,
                       AVG(duration_ms) AS avg_duration_ms
                FROM api_requests WHERE created_at >= ?
                GROUP BY route ORDER BY requests DESC LIMIT ?
                """,
                (since, limit),
            ).fetchall()
        return [
            {
                "route": row["route"],
                "requests": int(row["requests"]),
                "errors": int(row["errors"] or 0),
                "avgDurationMs": int(row["avg_duration_ms"] or 0),
            }
            for row in rows
        ]

    def api_model_breakdown(self, days: int) -> list[dict]:
        since = self._since_utc(days)
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT model, COUNT(*) AS count FROM analyses
                WHERE created_at >= ? GROUP BY model ORDER BY count DESC
                """,
                (since,),
            ).fetchall()
        return [{"model": row["model"], "count": int(row["count"])} for row in rows]

    def device_counts(self) -> dict:
        with self.connect() as connection:
            total = connection.execute(
                "SELECT COUNT(*) AS total FROM devices"
            ).fetchone()["total"]
            bound = connection.execute(
                "SELECT COUNT(*) AS total FROM account_devices"
            ).fetchone()["total"]
        return {"total": int(total), "bound": int(bound), "unbound": max(0, int(total) - int(bound))}

    def recent_api_requests(
        self,
        limit: int = 200,
        errors_only: bool = False,
        *,
        account_id: str | None = None,
        include_unbound: bool = False,
        include_polling: bool = False,
    ) -> list[dict]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT r.id, r.device_id, r.account_id, r.method, r.route, r.status,
                       r.duration_ms, r.created_at, a.phone_ciphertext, a.display_name
                FROM api_requests r
                LEFT JOIN access_accounts a ON a.id = r.account_id
                WHERE (? IS NULL OR r.account_id = ?)
                  AND (? = 1 OR r.account_id IS NOT NULL)
                  AND (? = 1 OR r.route NOT IN (
                      '/v1/accounts/me',
                      '/v1/trial/status',
                      '/v1/app-config',
                      '/v2/learning-pack/jobs/{job_id}'
                  ))
                  AND (? = 0 OR r.status >= 400)
                ORDER BY r.id DESC
                LIMIT ?
                """,
                (
                    account_id,
                    account_id,
                    1 if include_unbound else 0,
                    1 if include_polling else 0,
                    1 if errors_only else 0,
                    limit,
                ),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_app_config(self) -> dict | None:
        """运营后台保存的 App 公告/标语 JSON 文档；未配置时返回 None。"""
        import json

        with self.connect() as connection:
            row = connection.execute(
                "SELECT value FROM app_config WHERE key = ?", (APP_CONFIG_KEY,)
            ).fetchone()
        if row is None:
            return None
        try:
            document = json.loads(row["value"])
        except (TypeError, ValueError):
            return None
        return document if isinstance(document, dict) else None

    def set_app_config(self, document: dict) -> str:
        """整文档覆盖写 App 配置，返回 updated_at（UTC ISO）。"""
        import json

        updated_at = self._now()
        stored = dict(document)
        stored["updated_at"] = updated_at
        payload = json.dumps(stored, ensure_ascii=False)
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                    updated_at = excluded.updated_at
                """,
                (APP_CONFIG_KEY, payload, updated_at),
            )
        return updated_at
