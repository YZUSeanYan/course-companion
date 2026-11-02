package com.classroomradar.app.learning

import android.content.Context
import android.net.Uri
import com.classroomradar.app.BuildConfig
import com.classroomradar.app.data.AppPreferences
import com.classroomradar.app.data.ClassroomRepository
import com.classroomradar.app.learning.api.AiServiceConfig
import com.classroomradar.app.learning.api.AccountStatusDto
import com.classroomradar.app.learning.api.AccountStatusStore
import com.classroomradar.app.learning.api.AnalysisChunkInput
import com.classroomradar.app.learning.api.AnalysisRequest
import com.classroomradar.app.learning.api.AnalysisResultDto
import com.classroomradar.app.learning.api.AppConfigDto
import com.classroomradar.app.learning.api.DocumentAssetDto
import com.classroomradar.app.learning.api.LearningApiClient
import com.classroomradar.app.learning.api.LearningApiException
import com.classroomradar.app.learning.api.LearningPackRequestV2
import com.classroomradar.app.learning.api.ManualDoubtInput
import com.classroomradar.app.learning.api.NetworkErrorKind
import com.classroomradar.app.learning.api.normalizeAccountPhone
import com.classroomradar.app.learning.api.VisualBlockInput
import com.classroomradar.app.learning.api.requiresVisionForLearningPack
import android.util.Base64
import kotlinx.serialization.json.Json
import com.classroomradar.app.learning.importer.LectureImporter
import com.classroomradar.app.learning.importer.GlossaryImporter
import java.security.MessageDigest
import com.classroomradar.app.learning.review.ReviewScheduler
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class CourseDetailState(
    val course: CourseEntity? = null,
    val materials: List<MaterialEntity> = emptyList(),
    val learningItems: List<LearningItemEntity> = emptyList(),
)

class LearningPresenter(private val appContext: Context) {
    private val repository = LearningRepository.get(appContext)
    private val classroomRepository = ClassroomRepository.get(appContext)
    private val lectureImporter = LectureImporter()
    private val aiServiceConfig = AiServiceConfig(appContext)
    private val accountStatusStore = AccountStatusStore(appContext)
    private val learningApi = LearningApiClient(
        appContext,
        BuildConfig.LEARNING_API_BASE_URL,
        baseUrlProvider = aiServiceConfig::baseUrl,
    )
    private val protocolJson = Json { ignoreUnknownKeys = false }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var detailJob: Job? = null
    private var accountRefreshJob: Job? = null
    private var selectedCourseId: Long? = null

    private val _courses = MutableStateFlow<List<CourseEntity>>(emptyList())
    val courses: StateFlow<List<CourseEntity>> = _courses.asStateFlow()
    private val _reviewEntries = MutableStateFlow<List<ReviewCardWithSource>>(emptyList())
    val reviewEntries: StateFlow<List<ReviewCardWithSource>> = _reviewEntries.asStateFlow()
    private val _courseDetail = MutableStateFlow(CourseDetailState())
    val courseDetail: StateFlow<CourseDetailState> = _courseDetail.asStateFlow()
    private val _isImporting = MutableStateFlow(false)
    val isImporting: StateFlow<Boolean> = _isImporting.asStateFlow()
    private val _isAnalyzing = MutableStateFlow(false)
    val isAnalyzing: StateFlow<Boolean> = _isAnalyzing.asStateFlow()
    private val _serviceStatus = MutableStateFlow("尚未检查 AI 服务 · ${aiServiceConfig.displayTarget}")
    val serviceStatus: StateFlow<String> = _serviceStatus.asStateFlow()
    private val _aiServiceUrl = MutableStateFlow(aiServiceConfig.baseUrl)
    val aiServiceUrl: StateFlow<String> = _aiServiceUrl.asStateFlow()
    private val _accountStatus = MutableStateFlow(accountStatusStore.load())
    val accountStatus: StateFlow<AccountStatusDto?> = _accountStatus.asStateFlow()
    private val _accountSupported = MutableStateFlow(accountStatusStore.isSupported())
    val accountSupported: StateFlow<Boolean> = _accountSupported.asStateFlow()
    private val _accountMessage = MutableStateFlow<String?>(null)
    val accountMessage: StateFlow<String?> = _accountMessage.asStateFlow()
    private val _isAccountBusy = MutableStateFlow(false)
    val isAccountBusy: StateFlow<Boolean> = _isAccountBusy.asStateFlow()
    private val _codeCooldownUntilMs = MutableStateFlow(0L)
    val codeCooldownUntilMs: StateFlow<Long> = _codeCooldownUntilMs.asStateFlow()
    /** True when the entered phone has no account yet: request a trial code and self-apply. */
    private val _accountTrialMode = MutableStateFlow(false)
    val accountTrialMode: StateFlow<Boolean> = _accountTrialMode.asStateFlow()
    private val _appConfig = MutableStateFlow<AppConfigDto?>(null)
    val appConfig: StateFlow<AppConfigDto?> = _appConfig.asStateFlow()
    private var appConfigJob: Job? = null
    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    init {
        scope.launch { repository.observeCourses().collect { _courses.value = it } }
        scope.launch { repository.observeAllCardsWithSource().collect { _reviewEntries.value = it } }
    }

