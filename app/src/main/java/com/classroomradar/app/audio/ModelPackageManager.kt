package com.classroomradar.app.audio

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.TimeUnit

data class ModelStorageStatus(
    val installed: Boolean,
    val recycled: Boolean,
    val bytes: Long,
    val downloading: Boolean = false,
    val managedInstalled: Boolean = false,
    val bundledInstalled: Boolean = false,
    val corrupt: Boolean = false,
)

/** Written after the SHA-256 pass; a directory without it must not be loaded natively. */
internal const val MODEL_VERIFY_MARKER = ".verified"

enum class ModelDownloadStage {
    DOWNLOADING,
    EXTRACTING,
    VERIFYING,
    ACTIVATING,
}

data class ModelDownloadProgress(
    val stage: ModelDownloadStage,
    val packageIndex: Int,
    val packageCount: Int,
    val label: String,
    val downloadedBytes: Long = 0,
    val totalBytes: Long? = null,
) {
    val fraction: Float?
        get() = totalBytes?.takeIf { it > 0 }?.let { total ->
            (downloadedBytes.toDouble() / total).coerceIn(0.0, 1.0).toFloat()
        }
}

internal data class ModelPackage(
    val sources: List<String>,
    val archive: String,
    val label: String,
    val downloadSha256: String,
    val archiveFiles: Map<String, String> = emptyMap(),
) {
    init {
        require(sources.isNotEmpty()) { "模型包至少需要一个下载源" }
    }
}

internal class ModelIntegrityException(message: String) : IllegalStateException(message)

internal class ModelArchiveDownloader(private val client: OkHttpClient) {
    fun download(url: String, destination: File, onProgress: (downloaded: Long, total: Long?) -> Unit) {
        client.newCall(Request.Builder().url(url).build()).execute().use { response ->
            if (!response.isSuccessful) throw IOException("模型下载失败：HTTP ${response.code}")
            val body = response.body ?: throw IOException("模型下载响应为空")
            val total = body.contentLength().takeIf { it >= 0 }
            var downloaded = 0L
            var bytesSinceUpdate = 0L
            onProgress(0, total)
            body.byteStream().use { input ->
                FileOutputStream(destination).use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                        downloaded += count
                        bytesSinceUpdate += count
                        if (bytesSinceUpdate >= 256 * 1024) {
                            onProgress(downloaded, total)
                            bytesSinceUpdate = 0
                        }
                    }
                }
            }
            if (total != null && downloaded != total) {
                throw IOException("模型下载不完整：已接收 $downloaded / $total 字节")
            }
            onProgress(downloaded, total)
        }
    }

    fun downloadVerified(
        modelPackage: ModelPackage,
        destination: File,
        onProgress: (downloaded: Long, total: Long?) -> Unit,
    ) {
        modelPackage.sources.forEachIndexed { index, source ->
            try {
                download(source, destination, onProgress)
                val actual = destination.sha256()
                if (!actual.equals(modelPackage.downloadSha256, ignoreCase = true)) {
                    throw ModelIntegrityException("模型包 SHA-256 校验失败：${modelPackage.label}")
                }
                return
            } catch (failure: IOException) {
                if (index == modelPackage.sources.lastIndex) throw failure
            }
        }
    }
}

internal fun formatModelBytes(bytes: Long): String = when {
    bytes >= 1024L * 1024 * 1024 -> String.format(Locale.ROOT, "%.2f GB", bytes / 1024.0 / 1024 / 1024)
    bytes >= 1024L * 1024 -> String.format(Locale.ROOT, "%.1f MB", bytes / 1024.0 / 1024)
    bytes >= 1024 -> String.format(Locale.ROOT, "%.0f KB", bytes / 1024.0)
    else -> "$bytes B"
}

private fun File.sha256(): String = FileInputStream(this).use { input ->
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
    }
    digest.digest().joinToString("") { "%02x".format(it) }
}

private fun moveToRecycle(directory: File, recycleDir: File): File {
    recycleDir.mkdirs()
    val destination = File(recycleDir, "model-${System.currentTimeMillis()}-${System.nanoTime()}")
    check(directory.renameTo(destination)) { "无法将模型移入回收站" }
    return destination
}

