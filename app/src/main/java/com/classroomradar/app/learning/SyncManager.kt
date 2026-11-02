package com.classroomradar.app.learning

import android.content.Context
import com.classroomradar.app.BuildConfig
import com.classroomradar.app.data.ClassroomDatabase
import com.classroomradar.app.data.DoubtEventEntity
import com.classroomradar.app.data.SessionEntity
import com.classroomradar.app.data.SyncEntityRow
import com.classroomradar.app.data.SyncStateRow
import com.classroomradar.app.data.TranscriptLineEntity
import com.classroomradar.app.learning.api.AiServiceConfig
import com.classroomradar.app.learning.api.LearningApiClient
import com.classroomradar.app.learning.api.SyncChange
import com.classroomradar.app.learning.api.SyncRecordDto
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.util.UUID

/**
 * 云空间同步（与服务端 /v1/sync/push|pull 契约一致）。
 *
 * 语义对齐网页版：推送全部 8 类学习数据（全量快照，客户端 LWW 时间戳），
 * 再全量拉取并按 uid 合并；payload 使用与网页版一致的字段名，并额外携带
 * courseUid/sessionUid/learningItemUid/cardUid/transcriptLineUid 以支持跨设备
 * 关联重映射（服务端忽略多余字段）。
 */
class SyncManager private constructor(private val appContext: Context) {
    private val database = ClassroomDatabase.get(appContext)
    private val dao = database.syncDao()
    private val api = LearningApiClient(
        appContext,
        BuildConfig.LEARNING_API_BASE_URL,
        baseUrlProvider = AiServiceConfig(appContext)::baseUrl,
    )
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mutex = Mutex()

    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()
    private val _status = MutableStateFlow<String?>(null)
    val status: StateFlow<String?> = _status.asStateFlow()
    private val _lastSyncAt = MutableStateFlow<Long?>(null)
    val lastSyncAt: StateFlow<Long?> = _lastSyncAt.asStateFlow()

    init {
        // Room 不允许主线程访问数据库：初始值在 IO 协程中读取。
        scope.launch { _lastSyncAt.value = dao.state(KEY_LAST_SYNC)?.toLongOrNull() }
    }

    fun syncInBackground(silent: Boolean = false) {
        scope.launch { runCatching { fullSync(silent) } }
    }

    suspend fun fullSync(silent: Boolean = false): Boolean = mutex.withLock {
        _isSyncing.value = true
        if (!silent) _status.value = "正在收集本地变更…"
        try {
            val pushed = pushAll()
            if (!silent) _status.value = "已推送 $pushed 条，正在拉取云端…"
            val pulled = pullAndMerge()
            val now = System.currentTimeMillis()
            dao.putState(SyncStateRow(KEY_LAST_SYNC, now.toString()))
            _lastSyncAt.value = now
            _status.value = if (silent) null else "同步完成：推送 $pushed 条，合并 $pulled 条。"
            true
        } catch (error: Exception) {
            _status.value = "同步失败：${error.message ?: "请稍后重试"}"
            false
        } finally {
            _isSyncing.value = false
        }
    }

    // ---------- push ----------

    private suspend fun pushAll(): Int {
        val changes = mutableListOf<SyncChange>()
        collectCourses(changes)
        collectMaterials(changes)
        collectLearningItems(changes)
        collectReviewCards(changes)
        collectReviewLogs(changes)
        collectSessions(changes)
        collectTranscriptLines(changes)
        collectDoubts(changes)
        var accepted = 0
        var skipped = 0
        changes.chunked(BATCH).forEach { batch ->
            val sized = batch.filter {
                it.payload.toString().toByteArray(Charsets.UTF_8).size <= MAX_PAYLOAD
            }
            skipped += batch.size - sized.size
            if (sized.isEmpty()) return@forEach
            accepted += api.syncPush(sized).results.count { it.status == "accepted" }
        }
        if (skipped > 0) _status.value = "已跳过 $skipped 条超大记录"
        return accepted
    }

