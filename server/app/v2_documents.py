from __future__ import annotations

import asyncio
import os
import re
import tempfile
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import Settings
from .document_pipeline import analyze_document
from .security import token_digest

bearer_documents = HTTPBearer(auto_error=False)
ALLOWED_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def register_document_routes(app: FastAPI, settings: Settings) -> None:
    root = Path(os.getenv("DOCUMENT_STORAGE_ROOT", "document_assets")).resolve()
    root.mkdir(parents=True, exist_ok=True)

    async def device_id(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_documents)) -> str:
        if credentials is None or credentials.scheme.lower() != "bearer" or not settings.token_pepper:
            raise HTTPException(status_code=401, detail="A valid bearer device token is required")
        found = app.state.db.find_device_by_token_hash(token_digest(credentials.credentials, settings.token_pepper))
        if found is None:
            raise HTTPException(status_code=401, detail="Invalid device token")
        return found

    @app.post("/v2/documents/analyze")
    async def upload_document(file: UploadFile = File(...), _: str = Depends(device_id)) -> dict:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in ALLOWED_SUFFIXES:
            raise HTTPException(status_code=422, detail="Only PDF, JPEG and PNG documents are supported")
        mime = "application/pdf" if suffix == ".pdf" else ("image/png" if suffix == ".png" else "image/jpeg")
        with tempfile.TemporaryDirectory(prefix="course-document-") as temporary:
            source = Path(temporary) / f"upload{suffix}"
            total = 0
            with source.open("wb") as output:
                while chunk := await file.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_UPLOAD_BYTES:
                        raise HTTPException(status_code=413, detail="Document exceeds the 50MB limit")
                    output.write(chunk)
            if total == 0:
                raise HTTPException(status_code=422, detail="Document is empty")
            with source.open("rb") as input_file:
                signature = input_file.read(8)
            if suffix == ".pdf" and not signature.startswith(b"%PDF"):
                raise HTTPException(status_code=422, detail="Invalid PDF signature")
            if suffix == ".png" and signature != b"\x89PNG\r\n\x1a\n":
                raise HTTPException(status_code=422, detail="Invalid PNG signature")
            if suffix in {".jpg", ".jpeg"} and not signature.startswith(b"\xff\xd8"):
                raise HTTPException(status_code=422, detail="Invalid JPEG signature")
            try:
                asset = await asyncio.to_thread(analyze_document, source, mime, root)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            except RuntimeError as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc
            return asset.to_dict()

    @app.get("/v2/documents/{document_id}/pages/{filename}")
    def page_image(document_id: str, filename: str, _: str = Depends(device_id)) -> FileResponse:
        if not re.fullmatch(r"[0-9a-f]{24}", document_id) or not re.fullmatch(r"page-\d{4}\.jpg", filename):
            raise HTTPException(status_code=404, detail="Page not found")
        path = (root / document_id / "pages" / filename).resolve()
        path.relative_to(root)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Page not found")
        return FileResponse(path, media_type="image/jpeg")
