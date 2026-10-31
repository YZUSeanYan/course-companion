package com.classroomradar.app.audio

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.classroomradar.app.data.ClassroomDatabase
import com.classroomradar.app.learning.api.AiServiceConfig
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import kotlinx.coroutines.launch
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class CloudFallbackTest {
    @Test
    fun unavailableCloudUsesInstalledOfflineModel() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        assumeTrue(
            "Offline ASR model is not available in this local build (see docs/ONBOARDING.md)",
            ModelPackageManager(context).canRecognize(),
        )
        AiServiceConfig(context).save("http://127.0.0.1:1")
        context.getSharedPreferences("model_package_settings", android.content.Context.MODE_PRIVATE)
            .edit().clear().commit()
        val sessionId = ClassroomDatabase.get(context).classroomDao().insertSession(
            com.classroomradar.app.data.SessionEntity(startedAtMillis = System.currentTimeMillis()),
        )
        val engine = LecsyncRealtimeEngine(context, com.classroomradar.app.data.AppPreferences.get(context).realtimeConfig())
        engine.attachSession(sessionId)
        val finalTexts = mutableListOf<String>()
        val failures = mutableListOf<String>()
        val fallbackReady = CountDownLatch(1)
        val collectJob = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Default).launch {
            RecordingBus.events.collect { event ->
                if (event is RecorderEvent.Failure && event.message.contains("已切换本机识别")) fallbackReady.countDown()
            }
        }
        val stopped = CountDownLatch(1)
        engine.start(object : TranscriptionEngine.Listener {
            override fun onPartialText(text: String) = Unit
            override fun onFinalText(text: String) { finalTexts += text }
            override fun onError(error: Throwable) { failures += error.message.orEmpty() }
        })
        assertTrue(fallbackReady.await(25, TimeUnit.SECONDS))
        InstrumentationRegistry.getInstrumentation().context.assets.open("english-classroom.wav").use { input ->
            input.skip(44)
            val buffer = ByteArray(6400)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                val samples = ShortArray(count / 2) { index ->
                    (buffer[index * 2].toInt() and 0xff or (buffer[index * 2 + 1].toInt() shl 8)).toShort()
                }
                engine.acceptPcm(samples, samples.size)
            }
        }
        engine.stop { stopped.countDown() }
        assertTrue(stopped.await(20, TimeUnit.SECONDS))
        System.err.println("Cloud fallback finals=$finalTexts errors=$failures")
        assertTrue(finalTexts.isNotEmpty())
        assertTrue(failures.isEmpty())
        collectJob.cancel()
    }
}
