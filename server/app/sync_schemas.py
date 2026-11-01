from __future__ import annotations

from pydantic import Field

from .schemas import StrictModel

SYNC_ENTITIES = (
    "courses",
    "learning_items",
    "review_cards",
    "review_logs",
    "sessions",
    "transcript_lines",
    "doubts",
    "materials",
)

SYNC_MAX_BATCH_SIZE = 500
SYNC_MAX_PAYLOAD_BYTES = 128 * 1024


class SyncChange(StrictModel):
    entity: str = Field(min_length=1, max_length=64)
    client_uid: str = Field(alias="clientUid", min_length=1, max_length=64)
    payload: dict
    updated_at: int = Field(alias="updatedAt", ge=0)
    deleted: bool = False


class SyncPushRequest(StrictModel):
    changes: list[SyncChange] = Field(default_factory=list)


class SyncPushResult(StrictModel):
    client_uid: str = Field(alias="clientUid")
    status: str


class SyncPushResponse(StrictModel):
    results: list[SyncPushResult]
    server_time: int = Field(alias="serverTime")


class SyncPullRequest(StrictModel):
    entities: list[str] = Field(default_factory=list, max_length=64)


class SyncRecordResponse(StrictModel):
    entity: str
    client_uid: str = Field(alias="clientUid")
    payload: dict
    updated_at: int = Field(alias="updatedAt")
    deleted: bool


class SyncPullResponse(StrictModel):
    records: list[SyncRecordResponse]
    server_time: int = Field(alias="serverTime")