    private fun collectCourses(out: MutableList<SyncChange>) {
        dao.allCourses().forEach { course ->
            val uid = uidFor(ENTITY_COURSES, course.id) { course.createdAtMillis }
            out += change(ENTITY_COURSES, uid, course.createdAtMillis, buildJsonObject {
                put("name", course.name)
                put("teacher", course.teacher)
                put("language", course.language)
                put("examProfile", course.examProfile)
                put("courseNature", course.courseNature)
                put("createdAtMillis", course.createdAtMillis)
                put("courseUid", uid)
            })
        }
    }

    private fun collectMaterials(out: MutableList<SyncChange>) {
        dao.allMaterials().forEach { material ->
            val uid = uidFor(ENTITY_MATERIALS, material.id) { material.importedAtMillis }
            val courseUid = uidOf(ENTITY_COURSES, material.courseId)
            out += change(ENTITY_MATERIALS, uid, material.importedAtMillis, buildJsonObject {
                put("courseId", material.courseId)
                courseUid?.let { put("courseUid", it) }
                put("title", material.title)
                put("mimeType", material.mimeType)
                put("pageCount", material.pageCount)
                put("importedAtMillis", material.importedAtMillis)
                material.documentJson?.let { put("documentJson", it) }
            })
        }
    }

    private fun collectLearningItems(out: MutableList<SyncChange>) {
        dao.allLearningItems().forEach { item ->
            val uid = uidFor(ENTITY_ITEMS, item.id) { item.updatedAtMillis }
            val courseUid = uidOf(ENTITY_COURSES, item.courseId)
            out += change(ENTITY_ITEMS, uid, item.updatedAtMillis, buildJsonObject {
                put("courseId", item.courseId)
                courseUid?.let { put("courseUid", it) }
                put("type", item.type)
                put("title", item.title)
                put("content", item.content)
                item.translation?.let { put("translation", it) }
                item.example?.let { put("example", it) }
                put("sourceIds", buildJsonArray {
                    item.sourceIdsCsv.split(',').map(String::trim).filter(String::isNotEmpty)
                        .forEach { add(JsonPrimitive(it)) }
                })
                put("inCET6", item.inCET6)
                put("origin", item.origin)
                put("createdAtMillis", item.createdAtMillis)
                put("updatedAtMillis", item.updatedAtMillis)
            })
        }
    }

    private fun collectReviewCards(out: MutableList<SyncChange>) {
        val itemCourses = dao.allLearningItems().associate { it.id to it }
        dao.allReviewCards().forEach { card ->
            val updatedAt = card.lastReviewedAtMillis ?: card.dueAtMillis
            val uid = uidFor(ENTITY_CARDS, card.id) { updatedAt }
            val item = itemCourses[card.learningItemId]
            val itemUid = uidOf(ENTITY_ITEMS, card.learningItemId)
            val courseUid = item?.let { uidOf(ENTITY_COURSES, it.courseId) }
            out += change(ENTITY_CARDS, uid, updatedAt, buildJsonObject {
                put("learningItemId", card.learningItemId)
                itemUid?.let { put("learningItemUid", it) }
                item?.let {
                    put("itemType", it.type)
                    put("courseId", it.courseId)
                }
                courseUid?.let { put("courseUid", it) }
                put("front", card.front)
                put("back", card.back)
                put("dueAtMillis", card.dueAtMillis)
                put("cardState", card.cardState)
                card.step?.let { put("step", it) }
                put("stability", card.stability)
                put("difficulty", card.difficulty)
                put("reps", card.reps)
                put("lapses", card.lapses)
                card.lastReviewedAtMillis?.let { put("lastReviewedAtMillis", it) }
                card.lastRating?.let { put("lastRating", it) }
            })
        }
    }

    private fun collectReviewLogs(out: MutableList<SyncChange>) {
        dao.allReviewLogs().forEach { log ->
            val uid = uidFor(ENTITY_LOGS, log.id) { log.reviewedAtMillis }
            val cardUid = uidOf(ENTITY_CARDS, log.cardId)
            out += change(ENTITY_LOGS, uid, log.reviewedAtMillis, buildJsonObject {
                put("cardId", log.cardId)
                cardUid?.let { put("cardUid", it) }
                put("rating", log.rating)
                put("reviewedAtMillis", log.reviewedAtMillis)
                put("previousDueAtMillis", log.previousDueAtMillis)
                put("nextDueAtMillis", log.nextDueAtMillis)
            })
        }
    }

