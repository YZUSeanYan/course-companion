"""App 全局远程配置：启动公告与首页标语。

配置以单个 JSON 文档存放在 ``app_config`` 表，由管理后台编辑；
App 每次冷启动联网拉取，未配置或拉取失败时客户端回退内置默认值。
"""

from __future__ import annotations

from fastapi import Depends, FastAPI
from pydantic import Field

from .auth import device_identity
from .config import Settings
from .db import Database
from .schemas import StrictModel

MAX_TAGLINES = 8
MAX_TAGLINE_LENGTH = 40


class AnnouncementPayload(StrictModel):
    enabled: bool = False
    title: str = ""
    body: str = ""


class AppConfigResponse(StrictModel):
    announcement: AnnouncementPayload = Field(default_factory=AnnouncementPayload)
    taglines: list[str] = Field(default_factory=list)
    updated_at: str | None = Field(alias="updatedAt", default=None)


def app_config_response(database: Database) -> AppConfigResponse:
    """Read the stored document defensively; corrupt shapes fall back to defaults."""
    document = database.get_app_config() or {}
    raw_announcement = document.get("announcement")
    announcement = AnnouncementPayload()
    if isinstance(raw_announcement, dict):
        announcement = AnnouncementPayload(
            enabled=bool(raw_announcement.get("enabled", False)),
            title=str(raw_announcement.get("title", "")),
            body=str(raw_announcement.get("body", "")),
        )
    raw_taglines = document.get("taglines")
    taglines: list[str] = []
    if isinstance(raw_taglines, list):
        taglines = [str(item).strip() for item in raw_taglines if str(item).strip()]
    updated_at = document.get("updated_at")
    return AppConfigResponse(
        announcement=announcement,
        taglines=taglines,
        updatedAt=str(updated_at) if updated_at else None,
    )


def register_app_config_routes(app: FastAPI, settings: Settings) -> None:
    database: Database = app.state.db

    @app.get("/v1/app-config", response_model=AppConfigResponse)
    def read_app_config(device_id: str = Depends(device_identity)) -> AppConfigResponse:
        return app_config_response(database)
