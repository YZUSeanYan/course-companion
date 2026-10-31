package com.classroomradar.app.audio

import com.classroomradar.app.data.AppPreferences
import com.classroomradar.app.learning.api.LecsyncTerm
import com.classroomradar.app.learning.api.RealtimeConfig
import com.classroomradar.app.learning.api.RealtimeGlossaryConfig
import com.classroomradar.app.learning.api.RealtimeTranscribeConfig
import com.classroomradar.app.learning.api.RealtimeTranslateConfig

private const val MAX_GLOSSARY_ITEMS = 50

internal fun parseCloudHotwords(value: String): List<String> = value.lines()
    .map(String::trim)
    .filter(String::isNotEmpty)
    .distinct()
    .take(MAX_GLOSSARY_ITEMS)

internal fun serializeCloudHotwords(values: List<String>): String = values
    .map(String::trim)
    .filter(String::isNotEmpty)
    .distinct()
    .take(MAX_GLOSSARY_ITEMS)
    .joinToString("\n")

internal fun parseCloudTermPairs(value: String): List<LecsyncTerm> = value.lines().mapNotNull { line ->
    val split = line.split('=', '＝', limit = 2)
    split.takeIf { it.size == 2 && it[0].isNotBlank() && it[1].isNotBlank() }?.let {
        LecsyncTerm(it[0].trim(), it[1].trim())
    }
}.distinctBy { it.source.lowercase() }.take(MAX_GLOSSARY_ITEMS)

internal fun serializeCloudTermPairs(values: List<LecsyncTerm>): String = values
    .filter { it.source.isNotBlank() && it.target.isNotBlank() }
    .distinctBy { it.source.lowercase() }
    .take(MAX_GLOSSARY_ITEMS)
    .joinToString("\n") { "${it.source.trim()}=${it.target.trim()}" }

fun AppPreferences.realtimeConfig(): RealtimeConfig {
    val languages = cloudLanguageHints.split(',', '，', ' ').map(String::trim).filter(String::isNotEmpty).distinct().ifEmpty { listOf("en", "zh") }
    val terms = parseCloudHotwords(cloudHotwords)
    val pairs = parseCloudTermPairs(cloudTermPairs)
    val translationPair = cloudTranslationPair.split(',', '，', ' ').map(String::trim).filter(String::isNotEmpty).distinct()
    val selectedPair = if (translationPair.size == 2) translationPair else listOf("en", "zh")
    return RealtimeConfig(
        transcribe = RealtimeTranscribeConfig(
            languages = languages,
            strict = cloudStrictLanguages,
            identifyLanguage = cloudIdentifyLanguage,
            displayMode = cloudDisplayMode,
            segmentation = if (cloudDisplayMode == "sentence") null else cloudSegmentation,
            speakers = cloudSpeakersEnabled,
        ),
        translate = if (cloudTranslationEnabled) RealtimeTranslateConfig(selectedPair) else null,
        glossary = if (terms.isEmpty() && pairs.isEmpty() && cloudContext.isBlank()) null else RealtimeGlossaryConfig(
            terms = terms.ifEmpty { null },
            pairs = pairs.ifEmpty { null },
            context = cloudContext.trim().ifEmpty { null },
        ),
        aiEnhance = cloudEnhanceEnabled && cloudTranslationEnabled,
        digest = cloudDigestEnabled,
        store = cloudStoreEnabled,
        region = cloudRegion.takeIf { it != "auto" },
    )
}
