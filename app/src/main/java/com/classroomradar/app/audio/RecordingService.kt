package com.classroomradar.app.audio

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.classroomradar.app.MainActivity
import com.classroomradar.app.QuestionActionActivity
import com.classroomradar.app.R
import com.classroomradar.app.RadarCrashHandler
import com.classroomradar.app.data.AppPreferences
import com.classroomradar.app.data.ClassroomRepository
import com.classroomradar.app.detection.QuestionDetector
import com.classroomradar.app.learning.OfflineSyncManager
import com.classroomradar.app.widget.WaterClassWidgetProvider
import java.io.File
import java.util.concurrent.Executors

class RecordingService : Service() {
    private val worker = Executors.newSingleThreadExecutor()
    private val persistenceWorker = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val repository by lazy { ClassroomRepository.get(applicationContext) }
    private val preferences by lazy { AppPreferences.get(applicationContext) }
    private val alertManager by lazy { AlertManager(applicationContext, preferences) }
    private val translationCoordinator by lazy { TranslationCoordinator(applicationContext) }
    private val modelManager by lazy { ModelPackageManager(applicationContext) }
    private var detector = QuestionDetector()
    private var recorder: AudioRecord? = null
    private var engine: TranscriptionEngine? = null
    // Offline-first: local preview engine runs immediately while the cloud stream connects.
    @Volatile private var cloudEngine: LecsyncRealtimeEngine? = null
    @Volatile private var previewMode = false
    private val previewSegments = mutableListOf<TranscriptSegment>()
    @Volatile private var offlineFirstSession = false
    private var wakeLock: PowerManager.WakeLock? = null
    private val audioLock = Any()
    private val transcriptLock = Any()
    private var audioWriter: WavFileWriter? = null
    @Volatile private var activeSessionId: Long? = null
    private var startedAt = 0L
    @Volatile private var recording = false
    @Volatile private var paused = false
    private var pausedAtMillis = 0L
    private var pausedTotalMillis = 0L
    @Volatile private var finishingRecording = false
    @Volatile private var latestPartialText = ""
    @Volatile private var latestFinalText = ""
    @Volatile private var latestQuestionText = ""
    @Volatile private var foregroundUpdatePending = false
    private val recentFinalTexts = ArrayDeque<String>()

