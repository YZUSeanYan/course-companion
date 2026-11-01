"""App 公告/标语远程配置：管理端写入、App 端读取、默认回退与校验。"""

from fastapi.testclient import TestClient

from app.main import create_app

from conftest import auth_headers

ADMIN_HEADERS = {"X-Requested-With": "zhixi-admin"}


def _login(client: TestClient, settings) -> None:
    response = client.post("/admin/api/login", json={"password": settings.admin_password})
    assert response.status_code == 200, response.text


def test_app_config_defaults_without_admin_edit(settings):
    client = TestClient(create_app(settings))
    headers = auth_headers(client)
    response = client.get("/v1/app-config", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["announcement"]["enabled"] is False
    assert body["announcement"]["title"] == ""
    assert body["announcement"]["body"] == ""
    assert body["taglines"] == []
    assert body["updatedAt"] is None


def test_app_config_requires_device_token(settings):
    client = TestClient(create_app(settings))
    assert client.get("/v1/app-config").status_code == 401


def test_admin_app_config_requires_login(settings):
    client = TestClient(create_app(settings))
    assert client.get("/admin/api/app-config").status_code == 401
    assert client.patch("/admin/api/app-config", json={"taglines": []}).status_code == 401


def test_admin_app_config_requires_csrf_header(settings):
    client = TestClient(create_app(settings))
    _login(client, settings)
    response = client.patch(
        "/admin/api/app-config",
        json={"announcementEnabled": False, "taglines": []},
    )
    assert response.status_code == 403


def test_admin_app_config_rejects_long_taglines(settings):
    client = TestClient(create_app(settings))
    _login(client, settings)
    too_long = client.patch(
        "/admin/api/app-config",
        json={"taglines": ["学" * 41]},
        headers=ADMIN_HEADERS,
    )
    assert too_long.status_code == 422
    too_many = client.patch(
        "/admin/api/app-config",
        json={"taglines": [f"第{i}条" for i in range(9)]},
        headers=ADMIN_HEADERS,
    )
    assert too_many.status_code == 422


def test_admin_save_then_app_reads_config(settings):
    client = TestClient(create_app(settings))
    headers = auth_headers(client)
    _login(client, settings)
    saved = client.patch(
        "/admin/api/app-config",
        json={
            "announcementEnabled": True,
            "announcementTitle": "新版发布",
            "announcementBody": "知习 V2.0.5 已上线，欢迎体验公告与标语远控。",
            "taglines": ["知行合一", "学而时习之，不亦说乎", "  ", ""],
        },
        headers=ADMIN_HEADERS,
    )
    assert saved.status_code == 200, saved.text
    payload = saved.json()
    assert payload["announcementEnabled"] is True
    assert payload["announcementTitle"] == "新版发布"
    assert payload["taglines"] == ["知行合一", "学而时习之，不亦说乎"]
    assert payload["updatedAt"]

    body = client.get("/v1/app-config", headers=headers).json()
    assert body["announcement"] == {
        "enabled": True,
        "title": "新版发布",
        "body": "知习 V2.0.5 已上线，欢迎体验公告与标语远控。",
    }
    assert body["taglines"] == ["知行合一", "学而时习之，不亦说乎"]
    assert body["updatedAt"] == payload["updatedAt"]


def test_disabled_announcement_stays_disabled_for_app(settings):
    client = TestClient(create_app(settings))
    headers = auth_headers(client)
    _login(client, settings)
    saved = client.patch(
        "/admin/api/app-config",
        json={
            "announcementEnabled": True,
            "announcementTitle": "标题",
            "announcementBody": "正文",
        },
        headers=ADMIN_HEADERS,
    )
    assert saved.status_code == 200
    assert saved.json()["announcementEnabled"] is True
    off = client.patch(
        "/admin/api/app-config",
        json={
            "announcementEnabled": False,
            "announcementTitle": "标题",
            "announcementBody": "正文",
        },
        headers=ADMIN_HEADERS,
    )
    assert off.status_code == 200
    assert off.json()["announcementEnabled"] is False
    body = client.get("/v1/app-config", headers=headers).json()
    assert body["announcement"]["enabled"] is False
    assert body["announcement"]["title"] == "标题"


def test_enabling_announcement_without_content_is_forced_off(settings):
    client = TestClient(create_app(settings))
    _login(client, settings)
    saved = client.patch(
        "/admin/api/app-config",
        json={"announcementEnabled": True, "announcementTitle": "", "announcementBody": "  "},
        headers=ADMIN_HEADERS,
    )
    assert saved.status_code == 200
    assert saved.json()["announcementEnabled"] is False
