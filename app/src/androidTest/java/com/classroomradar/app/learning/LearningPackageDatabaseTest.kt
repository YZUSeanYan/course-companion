package com.classroomradar.app.learning

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.classroomradar.app.data.ClassroomDatabase
import com.classroomradar.app.learning.review.ReviewScheduler
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LearningPackageDatabaseTest {
    @Test
    fun packageCardsAndReviewLogsArePersistent() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val database = ClassroomDatabase.get(context)
        val dao = database.learningDao()
        val now = System.currentTimeMillis()
        val courseId = dao.insertCourse(CourseEntity(name = "设备测试课程", createdAtMillis = now))
        val item = LearningItemEntity(
            courseId = courseId,
            type = LearningItemEntity.TYPE_VOCABULARY,
            title = "lathe",
            content = "车床",
            sourceIdsCsv = "test-source",
            origin = LearningItemEntity.ORIGIN_MANUAL,
            createdAtMillis = now,
        )
        val itemId = dao.insertLearningItems(listOf(item)).single()
        val card = ReviewCardEntity(
            learningItemId = itemId,
            front = item.title,
            back = item.content,
            dueAtMillis = now,
        )
        val cardId = dao.insertReviewCard(card)
        val inserted = requireNotNull(dao.getReviewCard(cardId))
        assertEquals("lathe", inserted.front)
        assertEquals(itemId, inserted.learningItemId)

        val result = ReviewScheduler.review(inserted, ReviewScheduler.RATING_GOOD, now)
        dao.recordReview(result.card, result.log)
        val updated = requireNotNull(dao.getReviewCard(cardId))
        assertEquals(1, updated.reps)
        assertTrue(updated.dueAtMillis > now)

        dao.deleteCourse(courseId)
    }
}