    private fun collectSessions(out: MutableList<SyncChange>) {
        dao.allSessions().forEach { session ->
            val uid = uidFor(ENTITY_SESSIONS, session.id) { session.startedAtMillis }
            val courseUid = session.courseId?.let { uidOf(ENTITY_COURSES, it) }
            out += change(ENTITY_SESSIONS, uid, session.startedAtMillis, buildJsonObject {
                put("startedAtMillis", session.startedAtMillis)
                session.endedAtMillis?.let { put("endedAtMillis", it) }
                put("title", session.title)
                session.courseId?.let { put("courseId", it) }
                courseUid?.let { put("courseUid", it) }
            })
        }
    }

    private fun collectTranscriptLines(out: MutableList<SyncChange>) {
        dao.allTranscriptLines().forEach { line ->
            val uid = uidFor(ENTITY_LINES, line.id) { line.timestampMillis }
            val sessionUid = uidOf(ENTITY_SESSIONS, line.sessionId)
            out += change(ENTITY_LINES, uid, line.timestampMillis, buildJsonObject {
                put("sessionId", line.sessionId)
                sessionUid?.let { put("sessionUid", it) }
                put("timestampMillis", line.timestampMillis)
                put("text", line.text)
                line.segmentKey?.let { put("segmentKey", it) }
                line.speaker?.let { put("speaker", it) }
                line.startMs?.let { put("startMs", it) }
                line.endMs?.let { put("endMs", it) }
                line.language?.let { put("language", it) }
            })
        }
    }

    private fun collectDoubts(out: MutableList<SyncChange>) {
        dao.allDoubts().forEach { doubt ->
            val uid = uidFor(ENTITY_DOUBTS, doubt.id) { doubt.timestampMillis }
            val sessionUid = uidOf(ENTITY_SESSIONS, doubt.sessionId)
            val lineUid = doubt.transcriptLineId?.let { uidOf(ENTITY_LINES, it) }
            out += change(ENTITY_DOUBTS, uid, doubt.timestampMillis, buildJsonObject {
                put("sessionId", doubt.sessionId)
                sessionUid?.let { put("sessionUid", it) }
                doubt.transcriptLineId?.let { put("transcriptLineId", it) }
                lineUid?.let { put("transcriptLineUid", it) }
                put("timestampMillis", doubt.timestampMillis)
                put("sourceText", doubt.sourceText)
                put("note", doubt.note)
                put("createdAtMillis", doubt.createdAtMillis)
            })
        }
    }

    private fun uidFor(entity: String, localId: Long, updatedAt: () -> Long): String {
        dao.linkFor(entity, localId)?.let { return it.uid }
        val uid = UUID.randomUUID().toString()
        dao.upsertLink(SyncEntityRow(entity = entity, uid = uid, localId = localId, updatedAtMillis = updatedAt()))
        return uid
    }

    private fun uidOf(entity: String, localId: Long): String? = dao.linkFor(entity, localId)?.uid

    private fun change(entity: String, uid: String, natural: Long, payload: JsonObject): SyncChange {
        val stored = dao.linkByUid(entity, uid)?.updatedAtMillis ?: natural
        return SyncChange(entity, uid, payload, maxOf(stored, natural), deleted = false)
    }

    // ---------- pull ----------

    private suspend fun pullAndMerge(): Int {
        val response = api.syncPull(emptyList())
        var applied = 0
        response.records
            .sortedBy { ENTITY_ORDER.indexOf(it.entity).let { index -> if (index < 0) 99 else index } }
            .forEach { record ->
                if (applyRecord(record)) applied += 1
            }
        return applied
    }

