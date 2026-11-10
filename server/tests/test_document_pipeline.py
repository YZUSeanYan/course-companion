from pathlib import Path

import fitz
from PIL import Image

from app.document_pipeline import analyze_document


def test_pdf_pages_have_real_indices_text_and_images(tmp_path: Path):
    source = tmp_path / "lecture.pdf"
    document = fitz.open()
    for index in range(2):
        page = document.new_page()
        page.insert_text((72, 100), f"Engineering lecture page {index + 1}: tolerance and precision.")
    document.save(source)
    document.close()

    asset = analyze_document(source, "application/pdf", tmp_path / "out")

    assert asset.status == "COMPLETE"
    assert len(asset.pages) == 2
    assert asset.pages[1].pageIndex == 1
    assert "page 2" in asset.pages[1].nativeText
    assert (tmp_path / "out" / asset.documentId / asset.pages[0].imageRelativePath).is_file()
    assert asset.pages[0].widthPx > 0


def test_image_without_parser_keeps_page_asset_and_reports_status(tmp_path: Path):
    source = tmp_path / "diagram.png"
    Image.new("RGB", (320, 180), "white").save(source)

    asset = analyze_document(source, "image/png", tmp_path / "out")

    assert asset.status == "NEEDS_VISION_PARSER"
    assert asset.pages[0].status == "NEEDS_VISION_PARSER"
    assert asset.pages[0].pageIndex == 0
    assert asset.pages[0].blocks == []
    assert (tmp_path / "out" / asset.documentId / asset.pages[0].imageRelativePath).is_file()
    assert (tmp_path / "out" / asset.documentId / "asset.json").is_file()


def test_missing_input_is_rejected(tmp_path: Path):
    try:
        analyze_document(tmp_path / "missing.pdf", "application/pdf", tmp_path / "out")
    except ValueError as error:
        assert "does not exist" in str(error)
    else:
        raise AssertionError("missing document should fail")


def test_oversized_pdf_page_is_rejected_before_pixmap_allocation(tmp_path: Path):
    source = tmp_path / "oversized.pdf"
    document = fitz.open()
    document.new_page(width=3000, height=3000)
    document.save(source)
    document.close()

    try:
        analyze_document(source, "application/pdf", tmp_path / "out")
    except ValueError as exc:
        assert "40-megapixel" in str(exc)
    else:
        raise AssertionError("expected a render-pixel limit error")