    fun createCourse(name: String, courseNature: String, examProfile: String = CourseEntity.PROFILE_FOREIGN_CLASS) {
        if (name.isBlank()) {
            _message.value = "请先填写课程名称"
            return
        }
        scope.launch(Dispatchers.IO) {
            runCatching { repository.createCourse(name, "", "中英双语", examProfile, courseNature) }
                .onFailure { error ->
                    withContext(Dispatchers.Main.immediate) {
                        _message.value = error.message ?: "课程创建失败"
                    }
                }
        }
    }

    fun renameCourse(courseId: Long, name: String, courseNature: String) {
        if (name.isBlank()) {
            _message.value = "课程名称不能为空"
            return
        }
        scope.launch(Dispatchers.IO) {
            runCatching { repository.updateCourseMeta(courseId, name, courseNature) }
                .onFailure { error ->
                    withContext(Dispatchers.Main.immediate) {
                        _message.value = error.message ?: "课程更新失败"
                    }
                }
        }
    }

    fun deleteCourse(courseId: Long) {
        scope.launch(Dispatchers.IO) {
            runCatching { repository.deleteCourse(courseId) }
                .onSuccess {
                    if (selectedCourseId == courseId) selectedCourseId = null
                    withContext(Dispatchers.Main.immediate) {
                        _message.value = "课程已删除"
                    }
                }
                .onFailure { error ->
                    withContext(Dispatchers.Main.immediate) {
                        _message.value = error.message ?: "课程删除失败"
                    }
                }
        }
    }

    fun updateLearningItem(
        itemId: Long,
        title: String,
        content: String,
        translation: String?,
        example: String?,
    ) {
        if (title.isBlank() || content.isBlank()) {
            _message.value = "标题和正文不能为空"
            return
        }
        scope.launch(Dispatchers.IO) {
            runCatching {
                repository.updateLearningItemContent(itemId, title, content, translation, example)
            }.onSuccess {
                SyncManager.get(appContext).syncInBackground(silent = true)
                withContext(Dispatchers.Main.immediate) {
                    _message.value = "学习内容已保存"
                }
            }.onFailure { error ->
                withContext(Dispatchers.Main.immediate) {
                    _message.value = error.message ?: "学习内容保存失败"
                }
            }
        }
    }

    fun deleteLearningItem(itemId: Long) {
        scope.launch(Dispatchers.IO) {
            runCatching { repository.deleteLearningItem(itemId) }
                .onSuccess {
                    SyncManager.get(appContext).syncInBackground(silent = true)
                    withContext(Dispatchers.Main.immediate) {
                        _message.value = "学习内容已删除"
                    }
                }
                .onFailure { error ->
                    withContext(Dispatchers.Main.immediate) {
                        _message.value = error.message ?: "学习内容删除失败"
                    }
                }
        }
    }

    fun loadCourse(courseId: Long) {
        selectedCourseId = courseId
        detailJob?.cancel()
        detailJob = scope.launch {
            combine(
                repository.observeCourse(courseId),
                repository.observeMaterials(courseId),
                repository.observeLearningItems(courseId),
            ) { course, materials, items ->
                CourseDetailState(course, materials, items)
            }.collect { _courseDetail.value = it }
        }
    }

