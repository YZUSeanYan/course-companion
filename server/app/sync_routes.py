from __future__ import annotations

import json
import re
import time

from fastapi import Depends, FastAPI, HTTPException, Request, status

from .auth import activated_device
from .config import Settings
from .db import Database
from .sync_schemas import (
    SYNC_ENTITIES,
    SYNC_MAX_BATCH_SIZE,
    SYNC_MAX_PAYLOAD_BYTES,
    SyncChange,
    SyncPullRequest,
    SyncPullResponse,
    SyncPushRequest,
    SyncPushResponse,
    SyncPushResult,
    SyncRecordResponse,
)

_CLIENT_UID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _now_millis() -> int:
    return int(time.time() * 1000)


def _account_id_or_error(request: Request) -> str:
    account_id = getattr(request.state, "account_id", None)
    if account_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="请先激活账号后再同步",
            headers={"X-Zhixi-Error-Code": "account_required"},
        )
    return str(account_id)


def _validate_change(change: SyncChange, index: int) -> dict:
    position = index + 1
    if change.entity not in SYNC_ENTITIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"第 {position} 条变更的 entity 不受支持",
            headers={"X-Zhixi-Error-Code": "invalid_entity"},
        )
    if _CLIENT_UID_PATTERN.fullmatch(change.client_uid) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"第 {position} 条变更的 clientUid 必须是 36 位 UUID",
            headers={"X-Zhixi-Error-Code": "invalid_client_uid"},
        )
    payload_json = json.dumps(change.payload, ensure_ascii=False, separators=(",", ":"))
    if len(payload_json.encode("utf-8")) > SYNC_MAX_PAYLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"第 {position} 条变更的 payload 超过 {SYNC_MAX_PAYLOAD_BYTES // 1024}KB 限制",
            headers={"X-Zhixi-Error-Code": "payload_too_large"},
        )
    return {
        "entity": change.entity,
        "client_uid": change.client_uid.lower(),
        "payload": payload_json,
        "client_updated_at": change.updated_at,
        "deleted": change.deleted,
    }


def register_sync_routes(app: FastAPI, settings: Settings) -> None:
    database: Database = app.state.db

    @app.post("/v1/sync/push", response_model=SyncPushResponse)
    def sync_push(
        payload: SyncPushRequest,
        request: Request,
        device_id: str = Depends(activated_device),
    ) -> SyncPushResponse:
        account_id = _account_id_or_error(request)
        if len(payload.changes) > SYNC_MAX_BATCH_SIZE:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"单次同步最多 {SYNC_MAX_BATCH_SIZE} 条变更，请分批提交",
                headers={"X-Zhixi-Error-Code": "batch_too_large"},
            )
        prepared = [_validate_change(change, index) for index, change in enumerate(payload.changes)]
        accepted = database.upsert_sync_records(account_id, prepared)
        results = [
            SyncPushResult(clientUid=change["client_uid"], status="accepted" if ok else "ignored")
            for change, ok in zip(prepared, accepted)
        ]
        return SyncPushResponse(results=results, serverTime=_now_millis())

    @app.post("/v1/sync/pull", response_model=SyncPullResponse)
    def sync_pull(
        payload: SyncPullRequest,
        request: Request,
        device_id: str = Depends(activated_device),
    ) -> SyncPullResponse:
        account_id = _account_id_or_error(request)
        entities: list[str] = []
        for entity in payload.entities:
            if entity not in SYNC_ENTITIES:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"entity 不受支持：{entity}",
                    headers={"X-Zhixi-Error-Code": "invalid_entity"},
                )
            if entity not in entities:
                entities.append(entity)
        rows = database.list_sync_records(account_id, entities)
        records = [
            SyncRecordResponse(
                entity=row["entity"],
                clientUid=row["client_uid"],
                payload=json.loads(row["payload"]),
                updatedAt=int(row["client_updated_at"]),
                deleted=bool(row["deleted"]),
            )
            for row in rows
        ]
        return SyncPullResponse(records=records, serverTime=_now_millis())
