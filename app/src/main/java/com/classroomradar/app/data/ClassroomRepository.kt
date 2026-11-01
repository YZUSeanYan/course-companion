package com.classroomradar.app.data

import android.content.Context
import java.io.File

class ClassroomRepository private constructor(
    private val dao: ClassroomDao,
    private val doubtDao: DoubtDao,
    private val cloudDao: CloudDao,
    private val filesDir: File,
) {

    fun createSession(startedAtMillis: Long, courseId: Long? = null): Long =
        dao.insertSession(
            SessionEntity(
                startedAtMillis = startedAtMillis,
                title = defaultTitle(startedAtMillis),
                courseId = courseId,
            ),
        )

    fun renameSession(sessionId: Long, title: String) {
        val cleaned = title.trim()
        if (cleaned.isNotEmpty()) dao.renameSession(sessionId, cleaned)
    }

    fun appendTranscript(
        sessionId: Long,
        timestampMillis: Long,
        text: String,
        segmentKey: String? = null,
        speaker: String? = null,
        startMs: Long? = null,
        endMs: Long? = null,
        language: String? = null,
    ): Long = dao.insertTranscript(
        TranscriptLineEntity(sessionId = sessionId, timestampMillis = timestampMillis, text = text, segmentKey = segmentKey, speaker = speaker, startMs = startMs, endMs = endMs, language = language),
    )

    fun updateTranscriptSegment(lineId: Long, text: String) = dao.updateTranscriptSegment(lineId, text)

    fun saveLiveMinutes(sessionId: Long, contentJson: String) = cloudDao.upsertMinutes(
        LiveMinutesEntity(sessionId = sessionId, contentJson = contentJson, updatedAtMillis = System.currentTimeMillis()),
    )

    fun observeLiveMinutes(sessionId: Long) = cloudDao.observeMinutes(sessionId)

    fun saveLiveUsage(sessionId: Long, seconds: Double, cents: Double?, discardedSeconds: Double = 0.0) {
        val taskId = "realtime-$sessionId"
        val now = System.currentTimeMillis()
        cloudDao.upsertTask(CloudTaskEntity(taskId = taskId, sessionId = sessionId, kind = "REALTIME", status = "LIVE", effectiveSeconds = seconds, discardedSeconds = discardedSeconds, accruedCents = cents, createdAtMillis = now, updatedAtMillis = now))
    }

    fun saveCloudTask(task: CloudTaskEntity) = cloudDao.upsertTask(task)
    fun observeCloudTasks() = cloudDao.observeTasks()
    fun getCloudTask(taskId: String) = cloudDao.getTask(taskId)
    fun deleteCloudTask(taskId: String) = cloudDao.deleteTask(taskId)

    fun addDoubt(
        sessionId: Long,
        transcriptLineId: Long?,
        sourceText: String,
        note: String,
    ): Long = doubtDao.insertDoubt(
        DoubtEventEntity(
            sessionId = sessionId,
            transcriptLineId = transcriptLineId,
            timestampMillis = System.currentTimeMillis(),
            sourceText = sourceText.trim(),
            note = note.trim(),
            createdAtMillis = System.currentTimeMillis(),
        ),
    )

    fun observeDoubts(sessionId: Long) = doubtDao.observeDoubts(sessionId)
    fun getDoubts(sessionId: Long) = doubtDao.getDoubts(sessionId)
    fun deleteDoubt(doubtId: Long) = doubtDao.deleteDoubt(doubtId)
    fun observeTranslations(lineIds: List<Long>) = doubtDao.observeTranslations(lineIds)
    fun observeTranslation(lineId: Long) = doubtDao.observeTranslation(lineId)
    fun getTranslation(lineId: Long) = doubtDao.getTranslation(lineId)
    fun upsertTranslation(translation: TranslationEntity) = doubtDao.upsertTranslation(translation)

    fun appendQuestion(
        sessionId: Long,
        timestampMillis: Long,
        matchedTrigger: String?,
        question: String,
        sourceLine: String,
    ) {
        dao.insertQuestion(
            QuestionEventEntity(
                sessionId = sessionId,
                timestampMillis = timestampMillis,
                matchedTrigger = matchedTrigger,
                question = question,
                sourceLine = sourceLine,
            ),
        )
    }

    fun finishSession(sessionId: Long, endedAtMillis: Long) = dao.finishSession(sessionId, endedAtMillis)

    /** Replaces a session's provisional local transcript with cloud re-transcription segments. */
    fun replaceSessionTranscript(sessionId: Long, segments: List<com.classroomradar.app.audio.TranscriptSegment>) {
        val now = System.currentTimeMillis()
        val lines = segments.mapIndexed { index, segment ->
            TranscriptLineEntity(
                sessionId = sessionId,
                timestampMillis = now + index,
                text = segment.text,
                segmentKey = segment.segmentKey,
                speaker = segment.speaker,
                startMs = segment.startMs,
                endMs = segment.endMs,
                language = segment.language,
            )
        }
        if (lines.isEmpty()) return
        dao.replaceSessionTranscript(sessionId, lines)
    }

    fun setAudioPath(sessionId: Long, relativePath: String?) = dao.updateAudioPath(sessionId, relativePath)

    fun getSessionAudioPath(sessionId: Long): String? = dao.getSession(sessionId)?.audioRelativePath

    fun observeSessionSummaries() = dao.observeSessionSummaries()
    fun observeSession(sessionId: Long) = dao.observeSession(sessionId)
    fun observeTranscript(sessionId: Long) = dao.observeTranscript(sessionId)
    fun observeQuestions(sessionId: Long) = dao.observeQuestions(sessionId)

    fun loadExport(sessionId: Long): ExportRecord? {
        val session = dao.getSession(sessionId) ?: return null
        val transcript = dao.getTranscript(sessionId)
        val translations = transcript.mapNotNull { doubtDao.getTranslation(it.id) }
        return ExportRecord(session, transcript, dao.getQuestions(sessionId), doubtDao.getDoubts(sessionId), translations)
    }

    fun deleteSession(sessionId: Long) {
        dao.removeSession(sessionId)?.let(::deletePrivateAudio)
    }

    fun clearAllSessions() {
        dao.removeAllSessions().forEach(::deletePrivateAudio)
    }

    private fun deletePrivateAudio(relativePath: String) {
        File(filesDir, relativePath).takeIf { it.isFile }?.delete()
    }

    private fun defaultTitle(startedAtMillis: Long): String =
        "课堂记录 " + java.text.SimpleDateFormat("MM-dd HH:mm", java.util.Locale.CHINA)
            .format(java.util.Date(startedAtMillis))

    data class ExportRecord(
        val session: SessionEntity,
        val transcript: List<TranscriptLineEntity>,
        val questions: List<QuestionEventEntity>,
        val doubts: List<DoubtEventEntity> = emptyList(),
        val translations: List<TranslationEntity> = emptyList(),
    )

    companion object {
        @Volatile private var instance: ClassroomRepository? = null

        fun get(context: Context): ClassroomRepository = instance ?: synchronized(this) {
            instance ?: context.applicationContext.let { appContext ->
                ClassroomRepository(
                    dao = ClassroomDatabase.get(appContext).classroomDao(),
                    doubtDao = ClassroomDatabase.get(appContext).doubtDao(),
                    cloudDao = ClassroomDatabase.get(appContext).cloudDao(),
                    filesDir = appContext.filesDir,
                ).also { instance = it }
            }
        }
    }
}
