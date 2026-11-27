package com.classroomradar.app.learning

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

class LearningUiLogicTest {
    @Test
    fun searchMatchesAllFourFieldsIgnoringCaseAndPreservingOrder() {
        val items = listOf(
            item(1).copy(title = "Gradient descent"),
            item(2),
            item(3).copy(content = "Use the GRADIENT"),
            item(4).copy(translation = "gradient translation"),
            item(5).copy(example = "A Gradient example"),
        )

        assertEquals(listOf(1L, 3L, 4L, 5L), filterLearningItems(items, "  GrAdIeNt ").map { it.id })
        assertEquals(emptyList<LearningItemEntity>(), filterLearningItems(items, "missing"))
        assertEquals(items, filterLearningItems(items, "   "))
    }

    @Test
    fun pronunciationIsLimitedToVocabularyAndPhrasesAndUsesChineseOrEnglish() {
        assertTrue(supportsLearningPronunciation(LearningItemEntity.TYPE_VOCABULARY))
        assertTrue(supportsLearningPronunciation(LearningItemEntity.TYPE_PHRASE))
        assertFalse(supportsLearningPronunciation(LearningItemEntity.TYPE_KEY_POINT))
        assertFalse(supportsLearningPronunciation(LearningItemEntity.TYPE_QUESTION))
        assertEquals(Locale.US, learningSpeechLocale("gradient descent"))
        assertEquals(Locale.CHINA, learningSpeechLocale("梯度下降"))
        assertEquals(Locale.CHINA, learningSpeechLocale("梯度 (gradient)"))
        assertEquals(Locale.CHINA, learningSpeechLocale("\uD840\uDC00"))
    }

    @Test
    fun reviewedTodayCountsTheCurrentDeckFromLocalMidnightIncludingRescheduledCards() {
        // US spring DST change: midnight is at 05:00 UTC, even though noon uses a different offset.
        val zone = ZoneId.of("America/New_York")
        val now = Instant.parse("2026-03-08T16:00:00Z").toEpochMilli()
        val midnight = Instant.parse("2026-03-08T05:00:00Z").toEpochMilli()
        val nextMidnight = Instant.parse("2026-03-09T04:00:00Z").toEpochMilli()
        val reviewed = card(3, midnight).copy(dueAtMillis = now + 1_000, reps = 5)
        val deck = listOf(card(1, null), card(2, midnight - 1), reviewed, card(4, now))

        assertEquals(2, countCardsReviewedToday(deck, now, zone))
        assertEquals(1, countCardsReviewedToday(listOf(reviewed), now, zone))
        assertEquals(0, countCardsReviewedToday(deck, nextMidnight, zone))
    }

    private fun item(id: Long) = LearningItemEntity(
        id = id,
        courseId = 1,
        type = LearningItemEntity.TYPE_VOCABULARY,
        title = "title-$id",
        content = "content-$id",
        createdAtMillis = 0,
    )

    private fun card(id: Long, reviewedAtMillis: Long?) = ReviewCardEntity(
        id = id,
        learningItemId = id,
        front = "front-$id",
        back = "back-$id",
        dueAtMillis = 0,
        lastReviewedAtMillis = reviewedAtMillis,
    )
}
