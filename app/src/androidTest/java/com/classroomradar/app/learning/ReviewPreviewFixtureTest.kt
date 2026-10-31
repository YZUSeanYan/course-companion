package com.classroomradar.app.learning

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.classroomradar.app.data.ClassroomDatabase
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ReviewPreviewFixtureTest {
    @Test
    fun seed() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val dao = ClassroomDatabase.get(context).learningDao()
        cleanupCourses(context)
        val courseId = dao.insertCourse(CourseEntity(name = PREVIEW_COURSE, createdAtMillis = System.currentTimeMillis()))
        val itemId = dao.insertLearningItems(
            listOf(
                LearningItemEntity(
                    courseId = courseId,
                    type = LearningItemEntity.TYPE_VOCABULARY,
                    title = "lathe",
                    content = "车床",
                    sourceIdsCsv = "test-only",
                    origin = LearningItemEntity.ORIGIN_MANUAL,
                    createdAtMillis = System.currentTimeMillis(),
                ),
            ),
        ).single()
        dao.insertReviewCard(
            ReviewCardEntity(
                learningItemId = itemId,
                front = "lathe",
                back = "车床",
                dueAtMillis = 0,
            ),
        )
    }

    @Test
    fun cleanup() {
        cleanupCourses(InstrumentationRegistry.getInstrumentation().targetContext)
    }

    private fun cleanupCourses(context: android.content.Context) {
        ClassroomDatabase.get(context).openHelper.writableDatabase.execSQL(
            "DELETE FROM courses WHERE name = ?",
            arrayOf(PREVIEW_COURSE),
        )
    }

    private companion object {
        const val PREVIEW_COURSE = "设备 UI 测试课程（非 AI 内容）"
    }
}
