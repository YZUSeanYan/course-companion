package com.classroomradar.app.learning.importer

import android.content.Context
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
import java.io.IOException

internal data class PdfExtraction(val text: String, val pageCount: Int)

internal object PdfTextExtractor {
    @Volatile
    private var initialized = false

    fun extract(context: Context, file: File): PdfExtraction {
        try {
            initializePdfBox(context)
            PDDocument.load(file).use { document ->
                val pageCount = document.numberOfPages
                if (pageCount == 0) {
                    throw LectureImportException("PDF 没有可导入的页面")
                }
                val stripper = PDFTextStripper()
                val text = StringBuilder()
                for (page in 1..pageCount) {
                    stripper.startPage = page
                    stripper.endPage = page
                    val pageText = stripper.getText(document)
                    if (pageText.isNotBlank()) {
                        text.append(pageText).append('\n')
                        if (text.length >= MAX_EXTRACTED_TEXT_CHARS) {
                            break
                        }
                    }
                }
                return PdfExtraction(
                    text = finalizeExtractedText(
                        rawText = text.toString(),
                        emptyMessage = "当前页无文本层，请使用图片导入",
                    ),
                    pageCount = pageCount,
                )
            }
        } catch (failure: LectureImportException) {
            throw failure
        } catch (failure: IOException) {
            throw LectureImportException("PDF 读取失败，文件可能损坏、加密或不受支持", failure)
        }
    }

    private fun initializePdfBox(context: Context) {
        if (initialized) return
        synchronized(this) {
            if (!initialized) {
                PDFBoxResourceLoader.init(context.applicationContext)
                initialized = true
            }
        }
    }
}
