from dataclasses import replace

import fitz

from conftest import auth_headers, bind_test_device, create_test_account, make_client, register


def _write_lecture_pdf(path):
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 100), "A complex engineering diagram is described on this page.")
    document.save(path)
    document.close()


def _upload_lecture(client, headers, source):
    with source.open("rb") as stream:
        response = client.post(
            "/v2/documents/analyze",
            headers=headers,
            files={"file": ("lecture.pdf", stream, "application/pdf")},
        )
    assert response.status_code == 200, response.text
    return response.json()


def test_upload_document_and_read_page_image(settings, monkeypatch, tmp_path):
    monkeypatch.setenv("DOCUMENT_STORAGE_ROOT", str(tmp_path / "assets"))
    source = tmp_path / "lecture.pdf"
    _write_lecture_pdf(source)

    client = make_client(settings, lambda request: None)
    headers = auth_headers(client)
    asset = _upload_lecture(client, headers, source)
    assert asset["pages"][0]["pageIndex"] == 0
    assert asset["pages"][0]["nativeText"]

    filename = asset["pages"][0]["imageRelativePath"].rsplit("/", 1)[-1]
    image = client.get(f"/v2/documents/{asset['documentId']}/pages/{filename}", headers=headers)
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"
    assert image.content.startswith(b"\xff\xd8")
    assert "private" in image.headers.get("cache-control", "")
    assert "no-store" in image.headers.get("cache-control", "")


def test_foreign_account_cannot_read_document_pages(settings, monkeypatch, tmp_path):
    monkeypatch.setenv("DOCUMENT_STORAGE_ROOT", str(tmp_path / "assets"))
    source = tmp_path / "lecture.pdf"
    _write_lecture_pdf(source)

    client = make_client(settings, lambda request: None)
    owner = auth_headers(client)
    asset = _upload_lecture(client, owner, source)
    filename = asset["pages"][0]["imageRelativePath"].rsplit("/", 1)[-1]
    page_url = f"/v2/documents/{asset['documentId']}/pages/{filename}"

    foreign = client.get(page_url, headers=auth_headers(client))
    missing = client.get(
        "/v2/documents/aaaaaaaaaaaaaaaaaaaaaaaa/pages/page-0000.jpg",
        headers=owner,
    )
    assert foreign.status_code == 404
    assert foreign.json()["detail"] == "Page not found"
    assert missing.status_code == 404
    assert missing.json()["detail"] == foreign.json()["detail"]


def test_sibling_device_on_same_account_can_read_pages(settings, monkeypatch, tmp_path):
    monkeypatch.setenv("DOCUMENT_STORAGE_ROOT", str(tmp_path / "assets"))
    source = tmp_path / "lecture.pdf"
    _write_lecture_pdf(source)

    client = make_client(settings, lambda request: None)
    first = register(client, activate=True)
    owner_headers = {"Authorization": f"Bearer {first['token']}"}
    asset = _upload_lecture(client, owner_headers, source)
    filename = asset["pages"][0]["imageRelativePath"].rsplit("/", 1)[-1]
    page_url = f"/v2/documents/{asset['documentId']}/pages/{filename}"

    sibling = register(client, activate=False)
    bind_test_device(
        client,
        sibling["deviceId"],
        {
            "id": first["accountId"],
            "max_devices": client.app.state.settings.account_default_max_devices,
        },
    )
    sibling_headers = {"Authorization": f"Bearer {sibling['token']}"}
    image = client.get(page_url, headers=sibling_headers)
    assert image.status_code == 200, image.text
    assert image.content.startswith(b"\xff\xd8")


def test_legacy_document_without_owner_record_returns_404(settings, monkeypatch, tmp_path):
    monkeypatch.setenv("DOCUMENT_STORAGE_ROOT", str(tmp_path / "assets"))
    source = tmp_path / "lecture.pdf"
    _write_lecture_pdf(source)

    client = make_client(settings, lambda request: None)
    headers = auth_headers(client)
    asset = _upload_lecture(client, headers, source)
    filename = asset["pages"][0]["imageRelativePath"].rsplit("/", 1)[-1]
    with client.app.state.db.connect() as connection:
        connection.execute("DELETE FROM document_access")
    image = client.get(
        f"/v2/documents/{asset['documentId']}/pages/{filename}",
        headers=headers,
    )
    assert image.status_code == 404
    assert image.json()["detail"] == "Page not found"


