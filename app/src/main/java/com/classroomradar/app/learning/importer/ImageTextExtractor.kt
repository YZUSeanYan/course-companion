package com.classroomradar.app.learning.importer

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Task
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

internal class ImageTextExtractor(private val context: Context) {
    suspend fun extract(file: File): String {
        val recognizer = TextRecognition.getClient(
            ChineseTextRecognizerOptions.Builder().build(),
        )
        try {
            val image = InputImage.fromFilePath(context, Uri.fromFile(file))
            val result = recognizer.process(image).awaitResult()
            return finalizeExtractedText(result.text, "图片中未识别到文字")
        } catch (failure: CancellationException) {
            throw failure
        } catch (failure: LectureImportException) {
            throw failure
        } catch (failure: Exception) {
            throw LectureImportException("图片 OCR 识别失败，请确认图片有效且文字清晰", failure)
        } finally {
            recognizer.close()
        }
    }
}

private suspend fun <T : Any> Task<T>.awaitResult(): T =
    suspendCancellableCoroutine { continuation ->
        addOnSuccessListener { result ->
            if (continuation.isActive) {
                continuation.resume(result)
            }
        }
        addOnFailureListener { failure ->
            if (continuation.isActive) {
                continuation.resumeWithException(failure)
            }
        }
        addOnCanceledListener {
            if (continuation.isActive) {
                continuation.cancel()
            }
        }
    }
