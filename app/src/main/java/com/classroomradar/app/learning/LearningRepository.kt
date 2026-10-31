package com.classroomradar.app.learning

import android.content.Context
import com.classroomradar.app.data.ClassroomDatabase

class LearningRepository private constructor(private val dao: LearningDao) {
    fun observeCourses() = dao.observeCourses()
    fun observeCourse(courseId: Long) = dao.observeCourse(courseId)
    fun observeMaterials(courseId: Long) = dao.observeMaterials(courseId)
    fun observeLearningItems(courseId: Long) = dao.observeLearningItems(courseId)
    fun getLearningItems(courseId: Long) = dao.getLearningItems(courseId)
    fun observeDueCards(nowMillis: Long) = dao.observeDueCards(nowMillis)
    fun observeAllCards() = dao.observeAllCards()
    fun observeRecentLogs() = dao.observeRecentLogs()

    fun createCourse(name: String, teacher: String, language: String, examProfile: String = CourseEntity.PROFILE_FOREIGN_CLASS, courseNature: String = ""): Long = dao.insertCourse(
        CourseEntity(
            name = name.trim(),
            teacher = teacher.trim(),
            language = language,
            examProfile = examProfile,
            courseNature = courseNature.trim(),
            createdAtMillis = System.currentTimeMillis(),
        ),
    )

    fun getCourse(courseId: Long) = dao.getCourse(courseId)
    fun deleteCourse(courseId: Long) = dao.deleteCourse(courseId)
    fun insertMaterial(material: MaterialEntity) = dao.insertMaterial(material)
    fun getMaterial(materialId: Long) = dao.getMaterial(materialId)
    fun deleteMaterial(materialId: Long) = dao.deleteMaterial(materialId)
    fun updateMaterial(material: MaterialEntity) = dao.updateMaterial(material)
    fun insertLearningItems(items: List<LearningItemEntity>) = dao.insertLearningItems(items)
    fun insertReviewCards(cards: List<ReviewCardEntity>) = dao.insertReviewCards(cards)
    fun getReviewCard(cardId: Long) = dao.getReviewCard(cardId)
    fun updateReviewCard(card: ReviewCardEntity) = dao.updateReviewCard(card)
    fun insertReviewLog(log: ReviewLogEntity) = dao.insertReviewLog(log)
    fun recordReview(card: ReviewCardEntity, log: ReviewLogEntity) = dao.recordReview(card, log)
    fun insertAnalysisRun(run: AnalysisRunEntity) = dao.insertAnalysisRun(run)
    fun updateAnalysisRun(run: AnalysisRunEntity) = dao.updateAnalysisRun(run)
    fun saveLearningPackage(items: List<LearningItemEntity>, cards: List<ReviewCardEntity>, run: AnalysisRunEntity) =
        dao.saveLearningPackage(items, cards, run)

    fun findCompletedAnalysisRun(
        courseId: Long,
        targetType: String,
        targetId: Long,
        inputSha256: String,
        promptVersion: String,
        schemaVersion: String,
    ): AnalysisRunEntity? = dao.findCompletedAnalysisRun(
        courseId,
        targetType,
        targetId,
        inputSha256,
        promptVersion,
        schemaVersion,
    )

    companion object {
        @Volatile private var instance: LearningRepository? = null

        fun get(context: Context): LearningRepository = instance ?: synchronized(this) {
            instance ?: LearningRepository(ClassroomDatabase.get(context).learningDao()).also { instance = it }
        }
    }
}