    override fun onCreate() {
        super.onCreate()
        // The service can be started by the widget before any activity exists.
        RadarCrashHandler.install(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startRecording(
                intent.getLongExtra(EXTRA_COURSE_ID, -1L).takeIf { it > 0 },
            )
            ACTION_STOP -> stopRecording()
            ACTION_PAUSE -> pauseRecording()
            ACTION_RESUME -> resumeRecording()
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startRecording(courseId: Long?) {
        // Multiple UI/widget start intents are harmless. In particular, never turn an active
        // recording into a service stop just because a stale start PendingIntent was tapped.
        if (recording || finishingRecording) return
        // startForegroundService 要求 5 秒内进入前台；放在所有可能提前返回的检查之前，
        // 否则缺少模型/权限等快速失败路径会触发 ForegroundServiceDidNotStartInTime。
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, foregroundNotification(0))
        if (!modelManager.canRecognize() && !preferences.cloudListeningEnabled) {
            RecordingBus.emit(RecorderEvent.Failure("未安装离线识别模型，请下载模型或开启云端听课"))
            stopSelf()
            return
        }
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            stopSelf()
            return
        }
        startedAt = System.currentTimeMillis()
        pausedTotalMillis = 0L
        pausedAtMillis = 0L
        recording = true
        paused = false
        latestPartialText = ""
        latestFinalText = ""
        latestQuestionText = ""
        synchronized(transcriptLock) { recentFinalTexts.clear() }
        updateActiveSnapshot {
            ActiveRecordingSnapshot(
                sessionId = null,
                startedAtMillis = startedAt,
                liveTranscript = "",
                isPaused = false,
            )
        }
        acquireWakeLock()
        WaterClassWidgetProvider.refresh(this, isRecording = true)
        RecordingBus.emit(RecorderEvent.Status(isRecording = true, elapsedSeconds = 0))
        scheduleElapsedUpdate()

        worker.execute {
            val sessionId = runCatching { repository.createSession(startedAt, courseId) }
                .getOrElse {
                    handleEngineFailure(it)
                    return@execute
                }
            if (!recording) {
                repository.finishSession(sessionId, System.currentTimeMillis())
                return@execute
            }
            activeSessionId = sessionId
            updateActiveSnapshot { snapshot -> snapshot?.copy(sessionId = sessionId) }
            configureOptionalAudioCapture(sessionId)
            RecordingBus.emit(RecorderEvent.SessionStarted(sessionId, startedAt))

            val minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
            if (minBuffer <= 0) {
                handleEngineFailure(IllegalStateException("The microphone does not support the requested audio format."))
                return@execute
            }
            val localRecorder = try {
                AudioRecord(
                    MediaRecorder.AudioSource.VOICE_RECOGNITION,
                    SAMPLE_RATE,
                    CHANNEL_CONFIG,
                    AUDIO_FORMAT,
                    maxOf(minBuffer * 2, SAMPLE_RATE / 5 * 2),
                )
            } catch (error: Throwable) {
                handleEngineFailure(error)
                return@execute
            }
            if (localRecorder.state != AudioRecord.STATE_INITIALIZED) {
                localRecorder.runCatching { release() }
                handleEngineFailure(IllegalStateException("The microphone could not be initialized."))
                return@execute
            }
            if (!recording) {
                localRecorder.release()
                return@execute
            }
            recorder = localRecorder
            try {
                if (!recording) return@execute
                val forceOffline = preferences.forceOfflineRecording
                val wantCloud = preferences.cloudListeningEnabled && !forceOffline
                if (!wantCloud && !modelManager.canRecognize()) {
                    // A corrupt/missing model would abort inside sherpa-native; refuse gracefully.
                    recording = false
                    finishingRecording = true
                    updateActiveSnapshot { null }
                    RecordingBus.emit(RecorderEvent.Status(isRecording = false, elapsedSeconds = 0))
                    RecordingBus.emit(RecorderEvent.Failure("离线模型不可用或已损坏，请在设置 → 离线模式 → 离线模型 中重新下载"))
                    stopSelf()
                    return@execute
                }
                val offlineFirst = wantCloud && preferences.offlineFirstStart && modelManager.canRecognize()
                offlineFirstSession = offlineFirst
                if (offlineFirst) {
                    startOfflineFirst(sessionId)
                } else {
                    val activeEngine = if (wantCloud) {
                        LecsyncRealtimeEngine(applicationContext, preferences.realtimeConfig()).also { it.attachSession(sessionId) }
                    } else {
                        SherpaTwoPassEngine(applicationContext, modelManager.installedDirectory())
                    }
                    engine = activeEngine
                    activeEngine.start(standardListener())
                }
                if (!recording) return@execute
                localRecorder.startRecording()
                runCaptureLoop(localRecorder)
            } catch (error: Throwable) {
                if (recording && !paused) handleEngineFailure(error)
            }
        }
    }

    /** Standard listener for a single active engine (cloud or device). */
    private fun standardListener() = object : TranscriptionEngine.Listener {
        override fun onPartialText(text: String) = handlePartialTranscript(text)
        override fun onPartialTranslation(text: String?) = handlePartialTranslation(text)
        override fun onFinalText(text: String) = handleFinalTranscript(text)
        override fun onFinalSegment(segment: TranscriptSegment) = handleFinalSegment(segment)
        override fun onError(error: Throwable) = handleEngineFailure(error)
    }

    /** Local engine's listener while it only produces an unpersisted preview. */
    private fun previewListener() = object : TranscriptionEngine.Listener {
        override fun onPartialText(text: String) = handlePartialTranscript(text)
        override fun onPartialTranslation(text: String?) = Unit
        override fun onFinalText(text: String) = Unit
        override fun onFinalSegment(segment: TranscriptSegment) {
            if (!previewMode) return
            synchronized(previewSegments) {
                previewSegments.add(segment)
                handlePartialTranscript(previewSegments.takeLast(2).joinToString(" ") { it.text })
            }
        }
        override fun onError(error: Throwable) {
            // A broken preview engine must not kill the session; the cloud side carries on.
            if (previewMode) abandonPreview(error)
        }
    }

