import fitz

from conftest import auth_headers, make_client


def test_upload_document_and_read_page_image(settings, monkeypatch, tmp_path):
    monkeypatch.setenv("DOCUMENT_STORAGE_ROOT", str(tmp_path / "assets"))
    source = tmp_path / "lecture.pdf"
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 100), "A complex engineering diagram is described on this page.")
    document.save(source)
    document.close()

    client = make_client(settings, lambda request: None)
    headers = auth_headers(client)
    with source.open("rb") as stream:
        response = client.post(
            "/v2/documents/analyze",
            headers=headers,
            files={"file": ("lecture.pdf", stream, "application/pdf")},
        )
    assert response.status_code == 200, response.text
    asset = response.json()
    assert asset["pages"][0]["pageIndex"] == 0
    assert asset["pages"][0]["nativeText"]

    filename = asset["pages"][0]["imageRelativePath"].rsplit("/", 1)[-1]
    image = client.get(f"/v2/documents/{asset['documentId']}/pages/{filename}", headers=headers)
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"
    assert image.content.startswith(b"\xff\xd8")

    # Another activated account must not read another user's rendered pages.
    foreign_headers = auth_headers(client)
    foreign = client.get(
        f"/v2/documents/{asset['documentId']}/pages/{filename}",
        headers=foreign_headers,
    )
    assert foreign.status_code == 404
