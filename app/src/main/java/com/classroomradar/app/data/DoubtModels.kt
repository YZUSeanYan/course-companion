package com.classroomradar.app.data

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Entity(
    tableName = "doubt_events",
    foreignKeys = [ForeignKey(
        entity = SessionEntity::class,
        parentColumns = ["id"],
        childColumns = ["sessionId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index("sessionId"), Index("transcriptLineId")],
)
data class DoubtEventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sessionId: Long,
    val transcriptLineId: Long? = null,
    val timestampMillis: Long,
    val sourceText: String,
    val note: String = "",
    val createdAtMillis: Long,
)

@Entity(
    tableName = "transcript_translations",
    foreignKeys = [ForeignKey(
        entity = TranscriptLineEntity::class,
        parentColumns = ["id"],
        childColumns = ["transcriptLineId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index(value = ["transcriptLineId"], unique = true)],
)
data class TranslationEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val transcriptLineId: Long,
    val targetLang: String,
    val sourceHash: String,
    val translatedText: String = "",
    val status: String = STATUS_PENDING,
    val updatedAtMillis: Long,
) {
    companion object {
        const val STATUS_PENDING = "PENDING"
        const val STATUS_DONE = "DONE"
        const val STATUS_FAILED = "FAILED"
    }
}

@Dao
interface DoubtDao {
    @Insert
    fun insertDoubt(doubt: DoubtEventEntity): Long

    @Query("SELECT * FROM doubt_events WHERE sessionId = :sessionId ORDER BY timestampMillis DESC, id DESC")
    fun observeDoubts(sessionId: Long): Flow<List<DoubtEventEntity>>

    @Query("SELECT * FROM doubt_events WHERE sessionId = :sessionId ORDER BY timestampMillis ASC, id ASC")
    fun getDoubts(sessionId: Long): List<DoubtEventEntity>

    @Query("SELECT COUNT(*) FROM doubt_events WHERE sessionId = :sessionId")
    fun observeDoubtCount(sessionId: Long): Flow<Int>

    @Query("DELETE FROM doubt_events WHERE id = :doubtId")
    fun deleteDoubt(doubtId: Long)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun upsertTranslation(translation: TranslationEntity)

    @Query("SELECT * FROM transcript_translations WHERE transcriptLineId = :lineId")
    fun observeTranslation(lineId: Long): Flow<TranslationEntity?>

    @Query("SELECT * FROM transcript_translations WHERE transcriptLineId IN (:lineIds)")
    fun observeTranslations(lineIds: List<Long>): Flow<List<TranslationEntity>>

    @Query("SELECT * FROM transcript_translations WHERE transcriptLineId = :lineId")
    fun getTranslation(lineId: Long): TranslationEntity?
}