    fun importMaterial(uri: Uri, displayName: String?, mimeType: String?) {
        val courseId = selectedCourseId ?: run {
            _message.value = "请先选择课程"
            return
        }
        if (_isImporting.value) return
        _isImporting.value = true
        scope.launch {
            try {
                val imported = lectureImporter.import(appContext, uri, displayName, mimeType)
                withContext(Dispatchers.IO) {
                    repository.insertMaterial(
                        MaterialEntity(
                            courseId = courseId,
                            title = imported.title,
                            mimeType = imported.mimeType,
                            originalRelativePath = imported.originalRelativePath,
                            textRelativePath = imported.textRelativePath,
                            pageCount = imported.pageCount,
                            importedAtMillis = System.currentTimeMillis(),
                        ),
                    )
                }
                _message.value = "已导入《${imported.title}》"
            } catch (error: Exception) {
                _message.value = error.message ?: "讲义导入失败"
            } finally {
                _isImporting.value = false
            }
        }
    }

    private fun analyzeChunks(
        course: CourseEntity,
        targetType: String,
        targetId: Long,
        chunks: List<AnalysisChunkInput>,
        manualDoubts: List<ManualDoubtInput> = emptyList(),
        visualBlocks: List<VisualBlockInput> = emptyList(),
    ) {
        if (_isAnalyzing.value) return
        _isAnalyzing.value = true
        scope.launch {
            val startedAt = System.currentTimeMillis()
            try {
                val response = learningApi.analyzeV2(
                    LearningPackRequestV2(
                        courseName = course.name,
                        language = course.language,
                        courseNature = course.courseNature,
                        outputLanguage = if (AppPreferences.get(appContext).learningOutputChinese) "zh" else "source",
                        analysisMode = when {
                            targetType == "SESSION" -> "SESSION"
                            course.examProfile != CourseEntity.PROFILE_FOREIGN_CLASS -> "EXAM"
                            else -> "MATERIAL"
                        },
                        chunks = chunks,
                        manualDoubts = manualDoubts,
                        visualBlocks = visualBlocks,
                    ),
                )
                val itemCount = withContext(Dispatchers.IO) {
                    persistAnalysis(course.id, targetType, targetId, response, startedAt)
                }
                _message.value = if (itemCount == 0) {
                    "这份内容的学习包已存在，无需重复生成。"
                } else {
                    "AI 学习包已生成：新增 $itemCount 项学习内容和复习卡片"
                }
            } catch (error: Exception) {
                _message.value = analysisErrorMessage(error)
                refreshAccount(silent = true)
            } finally {
                _isAnalyzing.value = false
            }
        }
    }

    fun analyzeMaterial(materialId: Long) {
        val course = _courseDetail.value.course ?: run {
            _message.value = "课程不存在，无法生成学习包"
            return
        }
        scope.launch {
            val material = withContext(Dispatchers.IO) { repository.getMaterial(materialId) }
            if (material == null) {
                _message.value = "讲义不存在，请重新导入"
                return@launch
            }
            if (material.mimeType == "application/pdf" || material.mimeType.startsWith("image/")) {
                val originalPath = material.originalRelativePath
                if (originalPath != null) {
                    _isAnalyzing.value = true
                    try {
                        val asset = learningApi.analyzeDocument(
                            File(appContext.filesDir, originalPath),
                            material.mimeType,
                        )
                        withContext(Dispatchers.IO) {
                            repository.updateMaterial(
                                material.copy(
                                    documentJson = protocolJson.encodeToString(DocumentAssetDto.serializer(), asset),
                                    pageCount = asset.pages.size,
                                ),
                            )
                        }
                        val chunks = asset.pages.map { page ->
                            AnalysisChunkInput(
                                sourceId = page.pageId,
                                text = page.pageText.ifBlank { "第 ${page.pageIndex + 1} 页，需结合原图理解" },
                                page = page.pageIndex + 1,
                            )
                        }
                        val visualPages = asset.pages.filter { it.requiresVisionForLearningPack() }
                        val visualBlocks = visualPages.take(4).map { page ->
                            val imageBytes = learningApi.pageImage(
                                asset.documentId,
                                page.imageRelativePath.substringAfterLast('/'),
                            )
                            VisualBlockInput(
                                sourceId = page.pageId,
                                ocrText = page.pageText,
                                imageBase64 = Base64.encodeToString(imageBytes, Base64.NO_WRAP),
                                mimeType = "image/jpeg",
                            )
                        }
                        _isAnalyzing.value = false
                        analyzeChunks(
                            course,
                            "MATERIAL",
                            material.id,
                            chunks,
                            visualBlocks = visualBlocks,
                        )
                    } catch (error: Exception) {
                        _message.value = analysisErrorMessage(error)
                        _isAnalyzing.value = false
                    }
                    return@launch
                }
            }
            val text = runCatching {
                File(appContext.filesDir, material.textRelativePath).readText(Charsets.UTF_8)
            }.getOrElse {
                _message.value = "无法读取讲义正文：${it.message}"
                return@launch
            }
            if (text.isBlank()) {
                _message.value = "讲义没有可分析的正文"
                return@launch
            }
            analyzeChunks(
                course,
                "MATERIAL",
                material.id,
                listOf(AnalysisChunkInput("material-${material.id}", text.take(20_000), page = 1)),
            )
        }
    }