    private fun applyRecord(record: SyncRecordDto): Boolean {
        val entity = record.entity
        val uid = record.clientUid.lowercase()
        val link = dao.linkByUid(entity, uid)
        if (record.deleted) {
            link?.let { deleteLocal(entity, it.localId) }
            dao.deleteLink(entity, uid)
            return link != null
        }
        if (link == null) {
            val localId = insertLocal(entity, record.payload) ?: return false
            dao.upsertLink(SyncEntityRow(entity = entity, uid = uid, localId = localId, updatedAtMillis = record.updatedAt))
            return true
        }
        if (record.updatedAt > link.updatedAtMillis) {
            updateLocal(entity, link.localId, record.payload)
            dao.upsertLink(link.copy(updatedAtMillis = record.updatedAt))
            return true
        }
        return false
    }

    private fun insertLocal(entity: String, payload: JsonObject): Long? = runCatching {
        when (entity) {
            ENTITY_COURSES -> dao.insertCourse(
                CourseEntity(
                    name = payload.str("name") ?: return null,
                    teacher = payload.str("teacher") ?: "",
                    language = payload.str("language") ?: "中英双语",
                    examProfile = payload.str("examProfile") ?: CourseEntity.PROFILE_FOREIGN_CLASS,
                    courseNature = payload.str("courseNature") ?: "",
                    createdAtMillis = payload.long("createdAtMillis") ?: System.currentTimeMillis(),
                ),
            )
            ENTITY_MATERIALS -> {
                val courseId = resolveParent(ENTITY_COURSES, payload, "courseUid", "courseId") ?: return null
                dao.insertMaterial(
                    MaterialEntity(
                        courseId = courseId,
                        title = payload.str("title") ?: return null,
                        mimeType = payload.str("mimeType") ?: "application/octet-stream",
                        textRelativePath = "",
                        documentJson = payload.str("documentJson"),
                        pageCount = payload.int("pageCount") ?: 1,
                        importedAtMillis = payload.long("importedAtMillis") ?: System.currentTimeMillis(),
                    ),
                )
            }
            ENTITY_ITEMS -> {
                val courseId = resolveParent(ENTITY_COURSES, payload, "courseUid", "courseId") ?: return null
                dao.insertLearningItem(
                    LearningItemEntity(
                        courseId = courseId,
                        type = payload.str("type") ?: return null,
                        title = payload.str("title") ?: return null,
                        content = payload.str("content") ?: "",
                        translation = payload.str("translation"),
                        example = payload.str("example"),
                        sourceIdsCsv = payload.array("sourceIds")?.joinToString(",") ?: "",
                        inCET6 = payload.bool("inCET6") ?: false,
                        origin = payload.str("origin") ?: LearningItemEntity.ORIGIN_AI,
                        createdAtMillis = payload.long("createdAtMillis") ?: System.currentTimeMillis(),
                        updatedAtMillis = payload.long("updatedAtMillis")
                            ?: payload.long("createdAtMillis")
                            ?: System.currentTimeMillis(),
                    ),
                )
            }
            ENTITY_CARDS -> {
                val itemId = resolveParent(ENTITY_ITEMS, payload, "learningItemUid", "learningItemId") ?: return null
                dao.insertReviewCard(
                    ReviewCardEntity(
                        learningItemId = itemId,
                        front = payload.str("front") ?: return null,
                        back = payload.str("back") ?: "",
                        dueAtMillis = payload.long("dueAtMillis") ?: System.currentTimeMillis(),
                        cardState = payload.int("cardState") ?: 0,
                        step = payload.int("step"),
                        stability = payload.double("stability") ?: 0.0,
                        difficulty = payload.double("difficulty") ?: 0.0,
                        reps = payload.int("reps") ?: 0,
                        lapses = payload.int("lapses") ?: 0,
                        lastReviewedAtMillis = payload.long("lastReviewedAtMillis"),
                        lastRating = payload.int("lastRating"),
                    ),
                )
            }
            ENTITY_LOGS -> {
                val cardId = resolveParent(ENTITY_CARDS, payload, "cardUid", "cardId") ?: return null
                dao.insertReviewLog(
                    ReviewLogEntity(
                        cardId = cardId,
                        rating = payload.int("rating") ?: return null,
                        reviewedAtMillis = payload.long("reviewedAtMillis") ?: System.currentTimeMillis(),
                        previousDueAtMillis = payload.long("previousDueAtMillis") ?: 0,
                        nextDueAtMillis = payload.long("nextDueAtMillis") ?: 0,
                    ),
                )
            }
            ENTITY_SESSIONS -> dao.insertSession(
                SessionEntity(
                    startedAtMillis = payload.long("startedAtMillis") ?: System.currentTimeMillis(),
                    endedAtMillis = payload.long("endedAtMillis"),
                    title = payload.str("title") ?: "课堂记录",
                    courseId = resolveOptional(ENTITY_COURSES, payload, "courseUid", "courseId"),
                ),
            )
            ENTITY_LINES -> {
                val sessionId = resolveParent(ENTITY_SESSIONS, payload, "sessionUid", "sessionId") ?: return null
                dao.insertTranscriptLine(
                    TranscriptLineEntity(
                        sessionId = sessionId,
                        timestampMillis = payload.long("timestampMillis") ?: System.currentTimeMillis(),
                        text = payload.str("text") ?: return null,
                        segmentKey = payload.str("segmentKey"),
                        speaker = payload.str("speaker"),
                        startMs = payload.long("startMs"),
                        endMs = payload.long("endMs"),
                        language = payload.str("language"),
                    ),
                )
            }
            ENTITY_DOUBTS -> {
                val sessionId = resolveParent(ENTITY_SESSIONS, payload, "sessionUid", "sessionId") ?: return null
                dao.insertDoubt(
                    DoubtEventEntity(
                        sessionId = sessionId,
                        transcriptLineId = resolveOptional(ENTITY_LINES, payload, "transcriptLineUid", "transcriptLineId"),
                        timestampMillis = payload.long("timestampMillis") ?: System.currentTimeMillis(),
                        sourceText = payload.str("sourceText") ?: return null,
                        note = payload.str("note") ?: "",
                        createdAtMillis = payload.long("createdAtMillis") ?: System.currentTimeMillis(),
                    ),
                )
            }
            else -> null
        }
    }.getOrNull()

