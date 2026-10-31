package com.classroomradar.app.learning.api

import kotlinx.serialization.Serializable

@Serializable
data class DocumentBlockDto(
    val regionId: String,
    val type: String,
    val text: String = "",
    val bboxNorm: List<Float>? = null,
    val cropRelativePath: String? = null,
)

@Serializable
data class DocumentPageDto(
    val pageId: String,
    val pageIndex: Int,
    val nativeText: String = "",
    val ocrText: String = "",
    val pageText: String = "",
    val textSource: String,
    val imageRelativePath: String,
    val widthPx: Int,
    val heightPx: Int,
    val status: String,
    val blocks: List<DocumentBlockDto> = emptyList(),
)

@Serializable
data class DocumentAssetDto(
    val documentId: String,
    val sha256: String,
    val mimeType: String,
    val parserVersion: String,
    val status: String,
    val pages: List<DocumentPageDto>,
    val errors: List<String> = emptyList(),
)

internal fun DocumentPageDto.requiresVisionForLearningPack(): Boolean =
    !(status == "COMPLETE" && textSource == "pdf_text" && pageText.isNotBlank())