    /** Cloud side of offline-first: on fatal error the buffered local rows take over. */
    private fun offlineFirstCloudListener() = object : TranscriptionEngine.Listener {
        override fun onPartialText(text: String) {
            if (!previewMode) handlePartialTranscript(text)
        }

        override fun onPartialTranslation(text: String?) {
            if (!previewMode) handlePartialTranslation(text)
        }

        override fun onFinalText(text: String) {
            if (!previewMode) handleFinalTranscript(text)
        }

        override fun onFinalSegment(segment: TranscriptSegment) {
            if (!previewMode) handleFinalSegment(segment)
        }

        override fun onError(error: Throwable) {
            if (previewMode) {
                promoteLocal(error)
            } else {
                handleEngineFailure(error)
            }
        }
    }

    private fun startOfflineFirst(sessionId: Long) {
        val local = SherpaTwoPassEngine(applicationContext, modelManager.installedDirectory())
        val cloud = LecsyncRealtimeEngine(applicationContext, preferences.realtimeConfig()).also { it.attachSession(sessionId) }
        cloudEngine = cloud
        engine = local
        previewMode = true
        local.start(previewListener())
        cloud.start(offlineFirstCloudListener())
        RecordingBus.emit(RecorderEvent.Failure("已用本机模型开始识别，正在连接云端…"))
        scheduleCloudPromotion(8_000)
    }

    /** Polls the cloud stream; promotes it once ready, otherwise keeps the device engine. */
    private fun scheduleCloudPromotion(remainingMs: Long) {
        if (!previewMode) return
        if (remainingMs <= 0) {
            promoteLocal(null)
            return
        }
        mainHandler.postDelayed({
            if (!previewMode) return@postDelayed
            if (cloudEngine?.isReady == true) {
                promoteCloud()
            } else {
                scheduleCloudPromotion(remainingMs - 250)
            }
        }, 250)
    }

    private fun promoteCloud() {
        if (!previewMode) return
        previewMode = false
        val cloud = cloudEngine ?: return promoteLocal(null)
        val local = engine
        engine = cloud
        runCatching { local?.stop {} }
        synchronized(previewSegments) { previewSegments.clear() }
        RecordingBus.emit(RecorderEvent.ConnectionRestored)
        RecordingBus.emit(RecorderEvent.Failure("云端已连接，正在接管识别"))
        mainHandler.postDelayed({ RecordingBus.emit(RecorderEvent.ConnectionRestored) }, 600)
    }

    /** Keeps local recognition: buffered finals get persisted and continue normally. */
    private fun promoteLocal(error: Throwable?) {
        if (!previewMode) return
        previewMode = false
        runCatching { cloudEngine?.stop {} }
        cloudEngine = null
        val buffered = synchronized(previewSegments) {
            val copy = previewSegments.toList()
            previewSegments.clear()
            copy
        }
        buffered.forEach { handleFinalSegment(it) }
        RecordingBus.emit(
            RecorderEvent.Failure(
                if (error == null) "云端连接超时，本课继续使用本机识别；课后会自动同步到云端"
                else "云端暂不可用，已切换本机识别；课堂继续进行",
            ),
        )
    }

    /** Preview engine failed before promotion; fall back to cloud-only streaming. */
    private fun abandonPreview(error: Throwable) {
        previewMode = false
        cloudEngine?.let {
            engine = it
            synchronized(previewSegments) { previewSegments.clear() }
        } ?: handleEngineFailure(error)
    }

    /** Stops an offline-first preview (stop or finish): buffer is persisted if not promoted. */
    private fun settlePreviewForStop(): Boolean {
        if (!previewMode) return false
        previewMode = false
        runCatching { cloudEngine?.stop {} }
        cloudEngine = null
        val buffered = synchronized(previewSegments) {
            val copy = previewSegments.toList()
            previewSegments.clear()
            copy
        }
        // finishRecordingAfterFinalPass runs later; the rows are safe to append now.
        buffered.forEach { handleFinalSegment(it) }
        return true
    }

