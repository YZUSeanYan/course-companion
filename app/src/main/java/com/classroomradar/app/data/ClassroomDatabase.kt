package com.classroomradar.app.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.migration.Migration
import com.classroomradar.app.learning.AnalysisRunEntity
import com.classroomradar.app.learning.CourseEntity
import com.classroomradar.app.learning.LearningDao
import com.classroomradar.app.learning.LearningItemEntity
import com.classroomradar.app.learning.MaterialEntity
import com.classroomradar.app.learning.ReviewCardEntity
import com.classroomradar.app.learning.ReviewLogEntity
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "sessions")
data class SessionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val startedAtMillis: Long,
    val endedAtMillis: Long? = null,
    val title: String = "课堂记录",
    val audioRelativePath: String? = null,
    val courseId: Long? = null,
)

@Entity(
    tableName = "transcript_lines",
    foreignKeys = [ForeignKey(
        entity = SessionEntity::class,
        parentColumns = ["id"],
        childColumns = ["sessionId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index("sessionId"), Index(value = ["sessionId", "timestampMillis"]), Index(value = ["sessionId", "segmentKey"], unique = true)],
)
data class TranscriptLineEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sessionId: Long,
    val timestampMillis: Long,
    val text: String,
    val segmentKey: String? = null,
    val speaker: String? = null,
    val startMs: Long? = null,
    val endMs: Long? = null,
    val language: String? = null,
)

@Entity(
    tableName = "question_events",
    foreignKeys = [ForeignKey(
        entity = SessionEntity::class,
        parentColumns = ["id"],
        childColumns = ["sessionId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index("sessionId"), Index(value = ["sessionId", "timestampMillis"])],
)
data class QuestionEventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sessionId: Long,
    val timestampMillis: Long,
    val matchedTrigger: String?,
    val question: String,
    val sourceLine: String,
)

data class SessionSummary(
    val id: Long,
    val startedAtMillis: Long,
    val endedAtMillis: Long?,
    val title: String,
    val audioRelativePath: String?,
    val questionCount: Int,
    val doubtCount: Int = 0,
)

@Dao
interface ClassroomDao {
    @Insert
    fun insertSession(session: SessionEntity): Long

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertTranscript(line: TranscriptLineEntity): Long

    @Query("UPDATE transcript_lines SET text = :text WHERE id = :lineId")
    fun updateTranscriptSegment(lineId: Long, text: String)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertQuestion(event: QuestionEventEntity): Long

    @Query("UPDATE sessions SET endedAtMillis = :endedAtMillis WHERE id = :sessionId")
    fun finishSession(sessionId: Long, endedAtMillis: Long)

    @Query("UPDATE sessions SET audioRelativePath = :relativePath WHERE id = :sessionId")
    fun updateAudioPath(sessionId: Long, relativePath: String?)

    @Query("UPDATE sessions SET title = :title WHERE id = :sessionId")
    fun renameSession(sessionId: Long, title: String)

    @Query("DELETE FROM transcript_lines WHERE sessionId = :sessionId")
    fun deleteTranscriptLines(sessionId: Long)

    @Query("UPDATE doubt_events SET transcriptLineId = NULL WHERE sessionId = :sessionId")
    fun detachDoubtLineLinks(sessionId: Long)

    /** Cloud re-transcription replaces the local provisional transcript in place. */
    @Transaction
    fun replaceSessionTranscript(sessionId: Long, lines: List<TranscriptLineEntity>) {
        detachDoubtLineLinks(sessionId)
        deleteTranscriptLines(sessionId)
        lines.forEach { insertTranscript(it) }
    }

    @Query("SELECT * FROM sessions WHERE id = :sessionId")
    fun observeSession(sessionId: Long): Flow<SessionEntity?>

    @Query("SELECT * FROM sessions WHERE id = :sessionId")
    fun getSession(sessionId: Long): SessionEntity?

    @Query("SELECT * FROM transcript_lines WHERE sessionId = :sessionId ORDER BY timestampMillis ASC, id ASC")
    fun observeTranscript(sessionId: Long): Flow<List<TranscriptLineEntity>>

    @Query("SELECT * FROM transcript_lines WHERE sessionId = :sessionId ORDER BY timestampMillis ASC, id ASC")
    fun getTranscript(sessionId: Long): List<TranscriptLineEntity>

    @Query("SELECT * FROM question_events WHERE sessionId = :sessionId ORDER BY timestampMillis DESC, id DESC")
    fun observeQuestions(sessionId: Long): Flow<List<QuestionEventEntity>>

    @Query("SELECT * FROM question_events WHERE sessionId = :sessionId ORDER BY timestampMillis ASC, id ASC")
    fun getQuestions(sessionId: Long): List<QuestionEventEntity>

    @Query(
        """
        SELECT sessions.id, sessions.startedAtMillis, sessions.endedAtMillis, sessions.title,
               sessions.audioRelativePath, COUNT(DISTINCT question_events.id) AS questionCount,
               (SELECT COUNT(*) FROM doubt_events WHERE doubt_events.sessionId = sessions.id) AS doubtCount
        FROM sessions
        LEFT JOIN question_events ON question_events.sessionId = sessions.id
        GROUP BY sessions.id
        ORDER BY sessions.startedAtMillis DESC
        """,
    )
    fun observeSessionSummaries(): Flow<List<SessionSummary>>

    @Query("SELECT audioRelativePath FROM sessions WHERE audioRelativePath IS NOT NULL")
    fun getAllAudioPaths(): List<String>

    @Query("DELETE FROM sessions WHERE id = :sessionId")
    fun deleteSession(sessionId: Long)

    @Query("DELETE FROM sessions")
    fun deleteAllSessions()

    @Transaction
    fun removeSession(sessionId: Long): String? {
        val audioPath = getSession(sessionId)?.audioRelativePath
        deleteSession(sessionId)
        return audioPath
    }

    @Transaction
    fun removeAllSessions(): List<String> {
        val audioPaths = getAllAudioPaths()
        deleteAllSessions()
        return audioPaths
    }
}

@Database(
    entities = [
        SessionEntity::class,
        TranscriptLineEntity::class,
        QuestionEventEntity::class,
        CourseEntity::class,
        MaterialEntity::class,
        LearningItemEntity::class,
        ReviewCardEntity::class,
        ReviewLogEntity::class,
        AnalysisRunEntity::class,
        DoubtEventEntity::class,
        TranslationEntity::class,
        LiveMinutesEntity::class,
        CloudTaskEntity::class,
    ],
    version = 9,
    exportSchema = true,
)
abstract class ClassroomDatabase : RoomDatabase() {
    abstract fun classroomDao(): ClassroomDao
    abstract fun learningDao(): LearningDao
    abstract fun doubtDao(): DoubtDao
    abstract fun cloudDao(): CloudDao

    companion object {
        private const val DATABASE_NAME = "water_class_radar.db"
        @Volatile private var instance: ClassroomDatabase? = null

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE sessions ADD COLUMN courseId INTEGER")
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS courses (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        name TEXT NOT NULL,
                        teacher TEXT NOT NULL,
                        language TEXT NOT NULL,
                        createdAtMillis INTEGER NOT NULL
                    )""".trimIndent(),
                )
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS materials (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        courseId INTEGER NOT NULL,
                        title TEXT NOT NULL,
                        mimeType TEXT NOT NULL,
                        originalRelativePath TEXT,
                        textRelativePath TEXT NOT NULL,
                        pageCount INTEGER NOT NULL,
                        importedAtMillis INTEGER NOT NULL,
                        FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE CASCADE
                    )""".trimIndent(),
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_materials_courseId ON materials(courseId)")
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS learning_items (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        courseId INTEGER NOT NULL,
                        type TEXT NOT NULL,
                        title TEXT NOT NULL,
                        content TEXT NOT NULL,
                        translation TEXT,
                        example TEXT,
                        sourceIdsCsv TEXT NOT NULL,
                        origin TEXT NOT NULL,
                        createdAtMillis INTEGER NOT NULL,
                        FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE CASCADE
                    )""".trimIndent(),
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_learning_items_courseId ON learning_items(courseId)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_learning_items_courseId_type ON learning_items(courseId, type)")
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS review_cards (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        learningItemId INTEGER NOT NULL,
                        front TEXT NOT NULL,
                        back TEXT NOT NULL,
                        dueAtMillis INTEGER NOT NULL,
                        cardState INTEGER NOT NULL,
                        step INTEGER,
                        stability REAL NOT NULL,
                        difficulty REAL NOT NULL,
                        reps INTEGER NOT NULL,
                        lapses INTEGER NOT NULL,
                        lastReviewedAtMillis INTEGER,
                        lastRating INTEGER,
                        FOREIGN KEY(learningItemId) REFERENCES learning_items(id) ON DELETE CASCADE
                    )""".trimIndent(),
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_review_cards_learningItemId ON review_cards(learningItemId)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_review_cards_dueAtMillis ON review_cards(dueAtMillis)")
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS review_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        cardId INTEGER NOT NULL,
                        rating INTEGER NOT NULL,
                        reviewedAtMillis INTEGER NOT NULL,
                        previousDueAtMillis INTEGER NOT NULL,
                        nextDueAtMillis INTEGER NOT NULL,
                        FOREIGN KEY(cardId) REFERENCES review_cards(id) ON DELETE CASCADE
                    )""".trimIndent(),
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_review_logs_cardId ON review_logs(cardId)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_review_logs_reviewedAtMillis ON review_logs(reviewedAtMillis)")
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS analysis_runs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        courseId INTEGER NOT NULL,
                        targetType TEXT NOT NULL,
                        targetId INTEGER NOT NULL,
                        inputSha256 TEXT NOT NULL,
                        promptVersion TEXT NOT NULL,
                        schemaVersion TEXT NOT NULL,
                        model TEXT NOT NULL,
                        status TEXT NOT NULL,
                        errorMessage TEXT,
                        createdAtMillis INTEGER NOT NULL,
                        completedAtMillis INTEGER,
                        FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE CASCADE
                    )""".trimIndent(),
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_analysis_runs_courseId ON analysis_runs(courseId)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_analysis_runs_createdAtMillis ON analysis_runs(createdAtMillis)")
            }
        }

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                // Early v3 development installs may already contain this column.
                val hasStep = db.query("PRAGMA table_info(review_cards)").use { cursor ->
                    val nameIndex = cursor.getColumnIndex("name")
                    generateSequence { if (cursor.moveToNext()) cursor.getString(nameIndex) else null }
                        .any { it == "step" }
                }
                if (!hasStep) db.execSQL("ALTER TABLE review_cards ADD COLUMN step INTEGER")
            }
        }

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS doubt_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        sessionId INTEGER NOT NULL,
                        transcriptLineId INTEGER,
                        timestampMillis INTEGER NOT NULL,
                        sourceText TEXT NOT NULL,
                        note TEXT NOT NULL,
                        createdAtMillis INTEGER NOT NULL,
                        FOREIGN KEY(sessionId) REFERENCES sessions(id) ON DELETE CASCADE
                    )""".trimIndent(),
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_doubt_events_sessionId ON doubt_events(sessionId)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_doubt_events_transcriptLineId ON doubt_events(transcriptLineId)")
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS transcript_translations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        transcriptLineId INTEGER NOT NULL,
                        targetLang TEXT NOT NULL,
                        sourceHash TEXT NOT NULL,
                        translatedText TEXT NOT NULL,
                        status TEXT NOT NULL,
                        updatedAtMillis INTEGER NOT NULL,
                        FOREIGN KEY(transcriptLineId) REFERENCES transcript_lines(id) ON DELETE CASCADE
                    )""".trimIndent(),
                )
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_transcript_translations_transcriptLineId ON transcript_translations(transcriptLineId)")
            }
        }

        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE courses ADD COLUMN examProfile TEXT NOT NULL DEFAULT 'FOREIGN_CLASS'")
                db.execSQL("ALTER TABLE materials ADD COLUMN documentJson TEXT")
                db.execSQL("ALTER TABLE learning_items ADD COLUMN inCET6 INTEGER NOT NULL DEFAULT 0")
            }
        }

        val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE courses ADD COLUMN courseNature TEXT NOT NULL DEFAULT ''")
            }
        }

        val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                listOf(
                    "segmentKey TEXT", "speaker TEXT", "startMs INTEGER", "endMs INTEGER", "language TEXT",
                ).forEach { definition ->
                    db.execSQL("ALTER TABLE transcript_lines ADD COLUMN $definition")
                }
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_transcript_lines_sessionId_segmentKey ON transcript_lines(sessionId, segmentKey)")
                db.execSQL("""CREATE TABLE IF NOT EXISTS live_minutes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, sessionId INTEGER NOT NULL,
                    contentJson TEXT NOT NULL, updatedAtMillis INTEGER NOT NULL,
                    FOREIGN KEY(sessionId) REFERENCES sessions(id) ON DELETE CASCADE)""".trimIndent())
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_live_minutes_sessionId ON live_minutes(sessionId)")
                db.execSQL("""CREATE TABLE IF NOT EXISTS cloud_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, taskId TEXT NOT NULL, sessionId INTEGER,
                    kind TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL,
                    resultText TEXT NOT NULL, resultJson TEXT NOT NULL, effectiveSeconds REAL NOT NULL,
                    accruedCents REAL, createdAtMillis INTEGER NOT NULL, updatedAtMillis INTEGER NOT NULL,
                    FOREIGN KEY(sessionId) REFERENCES sessions(id) ON DELETE CASCADE)""".trimIndent())
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_cloud_tasks_taskId ON cloud_tasks(taskId)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_cloud_tasks_sessionId ON cloud_tasks(sessionId)")
            }
        }

        val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                // Official usage.update carries discardedSeconds alongside effectiveSeconds.
                db.execSQL("ALTER TABLE cloud_tasks ADD COLUMN discardedSeconds REAL NOT NULL DEFAULT 0")
            }
        }

        fun get(context: Context): ClassroomDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                ClassroomDatabase::class.java,
                DATABASE_NAME,
            )
                .addMigrations(MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9)
                .build()
                .also { instance = it }
        }
    }
}
