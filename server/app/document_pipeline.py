from __future__ import annotations

import hashlib
import json
import os
import shlex
import subprocess
from pathlib import Path
from typing import Any

import fitz
from PIL import Image

from .document_models import BlockAsset, DocumentAsset, PageAsset

PARSER_VERSION = "page-assets-v1"
MAX_FILE_BYTES = 50 * 1024 * 1024
MAX_PAGES = 100
RENDER_DPI = 200


def analyze_document(path: Path | str, mime_type: str, output_root: Path | str) -> DocumentAsset:
    source = Path(path).resolve()
    if not source.is_file():
        raise ValueError("Document does not exist")
    if source.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("Document exceeds the 50MB limit")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    document_id = digest[:24]
    root = Path(output_root).resolve()
    destination = (root / document_id).resolve()
    destination.relative_to(root)
    destination.mkdir(parents=True, exist_ok=True)
    pages_dir = destination / "pages"
    pages_dir.mkdir(exist_ok=True)

    if mime_type == "application/pdf" or source.suffix.lower() == ".pdf":
        pages = _process_pdf(source, document_id, pages_dir)
    elif mime_type in {"image/jpeg", "image/png"} or source.suffix.lower() in {".jpg", ".jpeg", ".png"}:
        pages = [_process_image(source, document_id, pages_dir)]
    else:
        raise ValueError("Only PDF, JPEG and PNG are supported by the page pipeline")

    statuses = {page.status for page in pages}
    status = "NEEDS_VISION_PARSER" if "NEEDS_VISION_PARSER" in statuses else "COMPLETE"
    errors = [f"Page {page.pageIndex + 1}: {page.status}" for page in pages if page.status != "COMPLETE"]
    asset = DocumentAsset(document_id, digest, mime_type, PARSER_VERSION, status, pages, errors)
    (destination / "asset.json").write_text(json.dumps(asset.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    return asset


def convert_office_to_pdf(source: Path, output_dir: Path) -> Path:
    executable = os.getenv("LIBREOFFICE_PATH", "libreoffice")
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            [executable, "--headless", "--convert-to", "pdf", "--outdir", str(output_dir), str(source)],
            check=True,
            capture_output=True,
            timeout=120,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise RuntimeError("LibreOffice conversion is unavailable or failed") from exc
    result = output_dir / f"{source.stem}.pdf"
    if not result.is_file():
        raise RuntimeError("LibreOffice did not produce a PDF")
    return result


def _process_pdf(source: Path, document_id: str, pages_dir: Path) -> list[PageAsset]:
    document = fitz.open(source)
    if len(document) > MAX_PAGES:
        raise ValueError(f"PDF exceeds the {MAX_PAGES}-page limit")
    pages: list[PageAsset] = []
    for index, pdf_page in enumerate(document):
        native = pdf_page.get_text("text").strip()
        page_id = f"{document_id}:p:{index}"
        image_path = pages_dir / f"page-{index:04d}.jpg"
        pixmap = pdf_page.get_pixmap(dpi=RENDER_DPI, alpha=False)
        pixmap.save(image_path)
        if _reliable_text(native):
            page = PageAsset(page_id, index, native, "", native, "pdf_text", f"pages/{image_path.name}", pixmap.width, pixmap.height, "COMPLETE")
        else:
            ocr_text, blocks, status = _parse_complex_page(image_path, page_id, pixmap.width, pixmap.height)
            page = PageAsset(page_id, index, native, ocr_text, ocr_text or native, "ocr" if ocr_text else "pdf_text", f"pages/{image_path.name}", pixmap.width, pixmap.height, status, blocks)
        pages.append(page)
    document.close()
    return pages


def _process_image(source: Path, document_id: str, pages_dir: Path) -> PageAsset:
    with Image.open(source) as image:
        from PIL import ImageOps

        image = ImageOps.exif_transpose(image).convert("RGB")
        if image.width * image.height > 40_000_000:
            raise ValueError("Image exceeds the 40-megapixel limit")
        image_path = pages_dir / "page-0000.jpg"
        image.save(image_path, quality=92)
        ocr_text, blocks, status = _parse_complex_page(image_path, f"{document_id}:p:0", image.width, image.height)
        return PageAsset(
            f"{document_id}:p:0",
            0,
            "",
            ocr_text,
            ocr_text,
            "ocr" if ocr_text else "image",
            f"pages/{image_path.name}",
            image.width,
            image.height,
            status,
            blocks,
        )


def _reliable_text(text: str) -> bool:
    compact = "".join(text.split())
    if len(compact) < 20:
        return False
    return text.count("�") / max(1, len(text)) < 0.02


def _parse_complex_page(image_path: Path, page_id: str, width: int, height: int) -> tuple[str, list[BlockAsset], str]:
    command = os.getenv("MINERU_COMMAND")
    if not command:
        return "", [], "NEEDS_VISION_PARSER"
    output_dir = image_path.parent / f"mineru-{page_id.replace(':', '-')}"
    output_dir.mkdir(exist_ok=True)
    try:
        subprocess.run(
            [*shlex.split(command), "-p", f"pages/{image_path.name}", "-o", str(output_dir)],
            check=True,
            capture_output=True,
            timeout=180,
        )
    except (OSError, subprocess.SubprocessError):
        return "", [], "NEEDS_VISION_PARSER"
    candidates = list(output_dir.rglob("*_content_list.json"))
    if not candidates:
        return "", [], "NEEDS_VISION_PARSER"
    try:
        content = json.loads(candidates[0].read_text(encoding="utf-8"))
        text, blocks = _map_mineru_content(content, page_id, width, height)
        return text, blocks, "COMPLETE" if text or blocks else "NEEDS_VISION_PARSER"
    except (OSError, ValueError, TypeError, KeyError):
        return "", [], "NEEDS_VISION_PARSER"


def _map_mineru_content(content: list[dict[str, Any]] | dict[str, Any], page_id: str, width: int, height: int) -> tuple[str, list[BlockAsset]]:
    if isinstance(content, dict):
        content = content.get("content_list") or content.get("items") or []
    blocks: list[BlockAsset] = []
    texts: list[str] = []
    for index, item in enumerate(content):
        if not isinstance(item, dict):
            continue
        raw_type = str(item.get("type", "text")).lower()
        block_type = {
            "equation": "formula",
            "formula": "formula",
            "table": "table",
            "image": "figure",
            "figure": "figure",
            "annotation": "annotation",
        }.get(raw_type, "text")
        text = str(item.get("text") or item.get("latex") or item.get("content") or "").strip()
        bbox = _normalized_bbox(item.get("bbox"), width, height)
        blocks.append(BlockAsset(f"{page_id}:b:{index}", block_type, text, bbox))
        if text:
            texts.append(text)
    return "\n".join(texts), blocks


def _normalized_bbox(raw: Any, width: int, height: int) -> list[float] | None:
    if not isinstance(raw, (list, tuple)) or len(raw) != 4 or width <= 0 or height <= 0:
        return None
    try:
        x0, y0, x1, y1 = (float(value) for value in raw)
        return [
            max(0.0, min(1.0, x0 / width)),
            max(0.0, min(1.0, y0 / height)),
            max(0.0, min(1.0, x1 / width)),
            max(0.0, min(1.0, y1 / height)),
        ]
    except (TypeError, ValueError):
        return None