    fun analyzeSession(sessionId: Long) {
        scope.launch {
            val record = withContext(Dispatchers.IO) { classroomRepository.loadExport(sessionId) }
            if (record == null || record.transcript.isEmpty()) {
                _message.value = "本节课还没有可分析的定稿转写"
                return@launch
            }
            val course = record.session.courseId?.let { id ->
                withContext(Dispatchers.IO) { repository.getCourse(id) }
            } ?: _courses.value.firstOrNull() ?: run {
                _message.value = "请先创建并关联一门课程"
                return@launch
            }
            val chunks = record.transcript.chunked(30).mapIndexed { index, lines ->
                val text = lines.joinToString("\n") { it.text }.take(20_000)
                AnalysisChunkInput(
                    sourceId = "session-$sessionId-part-${index + 1}",
                    text = text,
                    startMs = lines.first().timestampMillis,
                    endMs = lines.last().timestampMillis + 1,
                )
            }
            analyzeChunks(
                course,
                "SESSION",
                sessionId,
                chunks,
                record.doubts.map { doubt ->
                    ManualDoubtInput("doubt-${doubt.id}", doubt.sourceText, doubt.note)
                },
            )
        }
    }

    private fun analysisErrorMessage(error: Exception): String = when (error) {
        is LearningApiException.JobFailed -> when (error.code) {
            "account_required" -> "AI 学习包需要先激活试用额度：设置 → 试用额度 → 输入手机号。"
            "account_expired", "account_disabled" -> error.userMessage
            "quota_exceeded" -> "今天的学习包生成次数已达上限，请明天再试。"
            "provider_unavailable" -> error.userMessage.ifBlank {
                "AI 服务暂时不可用，请稍后重试。"
            }
            "timeout" -> "讲义分析用时较长，暂时还没有结果。请稍后重试，已开始的同一任务会继续复用。"
            else -> "学习包生成未完成：${error.userMessage}"
        }
        is LearningApiException.Network -> {
            val reason = when (error.kind) {
                NetworkErrorKind.TIMEOUT -> "与 AI 服务的连接等待超时"
                NetworkErrorKind.TLS -> "HTTPS 安全连接失败，请检查系统时间或网络代理"
                else -> "网络连接中断，未能继续获取生成结果"
            }
            "$reason。请检查 Wi-Fi 或移动网络后重试；若后台任务已创建，服务端会继续处理且同一讲义不会重复创建。"
        }
        is LearningApiException.Http -> when {
            error.errorCode == "account_required" ->
                "AI 学习包、翻译和云端听课需要先激活试用额度：设置 → 试用额度 → 输入手机号。"
            error.errorCode == "account_expired" -> error.detail
            error.errorCode == "account_disabled" -> error.detail
            error.errorCode == "quota_exceeded" -> error.detail
            error.errorCode == "device_limit_reached" -> error.detail
            error.httpCode == 401 ->
                "AI 服务鉴权失败（HTTP 401），请重新检查服务或联系后端管理员。"
            error.httpCode == 403 ->
                if (error.detail.isNotBlank()) error.detail else "当前设备没有试用额度，请联系管理员。"
            error.httpCode == 404 -> "AI 服务路径不存在（HTTP 404），请检查设置中的服务地址。"
            error.httpCode == 429 ->
                if (error.detail.isNotBlank()) error.detail else "AI 服务请求额度已用尽或触发限流，请稍后重试。"
            error.httpCode == 503 -> "后端已连接，但 AI 模型不可用：${error.detail}"
            else -> "生成学习包失败（HTTP ${error.httpCode}）：${error.detail}"
        }
        is LearningApiException.InvalidResponse ->
            "后端已响应，但数据格式与学习包协议不兼容：${error.message}"
        else -> "生成学习包失败：${error.message ?: "请稍后重试"}"
    }

