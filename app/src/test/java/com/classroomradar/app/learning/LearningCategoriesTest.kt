package com.classroomradar.app.learning

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LearningCategoriesTest {
    @Test
    fun groupsFollowFixedOrderAndHideEmptyCategories() {
        val groups = groupLearningItems(
            listOf(
                item(1, LearningItemEntity.TYPE_QUIZ),
                item(2, LearningItemEntity.TYPE_VOCABULARY),
                item(3, LearningItemEntity.TYPE_MEETING_MINUTES),
                item(4, LearningItemEntity.TYPE_VOCABULARY),
            ),
        )
        assertEquals(
            listOf(
                LearningItemEntity.TYPE_MEETING_MINUTES,
                LearningItemEntity.TYPE_VOCABULARY,
                LearningItemEntity.TYPE_QUIZ,
            ),
            groups.map { it.type },
        )
        assertEquals(2, groups.first { it.type == LearningItemEntity.TYPE_VOCABULARY }.items.size)
    }

    @Test
    fun unknownTypeFallsBackToLastGroup() {
        val groups = groupLearningItems(
            listOf(
                item(1, "LEGACY_TYPE"),
                item(2, LearningItemEntity.TYPE_PHRASE),
            ),
        )
        assertEquals(listOf(LearningItemEntity.TYPE_PHRASE, "LEGACY_TYPE"), groups.map { it.type })
        assertEquals("学习内容", groups.last().title)
    }

    @Test
    fun reviewSummariesCountDueCardsAndNextDueTime() {
        val now = 1_000L
        val summaries = summarizeReviewCategories(
            listOf(
                reviewCard(1, LearningItemEntity.TYPE_VOCABULARY, dueAtMillis = 500L),
                reviewCard(2, LearningItemEntity.TYPE_VOCABULARY, dueAtMillis = 2_000L),
                reviewCard(3, LearningItemEntity.TYPE_QUIZ, dueAtMillis = 3_000L),
            ),
            now,
        )
        assertEquals(
            listOf(LearningItemEntity.TYPE_VOCABULARY, LearningItemEntity.TYPE_QUIZ),
            summaries.map { it.type },
        )
        assertEquals(2, summaries[0].total)
        assertEquals(1, summaries[0].due)
        assertEquals(2_000L, summaries[0].nextDueAtMillis)
        assertEquals(0, summaries[1].due)
    }

    @Test
    fun everyKnownItemTypeHasACategoryAndLabel() {
        val types = listOf(
            LearningItemEntity.TYPE_MEETING_MINUTES,
            LearningItemEntity.TYPE_DOUBT,
            LearningItemEntity.TYPE_KEY_POINT,
            LearningItemEntity.TYPE_VOCABULARY,
            LearningItemEntity.TYPE_PHRASE,
            LearningItemEntity.TYPE_QUESTION,
            LearningItemEntity.TYPE_QUIZ,
        )
        types.forEach { type ->
            val category = LearningCategory.fromType(type)
            assertTrue("missing category for $type", category != null)
            assertEquals(category!!.label, learningTypeLabel(type))
        }
        assertEquals(null, LearningCategory.fromType("LEGACY_TYPE"))
    }

    private fun item(id: Long, type: String) = LearningItemEntity(
        id = id,
        courseId = 1,
        type = type,
        title = "title-$id",
        content = "content-$id",
        createdAtMillis = 0,
    )

    private fun reviewCard(id: Long, type: String, dueAtMillis: Long) = ReviewCardWithSource(
        card = ReviewCardEntity(
            id = id,
            learningItemId = id,
            front = "front-$id",
            back = "back-$id",
            dueAtMillis = dueAtMillis,
        ),
        itemType = type,
        courseId = 1,
        itemTitle = "title-$id",
    )
}