    private fun updateLocal(entity: String, id: Long, payload: JsonObject) {
        runCatching {
            when (entity) {
                ENTITY_COURSES -> dao.course(id)?.let { existing ->
                    dao.updateCourse(
                        id,
                        payload.str("name") ?: existing.name,
                        payload.str("teacher") ?: existing.teacher,
                        payload.str("language") ?: existing.language,
                        payload.str("examProfile") ?: existing.examProfile,
                        payload.str("courseNature") ?: existing.courseNature,
                    )
                }
                ENTITY_MATERIALS -> {
                    val courseId = resolveParent(ENTITY_COURSES, payload, "courseUid", "courseId") ?: return
                    dao.updateMaterial(
                        id,
                        courseId,
                        payload.str("title") ?: return,
                        payload.str("mimeType") ?: "application/octet-stream",
                        payload.int("pageCount") ?: 1,
                        payload.long("importedAtMillis") ?: System.currentTimeMillis(),
                    )
                }
                ENTITY_ITEMS -> {
                    val courseId = resolveParent(ENTITY_COURSES, payload, "courseUid", "courseId") ?: return
                    dao.updateLearningItem(
                        id,
                        courseId,
                        payload.str("type") ?: return,
                        payload.str("title") ?: return,
                        payload.str("content") ?: "",
                        payload.str("translation"),
                        payload.str("example"),
                        payload.array("sourceIds")?.joinToString(",") ?: "",
                        payload.bool("inCET6") ?: false,
                        payload.str("origin") ?: LearningItemEntity.ORIGIN_AI,
                        payload.long("updatedAtMillis")
                            ?: payload.long("createdAtMillis")
                            ?: System.currentTimeMillis(),
                    )
                }
                ENTITY_CARDS -> dao.updateReviewCard(
                    id,
                    payload.str("front") ?: return,
                    payload.str("back") ?: "",
                    payload.long("dueAtMillis") ?: System.currentTimeMillis(),
                    payload.int("cardState") ?: 0,
                    payload.int("step"),
                    payload.double("stability") ?: 0.0,
                    payload.double("difficulty") ?: 0.0,
                    payload.int("reps") ?: 0,
                    payload.int("lapses") ?: 0,
                    payload.long("lastReviewedAtMillis"),
                    payload.int("lastRating"),
                )
                ENTITY_LOGS -> Unit // 复习日志不可变，重复合并无意义
                ENTITY_SESSIONS -> dao.session(id)?.let { existing ->
                    dao.updateSession(id, payload.long("endedAtMillis"), payload.str("title") ?: existing.title)
                }
                ENTITY_LINES -> dao.updateTranscriptLine(
                    id,
                    payload.str("text") ?: return,
                    payload.str("speaker"),
                    payload.long("startMs"),
                    payload.long("endMs"),
                    payload.str("language"),
                )
                ENTITY_DOUBTS -> dao.updateDoubt(id, payload.str("sourceText") ?: return, payload.str("note") ?: "")
            }
        }
    }

