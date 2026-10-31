package com.classroomradar.app.learning.review

import com.classroomradar.app.learning.ReviewCardEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReviewSchedulerTest {
    @Test
    fun goodReviewAdvancesDueDateAndWritesLog() {
        val now = 1_800_000_000_000L
        val card = ReviewCardEntity(
            id = 9,
            learningItemId = 3,
            front = "supervised learning",
            back = "监督学习",
            dueAtMillis = now,
        )

        val result = ReviewScheduler.review(card, ReviewScheduler.RATING_GOOD, now)

        assertTrue(result.card.dueAtMillis > now)
        assertEquals(1, result.card.reps)
        assertEquals(0, result.card.lapses)
        assertEquals(now, result.card.lastReviewedAtMillis)
        assertEquals(9, result.log.cardId)
        assertEquals(now, result.log.previousDueAtMillis)
        assertEquals(result.card.dueAtMillis, result.log.nextDueAtMillis)
    }

    @Test
    fun againReviewCountsLapseWithoutRandomness() {
        val now = 1_800_000_000_000L
        val card = ReviewCardEntity(
            id = 2,
            learningItemId = 1,
            front = "lathe",
            back = "车床",
            dueAtMillis = now,
        )

        val first = ReviewScheduler.review(card, ReviewScheduler.RATING_AGAIN, now)
        val second = ReviewScheduler.review(card, ReviewScheduler.RATING_AGAIN, now)

        assertEquals(first.card.dueAtMillis, second.card.dueAtMillis)
        assertEquals(1, first.card.lapses)
        assertEquals(ReviewScheduler.RATING_AGAIN, first.card.lastRating)
    }
}
