package com.classroomradar.app.audio

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.EOFException
import java.io.InputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class SherpaEngineSmokeTest {
    @Test
    fun engineRecognizesBundledSpeech() {
        requireLocalAssets("chinese-classroom.wav", "model-fixtures/first_pass/model.int8.onnx")
        assertTrue("no speech was recognized from the test wav", recognize("chinese-classroom.wav").isNotBlank())
    }

    @Test
    fun engineRecognizesEnglishClassroom() {
        requireLocalAssets("english-classroom.wav", "model-fixtures/first_pass/model.int8.onnx")
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val modelDir = java.io.File(context.cacheDir, "sherpa-smoke-${System.nanoTime()}")
        ModelPackageManager.REQUIRED_FILES.forEach { relative ->
            val target = java.io.File(modelDir, relative)
            target.parentFile?.mkdirs()
            InstrumentationRegistry.getInstrumentation().context.assets.open("model-fixtures/${relative.removePrefix("models/")}").use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            }
        }
        val text = recognize("english-classroom.wav", modelDir)
        System.err.println("English classroom transcript: $text")
        assertTrue("English classroom transcript was blank", text.isNotBlank())
        assertTrue("English keywords were not recognized: $text", text.contains("supervised", ignoreCase = true))
    }

    private fun requireLocalAssets(vararg names: String) {
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        names.forEach { name ->
            val available = runCatching { assets.open(name).close() }.isSuccess
            assumeTrue("Local ASR fixture is not installed: $name (see docs/ONBOARDING.md)", available)
        }
    }

    private fun recognize(assetName: String, modelDirectory: java.io.File? = null): String {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val pcm = InstrumentationRegistry.getInstrumentation().context.assets
            .open(assetName).use(::readPcm16Mono)
        assertTrue("test wav decoded to no samples", pcm.isNotEmpty())

        val stopped = CountDownLatch(1)
        val finals = StringBuilder()
        val failure = AtomicReference<Throwable?>(null)
        val engine = SherpaTwoPassEngine(context, modelDirectory ?: prepareModelDirectory(context))
        engine.start(object : TranscriptionEngine.Listener {
            override fun onPartialText(text: String) = Unit
            override fun onFinalText(text: String) {
                synchronized(finals) {
                    if (finals.isNotEmpty()) finals.append(' ')
                    finals.append(text)
                }
            }

            override fun onError(error: Throwable) {
                failure.set(error)
            }
        })

        val chunk = 1600
        var offset = 0
        while (offset < pcm.size) {
            val count = minOf(chunk, pcm.size - offset)
            engine.acceptPcm(pcm.copyOfRange(offset, offset + count), count)
            offset += count
        }
        engine.stop { stopped.countDown() }
        assertTrue("final pass did not drain in time", stopped.await(180, TimeUnit.SECONDS))
        assertNull("engine reported an error: ${failure.get()}", failure.get())
        return finals.toString()
    }

    private fun prepareModelDirectory(context: android.content.Context): java.io.File {
        val modelDir = java.io.File(context.cacheDir, "sherpa-smoke-${System.nanoTime()}")
        ModelPackageManager.REQUIRED_FILES.forEach { relative ->
            val target = java.io.File(modelDir, relative)
            target.parentFile?.mkdirs()
            InstrumentationRegistry.getInstrumentation().context.assets.open("model-fixtures/${relative.removePrefix("models/")}").use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            }
        }
        return modelDir
    }

    private fun readPcm16Mono(stream: InputStream): ShortArray {
        val bytes = stream.readBytes()
        require(bytes.size > 44) { "wav too small" }
        var dataOffset = -1
        var dataLength = 0
        var cursor = 12
        while (cursor + 8 <= bytes.size) {
            val id = String(bytes, cursor, 4, Charsets.US_ASCII)
            val size = readLeInt(bytes, cursor + 4)
            if (id == "data") {
                dataOffset = cursor + 8
                dataLength = size
                break
            }
            cursor += 8 + size + (size and 1)
        }
        if (dataOffset < 0) throw EOFException("no data chunk in wav")
        val sampleCount = minOf(dataLength, bytes.size - dataOffset) / 2
        return ShortArray(sampleCount) { i ->
            val lo = bytes[dataOffset + i * 2].toInt() and 0xFF
            val hi = bytes[dataOffset + i * 2 + 1].toInt() and 0xFF
            ((hi shl 8) or lo).toShort()
        }
    }

    private fun readLeInt(bytes: ByteArray, offset: Int): Int =
        (bytes[offset].toInt() and 0xFF) or
            ((bytes[offset + 1].toInt() and 0xFF) shl 8) or
            ((bytes[offset + 2].toInt() and 0xFF) shl 16) or
            ((bytes[offset + 3].toInt() and 0xFF) shl 24)
}
