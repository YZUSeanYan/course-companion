package com.classroomradar.app.learning

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "courses")
data class CourseEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val teacher: String = "",
    val language: String = "中英双语",
    val examProfile: String = PROFILE_FOREIGN_CLASS,
    val courseNature: String = "",
    val createdAtMillis: Long,
) {
    companion object {
        const val PROFILE_FOREIGN_CLASS = "FOREIGN_CLASS"
        const val PROFILE_CET6 = "CET6"
        const val PROFILE_GENERAL_EXAM = "GENERAL_EXAM"
    }
}

@Entity(
    tableName = "materials",
    foreignKeys = [ForeignKey(
        entity = CourseEntity::class,
        parentColumns = ["id"],
        childColumns = ["courseId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index("courseId")],
)
data class MaterialEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val courseId: Long,
    val title: String,
    val mimeType: String,
    val originalRelativePath: String? = null,
    val textRelativePath: String,
    val documentJson: String? = null,
    val pageCount: Int = 1,
    val importedAtMillis: Long,
)

@Entity(
    tableName = "learning_items",
    foreignKeys = [ForeignKey(
        entity = CourseEntity::class,
        parentColumns = ["id"],
        childColumns = ["courseId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index("courseId"), Index(value = ["courseId", "type"])],
)
data class LearningItemEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val courseId: Long,
    val type: String,
    val title: String,
    val content: String,
    val translation: String? = null,
    val example: String? = null,
    val sourceIdsCsv: String = "",
    val inCET6: Boolean = false,
    val origin: String = ORIGIN_AI,
    val createdAtMillis: Long,
) {
    companion object {
        const val TYPE_VOCABULARY = "VOCABULARY"
        const val TYPE_PHRASE = "PHRASE"
        const val TYPE_KEY_POINT = "KEY_POINT"
        const val TYPE_QUESTION = "QUESTION"
        const val TYPE_QUIZ = "QUIZ"
        const val TYPE_MEETING_MINUTES = "MEETING_MINUTES"
        const val TYPE_DOUBT = "DOUBT"
        const val ORIGIN_AI = "AI"
        const val ORIGIN_AI_CACHE = "AI_CACHE"
        const val ORIGIN_MANUAL = "MANUAL"
    }
}

@Entity(
    tableName = "review_cards",
    foreignKeys = [ForeignKey(
        entity = LearningItemEntity::class,
        parentColumns = ["id"],
        childColumns = ["learningItemId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index("learningItemId"), Index("dueAtMillis")],
)
data class ReviewCardEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val learningItemId: Long,
    val front: String,
    val back: String,
    val dueAtMillis: Long,
    val cardState: Int = 0,
    val step: Int? = null,
    val stability: Double = 0.0,
    val difficulty: Double = 0.0,
    val reps: Int = 0,
    val lapses: Int = 0,
    val lastReviewedAtMillis: Long? = null,
    val lastRating: Int? = null,
)

@Entity(
    tableName = "review_logs",
    foreignKeys = [ForeignKey(
        entity = ReviewCardEntity::class,
        parentColumns = ["id"],
        childColumns = ["cardId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index("cardId"), Index("reviewedAtMillis")],
)
data class ReviewLogEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val cardId: Long,
    val rating: Int,
    val reviewedAtMillis: Long,
    val previousDueAtMillis: Long,
    val nextDueAtMillis: Long,
)

@Entity(
    tableName = "analysis_runs",
    foreignKeys = [ForeignKey(
        entity = CourseEntity::class,
        parentColumns = ["id"],
        childColumns = ["courseId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index("courseId"), Index("createdAtMillis")],
)
data class AnalysisRunEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val courseId: Long,
    val targetType: String,
    val targetId: Long,
    val inputSha256: String,
    val promptVersion: String,
    val schemaVersion: String,
    val model: String = "",
    val status: String,
    val errorMessage: String? = null,
    val createdAtMillis: Long,
    val completedAtMillis: Long? = null,
)