    private fun runCaptureLoop(localRecorder: AudioRecord) {
        if (paused) return
        check(localRecorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
            "The microphone did not enter the recording state."
        }
        // 100ms chunks keep first-word latency near the official 0.28s figure;
        // 200ms chunking would add up to a tenth of a second before the audio even leaves.
        val buffer = ShortArray(SAMPLE_RATE / 10)
        var consecutiveEmptyReads = 0
        while (recording && !paused) {
            val read = localRecorder.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING)
            when {
                read > 0 -> {
                    consecutiveEmptyReads = 0
                    synchronized(audioLock) { audioWriter?.runCatching { write(buffer, read) } }
                    engine?.acceptPcm(buffer, read)
                    if (previewMode) cloudEngine?.acceptPcm(buffer, read)
                }
                read == 0 -> {
                    consecutiveEmptyReads += 1
                    check(consecutiveEmptyReads < MAX_CONSECUTIVE_EMPTY_READS) {
                        "The microphone repeatedly returned no audio data."
                    }
                }
                else -> {
                    if (!paused) error("The microphone read failed with code $read.")
                }
            }
        }
    }

    private fun pauseRecording() {
        if (!recording || paused || finishingRecording) return
        paused = true
        pausedAtMillis = System.currentTimeMillis()
        updateActiveSnapshot { snapshot -> snapshot?.copy(isPaused = true) }
        releaseWakeLock()
        RecordingBus.emit(RecorderEvent.Status(isRecording = true, elapsedSeconds = elapsedSeconds(), isPaused = true))
        updateForegroundNotification()
        engine?.setPaused(true)
        cloudEngine?.setPaused(true)
        engine?.finalizePending()
        worker.execute { recorder?.runCatching { stop() } }
    }

    private fun resumeRecording() {
        if (!recording || !paused || finishingRecording) return
        pausedTotalMillis += System.currentTimeMillis() - pausedAtMillis
        pausedAtMillis = 0L
        paused = false
        updateActiveSnapshot { snapshot -> snapshot?.copy(isPaused = false) }
        acquireWakeLock()
        RecordingBus.emit(RecorderEvent.Status(isRecording = true, elapsedSeconds = elapsedSeconds(), isPaused = false))
        updateForegroundNotification()
        // Reconnect a stream the server closed during a long pause before audio resumes.
        engine?.setPaused(false)
        cloudEngine?.setPaused(false)
        worker.execute {
            runCatching {
                recorder?.startRecording()
                engine ?: return@runCatching
                runCaptureLoop(recorder ?: return@runCatching)
            }.onFailure { error -> if (recording && !paused) handleEngineFailure(error) }
        }
    }

    private fun handleFinalTranscript(text: String) = handleFinalSegment(TranscriptSegment(text))

    private fun handleFinalSegment(segment: TranscriptSegment) {
        val text = segment.text
        if (!recording && !finishingRecording) return
        val timestampMillis = System.currentTimeMillis()
        val sessionId = activeSessionId ?: return
        latestFinalText = text
        latestPartialText = ""
        rememberFinalTranscript(text)
        updateActiveSnapshot { snapshot -> snapshot?.copy(liveTranscript = "") }
        requestForegroundNotificationUpdate()
        // Cloud sentence mode can return a paragraph as one final; persist subtitle-sized
        // clauses so each card stays short and its translation lines up with the source.
        val chunks = TranscriptClauseSplitter.split(text).ifEmpty { listOf(text) }
        persistenceWorker.execute {
            val lineIds = mutableListOf<Long>()
            val lineTexts = mutableListOf<String>()
            chunks.forEachIndexed { index, chunk ->
                val lineId = repository.appendTranscript(
                    sessionId, timestampMillis + index, chunk,
                    segmentKey = segment.segmentKey?.let {
                        if (chunks.size == 1) it else "$it#${index + 1}"
                    },
                    speaker = if (index == 0) segment.speaker else null,
                    startMs = chunkBoundary(segment.startMs, segment.endMs, chunks, index),
                    endMs = chunkBoundary(segment.startMs, segment.endMs, chunks, index + 1),
                    language = segment.language,
                )
                if (lineId > 0) {
                    lineIds += lineId
                    lineTexts += chunk
                    RecordingBus.emit(RecorderEvent.Transcript(lineId, chunk, timestampMillis + index))
                    // Local rows keep translating even after a cloud session fell back to the device engine.
                    val usingDeviceEngine = !preferences.cloudListeningEnabled ||
                        (engine as? LecsyncRealtimeEngine)?.isOfflineFallbackActive == true ||
                        engine is SherpaTwoPassEngine
                    if (usingDeviceEngine) translationCoordinator.enqueue(lineId, chunk)
                }
            }
            if (lineIds.isNotEmpty()) {
                (engine as? LecsyncRealtimeEngine)?.registerTranscriptLines(segment.segmentKey, lineIds, lineTexts)
            }
        }
    }

    /** Proportional time boundary for clause [index] of [chunks]; null stays null. */
    private fun chunkBoundary(startMs: Long?, endMs: Long?, chunks: List<String>, index: Int): Long? {
        if (startMs == null || endMs == null || endMs <= startMs) return if (index == 0) startMs else endMs
        if (index <= 0) return startMs
        if (index >= chunks.size) return endMs
        val total = chunks.sumOf { it.length }.coerceAtLeast(1)
        val before = chunks.take(index).sumOf { it.length }
        return startMs + (endMs - startMs) * before / total
    }

    private fun handlePartialTranscript(text: String) {
        if (recording) {
            latestPartialText = text
            updateActiveSnapshot { snapshot -> snapshot?.copy(liveTranscript = text) }
            requestForegroundNotificationUpdate()
            RecordingBus.emit(RecorderEvent.PartialTranscript(text))
        }
    }

    private fun handlePartialTranslation(text: String?) {
        if (recording) RecordingBus.emit(RecorderEvent.PartialTranslation(text))
    }

    private fun handleEngineFailure(error: Throwable) {
        RecordingBus.emit(RecorderEvent.Failure(error.message ?: "离线识别引擎不可用"))
        // While paused the session stays alive; resume() retries the engine and only
        // a failure outside pause ends the recording.
        if (recording && !paused) stopRecording()
    }

    private fun scheduleElapsedUpdate() {
        mainHandler.post(object : Runnable {
            override fun run() {
                if (!recording) return
                val elapsedSeconds = elapsedSeconds()
                RecordingBus.emit(RecorderEvent.Status(true, elapsedSeconds, isPaused = paused))
                updateForegroundNotification()
                mainHandler.postDelayed(this, 1_000)
            }
        })
    }

    private fun stopRecording() {
        if (!recording) return
        // Flags flip first on the calling thread so the UI and the read loop react at once.
        // The blocking native teardown (AudioRecord.stop/release, VAD flush, final-pass drain)
        // is queued on the same serial worker that owns the read loop: the loop observes
        // recording=false and exits first, then the teardown runs, so ordering and the
        // final-pass persistence chain are identical to before — only the main-thread freeze
        // is gone.
        recording = false
        finishingRecording = true
        mainHandler.removeCallbacksAndMessages(null)
        foregroundUpdatePending = false
        updateActiveSnapshot { null }
        releaseWakeLock()
        WaterClassWidgetProvider.refresh(this, isRecording = false)
        RecordingBus.emit(RecorderEvent.Status(isRecording = false, elapsedSeconds = 0))
        worker.execute {
            recorder?.runCatching {
                if (recordingState == AudioRecord.RECORDSTATE_RECORDING) stop()
                release()
            }
            recorder = null
            synchronized(audioLock) {
                audioWriter?.runCatching { close() }
                audioWriter = null
            }
            // Offline-first preview buffers its finals in memory; persist them before teardown.
            settlePreviewForStop()
            val localEngine = engine
            engine = null
            if (localEngine != null) localEngine.stop(::finishRecordingAfterFinalPass)
            else finishRecordingAfterFinalPass()
        }
    }

    /** Stops the service only once Sherpa's queued Paraformer results are persisted. */
    private fun finishRecordingAfterFinalPass() {
        val sessionId = activeSessionId
        val finish = Runnable {
            sessionId?.let { repository.finishSession(it, System.currentTimeMillis()) }
            // Offline / on-device sessions hand their WAV to the cloud re-transcription queue.
            val shouldSync = sessionId != null && preferences.autoCloudSync && (
                !preferences.cloudListeningEnabled ||
                    preferences.forceOfflineRecording ||
                    offlineFirstSession
                )
            if (shouldSync && sessionId != null) {
                repository.getSessionAudioPath(sessionId)?.let { relative ->
                    OfflineSyncManager.get(applicationContext).schedule(sessionId, relative)
                }
            }
            activeSessionId = null
            finishingRecording = false
            mainHandler.post {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        // onDestroy may already have shut the pool down (refusal / fast stop); run inline then.
        try {
            persistenceWorker.execute(finish)
        } catch (rejected: java.util.concurrent.RejectedExecutionException) {
            finish.run()
        }
    }

    private fun foregroundNotification(elapsedSeconds: Long): Notification {
        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stop = PendingIntent.getService(
            this,
            1,
            Intent(this, RecordingService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val pauseAction = PendingIntent.getService(
            this,
            2,
            Intent(this, RecordingService::class.java).setAction(if (paused) ACTION_RESUME else ACTION_PAUSE),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val expandedText = notificationExpandedTranscript()
        return NotificationCompat.Builder(this, CHANNEL_RECORDING)
            .setSmallIcon(R.drawable.ic_stat_zhixi)
            .setContentTitle(getString(R.string.notification_recording_title))
            .setContentText("${formatDuration(elapsedSeconds)} · ${notificationCollapsedTranscript()}")
            .setSubText(if (paused) "● 已暂停 · 课堂仍保留" else "● 正在录音 · ${notificationTranscriptState()} · ${if (preferences.cloudListeningEnabled) "云端听课" else "设备端识别"}")
            .setContentIntent(openApp)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setWhen(startedAt)
            .setShowWhen(true)
            .setUsesChronometer(!paused)
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .setBigContentTitle(getString(R.string.notification_recording_title))
                    .bigText(expandedText)
                    .setSummaryText(if (paused) "● 已暂停 · 课堂仍保留" else "● 正在录音 · ${formatDuration(elapsedSeconds)} · 设备端识别"),
            )
            .setRequestPromotedOngoing(true)
            .addAction(0, if (paused) "继续" else "暂停", pauseAction)
            .addAction(0, getString(R.string.stop), stop)
            .build()
    }

    private fun notifyQuestion(question: String) {
        val copy = questionActionPendingIntent(QuestionActionActivity.ACTION_COPY, question, 20)
        val openDoubao = questionActionPendingIntent(QuestionActionActivity.ACTION_OPEN_DOUBAO, question, 21)
        val openDeepSeek = questionActionPendingIntent(QuestionActionActivity.ACTION_OPEN_DEEPSEEK, question, 22)
        val notification = NotificationCompat.Builder(this, CHANNEL_ALERT)
            .setSmallIcon(R.drawable.ic_stat_zhixi)
            .setContentTitle(getString(R.string.notification_question_title))
            .setContentText(question)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setStyle(
                NotificationCompat.BigTextStyle().bigText(
                    "可能被提问\n问题回溯：$question",
                ),
            )
            .setContentIntent(openDoubao)
            .addAction(0, "复制", copy)
            .addAction(0, "豆包", openDoubao)
            .addAction(0, "DeepSeek", openDeepSeek)
            .setAutoCancel(true)
            .build()
        getSystemService(NotificationManager::class.java).notify(QUESTION_NOTIFICATION_ID, notification)
    }

    private fun questionActionPendingIntent(action: String, question: String, requestCode: Int): PendingIntent =
        PendingIntent.getActivity(
            this,
            requestCode,
            Intent(this, QuestionActionActivity::class.java).apply {
                this.action = action
                putExtra(QuestionActionActivity.EXTRA_QUESTION, question)
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    private fun createNotificationChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_RECORDING, getString(R.string.channel_recording), NotificationManager.IMPORTANCE_LOW),
        )
        // The legacy alert channel was created with the system default notification sound,
        // and channel audio settings are frozen after creation — so existing installs keep
        // ringing no matter what the in-app toggles say. Ship the fix under a fresh id.
        manager.deleteNotificationChannel(LEGACY_CHANNEL_ALERT)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ALERT, getString(R.string.channel_alert), NotificationManager.IMPORTANCE_HIGH).apply {
                // Vibration and the headphone-only chime are handled by AlertManager behind
                // the user's settings; the notification itself must always stay silent.
                setSound(null, null)
                enableVibration(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            },
        )
    }

    override fun onDestroy() {
        stopRecording()
        // Graceful, not shutdownNow: stopRecording queues the native teardown on this serial
        // worker (right behind the read loop, which exits within one buffer period), and an
        // immediate shutdown would drop it — losing the final-pass drain and finishSession.
        worker.shutdown()
        persistenceWorker.shutdown()
        translationCoordinator.close()
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "com.classroomradar.app.action.START"
        const val ACTION_STOP = "com.classroomradar.app.action.STOP"
        const val ACTION_PAUSE = "com.classroomradar.app.action.PAUSE"
        const val ACTION_RESUME = "com.classroomradar.app.action.RESUME"
        const val EXTRA_COURSE_ID = "com.classroomradar.app.extra.COURSE_ID"
        const val CHANNEL_RECORDING = "recording"
        private const val CHANNEL_ALERT = "question_alert_v2"
        private const val LEGACY_CHANNEL_ALERT = "question_alert"
        private const val NOTIFICATION_ID = 10
        private const val QUESTION_NOTIFICATION_ID = 11
        private const val SAMPLE_RATE = 16_000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val NOTIFICATION_UPDATE_THROTTLE_MILLIS = 350L
        private const val MAX_NOTIFICATION_TEXT_LENGTH = 72
        private const val MAX_WAKE_LOCK_MILLIS = 6 * 60 * 60 * 1_000L
        private const val MAX_CONSECUTIVE_EMPTY_READS = 8
        @Volatile private var activeRecordingSnapshot: ActiveRecordingSnapshot? = null

        data class ActiveRecordingSnapshot(
            val sessionId: Long?,
            val startedAtMillis: Long,
            val liveTranscript: String,
            val isPaused: Boolean = false,
        )

        private fun formatDuration(seconds: Long): String =
            "%02d:%02d".format(seconds / 60, seconds % 60)

        fun isRealtimeNotificationEnabled(context: android.content.Context): Boolean {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) return false
            val manager = context.getSystemService(NotificationManager::class.java)
            if (!manager.areNotificationsEnabled()) return false
            // A new install has no channel until startRecording() creates it immediately before
            // startForeground(). Treat that absence as available instead of blocking the first
            // recording attempt and sending the user to a settings page with no channel to show.
            if (manager.getNotificationChannel(CHANNEL_RECORDING)?.importance == NotificationManager.IMPORTANCE_NONE) return false
            return Build.VERSION.SDK_INT < 36 || manager.canPostPromotedNotifications()
        }

        /**
         * Returns true when ordinary notifications are already usable and the remaining blocker,
         * if any, is Android 16's promoted/live-update setting.
         */
        fun shouldOpenPromotedNotificationSettings(context: android.content.Context): Boolean {
            if (Build.VERSION.SDK_INT < 36) return false
            if (ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
            val manager = context.getSystemService(NotificationManager::class.java)
            if (!manager.areNotificationsEnabled()) return false
            return manager.getNotificationChannel(CHANNEL_RECORDING)?.importance != NotificationManager.IMPORTANCE_NONE
        }

        fun currentRecordingSnapshot(): ActiveRecordingSnapshot? = activeRecordingSnapshot

        private fun updateActiveSnapshot(transform: (ActiveRecordingSnapshot?) -> ActiveRecordingSnapshot?) {
            activeRecordingSnapshot = transform(activeRecordingSnapshot)
        }
    }

    private fun configureOptionalAudioCapture(sessionId: Long) {
        // Auto cloud sync needs the source WAV for local/offline sessions.
        val syncMayNeedAudio = preferences.autoCloudSync && (
            !preferences.cloudListeningEnabled ||
                preferences.forceOfflineRecording ||
                preferences.offlineFirstStart
            )
        if (!preferences.saveAudioEnabled && !syncMayNeedAudio) return
        val relativePath = "recordings/session_$sessionId.wav"
        val target = File(filesDir, relativePath)
        runCatching {
            target.parentFile?.mkdirs()
            synchronized(audioLock) { audioWriter = WavFileWriter(target) }
            repository.setAudioPath(sessionId, relativePath)
        }.onFailure {
            target.delete()
            synchronized(audioLock) { audioWriter = null }
        }
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val powerManager = getSystemService(PowerManager::class.java)
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:class-session").apply {
            setReferenceCounted(false)
            // The foreground service refreshes this lock for each recording. The timeout
            // is only a failsafe for a lifecycle fault and should not end normal classes.
            acquire(MAX_WAKE_LOCK_MILLIS)
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.runCatching { if (isHeld) release() }
        wakeLock = null
    }

    private fun requestForegroundNotificationUpdate() {
        if (!recording || foregroundUpdatePending) return
        foregroundUpdatePending = true
        mainHandler.postDelayed(
            {
                foregroundUpdatePending = false
                if (recording) updateForegroundNotification()
            },
            NOTIFICATION_UPDATE_THROTTLE_MILLIS,
        )
    }

    private fun updateForegroundNotification() {
        getSystemService(NotificationManager::class.java).notify(
            NOTIFICATION_ID,
            foregroundNotification(elapsedSeconds()),
        )
    }

    private fun elapsedSeconds(): Long = when {
        paused -> (pausedAtMillis - startedAt - pausedTotalMillis).coerceAtLeast(0) / 1_000
        else -> (System.currentTimeMillis() - startedAt - pausedTotalMillis).coerceAtLeast(0) / 1_000
    }

    private fun notificationTranscriptState(): String = when {
        latestFinalText.isNotBlank() && latestPartialText.isNotBlank() -> "上段定稿 · 实时识别"
        latestPartialText.isNotBlank() -> "实时识别"
        latestFinalText.isNotBlank() -> "最近定稿"
        else -> "实时识别"
    }

    private fun notificationCollapsedTranscript(): String = when {
        latestFinalText.isNotBlank() && latestPartialText.isNotBlank() ->
            "${compactNotificationText(latestFinalText, 30)} · ${compactNotificationText(latestPartialText, 38)}"
        latestPartialText.isNotBlank() -> compactNotificationText(latestPartialText, MAX_NOTIFICATION_TEXT_LENGTH)
        latestFinalText.isNotBlank() -> compactNotificationText(latestFinalText, MAX_NOTIFICATION_TEXT_LENGTH)
        else -> "正在等待语音…"
    }

    private fun notificationExpandedTranscript(): String {
        val recentFinals = synchronized(transcriptLock) { recentFinalTexts.toList() }
        return buildString {
            recentFinals.forEach { line ->
                if (isNotEmpty()) append('\n')
                append("• ")
                append(compactNotificationText(line, 96))
            }
            if (latestPartialText.isNotBlank()) {
                if (isNotEmpty()) append("\\n\\n")
                append("正在识别：")
                append(compactNotificationText(latestPartialText, 120))
            }
            if (isEmpty()) append("正在等待语音…")
        }
    }

    private fun rememberFinalTranscript(text: String) {
        synchronized(transcriptLock) {
            if (recentFinalTexts.lastOrNull() == text) return
            recentFinalTexts.addLast(text)
            while (recentFinalTexts.size > 4) recentFinalTexts.removeFirst()
        }
    }

    private fun compactNotificationText(text: String, maxLength: Int): String {
        val normalized = text.replace(Regex("\\s+"), " ").trim()
        return if (normalized.length <= maxLength) normalized else "…${normalized.takeLast(maxLength - 1)}"
    }

}