def test_binding_account_transfers_standalone_document_access(settings, monkeypatch, tmp_path):
    monkeypatch.setenv("DOCUMENT_STORAGE_ROOT", str(tmp_path / "assets"))
    source = tmp_path / "lecture.pdf"
    _write_lecture_pdf(source)

    client = make_client(replace(settings, require_account_activation=False), lambda request: None)
    standalone = register(client, activate=False)
    headers = {"Authorization": f"Bearer {standalone['token']}"}
    asset = _upload_lecture(client, headers, source)
    filename = asset["pages"][0]["imageRelativePath"].rsplit("/", 1)[-1]
    page_url = f"/v2/documents/{asset['documentId']}/pages/{filename}"

    account, _ = create_test_account(client)
    bind_test_device(client, standalone["deviceId"], account)

    image = client.get(page_url, headers=headers)
    assert image.status_code == 200, image.text
    with client.app.state.db.connect() as connection:
        owners = connection.execute(
            "SELECT owner_key FROM document_access WHERE document_id = ?",
            (asset["documentId"],),
        ).fetchall()
    assert [row["owner_key"] for row in owners] == [f"account:{account['id']}"]


def test_document_access_failure_releases_document_quota(settings, monkeypatch, tmp_path):
    monkeypatch.setenv("DOCUMENT_STORAGE_ROOT", str(tmp_path / "assets"))
    source = tmp_path / "lecture.pdf"
    _write_lecture_pdf(source)

    client = make_client(settings, lambda request: None)
    owner = register(client)
    headers = {"Authorization": f"Bearer {owner['token']}"}

    def fail_grant(document_id, owner_key):
        raise RuntimeError("grant failed")

    monkeypatch.setattr(client.app.state.db, "grant_document_access", fail_grant)
    with source.open("rb") as stream:
        response = client.post(
            "/v2/documents/analyze",
            headers=headers,
            files={"file": ("lecture.pdf", stream, "application/pdf")},
        )

    assert response.status_code == 503
    assert response.json()["detail"] == "grant failed"
    usage = client.app.state.db.account_usage_today(
        owner["accountId"], client.app.state.db.today()
    )
    assert usage["documents"] == 0


def test_same_document_can_be_claimed_by_multiple_accounts(settings, monkeypatch, tmp_path):
    monkeypatch.setenv("DOCUMENT_STORAGE_ROOT", str(tmp_path / "assets"))
    source = tmp_path / "lecture.pdf"
    _write_lecture_pdf(source)

    client = make_client(settings, lambda request: None)
    first = register(client)
    second = register(client)
    first_headers = {"Authorization": f"Bearer {first['token']}"}
    second_headers = {"Authorization": f"Bearer {second['token']}"}
    first_asset = _upload_lecture(client, first_headers, source)
    second_asset = _upload_lecture(client, second_headers, source)
    assert second_asset["documentId"] == first_asset["documentId"]

    filename = first_asset["pages"][0]["imageRelativePath"].rsplit("/", 1)[-1]
    page_url = f"/v2/documents/{first_asset['documentId']}/pages/{filename}"
    assert client.get(page_url, headers=first_headers).status_code == 200
    assert client.get(page_url, headers=second_headers).status_code == 200
    assert client.get(page_url, headers=auth_headers(client)).status_code == 404

    with client.app.state.db.connect() as connection:
        owners = connection.execute(
            "SELECT owner_key FROM document_access WHERE document_id = ?",
            (first_asset["documentId"],),
        ).fetchall()
    assert {row["owner_key"] for row in owners} == {
        f"account:{first['accountId']}",
        f"account:{second['accountId']}",
    }


def test_reupload_restores_access_to_legacy_document(settings, monkeypatch, tmp_path):
    monkeypatch.setenv("DOCUMENT_STORAGE_ROOT", str(tmp_path / "assets"))
    source = tmp_path / "lecture.pdf"
    _write_lecture_pdf(source)

    client = make_client(settings, lambda request: None)
    owner = register(client)
    headers = {"Authorization": f"Bearer {owner['token']}"}
    asset = _upload_lecture(client, headers, source)
    filename = asset["pages"][0]["imageRelativePath"].rsplit("/", 1)[-1]
    page_url = f"/v2/documents/{asset['documentId']}/pages/{filename}"
    with client.app.state.db.connect() as connection:
        connection.execute(
            "DELETE FROM document_access WHERE document_id = ?",
            (asset["documentId"],),
        )
    assert client.get(page_url, headers=headers).status_code == 404

    restored = _upload_lecture(client, headers, source)

    assert restored["documentId"] == asset["documentId"]
    image = client.get(page_url, headers=headers)
    assert image.status_code == 200, image.text
    assert image.content.startswith(b"\xff\xd8")