    private fun persistAnalysis(
        courseId: Long,
        targetType: String,
        targetId: Long,
        response: AnalysisResultDto,
        startedAt: Long,
    ): Int {
        val existing = repository.findCompletedAnalysisRun(
            courseId = courseId,
            targetType = targetType,
            targetId = targetId,
            inputSha256 = response.inputSha256,
            promptVersion = response.promptVersion,
            schemaVersion = response.schemaVersion,
        )
        if (existing != null) return 0
        val now = System.currentTimeMillis()
        val pack = response.learningPackage
        val items = buildList {
            pack.minutes?.let { minutes ->
                val minuteSources = (
                    minutes.sections.flatMap { it.sourceIds } +
                        pack.keyPoints.flatMap { it.sourceIds } +
                        pack.quizCards.flatMap { it.sourceIds }
                    ).distinct()
                add(
                    learningItem(
                        courseId,
                        LearningItemEntity.TYPE_MEETING_MINUTES,
                        minutes.title,
                        minutes.overview,
                        minuteSources,
                        now,
                    ),
                )
            }
            pack.doubtAnswers.forEach {
                add(learningItem(courseId, LearningItemEntity.TYPE_DOUBT, "我的疑问与参考解答", it.answer, it.sourceIds, now))
            }
            pack.visualNotes.forEach {
                add(learningItem(courseId, LearningItemEntity.TYPE_KEY_POINT, "图像说明", it.description, it.sourceIds, now))
            }
            pack.summary.forEach {
                add(learningItem(courseId, LearningItemEntity.TYPE_KEY_POINT, "课堂摘要", it.text, it.sourceIds, now))
            }
            pack.vocabulary.forEach {
                add(learningItem(courseId, LearningItemEntity.TYPE_VOCABULARY, it.term, it.definitionZh, it.sourceIds, now, it.definitionEn, it.example))
            }
            pack.phrases.forEach {
                add(learningItem(courseId, LearningItemEntity.TYPE_PHRASE, it.phrase, it.definitionZh, it.sourceIds, now, it.definitionEn, it.example))
            }
            pack.keyPoints.forEach {
                add(learningItem(courseId, LearningItemEntity.TYPE_KEY_POINT, "重难点", it.text, it.sourceIds, now))
            }
            pack.questions.forEach {
                add(learningItem(courseId, LearningItemEntity.TYPE_QUESTION, it.question, it.answer, it.sourceIds, now))
            }
            pack.quizCards.forEach {
                add(learningItem(courseId, LearningItemEntity.TYPE_QUIZ, it.front, it.back, it.sourceIds, now))
            }
        }
        val cards = items.mapIndexedNotNull { index, item ->
            if (item.type !in setOf(
                    LearningItemEntity.TYPE_VOCABULARY,
                    LearningItemEntity.TYPE_PHRASE,
                    LearningItemEntity.TYPE_QUESTION,
                    LearningItemEntity.TYPE_QUIZ,
                )
            ) {
                null
            } else {
                ReviewCardEntity(
                    learningItemId = index.toLong(),
                    front = item.title,
                    back = item.content,
                    dueAtMillis = now,
                )
            }
        }
        repository.saveLearningPackage(
            items = items,
            cards = cards,
            run = AnalysisRunEntity(
                courseId = courseId,
                targetType = targetType,
                targetId = targetId,
                inputSha256 = response.inputSha256,
                promptVersion = response.promptVersion,
                schemaVersion = response.schemaVersion,
                model = response.model,
                status = "COMPLETED",
                createdAtMillis = startedAt,
                completedAtMillis = now,
            ),
        )
        SyncManager.get(appContext).syncInBackground(silent = true)
        return items.size
    }

    private fun learningItem(
        courseId: Long,
        type: String,
        title: String,
        content: String,
        sourceIds: List<String>,
        now: Long,
        translation: String? = null,
        example: String? = null,
    ) = LearningItemEntity(
        courseId = courseId,
        type = type,
        title = title,
        content = content,
        translation = translation,
        example = example,
        sourceIdsCsv = sourceIds.joinToString(","),
        createdAtMillis = now,
    )

    fun saveAiServiceUrl(rawUrl: String) {
        try {
            val previous = _aiServiceUrl.value
            _aiServiceUrl.value = aiServiceConfig.save(rawUrl)
            _serviceStatus.value = "服务地址已保存 · ${aiServiceConfig.displayTarget}"
            if (previous != _aiServiceUrl.value) {
                _accountStatus.value = null
                _accountSupported.value = true
                _accountMessage.value = "服务地址已更换，请重新激活试用额度"
            }
            checkAiService()
        } catch (error: IllegalArgumentException) {
            _serviceStatus.value = "服务地址未保存：${error.message}"
        }
    }