    private fun deleteLocal(entity: String, id: Long) {
        runCatching {
            when (entity) {
                ENTITY_COURSES -> dao.deleteCourse(id)
                ENTITY_MATERIALS -> dao.deleteMaterial(id)
                ENTITY_ITEMS -> dao.deleteLearningItem(id)
                ENTITY_CARDS -> dao.deleteReviewCard(id)
                ENTITY_LOGS -> dao.deleteReviewLog(id)
                ENTITY_SESSIONS -> dao.deleteSession(id)
                ENTITY_LINES -> dao.deleteTranscriptLine(id)
                ENTITY_DOUBTS -> dao.deleteDoubt(id)
            }
        }
    }

    private fun resolveParent(entity: String, payload: JsonObject, uidField: String, idField: String): Long? =
        resolveOptional(entity, payload, uidField, idField)

    private fun resolveOptional(entity: String, payload: JsonObject, uidField: String, idField: String): Long? {
        payload.str(uidField)?.lowercase()?.let { uid ->
            dao.linkByUid(entity, uid)?.let { return it.localId }
        }
        return payload.long(idField)
    }

    private fun JsonObject.str(key: String): String? =
        runCatching { this[key]?.jsonPrimitive?.contentOrNull }.getOrNull()

    private fun JsonObject.long(key: String): Long? =
        runCatching { this[key]?.jsonPrimitive?.longOrNull }.getOrNull()

    private fun JsonObject.int(key: String): Int? =
        runCatching { this[key]?.jsonPrimitive?.intOrNull }.getOrNull()

    private fun JsonObject.double(key: String): Double? =
        runCatching { this[key]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull() }.getOrNull()

    private fun JsonObject.bool(key: String): Boolean? =
        runCatching { this[key]?.jsonPrimitive?.booleanOrNull }.getOrNull()

    private fun JsonObject.array(key: String): List<String>? =
        runCatching {
            (this[key] as? kotlinx.serialization.json.JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull }
        }.getOrNull()

    companion object {
        private const val ENTITY_COURSES = "courses"
        private const val ENTITY_MATERIALS = "materials"
        private const val ENTITY_ITEMS = "learning_items"
        private const val ENTITY_CARDS = "review_cards"
        private const val ENTITY_LOGS = "review_logs"
        private const val ENTITY_SESSIONS = "sessions"
        private const val ENTITY_LINES = "transcript_lines"
        private const val ENTITY_DOUBTS = "doubts"
        private val ENTITY_ORDER = listOf(
            ENTITY_COURSES, ENTITY_MATERIALS, ENTITY_ITEMS, ENTITY_CARDS, ENTITY_LOGS,
            ENTITY_SESSIONS, ENTITY_LINES, ENTITY_DOUBTS,
        )
        private const val BATCH = 400
        private const val MAX_PAYLOAD = 128 * 1024
        private const val KEY_LAST_SYNC = "last_sync_at"

        @Volatile private var instance: SyncManager? = null

        fun get(context: Context): SyncManager = instance ?: synchronized(this) {
            instance ?: SyncManager(context.applicationContext).also { instance = it }
        }
    }
}
