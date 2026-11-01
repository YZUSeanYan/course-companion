package com.classroomradar.app.audio

import android.content.Intent
import android.Manifest
import android.os.Build
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PauseActionTest {
    @Test
    fun pauseAndResumeKeepTheSameRecordingSession() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        // 显式使用云端引擎：设备测试不依赖本机是否下载过离线模型或残留设置。
        context.getSharedPreferences("water_class_radar_settings", android.content.Context.MODE_PRIVATE)
            .edit()
            .putBoolean("cloud_listening_enabled", true)
            .putBoolean("force_offline_recording", false)
            .putBoolean("offline_first_start", false)
            .commit()
        automation.grantRuntimePermission(context.packageName, Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            automation.grantRuntimePermission(context.packageName, Manifest.permission.POST_NOTIFICATIONS)
        }
        val before = RecordingService.currentRecordingSnapshot()
        if (before == null) {
            androidx.core.content.ContextCompat.startForegroundService(
                context,
                Intent(context, RecordingService::class.java).setAction(RecordingService.ACTION_START),
            )
        }
        var active = before
        var attempts = 0
        while (active?.sessionId == null && attempts < 100) {
            Thread.sleep(50)
            active = RecordingService.currentRecordingSnapshot()
            attempts++
        }
        val sessionId = requireNotNull(active?.sessionId)
        System.err.println("Pause test session before pause: $sessionId")

        context.startService(Intent(context, RecordingService::class.java).setAction(RecordingService.ACTION_PAUSE))
        val paused = awaitSnapshot { it?.isPaused == true }
        assertTrue(paused.sessionId == sessionId)

        context.startService(Intent(context, RecordingService::class.java).setAction(RecordingService.ACTION_RESUME))
        val resumed = awaitSnapshot { it?.isPaused == false }
        assertTrue(resumed.sessionId == sessionId)

        context.startService(Intent(context, RecordingService::class.java).setAction(RecordingService.ACTION_STOP))
    }

    private fun awaitSnapshot(
        predicate: (RecordingService.Companion.ActiveRecordingSnapshot?) -> Boolean,
    ): RecordingService.Companion.ActiveRecordingSnapshot {
        repeat(100) {
            val snapshot = RecordingService.currentRecordingSnapshot()
            if (predicate(snapshot)) return requireNotNull(snapshot)
            Thread.sleep(50)
        }
        error("Recording state did not settle in time")
    }
}
