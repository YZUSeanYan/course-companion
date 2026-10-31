package com.classroomradar.app.learning

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.classroomradar.app.data.ClassroomRepository
import com.classroomradar.app.data.TranslationEntity
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ClassroomPreviewFixtureTest {
    @Test
    fun seed() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val repository = ClassroomRepository.get(context)
        cleanup(context)
        val now = System.currentTimeMillis()
        val sessionId = repository.createSession(now)
        repository.renameSession(sessionId, FIXTURE_TITLE)
        val lineId = repository.appendTranscript(sessionId, now, "A lathe removes material from a workpiece.")
        repository.upsertTranslation(
            TranslationEntity(
                transcriptLineId = lineId,
                targetLang = "zh-CN",
                sourceHash = "a".repeat(64),
                translatedText = "车床从工件上去除材料。",
                status = TranslationEntity.STATUS_DONE,
                updatedAtMillis = now,
            ),
        )
        repository.finishSession(sessionId, now + 1000)
    }

    @Test
    fun verifyManualDoubt() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val repository = ClassroomRepository.get(context)
        val database = com.classroomradar.app.data.ClassroomDatabase.get(context).openHelper.writableDatabase
        database.query("SELECT id FROM sessions WHERE title = ?", arrayOf(FIXTURE_TITLE)).use { cursor ->
            while (cursor.moveToNext()) {
                val doubts = repository.getDoubts(cursor.getLong(0))
                System.err.println("Fixture doubts: ${doubts.map { it.sourceText to it.note }}")
            }
        }
    }

    @Test
    fun cleanup() {
        cleanup(InstrumentationRegistry.getInstrumentation().targetContext)
    }

    private fun cleanup(context: android.content.Context) {
        val repository = ClassroomRepository.get(context)
        val database = com.classroomradar.app.data.ClassroomDatabase.get(context).openHelper.writableDatabase
        database.query("SELECT id FROM sessions WHERE title = ?", arrayOf(FIXTURE_TITLE)).use { cursor ->
            while (cursor.moveToNext()) repository.deleteSession(cursor.getLong(0))
        }
    }

    private companion object {
        const val FIXTURE_TITLE = "设备 UI 测试课堂（非真实录音）"
    }
}