    fun refreshAccount(silent: Boolean = false) {
        if (accountRefreshJob?.isActive == true) return
        accountRefreshJob = scope.launch {
            try {
                val status = learningApi.accountStatus()
                accountStatusStore.save(status)
                _accountStatus.value = status
                _accountSupported.value = true
                if (!silent) {
                    _accountMessage.value = if (status.activated) {
                        "额度状态已刷新"
                    } else {
                        "尚未激活试用额度"
                    }
                }
            } catch (error: LearningApiException.Http) {
                if (error.httpCode == 404 || error.httpCode == 405) {
                    accountStatusStore.markUnsupported()
                    _accountStatus.value = null
                    _accountSupported.value = false
                    if (!silent) _accountMessage.value = "当前 AI 服务未启用手机号额度"
                } else if (!silent) {
                    _accountMessage.value = accountErrorMessage(error)
                }
            } catch (error: Exception) {
                if (!silent) _accountMessage.value = accountErrorMessage(error)
            }
        }
    }

    fun requestCode(rawPhone: String) {
        val phone = normalizeAccountPhone(rawPhone)
        if (phone == null) {
            _accountMessage.value = "请输入 11 位中国大陆手机号"
            return
        }
        if (_isAccountBusy.value) return
        if (System.currentTimeMillis() < _codeCooldownUntilMs.value) return
        _isAccountBusy.value = true
        _accountMessage.value = null
        scope.launch {
            try {
                if (_accountTrialMode.value) {
                    // 未开通手机号：走自助申请验证码，验证通过后可自助开卡。
                    val response = learningApi.requestTrialCode(phone)
                    _codeCooldownUntilMs.value = System.currentTimeMillis() +
                        maxOf(response.resendAfterSeconds, 1) * 1000L
                    _accountMessage.value = "验证码已发送至 ${response.phoneMasked}；填写姓名和昵称即可开通"
                } else {
                    val response = learningApi.requestActivationCode(phone)
                    _codeCooldownUntilMs.value = System.currentTimeMillis() +
                        maxOf(response.cooldownSeconds, 1) * 1000L
                    _accountMessage.value = "验证码已发送至 ${response.phoneMasked}，请查收短信"
                }
            } catch (error: Exception) {
                val http = error as? LearningApiException.Http
                if (http?.errorCode == "account_not_found" && !_accountTrialMode.value) {
                    // 该手机号未在后台开户：切到自助开通，提示重新获取验证码。
                    _accountTrialMode.value = true
                    _accountMessage.value = "该手机号尚未开通试用额度：填写姓名和昵称后可直接开通并激活"
                } else if (http?.errorCode == "phone_registered" && _accountTrialMode.value) {
                    _accountTrialMode.value = false
                    _accountMessage.value = "该手机号已在试用名单中，请直接获取激活验证码"
                } else {
                    _accountMessage.value = accountErrorMessage(error)
                }
            } finally {
                _isAccountBusy.value = false
            }
        }
    }

    fun applyTrial(rawPhone: String, code: String, name: String, nickname: String) {
        val phone = normalizeAccountPhone(rawPhone)
        if (phone == null) {
            _accountMessage.value = "请输入 11 位中国大陆手机号"
            return
        }
        if (name.isBlank() || nickname.isBlank()) {
            _accountMessage.value = "请填写姓名和昵称"
            return
        }
        if (code.length != 6) {
            _accountMessage.value = "请输入 6 位短信验证码"
            return
        }
        if (_isAccountBusy.value) return
        _isAccountBusy.value = true
        _accountMessage.value = null
        scope.launch {
            try {
                val applied = learningApi.applyTrial(phone, code, name, nickname)
                if (!applied.applied) {
                    _accountMessage.value = applied.message.ifBlank { "自助开通失败，请稍后重试" }
                    return@launch
                }
                // 开卡成功后立即拉取账号状态（apply 已绑定当前设备）。
                val status = learningApi.accountStatus()
                accountStatusStore.save(status)
                _accountStatus.value = status
                _accountSupported.value = true
                _accountTrialMode.value = false
                _codeCooldownUntilMs.value = 0L
                _accountMessage.value = "已开通并激活 ${status.phoneMasked}，有效期至 ${applied.validUntil}"
                SyncManager.get(appContext).syncInBackground(silent = true)
            } catch (error: Exception) {
                _accountMessage.value = accountErrorMessage(error)
            } finally {
                _isAccountBusy.value = false
            }
        }
    }

