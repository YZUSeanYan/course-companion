package com.classroomradar.app.learning

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface LearningDao {
    @Insert
    fun insertCourse(course: CourseEntity): Long

    @Query("SELECT * FROM courses ORDER BY createdAtMillis DESC, id DESC")
    fun observeCourses(): Flow<List<CourseEntity>>

    @Query("SELECT * FROM courses WHERE id = :courseId")
    fun observeCourse(courseId: Long): Flow<CourseEntity?>

    @Query("SELECT * FROM courses WHERE id = :courseId")
    fun getCourse(courseId: Long): CourseEntity?

    @Query("DELETE FROM courses WHERE id = :courseId")
    fun deleteCourse(courseId: Long)

    @Insert
    fun insertMaterial(material: MaterialEntity): Long

    @Query("SELECT * FROM materials WHERE courseId = :courseId ORDER BY importedAtMillis DESC, id DESC")
    fun observeMaterials(courseId: Long): Flow<List<MaterialEntity>>

    @Query("SELECT * FROM materials WHERE id = :materialId")
    fun getMaterial(materialId: Long): MaterialEntity?

    @Query("DELETE FROM materials WHERE id = :materialId")
    fun deleteMaterial(materialId: Long)

    @Update
    fun updateMaterial(material: MaterialEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertLearningItems(items: List<LearningItemEntity>): List<Long>

    @Query("SELECT * FROM learning_items WHERE courseId = :courseId ORDER BY createdAtMillis DESC, id DESC")
    fun observeLearningItems(courseId: Long): Flow<List<LearningItemEntity>>

    @Query("SELECT * FROM learning_items WHERE courseId = :courseId ORDER BY createdAtMillis DESC, id DESC")
    fun getLearningItems(courseId: Long): List<LearningItemEntity>

    @Query("SELECT * FROM learning_items WHERE id = :itemId")
    fun getLearningItem(itemId: Long): LearningItemEntity?

    @Query("DELETE FROM learning_items WHERE id = :itemId")
    fun deleteLearningItem(itemId: Long)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insertReviewCards(cards: List<ReviewCardEntity>): List<Long>

    @Insert
    fun insertReviewCard(card: ReviewCardEntity): Long

    @Update
    fun updateReviewCard(card: ReviewCardEntity)

    @Query("SELECT * FROM review_cards WHERE dueAtMillis <= :nowMillis ORDER BY dueAtMillis ASC, id ASC")
    fun observeDueCards(nowMillis: Long): Flow<List<ReviewCardEntity>>

    @Query("SELECT * FROM review_cards ORDER BY dueAtMillis ASC, id ASC")
    fun observeAllCards(): Flow<List<ReviewCardEntity>>

    @Query(
        "SELECT review_cards.*, learning_items.type AS itemType, " +
            "learning_items.courseId AS courseId, learning_items.title AS itemTitle " +
            "FROM review_cards INNER JOIN learning_items ON learning_items.id = review_cards.learningItemId " +
            "ORDER BY review_cards.dueAtMillis ASC, review_cards.id ASC",
    )
    fun observeAllCardsWithSource(): Flow<List<ReviewCardWithSource>>

    @Query("SELECT * FROM review_cards WHERE id = :cardId")
    fun getReviewCard(cardId: Long): ReviewCardEntity?

    @Insert
    fun insertReviewLog(log: ReviewLogEntity): Long

    @Transaction
    fun recordReview(card: ReviewCardEntity, log: ReviewLogEntity) {
        updateReviewCard(card)
        insertReviewLog(log)
    }

    @Query("SELECT * FROM review_logs ORDER BY reviewedAtMillis DESC, id DESC LIMIT :limit")
    fun observeRecentLogs(limit: Int = 50): Flow<List<ReviewLogEntity>>

    @Insert
    fun insertAnalysisRun(run: AnalysisRunEntity): Long

    @Update
    fun updateAnalysisRun(run: AnalysisRunEntity)

    @Query("SELECT * FROM analysis_runs WHERE courseId = :courseId ORDER BY createdAtMillis DESC, id DESC")
    fun observeAnalysisRuns(courseId: Long): Flow<List<AnalysisRunEntity>>

    @Query(
        "SELECT * FROM analysis_runs WHERE courseId = :courseId AND targetType = :targetType " +
            "AND targetId = :targetId AND inputSha256 = :inputSha256 AND promptVersion = :promptVersion " +
            "AND schemaVersion = :schemaVersion AND status = 'COMPLETED' ORDER BY id DESC LIMIT 1",
    )
    fun findCompletedAnalysisRun(
        courseId: Long,
        targetType: String,
        targetId: Long,
        inputSha256: String,
        promptVersion: String,
        schemaVersion: String,
    ): AnalysisRunEntity?

    @Transaction
    fun saveLearningPackage(
        items: List<LearningItemEntity>,
        cards: List<ReviewCardEntity>,
        run: AnalysisRunEntity,
    ): List<Long> {
        val itemIds = insertLearningItems(items)
        require(cards.all { it.learningItemId >= 0 && it.learningItemId < items.size }) { "Review card source index is invalid" }
        val linkedCards = cards.map { card -> card.copy(learningItemId = itemIds[card.learningItemId.toInt()]) }
        insertReviewCards(linkedCards)
        insertAnalysisRun(run)
        return itemIds
    }
}
