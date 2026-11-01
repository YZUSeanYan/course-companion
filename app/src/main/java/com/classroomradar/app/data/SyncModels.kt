package com.classroomradar.app.data

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import com.classroomradar.app.learning.CourseEntity
import com.classroomradar.app.learning.LearningItemEntity
import com.classroomradar.app.learning.MaterialEntity
import com.classroomradar.app.learning.ReviewCardEntity
import com.classroomradar.app.learning.ReviewLogEntity

/**
 * 云空间同步的本地映射：满足服务端「clientUid 必须是 36 位 UUID」的要求，
 * 同时不改动既有业务表结构。localId 指向对应实体表的主键。
 */
@Entity(tableName = "sync_entities", indices = [
    androidx.room.Index(value = ["entity", "uid"], unique = true),
    androidx.room.Index(value = ["entity", "localId"], unique = true),
])
data class SyncEntityRow(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val entity: String,
    val uid: String,
    val localId: Long,
    /** 与服务端 LWW 对齐的时间戳（毫秒），取自实体自身的时间字段。 */
    val updatedAtMillis: Long,
)

@Entity(tableName = "sync_state")
data class SyncStateRow(
    @PrimaryKey val key: String,
    val value: String,
)

@Dao
interface SyncDao {
    @Query("SELECT * FROM sync_entities WHERE entity = :entity AND localId = :localId LIMIT 1")
    fun linkFor(entity: String, localId: Long): SyncEntityRow?

    @Query("SELECT * FROM sync_entities WHERE entity = :entity AND uid = :uid LIMIT 1")
    fun linkByUid(entity: String, uid: String): SyncEntityRow?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun upsertLink(row: SyncEntityRow)

    @Query("DELETE FROM sync_entities WHERE entity = :entity AND uid = :uid")
    fun deleteLink(entity: String, uid: String)

    @Query("SELECT value FROM sync_state WHERE key = :key")
    fun state(key: String): String?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun putState(row: SyncStateRow)

    // ---- 拉取时的按字段更新（避免 REPLACE 触发级联删除） ----
    @Query("UPDATE courses SET name=:name, teacher=:teacher, language=:language, examProfile=:examProfile, courseNature=:courseNature WHERE id=:id")
    fun updateCourse(id: Long, name: String, teacher: String, language: String, examProfile: String, courseNature: String)

    @Query("UPDATE materials SET courseId=:courseId, title=:title, mimeType=:mimeType, pageCount=:pageCount, importedAtMillis=:importedAtMillis WHERE id=:id")
    fun updateMaterial(id: Long, courseId: Long, title: String, mimeType: String, pageCount: Int, importedAtMillis: Long)

    @Query("UPDATE learning_items SET courseId=:courseId, type=:type, title=:title, content=:content, translation=:translation, example=:example, sourceIdsCsv=:sourceIdsCsv, inCET6=:inCet6, origin=:origin WHERE id=:id")
    fun updateLearningItem(id: Long, courseId: Long, type: String, title: String, content: String, translation: String?, example: String?, sourceIdsCsv: String, inCet6: Boolean, origin: String)

    @Query("UPDATE review_cards SET front=:front, back=:back, dueAtMillis=:dueAtMillis, cardState=:cardState, step=:step, stability=:stability, difficulty=:difficulty, reps=:reps, lapses=:lapses, lastReviewedAtMillis=:lastReviewedAtMillis, lastRating=:lastRating WHERE id=:id")
    fun updateReviewCard(id: Long, front: String, back: String, dueAtMillis: Long, cardState: Int, step: Int?, stability: Double, difficulty: Double, reps: Int, lapses: Int, lastReviewedAtMillis: Long?, lastRating: Int?)

    @Query("UPDATE sessions SET endedAtMillis=:endedAtMillis, title=:title WHERE id=:id")
    fun updateSession(id: Long, endedAtMillis: Long?, title: String)

    @Query("UPDATE transcript_lines SET text=:text, speaker=:speaker, startMs=:startMs, endMs=:endMs, language=:language WHERE id=:id")
    fun updateTranscriptLine(id: Long, text: String, speaker: String?, startMs: Long?, endMs: Long?, language: String?)

    @Query("UPDATE doubt_events SET sourceText=:sourceText, note=:note WHERE id=:id")
    fun updateDoubt(id: Long, sourceText: String, note: String)

    // ---- 拉取时的插入（父行先于子行写入） ----
    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertCourse(course: CourseEntity): Long

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertMaterial(material: MaterialEntity): Long

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertLearningItem(item: LearningItemEntity): Long

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertReviewCard(card: ReviewCardEntity): Long

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertReviewLog(log: ReviewLogEntity): Long

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertSession(session: SessionEntity): Long

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertTranscriptLine(line: TranscriptLineEntity): Long

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertDoubt(doubt: DoubtEventEntity): Long

    @Query("DELETE FROM courses WHERE id = :id")
    fun deleteCourse(id: Long)

    @Query("DELETE FROM learning_items WHERE id = :id")
    fun deleteLearningItem(id: Long)

    @Query("DELETE FROM review_cards WHERE id = :id")
    fun deleteReviewCard(id: Long)

    @Query("DELETE FROM review_logs WHERE id = :id")
    fun deleteReviewLog(id: Long)

    @Query("DELETE FROM sessions WHERE id = :id")
    fun deleteSession(id: Long)

    @Query("DELETE FROM transcript_lines WHERE id = :id")
    fun deleteTranscriptLine(id: Long)

    @Query("DELETE FROM doubt_events WHERE id = :id")
    fun deleteDoubt(id: Long)

    @Query("DELETE FROM materials WHERE id = :id")
    fun deleteMaterial(id: Long)

    // ---- 全量读取（与网页版一致：每次同步收集全部行） ----
    @Query("SELECT * FROM courses")
    fun allCourses(): List<CourseEntity>

    @Query("SELECT * FROM materials")
    fun allMaterials(): List<MaterialEntity>

    @Query("SELECT * FROM learning_items")
    fun allLearningItems(): List<LearningItemEntity>

    @Query("SELECT * FROM review_cards")
    fun allReviewCards(): List<ReviewCardEntity>

    @Query("SELECT * FROM review_logs")
    fun allReviewLogs(): List<ReviewLogEntity>

    @Query("SELECT * FROM sessions")
    fun allSessions(): List<SessionEntity>

    @Query("SELECT * FROM transcript_lines")
    fun allTranscriptLines(): List<TranscriptLineEntity>

    @Query("SELECT * FROM doubt_events")
    fun allDoubts(): List<DoubtEventEntity>

    @Query("SELECT * FROM courses WHERE id = :id")
    fun course(id: Long): CourseEntity?

    @Query("SELECT * FROM learning_items WHERE id = :id")
    fun learningItem(id: Long): LearningItemEntity?

    @Query("SELECT * FROM review_cards WHERE id = :id")
    fun reviewCard(id: Long): ReviewCardEntity?

    @Query("SELECT * FROM sessions WHERE id = :id")
    fun session(id: Long): SessionEntity?
}
