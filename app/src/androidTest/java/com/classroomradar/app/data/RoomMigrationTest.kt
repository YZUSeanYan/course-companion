package com.classroomradar.app.data

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RoomMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        ClassroomDatabase::class.java,
    )

    @Test
    fun migration2To3PreservesClassroomAndAddsLearningTables() {
        helper.createDatabase(TEST_DATABASE, 2).apply {
            execSQL(
                "INSERT INTO sessions (id, startedAtMillis, endedAtMillis, title, audioRelativePath) " +
                    "VALUES (7, 123456, NULL, '保留的课堂', NULL)",
            )
            close()
        }

        helper.runMigrationsAndValidate(
            TEST_DATABASE,
            8,
            true,
            ClassroomDatabase.MIGRATION_2_3,
            ClassroomDatabase.MIGRATION_3_4,
            ClassroomDatabase.MIGRATION_4_5,
            ClassroomDatabase.MIGRATION_5_6,
            ClassroomDatabase.MIGRATION_6_7,
            ClassroomDatabase.MIGRATION_7_8,
        ).apply {
            query("SELECT title, courseId FROM sessions WHERE id = 7").use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertTrue(cursor.getString(0) == "保留的课堂")
                assertNull(cursor.getString(1))
            }
            query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'courses'").use { cursor ->
                assertTrue(cursor.moveToFirst())
            }
            close()
        }
    }

    @Test
    fun migration3To4PreservesExistingReviewCards() {
        helper.createDatabase(TEST_DATABASE, 3).apply {
            execSQL("INSERT INTO courses (id, name, teacher, language, createdAtMillis) VALUES (1, 'English', '', 'zh-en', 1)")
            execSQL(
                "INSERT INTO learning_items (id, courseId, type, title, content, translation, example, sourceIdsCsv, origin, createdAtMillis) " +
                    "VALUES (2, 1, 'VOCABULARY', 'lathe', '车床', NULL, NULL, 'page-1', 'AI', 1)",
            )
            execSQL(
                "INSERT INTO review_cards (id, learningItemId, front, back, dueAtMillis, cardState, stability, difficulty, reps, lapses, lastReviewedAtMillis, lastRating) " +
                    "VALUES (3, 2, 'lathe', '车床', 1234, 0, 0.0, 0.0, 0, 0, NULL, NULL)",
            )
            close()
        }

        helper.runMigrationsAndValidate(
            TEST_DATABASE,
            4,
            true,
            ClassroomDatabase.MIGRATION_3_4,
        ).apply {
            query("SELECT front, back, dueAtMillis, step FROM review_cards WHERE id = 3").use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertTrue(cursor.getString(0) == "lathe")
                assertTrue(cursor.getString(1) == "车床")
                assertTrue(cursor.getLong(2) == 1234L)
                assertNull(cursor.getString(3))
            }
            close()
        }
    }

    @Test
    fun migration4To5AddsManualDoubtsAndTranslationsWithoutDeletingHistory() {
        helper.createDatabase(TEST_DATABASE, 4).apply {
            execSQL("INSERT INTO sessions (id, startedAtMillis, title) VALUES (1, 1, '旧课堂')")
            execSQL("INSERT INTO transcript_lines (id, sessionId, timestampMillis, text) VALUES (2, 1, 1, 'original')")
            execSQL(
                "INSERT INTO question_events (id, sessionId, timestampMillis, matchedTrigger, question, sourceLine) " +
                    "VALUES (3, 1, 1, NULL, 'legacy question', 'original')",
            )
            close()
        }

        helper.runMigrationsAndValidate(TEST_DATABASE, 8, true, ClassroomDatabase.MIGRATION_4_5, ClassroomDatabase.MIGRATION_5_6, ClassroomDatabase.MIGRATION_6_7, ClassroomDatabase.MIGRATION_7_8).apply {
            query("SELECT question FROM question_events WHERE id = 3").use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertTrue(cursor.getString(0) == "legacy question")
            }
            execSQL(
                "INSERT INTO doubt_events (sessionId, transcriptLineId, timestampMillis, sourceText, note, createdAtMillis) " +
                    "VALUES (1, 2, 1, 'user doubt', 'note', 1)",
            )
            query("SELECT sourceText, note FROM doubt_events WHERE sessionId = 1").use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertTrue(cursor.getString(0) == "user doubt")
                assertTrue(cursor.getString(1) == "note")
            }
            close()
        }
    }

    @Test
    fun migration7To8AddsRealtimeLearningMetadataWithoutDeletingTranscript() {
        helper.createDatabase(TEST_DATABASE, 7).apply {
            execSQL("INSERT INTO sessions (id, startedAtMillis, title) VALUES (9, 1, '保留课堂')")
            execSQL("INSERT INTO transcript_lines (id, sessionId, timestampMillis, text) VALUES (4, 9, 100, '原文')")
            close()
        }
        helper.runMigrationsAndValidate(TEST_DATABASE, 8, true, ClassroomDatabase.MIGRATION_7_8).apply {
            execSQL("UPDATE transcript_lines SET segmentKey = 'stream-1', speaker = 'speaker_0', startMs = 100, endMs = 1200 WHERE id = 4")
            execSQL("INSERT INTO live_minutes(sessionId, contentJson, updatedAtMillis) VALUES (9, '{\"sections\":[]}', 100)")
            query("SELECT text, speaker, startMs FROM transcript_lines WHERE id = 4").use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertTrue(cursor.getString(0) == "原文")
                assertTrue(cursor.getString(1) == "speaker_0")
                assertTrue(cursor.getLong(2) == 100L)
            }
            query("SELECT contentJson FROM live_minutes WHERE sessionId = 9").use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertTrue(cursor.getString(0).contains("sections"))
            }
            close()
        }
    }

    private companion object {
        const val TEST_DATABASE = "course-companion-migration-test"
    }
}