    fun activateAccount(rawPhone: String, code: String? = null) {
        val phone = normalizeAccountPhone(rawPhone)
        if (phone == null) {
            _accountMessage.value = "请输入 11 位中国大陆手机号"
            return
        }
        if (_isAccountBusy.value) return
        _isAccountBusy.value = true
        _accountMessage.value = null
        scope.launch {
            try {
                val status = learningApi.activateAccount(phone, code)
                accountStatusStore.save(status)
                _accountStatus.value = status
                _accountSupported.value = true
                _accountTrialMode.value = false
                _codeCooldownUntilMs.value = 0L
                _accountMessage.value = "已激活 ${status.phoneMasked}，今日额度已同步"
                SyncManager.get(appContext).syncInBackground(silent = true)
            } catch (error: Exception) {
                _accountMessage.value = accountErrorMessage(error)
            } finally {
                _isAccountBusy.value = false
            }
        }
    }

    fun fetchAppConfig() {
        if (appConfigJob?.isActive == true) return
        appConfigJob = scope.launch {
            try {
                _appConfig.value = learningApi.appConfig()
            } catch (error: Exception) {
                // 公告与标语是增强体验：拉取失败静默保留默认值，不打扰用户。
            }
        }
    }

    fun consumeAccountMessage() {
        _accountMessage.value = null
    }

    private fun accountErrorMessage(error: Exception): String = when (error) {
        is LearningApiException.Http -> when (error.errorCode) {
            "account_not_found" -> "未找到该手机号的试用额度，请联系管理员添加"
            "account_disabled" -> "试用账号已停用，请联系管理员"
            "account_expired" -> error.detail
            "device_limit_reached" -> error.detail
            "device_bound_elsewhere" -> error.detail
            "activation_code_required" -> "该账号已启用验证码保护，请先获取短信验证码"
            else -> when (error.httpCode) {
                400 -> error.detail.ifBlank { "请求参数不正确，请检查后重试" }
                401 -> "设备凭据失效，请重新保存服务地址后再试"
                403 -> error.detail.ifBlank { "当前设备没有试用额度，请联系管理员" }
                404, 405 -> "当前 AI 服务未启用手机号额度"
                429 -> error.detail
                else -> "额度服务请求失败（HTTP ${error.httpCode}）：${error.detail}"
            }
        }
        is LearningApiException.Network -> "网络连接失败，请检查 Wi-Fi 或移动网络后重试"
        else -> error.message ?: "额度服务暂时不可用"
    }

    fun checkAiService() {
        _serviceStatus.value = "正在检查 ${aiServiceConfig.displayTarget}…"
        scope.launch {
            _serviceStatus.value = try {
                val health = learningApi.health()
                if (health.providerConfigured) {
                    "AI 服务在线 · ${aiServiceConfig.displayTarget}\n文本生成与视觉理解会在使用时分别验证"
                } else {
                    "服务在线，但模型能力未配置\n请联系服务管理员检查文本模型配置"
                }
            } catch (error: LearningApiException.Network) {
                val reason = when (error.kind) {
                    NetworkErrorKind.TIMEOUT -> "连接超时"
                    NetworkErrorKind.TLS -> "HTTPS/TLS 连接失败"
                    else -> "无法建立连接"
                }
                "$reason · ${aiServiceConfig.displayTarget}\n请确认后端已启动、手机与电脑网络互通；10.0.2.2 仅用于电脑模拟器"
            } catch (error: LearningApiException.Http) {
                "后端响应异常 · HTTP ${error.httpCode}\n${error.detail}"
            } catch (error: Exception) {
                "服务检查失败 · ${aiServiceConfig.displayTarget}\n${error.message ?: "未知错误"}"
            }
        }
        if (_serviceStatus.value.contains("在线")) {
            refreshAccount(silent = true)
        }
    }

    fun reviewCard(cardId: Long, rating: Int) {
        scope.launch(Dispatchers.IO) {
            runCatching {
                val card = repository.getReviewCard(cardId) ?: return@runCatching
                val result = ReviewScheduler.review(card, rating, System.currentTimeMillis())
                repository.recordReview(result.card, result.log)
            }.onFailure { error ->
                withContext(Dispatchers.Main.immediate) {
                    _message.value = "复习结果保存失败：${error.message}"
                }
            }
        }
    }