private fun moveToQuarantine(directory: File, quarantineDir: File) {
    quarantineDir.mkdirs()
    val destination = File(quarantineDir, "staging-${System.currentTimeMillis()}-${System.nanoTime()}")
    check(directory.renameTo(destination)) { "无法隔离旧的模型暂存目录" }
}

private fun extractArchive(archive: File, destination: File, fileMapping: Map<String, String>) {
    TarArchiveInputStream(
        BZip2CompressorInputStream(FileInputStream(archive), true),
    ).use { input ->
        while (true) {
            val entry = input.nextTarEntry ?: break
            if (entry.isDirectory) continue
            val name = entry.name.replace('\\', '/').removePrefix("./")
            val relative = fileMapping[name] ?: continue
            val output = File(destination, relative)
            output.parentFile?.mkdirs()
            require(output.canonicalPath.startsWith(destination.canonicalPath + File.separator)) {
                "模型压缩包包含不安全路径"
            }
            FileOutputStream(output).use { stream -> input.copyTo(stream) }
        }
    }
}

internal class ModelPackageInstaller(
    storageRoot: File,
    private val archiveDownloader: ModelArchiveDownloader,
    private val packages: List<ModelPackage> = ModelPackageManager.PACKAGES,
    private val requiredHashes: Map<String, String> = ModelPackageManager.REQUIRED_HASHES,
) {
    private val activeDir = File(storageRoot, "model-runtime/current")
    private val stagingDir = File(storageRoot, "model-runtime/staging")
    private val recycleDir = File(storageRoot, "model-recycle-bin")
    private val quarantineDir = File(storageRoot, "model-quarantine")

    fun install(onProgress: (ModelDownloadProgress) -> Unit): File {
        if (stagingDir.exists()) moveToQuarantine(stagingDir, quarantineDir)
        check(stagingDir.mkdirs()) { "无法创建模型下载目录" }
        try {
            packages.forEachIndexed { index, modelPackage ->
                val packageNumber = index + 1
                val downloaded = File(stagingDir, modelPackage.archive)
                downloaded.parentFile?.mkdirs()
                onProgress(
                    ModelDownloadProgress(
                        ModelDownloadStage.DOWNLOADING,
                        packageNumber,
                        packages.size,
                        modelPackage.label,
                    ),
                )
                archiveDownloader.downloadVerified(modelPackage, downloaded) { bytes, total ->
                    onProgress(
                        ModelDownloadProgress(
                            ModelDownloadStage.DOWNLOADING,
                            packageNumber,
                            packages.size,
                            modelPackage.label,
                            bytes,
                            total,
                        ),
                    )
                }
                if (modelPackage.archive.endsWith(".tar.bz2")) {
                    onProgress(
                        ModelDownloadProgress(
                            ModelDownloadStage.EXTRACTING,
                            packageNumber,
                            packages.size,
                            modelPackage.label,
                        ),
                    )
                    extractArchive(downloaded, stagingDir, modelPackage.archiveFiles)
                }
            }
            onProgress(
                ModelDownloadProgress(
                    ModelDownloadStage.VERIFYING,
                    packages.size,
                    packages.size,
                    "SHA-256 完整性校验",
                ),
            )
            requiredHashes.forEach { (relative, expected) ->
                val actual = File(stagingDir, relative).sha256()
                require(actual.equals(expected, ignoreCase = true)) { "模型文件校验失败：$relative" }
            }
            ModelPackageManager.REQUIRED_FILES.forEach { relative ->
                require(File(stagingDir, relative).length() > 0) { "模型文件为空：$relative" }
            }
            onProgress(
                ModelDownloadProgress(
                    ModelDownloadStage.ACTIVATING,
                    packages.size,
                    packages.size,
                    "启用已校验模型",
                ),
            )
            val previous = activeDir.takeIf { it.exists() }?.let { moveToRecycle(it, recycleDir) }
            if (!stagingDir.renameTo(activeDir)) {
                previous?.renameTo(activeDir)
                error("无法启用下载的模型，原模型已保留")
            }
            // Marker proves the directory passed the SHA-256 check above; without it a
            // partially written model must never be handed to sherpa-native (it aborts).
            runCatching { File(activeDir, MODEL_VERIFY_MARKER).writeText("sha256-ok") }
            return activeDir
        } catch (error: Throwable) {
            if (stagingDir.exists()) moveToQuarantine(stagingDir, quarantineDir)
            throw error
        }
    }
}

