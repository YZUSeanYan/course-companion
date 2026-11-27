package com.classroomradar.app.learning

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

internal enum class LearningSpeechStatus { Initializing, Ready, Unavailable }

@Composable
internal fun rememberLearningSpeech(): LearningSpeech {
    val context = LocalContext.current.applicationContext
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val speech = remember(context, lifecycle) { LearningSpeech(context) }
    DisposableEffect(speech) {
        speech.start()
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) speech.stop()
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            speech.dispose()
        }
    }
    return speech
}

/** One engine per screen, confined to the main thread. Only installed offline voices may speak. */
internal class LearningSpeech(private val context: Context) {
    var status by mutableStateOf(LearningSpeechStatus.Initializing)
        private set

    private var engine: TextToSpeech? = null
    private var voices: List<Voice> = emptyList()

    fun start() {
        val mainHandler = Handler(Looper.getMainLooper())
        engine = runCatching {
            TextToSpeech(context) { result ->
                // Some engines report failure before the constructor returns. Post either result
                // so the engine has been assigned, and ignore it if disposal has cleared it.
                mainHandler.post { onInitialized(result) }
            }
        }.getOrNull()
        if (engine == null) status = LearningSpeechStatus.Unavailable
    }

    private fun onInitialized(result: Int) {
        val current = engine ?: return
        if (result == TextToSpeech.SUCCESS) {
            voices = runCatching {
                current.voices.orEmpty().filter { voice ->
                    !voice.isNetworkConnectionRequired &&
                        TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED !in voice.features
                }
            }.getOrDefault(emptyList())
        }
        if (voices.isEmpty()) {
            status = LearningSpeechStatus.Unavailable
            dispose()
        } else {
            status = LearningSpeechStatus.Ready
        }
    }

    fun speak(text: String) {
        val current = engine ?: return
        val utterance = text.trim()
        if (status != LearningSpeechStatus.Ready || utterance.isEmpty()) return
        val locale = learningSpeechLocale(utterance)
        val voice = voices
            .filter { it.locale.language == locale.language }
            .maxWithOrNull(compareBy<Voice> { it.locale == locale }.thenBy { it.quality })
        if (voice == null) {
            unavailableMessage("未安装此语言的离线发音")
            return
        }
        val spoken = runCatching {
            current.setVoice(voice) == TextToSpeech.SUCCESS &&
                current.speak(utterance, TextToSpeech.QUEUE_FLUSH, null, "learning-${System.nanoTime()}") == TextToSpeech.SUCCESS
        }.getOrDefault(false)
        if (!spoken) unavailableMessage("暂时无法朗读，请检查系统发音设置")
    }

    fun stop() {
        runCatching { engine?.stop() }
    }

    fun dispose() {
        val current = engine ?: return
        engine = null
        voices = emptyList()
        runCatching { current.stop() }
        runCatching { current.shutdown() }
    }

    private fun unavailableMessage(message: String) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }
}
