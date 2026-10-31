package com.classroomradar.app.audio

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class ModelPackageManagerTest {
    @Test
    fun uninstallMovesModelToRecycleBinAndRestoresIt() {
        val testAssets = InstrumentationRegistry.getInstrumentation().context.assets
        val fixtureName = "model-fixtures/${ModelPackageManager.REQUIRED_FILES.first().removePrefix("models/")}"
        assumeTrue(
            "Local model fixture is not installed: $fixtureName (see docs/ONBOARDING.md)",
            runCatching { testAssets.open(fixtureName).close() }.isSuccess,
        )
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val testRoot = File(context.cacheDir, "model-package-test-${System.nanoTime()}")
        val manager = ModelPackageManager(context, testRoot)
        context.getSharedPreferences("model_package_settings", android.content.Context.MODE_PRIVATE)
            .edit().clear().commit()
        val active = File(testRoot, "model-runtime/current")
        ModelPackageManager.REQUIRED_FILES.forEach { relative ->
            val target = File(active, relative)
            target.parentFile?.mkdirs()
            InstrumentationRegistry.getInstrumentation().context.assets.open("model-fixtures/${relative.removePrefix("models/")}").use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            }
        }

        assertTrue(manager.installedDirectory()?.isDirectory == true)
        manager.uninstall()
        assertFalse(manager.canRecognize())
        assertTrue(manager.status().recycled)

        manager.restoreLatest()
        assertTrue(manager.canRecognize())
        assertTrue(manager.installedDirectory()?.isDirectory == true)
    }
}
