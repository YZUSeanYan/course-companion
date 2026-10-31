package com.classroomradar.app.audio

import android.content.Context
import com.classroomradar.app.BuildConfig
import com.classroomradar.app.data.AppPreferences
import com.classroomradar.app.data.ClassroomRepository
import com.classroomradar.app.data.TranslationEntity
import com.classroomradar.app.learning.api.AiServiceConfig
import com.classroomradar.app.learning.api.LecsyncApiClient
import com.classroomradar.app.learning.api.LecsyncTerm
import com.classroomradar.app.learning.api.LecsyncTranslationRequest
import com.classroomradar.app.learning.api.LearningApiClient
import kotlinx.coroutines.runBlocking
import java.security.MessageDigest
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Translates finalized transcript lines without blocking recording or source persistence. */
class TranslationCoordinator(context: Context) {
    private val repository = ClassroomRepository.get(context)
    private val preferences = AppPreferences.get(context)
    private val aiServiceConfig = AiServiceConfig(context)
    private val api = LecsyncApiClient(context, aiServiceConfig)
    private val fallbackApi = LearningApiClient(
        context,
        BuildConfig.LEARNING_API_BASE_URL,
        baseUrlProvider = aiServiceConfig::baseUrl,
    )
    private val worker: ExecutorService = Executors.newSingleThreadExecutor()

    fun enqueue(lineId: Long, sourceText: String) {
        if (!preferences.translationEnabled || sourceText.isBlank()) return
        val sourceHash = sourceText.toByteArray(Charsets.UTF_8).sha256()
        val pair = preferences.cloudTranslationPair.split(',', '，', ' ').map(String::trim).filter(String::isNotEmpty)
        val targetLang = pair.getOrNull(1) ?: "zh"
        val terms = preferences.cloudTermPairs.lines().mapNotNull { line ->
            val parts = line.split('=', '＝', limit = 2)
            if (parts.size == 2 && parts[0].isNotBlank() && parts[1].isNotBlank()) LecsyncTerm(parts[0].trim(), parts[1].trim()) else null
        }.take(20)
        repository.upsertTranslation(
            TranslationEntity(
                transcriptLineId = lineId,
                targetLang = targetLang,
                sourceHash = sourceHash,
                updatedAtMillis = System.currentTimeMillis(),
            ),
        )
        worker.execute {
            runCatching {
                val result = runCatching {
                    runBlocking {
                        api.translate(
                            LecsyncTranslationRequest(
                                sourceText = sourceText,
                                sourceLang = "auto",
                                targetLang = targetLang,
                                context = preferences.cloudContext,
                                model = preferences.cloudTranslationModel.trim().ifEmpty { null },
                                terms = terms,
                                lineId = lineId,
                                sourceHash = sourceHash,
                            ),
                        ).finalText
                    }
                }.getOrElse {
                    runBlocking { fallbackApi.translate(lineId, sourceText, sourceHash, if (targetLang == "zh") "zh-CN" else "en-US").translation }
                }
                repository.upsertTranslation(
                    TranslationEntity(
                        transcriptLineId = lineId,
                        targetLang = targetLang,
                        sourceHash = sourceHash,
                        translatedText = result,
                        status = TranslationEntity.STATUS_DONE,
                        updatedAtMillis = System.currentTimeMillis(),
                    ),
                )
            }.onFailure {
                repository.upsertTranslation(
                    TranslationEntity(
                        transcriptLineId = lineId,
                        targetLang = targetLang,
                        sourceHash = sourceHash,
                        status = TranslationEntity.STATUS_FAILED,
                        updatedAtMillis = System.currentTimeMillis(),
                    ),
                )
            }
        }
    }

    fun close() = worker.shutdown()

    private fun ByteArray.sha256(): String =
        MessageDigest.getInstance("SHA-256").digest(this).joinToString("") { "%02x".format(it) }
}