class ModelPackageManager(private val context: Context, storageRoot: File = context.filesDir) {
    private val activeDir = File(storageRoot, "model-runtime/current")
    private val recycleDir = File(storageRoot, "model-recycle-bin")
    private val preferences = context.getSharedPreferences("model_package_settings", Context.MODE_PRIVATE)
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()
    private val archiveDownloader = ModelArchiveDownloader(client)
    private val installer = ModelPackageInstaller(storageRoot, archiveDownloader)

    @Volatile
    private var downloadActive = false

    fun status(): ModelStorageStatus {
        val managedInstalled = installedDirectory() != null
        val bundledInstalled = !bundledDisabled && hasBundledModel()
        return ModelStorageStatus(
            installed = managedInstalled || bundledInstalled,
            recycled = recycleDir.listFiles()?.any { it.isDirectory && it.name.startsWith("model-") } == true,
            bytes = REQUIRED_FILES.sumOf { relative -> File(activeDir, relative).takeIf { it.isFile }?.length() ?: 0L },
            downloading = downloadActive,
            managedInstalled = managedInstalled,
            bundledInstalled = bundledInstalled,
            corrupt = activeDir.isDirectory && !managedInstalled,
        )
    }

    fun installedDirectory(): File? {
        if (!activeDir.isDirectory) return null
        val marker = File(activeDir, MODEL_VERIFY_MARKER)
        if (!marker.isFile) {
            // One-time migration for installs predating the marker: verify the pinned
            // hashes exactly once; a corrupt directory is refused instead of crashing sherpa.
            if (!legacyMigrationChecked) {
                legacyMigrationChecked = true
                val healthy = REQUIRED_HASHES.all { (relative, expected) ->
                    val file = File(activeDir, relative)
                    file.isFile && file.length() > 0 &&
                        runCatching { file.sha256().equals(expected, ignoreCase = true) }.getOrDefault(false)
                }
                legacyHealthy = healthy
                if (healthy) runCatching { marker.writeText("sha256-ok") }
            }
            if (legacyHealthy != true) return null
        }
        return activeDir.takeIf { directory ->
            REQUIRED_FILES.all { relative ->
                File(directory, relative).let { it.isFile && it.length() > 0 }
            }
        }
    }

    @Volatile private var legacyMigrationChecked = false
    @Volatile private var legacyHealthy: Boolean? = null

    fun canRecognize(): Boolean = installedDirectory() != null || (
        !preferences.getBoolean(KEY_BUNDLED_DISABLED, false) && hasBundledModel()
    )

    private fun hasBundledModel(): Boolean = runCatching {
        context.assets.open("models/vad/silero_vad.onnx").close()
    }.isSuccess

    private var bundledDisabled: Boolean
        get() = preferences.getBoolean(KEY_BUNDLED_DISABLED, false)
        set(value) = preferences.edit().putBoolean(KEY_BUNDLED_DISABLED, value).apply()

    suspend fun downloadAndInstall(
        onProgress: (ModelDownloadProgress) -> Unit = {},
    ): File = withContext(Dispatchers.IO) {
        check(!downloadActive) { "已有模型下载任务正在进行" }
        check(RecordingService.currentRecordingSnapshot() == null) { "请先停止录音再下载或更新模型" }
        downloadActive = true
        try {
            val installed = installer.install(onProgress)
            bundledDisabled = false
            installed
        } finally {
            downloadActive = false
        }
    }

    fun uninstall() {
        check(RecordingService.currentRecordingSnapshot() == null) { "请先停止录音再卸载模型" }
        check(!downloadActive) { "模型下载完成后才能卸载" }
        val installed = installedDirectory()
        bundledDisabled = true
        if (installed != null) moveToRecycle(installed, recycleDir)
    }