    fun importGlossary(uri: Uri) {
        val course = _courseDetail.value.course ?: return
        if (course.examProfile != CourseEntity.PROFILE_CET6) {
            _message.value = "只有 CET6 课程支持标准词表导入"
            return
        }
        scope.launch(Dispatchers.IO) {
            runCatching {
                val text = appContext.contentResolver.openInputStream(uri)?.use {
                    it.readBytes().toString(Charsets.UTF_8)
                } ?: error("无法读取词表")
                require(text.length <= 2_000_000) { "词表文件过大" }
                val entries = GlossaryImporter.parse(text)
                val existing = _courseDetail.value.learningItems.mapTo(mutableSetOf()) { it.title.lowercase() }
                val now = System.currentTimeMillis()
                val items = entries.filter { it.term.lowercase() !in existing }.map { entry ->
                    LearningItemEntity(
                        courseId = course.id,
                        type = LearningItemEntity.TYPE_VOCABULARY,
                        title = entry.term,
                        content = entry.definition,
                        sourceIdsCsv = "CET6-CSV",
                        inCET6 = true,
                        origin = LearningItemEntity.ORIGIN_MANUAL,
                        createdAtMillis = now,
                    )
                }
                val cards = items.mapIndexed { index, item ->
                    ReviewCardEntity(learningItemId = index.toLong(), front = item.title, back = item.content, dueAtMillis = now)
                }
                repository.saveLearningPackage(
                    items,
                    cards,
                    AnalysisRunEntity(
                        courseId = course.id,
                        targetType = "GLOSSARY",
                        targetId = 0,
                        inputSha256 = MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) },
                        promptVersion = "manual-csv-v1",
                        schemaVersion = "1.0",
                        model = "MANUAL",
                        status = "COMPLETED",
                        createdAtMillis = now,
                        completedAtMillis = now,
                    ),
                )
                items.size
            }.onSuccess { count ->
                withContext(Dispatchers.Main.immediate) {
                    _message.value = "已导入 $count 个 CET6 词条，重复词条已跳过"
                }
            }.onFailure { error ->
                withContext(Dispatchers.Main.immediate) {
                    _message.value = error.message ?: "词表导入失败"
                }
            }
        }
    }

    fun consumeMessage() {
        _message.value = null
    }

    suspend fun loadPageImage(documentId: String, filename: String): ByteArray =
        learningApi.pageImage(documentId, filename)

    fun prepareCourseExport(courseId: Long, onReady: (String, String) -> Unit) {
        scope.launch(Dispatchers.IO) {
            try {
                val course = repository.getCourse(courseId)
                if (course == null) {
                    _message.value = "课程不存在，无法导出学习包"
                    return@launch
                }
                val items = repository.getLearningItems(courseId)
                val markdown = buildString {
                    appendLine("# ${course.name} · AI 学习包")
                    appendLine()
                    appendLine("- 课程语言：${course.language}")
                    if (course.courseNature.isNotBlank()) appendLine("- 学习项目性质：${course.courseNature}")
                    if (course.teacher.isNotBlank()) appendLine("- 教师：${course.teacher}")
                    appendLine("- 导出时间：${java.text.DateFormat.getDateTimeInstance().format(java.util.Date())}")
                    appendLine()
                    val grouped = items.groupBy { it.type }
                    val orderedGroups = LearningCategory.entries.mapNotNull { category ->
                        grouped[category.type]?.let { category.label to it }
                    } + grouped
                        .filterKeys { LearningCategory.fromType(it) == null }
                        .map { (type, group) -> learningTypeLabel(type) to group }
                    orderedGroups.forEach { (label, group) ->
                        appendLine("## $label")
                        appendLine()
                        group.forEach { item ->
                            appendLine("### ${item.title}")
                            appendLine(item.content)
                            item.translation?.takeIf { it.isNotBlank() }?.let { appendLine(it) }
                            item.example?.takeIf { it.isNotBlank() }?.let { appendLine("例句：$it") }
                            appendLine("来源：${item.sourceIdsCsv}")
                            appendLine(if (item.origin == LearningItemEntity.ORIGIN_AI_CACHE) "AI 预生成缓存" else "AI 生成")
                            appendLine()
                        }
                    }
                    if (items.isEmpty()) appendLine("尚未生成 AI 学习内容。")
                }
                withContext(Dispatchers.Main.immediate) {
                    onReady("${course.name}-AI学习包.md", markdown)
                }
            } catch (error: Exception) {
                _message.value = "无法准备学习包导出：${error.message ?: "请稍后重试"}"
            }
        }
    }

    fun close() {
        detailJob?.cancel()
        accountRefreshJob?.cancel()
        scope.cancel()
    }
}
