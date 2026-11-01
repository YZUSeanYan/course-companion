from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.main import create_app
from conftest import (
    auth_headers,
    bind_test_device,
    create_test_account,
    register_unactivated,
)

VALID_ENTITIES = [
    "courses",
    "learning_items",
    "review_cards",
    "review_logs",
    "sessions",
    "transcript_lines",
    "doubts",
    "materials",
]


def make_change(
    entity: str,
    payload: dict,
    updated_at: int,
    *,
    client_uid: str | None = None,
    deleted: bool = False,
) -> dict:
    return {
        "entity": entity,
        "clientUid": client_uid or str(uuid.uuid4()),
        "payload": payload,
        "updatedAt": updated_at,
        "deleted": deleted,
    }


def push(client: TestClient, headers: dict, changes: list[dict]):
    return client.post("/v1/sync/push", json={"changes": changes}, headers=headers)


def pull(client: TestClient, headers: dict, entities: list[str] | None = None):
    body = {} if entities is None else {"entities": entities}
    return client.post("/v1/sync/pull", json=body, headers=headers)


def push_one(client: TestClient, headers: dict, change: dict) -> str:
    response = push(client, headers, [change])
    assert response.status_code == 200, response.text
    return response.json()["results"][0]["status"]


def pull_records(client: TestClient, headers: dict, entities=None) -> list[dict]:
    response = pull(client, headers, entities)
    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body["serverTime"], int)
    return body["records"]


def second_account_headers(client: TestClient) -> dict[str, str]:
    registered = client.post("/v1/devices/register").json()
    account, _ = create_test_account(client)
    bind_test_device(client, registered["deviceId"], account)
    return {"Authorization": f"Bearer {registered['token']}"}


