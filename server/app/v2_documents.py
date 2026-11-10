from __future__ import annotations

import asyncio
import os
import re
import tempfile
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .accounts import resolve_quota_subject
from .auth import activated_device
from .config import Settings
from .document_pipeline import analyze_document

ALLOWED_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def register_document_routes(app: FastAPI, settings: Settings) -> None:
    root = Path(os.getenv("DOCUMENT_STORAGE_ROOT", "document_assets")).resolve()
    root.mkdir(parents=True, exist_ok=True)

    def document_owner(device: str) -> str:
        # Identical files may share on-disk assets, but access is per account
        # (or per standalone device when no account is bound).
        subject = resolve_quota_subject(app.state.db, settings, device)
        return f"account:{subject.account_id}" if subject.account_id else f"device:{device}"

    @app.post("/v2/documents/analyze")
    async def upload_document(
        file: UploadFile = File(...), device: str = Depends(activated_device)
    ) -> dict:
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
            subject = resolve_quota_subject(app.state.db, settings, device)
            app.state.db.reserve_document(
                device, subject.limits.documents, subject.account_id
            )
            try:
                asset = await asyncio.to_thread(analyze_document, source, mime, root)
            except ValueError as exc:
                app.state.db.release_document(device, subject.account_id)
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            except RuntimeError as exc:
                app.state.db.release_document(device, subject.account_id)
                raise HTTPException(status_code=503, detail=str(exc)) from exc
            except Exception:
                app.state.db.release_document(device, subject.account_id)
                raise
            app.state.db.grant_document_access(asset.documentId, document_owner(device))
            return asset.to_dict()

    @app.get("/v2/documents/{document_id}/pages/{filename}")
    def page_image(
        document_id: str, filename: str, device: str = Depends(activated_device)
    ) -> FileResponse:
        document_match = re.fullmatch(r"([0-9a-f]{24})", document_id)
        page_match = re.fullmatch(r"page-(\d{4})\.jpg", filename)
        if document_match is None or page_match is None:
            raise HTTPException(status_code=404, detail="Page not found")
        # Rebuild both components from parsed integers so the path can only
        # contain characters produced by this formatting, never raw input.
        document_key = f"{int(document_match.group(1), 16):024x}"
        if not app.state.db.has_document_access(document_key, document_owner(device)):
            raise HTTPException(status_code=404, detail="Page not found")
        safe_filename = f"page-{int(page_match.group(1)):04d}.jpg"
        path = (root / document_key / "pages" / safe_filename).resolve()
        path.relative_to(root)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Page not found")
        return FileResponse(
            path,
            media_type="image/jpeg",
            headers={"Cache-Control": "private, no-store", "Vary": "Authorization"},
        )
