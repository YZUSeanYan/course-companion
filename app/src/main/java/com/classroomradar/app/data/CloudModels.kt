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
    tableName = "live_minutes",
    foreignKeys = [ForeignKey(entity = SessionEntity::class, parentColumns = ["id"], childColumns = ["sessionId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index(value = ["sessionId"], unique = true)],
)
data class LiveMinutesEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sessionId: Long,
    val contentJson: String,
    val updatedAtMillis: Long,
)

@Entity(
    tableName = "cloud_tasks",
    foreignKeys = [ForeignKey(entity = SessionEntity::class, parentColumns = ["id"], childColumns = ["sessionId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index(value = ["taskId"], unique = true), Index("sessionId")],
)
data class CloudTaskEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val taskId: String,
    val sessionId: Long? = null,
    val kind: String,
    val status: String,
    val progress: Int = 0,
    val resultText: String = "",
    val resultJson: String = "",
    val effectiveSeconds: Double = 0.0,
    val accruedCents: Double? = null,
    val createdAtMillis: Long,
    val updatedAtMillis: Long,
)

@Dao
interface CloudDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun upsertMinutes(minutes: LiveMinutesEntity)

    @Query("SELECT * FROM live_minutes WHERE sessionId = :sessionId")
    fun observeMinutes(sessionId: Long): Flow<LiveMinutesEntity?>

    @Query("SELECT * FROM live_minutes WHERE sessionId = :sessionId")
    fun getMinutes(sessionId: Long): LiveMinutesEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun upsertTask(task: CloudTaskEntity)

    @Query("SELECT * FROM cloud_tasks WHERE taskId = :taskId")
    fun getTask(taskId: String): CloudTaskEntity?

    @Query("SELECT * FROM cloud_tasks ORDER BY updatedAtMillis DESC")
    fun observeTasks(): Flow<List<CloudTaskEntity>>

    @Query("DELETE FROM cloud_tasks WHERE taskId = :taskId")
    fun deleteTask(taskId: String)
}