    fun restoreLatest(): File {
        check(!downloadActive) { "模型下载完成后才能恢复" }
        val latest = recycleDir.listFiles()
            ?.filter { it.isDirectory && it.name.startsWith("model-") }
            ?.maxByOrNull { it.lastModified() }
            ?: error("回收站没有可恢复的模型")
        if (activeDir.exists()) moveToRecycle(activeDir, recycleDir)
        check(latest.renameTo(activeDir)) { "无法恢复模型" }
        bundledDisabled = false
        return activeDir
    }

    companion object {
        private const val KEY_BUNDLED_DISABLED = "bundled_model_disabled"
        private const val MIRROR_BASE_URL = "https://shuike.seanyan.store/models/zhixi/"
        private const val OFFICIAL_BASE_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"

        val REQUIRED_FILES = setOf(
            "models/first_pass/model.int8.onnx",
            "models/first_pass/tokens.txt",
            "models/first_pass/bbpe.model",
            "models/second_pass/model.int8.onnx",
            "models/second_pass/tokens.txt",
            "models/vad/silero_vad.onnx",
        )

        internal val REQUIRED_HASHES = mapOf(
            "models/first_pass/model.int8.onnx" to "68c9c943840f7d9cf3e8a4970ba50f404feb5277f611fa82b7e72267786fa84a",
            "models/first_pass/tokens.txt" to "6fed8c6c248516f38e7faa19404b57413e8ce259f1cbc1fa4aebc86eac32fdfd",
            "models/first_pass/bbpe.model" to "503204e0690eff065e30d0e01898c9ab06d0e6dc376a741eb6846198f95b2f82",
            "models/second_pass/model.int8.onnx" to "3ef6c19369b912f7caf3cef8e545c5ccd1a33d9d7ec792a46668dc41c4b229ec",
            "models/second_pass/tokens.txt" to "4b2d964e18b9cf139b473003b6698fb2ed9a2a5ec55b93daa677b28f578897aa",
            "models/vad/silero_vad.onnx" to "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6",
        )

        internal val PACKAGES = listOf(
            ModelPackage(
                sources = listOf(
                    MIRROR_BASE_URL + "sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01.tar.bz2",
                    MIRROR_BASE_URL + "sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01.tar.bz2",
                    OFFICIAL_BASE_URL + "sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01.tar.bz2",
                ),
                archive = "first-pass.tar.bz2",
                label = "流式识别 Zipformer",
                downloadSha256 = "b3b309f7ce4a737195fcc6963ea19b0653a7d3401580af5ae0d3e284cbb71f0b",
                archiveFiles = mapOf(
                    "sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01/model.int8.onnx" to "models/first_pass/model.int8.onnx",
                    "sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01/tokens.txt" to "models/first_pass/tokens.txt",
                    "sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01/bbpe.model" to "models/first_pass/bbpe.model",
                ),
            ),
            ModelPackage(
                sources = listOf(
                    MIRROR_BASE_URL + "sherpa-onnx-paraformer-zh-small-2024-03-09.tar.bz2",
                    MIRROR_BASE_URL + "sherpa-onnx-paraformer-zh-small-2024-03-09.tar.bz2",
                    OFFICIAL_BASE_URL + "sherpa-onnx-paraformer-zh-small-2024-03-09.tar.bz2",
                ),
                archive = "second-pass.tar.bz2",
                label = "终稿识别 Paraformer",
                downloadSha256 = "da92b3db5218c5be53aad53e57d1b6e63e7fc98a0e054fbdd6dbe18e9c6b1450",
                archiveFiles = mapOf(
                    "sherpa-onnx-paraformer-zh-small-2024-03-09/model.int8.onnx" to "models/second_pass/model.int8.onnx",
                    "sherpa-onnx-paraformer-zh-small-2024-03-09/tokens.txt" to "models/second_pass/tokens.txt",
                ),
            ),
            ModelPackage(
                sources = listOf(
                    MIRROR_BASE_URL + "silero_vad.onnx",
                    MIRROR_BASE_URL + "silero_vad.onnx",
                    OFFICIAL_BASE_URL + "silero_vad.onnx",
                ),
                archive = "models/vad/silero_vad.onnx",
                label = "语音端点检测 Silero VAD",
                downloadSha256 = "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6",
            ),
        )
    }
}
