package com.classroomradar.app.learning.review

import com.classroomradar.app.learning.ReviewCardEntity
import com.classroomradar.app.learning.ReviewLogEntity
import io.github.openspacedrepetition.Card
import io.github.openspacedrepetition.Rating
import io.github.openspacedrepetition.Scheduler
import io.github.openspacedrepetition.State
import java.time.Instant

data class ReviewResult(
    val card: ReviewCardEntity,
    val log: ReviewLogEntity,
)

object ReviewScheduler {
    const val RATING_AGAIN = 1
    const val RATING_HARD = 2
    const val RATING_GOOD = 3
    const val RATING_EASY = 4

    private val scheduler = Scheduler.builder().enableFuzzing(false).build()

    fun review(card: ReviewCardEntity, rating: Int, reviewedAtMillis: Long): ReviewResult {
        require(rating in RATING_AGAIN..RATING_EASY) { "Unknown FSRS rating: $rating" }
        val now = Instant.ofEpochMilli(reviewedAtMillis)
        val result = scheduler.reviewCard(card.toFsrs(), rating.toFsrsRating(), now)
        val updated = result.card()
        val updatedEntity = card.copy(
            dueAtMillis = updated.due.toEpochMilli(),
            cardState = updated.state.ordinal,
            step = updated.step,
            stability = updated.stability ?: 0.0,
            difficulty = updated.difficulty ?: 0.0,
            reps = card.reps + 1,
            lapses = card.lapses + if (rating == RATING_AGAIN) 1 else 0,
            lastReviewedAtMillis = reviewedAtMillis,
            lastRating = rating,
        )
        return ReviewResult(
            card = updatedEntity,
            log = ReviewLogEntity(
                cardId = card.id,
                rating = rating,
                reviewedAtMillis = reviewedAtMillis,
                previousDueAtMillis = card.dueAtMillis,
                nextDueAtMillis = updatedEntity.dueAtMillis,
            ),
        )
    }

    private fun ReviewCardEntity.toFsrs(): Card = Card.builder()
        .cardId(id.toInt())
        .state(State.values()[cardState.coerceIn(0, State.values().lastIndex)])
        .step(step)
        .stability(stability.takeIf { it > 0.0 })
        .difficulty(difficulty.takeIf { it > 0.0 })
        .due(Instant.ofEpochMilli(dueAtMillis))
        .lastReview(lastReviewedAtMillis?.let(Instant::ofEpochMilli))
        .build()

    private fun Int.toFsrsRating(): Rating = when (this) {
        RATING_AGAIN -> Rating.AGAIN
        RATING_HARD -> Rating.HARD
        RATING_GOOD -> Rating.GOOD
        RATING_EASY -> Rating.EASY
        else -> error("Unknown rating: $this")
    }
}