def test_push_and_pull_roundtrip(settings):
    client = TestClient(create_app(settings))
    headers = auth_headers(client)
    course_uid = str(uuid.uuid4())
    item_uid = str(uuid.uuid4())

    response = push(
        client,
        headers,
        [
            make_change("courses", {"name": "生物学", "term": 1}, 1000, client_uid=course_uid),
            make_change("learning_items", {"courseUid": course_uid, "title": "细胞"}, 2000, client_uid=item_uid),
        ],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert [item["status"] for item in body["results"]] == ["accepted", "accepted"]
    assert [item["clientUid"] for item in body["results"]] == [course_uid, item_uid]
    assert isinstance(body["serverTime"], int)

    records = pull_records(client, headers)
    assert len(records) == 2
    by_uid = {record["clientUid"]: record for record in records}
    assert by_uid[course_uid]["entity"] == "courses"
    assert by_uid[course_uid]["payload"] == {"name": "生物学", "term": 1}
    assert by_uid[course_uid]["updatedAt"] == 1000
    assert by_uid[course_uid]["deleted"] is False
    assert by_uid[item_uid]["entity"] == "learning_items"
    assert by_uid[item_uid]["payload"]["courseUid"] == course_uid


def test_push_lww_ignores_stale_and_equal_updates(settings):
    client = TestClient(create_app(settings))
    headers = auth_headers(client)
    uid = str(uuid.uuid4())

    assert push_one(client, headers, make_change("courses", {"v": 1}, 1000, client_uid=uid)) == "accepted"
    assert push_one(client, headers, make_change("courses", {"v": "stale"}, 999, client_uid=uid)) == "ignored"
    assert push_one(client, headers, make_change("courses", {"v": "equal"}, 1000, client_uid=uid)) == "ignored"

    records = pull_records(client, headers)
    assert len(records) == 1
    assert records[0]["payload"] == {"v": 1}
    assert records[0]["updatedAt"] == 1000

    assert push_one(client, headers, make_change("courses", {"v": 2}, 2000, client_uid=uid)) == "accepted"
    records = pull_records(client, headers)
    assert records[0]["payload"] == {"v": 2}
    assert records[0]["updatedAt"] == 2000


def test_push_deleted_tombstone_roundtrip(settings):
    client = TestClient(create_app(settings))
    headers = auth_headers(client)
    uid = str(uuid.uuid4())

    assert push_one(client, headers, make_change("doubts", {"text": "为何"}, 1000, client_uid=uid)) == "accepted"
    assert push_one(
        client,
        headers,
        make_change("doubts", {"text": "为何"}, 2000, client_uid=uid, deleted=True),
    ) == "accepted"

    records = pull_records(client, headers)
    assert records[0]["deleted"] is True
    assert records[0]["updatedAt"] == 2000

    assert push_one(
        client,
        headers,
        make_change("doubts", {"text": "恢复"}, 3000, client_uid=uid),
    ) == "accepted"
    records = pull_records(client, headers)
    assert records[0]["deleted"] is False
    assert records[0]["payload"] == {"text": "恢复"}


def test_push_batch_over_500_returns_422(settings):
    client = TestClient(create_app(settings))
    headers = auth_headers(client)
    changes = [make_change("courses", {"i": index}, index) for index in range(501)]

    response = push(client, headers, changes)
    assert response.status_code == 422
    assert "500" in response.json()["detail"]
    assert client.app.state.db.list_sync_records(
        _account_id(client, headers), []
    ) == []

    exact = [make_change("courses", {"i": index}, index) for index in range(500)]
    ok = push(client, headers, exact)
    assert ok.status_code == 200
    assert all(item["status"] == "accepted" for item in ok.json()["results"])


def test_push_payload_over_128kb_returns_422(settings):
    client = TestClient(create_app(settings))
    headers = auth_headers(client)
    big = "x" * (128 * 1024)

    response = push(client, headers, [make_change("courses", {"blob": big}, 1000)])
    assert response.status_code == 422
    assert "128KB" in response.json()["detail"]

    records = pull_records(client, headers)
    assert records == []


def test_push_rejects_invalid_entity_and_client_uid(settings):
    client = TestClient(create_app(settings))
    headers = auth_headers(client)

    bad_entity = push(client, headers, [make_change("notes", {}, 1000)])
    assert bad_entity.status_code == 422
    assert "entity" in bad_entity.json()["detail"]

    bad_uid = push(client, headers, [make_change("courses", {}, 1000, client_uid="not-a-uuid")])
    assert bad_uid.status_code == 422
    assert "clientUid" in bad_uid.json()["detail"]

    too_long = push(client, headers, [make_change("courses", {}, 1000, client_uid=str(uuid.uuid4()) + "ab")])
    assert too_long.status_code == 422

    records = pull_records(client, headers)
    assert records == []


def test_pull_entity_filter_and_empty_means_all(settings):
    client = TestClient(create_app(settings))
    headers = auth_headers(client)
    push_one(client, headers, make_change("courses", {"v": 1}, 1000))
    push_one(client, headers, make_change("review_cards", {"v": 2}, 1000))

    only_courses = pull_records(client, headers, ["courses"])
    assert [record["entity"] for record in only_courses] == ["courses"]

    unknown = pull(client, headers, ["grades"])
    assert unknown.status_code == 422

    everything = pull_records(client, headers, [])
    assert sorted(record["entity"] for record in everything) == ["courses", "review_cards"]

    missing_field = pull(client, headers)
    assert missing_field.status_code == 200
    assert len(missing_field.json()["records"]) == 2


def test_sync_accounts_are_isolated(settings):
    client = TestClient(create_app(settings))
    headers_a = auth_headers(client)
    headers_b = second_account_headers(client)

    push_one(client, headers_a, make_change("courses", {"owner": "a"}, 1000))

    assert pull_records(client, headers_b) == []
    push_one(client, headers_b, make_change("courses", {"owner": "b"}, 1000))

    records_a = pull_records(client, headers_a)
    assert [record["payload"] for record in records_a] == [{"owner": "a"}]
    records_b = pull_records(client, headers_b)
    assert [record["payload"] for record in records_b] == [{"owner": "b"}]

    # Same clientUid in both accounts stays independent.
    shared_uid = str(uuid.uuid4())
    assert push_one(client, headers_a, make_change("materials", {"who": "a"}, 1000, client_uid=shared_uid)) == "accepted"
    assert push_one(client, headers_b, make_change("materials", {"who": "b"}, 2000, client_uid=shared_uid)) == "accepted"
    by_account = {
        record["payload"]["who"]: record["updatedAt"]
        for record in pull_records(client, headers_a) + pull_records(client, headers_b)
        if record["entity"] == "materials"
    }
    assert by_account == {"a": 1000, "b": 2000}


def test_sync_requires_activated_device(settings):
    client = TestClient(create_app(settings))
    unactivated = register_unactivated(client)
    headers = {"Authorization": f"Bearer {unactivated['token']}"}

    push_response = push(client, headers, [make_change("courses", {}, 1000)])
    assert push_response.status_code == 403
    assert push_response.headers["X-Zhixi-Error-Code"] == "account_required"

    pull_response = pull(client, headers)
    assert pull_response.status_code == 403
    assert pull_response.headers["X-Zhixi-Error-Code"] == "account_required"

    anonymous_push = client.post("/v1/sync/push", json={"changes": []})
    assert anonymous_push.status_code == 401


def _account_id(client: TestClient, headers: dict) -> str:
    token = headers["Authorization"].split(" ", 1)[1]
    from app.security import token_digest

    device_id = client.app.state.db.find_device_by_token_hash(
        token_digest(token, client.app.state.settings.token_pepper)
    )
    account = client.app.state.db.account_for_device(device_id)
    assert account is not None
    return str(account["id"])
