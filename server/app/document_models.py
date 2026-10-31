from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal


@dataclass(slots=True)
class BlockAsset:
    regionId: str
    type: Literal["text", "formula", "table", "figure", "annotation"]
    text: str = ""
    bboxNorm: list[float] | None = None
    cropRelativePath: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class PageAsset:
    pageId: str
    pageIndex: int
    nativeText: str
    ocrText: str
    pageText: str
    textSource: str
    imageRelativePath: str
    widthPx: int
    heightPx: int
    status: str
    blocks: list[BlockAsset] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {**asdict(self), "blocks": [block.to_dict() for block in self.blocks]}


@dataclass(slots=True)
class DocumentAsset:
    documentId: str
    sha256: str
    mimeType: str
    parserVersion: str
    status: str
    pages: list[PageAsset]
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {**asdict(self), "pages": [page.to_dict() for page in self.pages]}
