package com.classroomradar.app.learning

import java.time.Instant
import java.time.ZoneId
import java.util.Locale

internal fun filterLearningItems(items: List<LearningItemEntity>, query: String): List<LearningItemEntity> {
    val term = query.trim()
    if (term.isEmpty()) return items
    return items.filter { item ->
        item.title.contains(term, ignoreCase = true) ||
            item.content.contains(term, ignoreCase = true) ||
            item.translation?.contains(term, ignoreCase = true) == true ||
            item.example?.contains(term, ignoreCase = true) == true
    }
}

internal fun supportsLearningPronunciation(type: String): Boolean =
    type == LearningItemEntity.TYPE_VOCABULARY || type == LearningItemEntity.TYPE_PHRASE

// Learning items and review cards are bilingual without a per-field locale.
internal fun learningSpeechLocale(text: String): Locale =
    if (text.codePoints().anyMatch { Character.UnicodeScript.of(it) == Character.UnicodeScript.HAN }) {
        Locale.CHINA
    } else {
        Locale.US
    }

internal fun countCardsReviewedToday(
    cards: List<ReviewCardEntity>,
    nowMillis: Long,
    zone: ZoneId = ZoneId.systemDefault(),
): Int {
    val startOfToday = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate()
        .atStartOfDay(zone).toInstant().toEpochMilli()
    return cards.count { card -> card.lastReviewedAtMillis?.let { it >= startOfToday } == true }
}
