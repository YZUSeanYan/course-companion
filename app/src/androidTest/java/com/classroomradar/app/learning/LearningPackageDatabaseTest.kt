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

    @Test
    fun completedAnalysisCanBeFoundForRetryDeduplication() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val dao = ClassroomDatabase.get(context).learningDao()
        val now = System.currentTimeMillis()
        val courseId = dao.insertCourse(CourseEntity(name = "Retry dedup test", createdAtMillis = now))
        val run = AnalysisRunEntity(
            courseId = courseId,
            targetType = "MATERIAL",
            targetId = 7L,
            inputSha256 = "a".repeat(64),
            promptVersion = "learning-minutes-v2",
            schemaVersion = "2.0",
            model = "test-model",
            status = "COMPLETED",
            createdAtMillis = now,
            completedAtMillis = now,
        )
        dao.insertAnalysisRun(run)

        val found = dao.findCompletedAnalysisRun(
            courseId = courseId,
            targetType = "MATERIAL",
            targetId = 7L,
            inputSha256 = "a".repeat(64),
            promptVersion = "learning-minutes-v2",
            schemaVersion = "2.0",
        )
        assertEquals(run.model, found?.model)
        assertEquals(null, dao.findCompletedAnalysisRun(courseId, "MATERIAL", 8L, "a".repeat(64), "learning-minutes-v2", "2.0"))
        dao.deleteCourse(courseId)
    }
}
