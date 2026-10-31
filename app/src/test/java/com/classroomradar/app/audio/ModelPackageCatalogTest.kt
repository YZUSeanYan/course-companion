package com.classroomradar.app.audio

import org.junit.Assert.assertEquals
import org.junit.Test

class ModelPackageCatalogTest {
    @Test
    fun requiredHashesCoverAllSixRequiredFiles() {
        val expected = mapOf(
            "models/first_pass/model.int8.onnx" to "68c9c943840f7d9cf3e8a4970ba50f404feb5277f611fa82b7e72267786fa84a",
            "models/first_pass/tokens.txt" to "6fed8c6c248516f38e7faa19404b57413e8ce259f1cbc1fa4aebc86eac32fdfd",
            "models/first_pass/bbpe.model" to "503204e0690eff065e30d0e01898c9ab06d0e6dc376a741eb6846198f95b2f82",
            "models/second_pass/model.int8.onnx" to "3ef6c19369b912f7caf3cef8e545c5ccd1a33d9d7ec792a46668dc41c4b229ec",
            "models/second_pass/tokens.txt" to "4b2d964e18b9cf139b473003b6698fb2ed9a2a5ec55b93daa677b28f578897aa",
            "models/vad/silero_vad.onnx" to "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6",
        )

        assertEquals(6, ModelPackageManager.REQUIRED_FILES.size)
        assertEquals(ModelPackageManager.REQUIRED_FILES, ModelPackageManager.REQUIRED_HASHES.keys)
        assertEquals(expected, ModelPackageManager.REQUIRED_HASHES)
    }

    @Test
    fun defaultPackagesUseMirrorFirstAndOfficialSourceAsFallback() {
        val mirror = "https://shuike.seanyan.store/models/zhixi/"
        val official = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
        val expected = listOf(
            Triple(
                "sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01.tar.bz2",
                "b3b309f7ce4a737195fcc6963ea19b0653a7d3401580af5ae0d3e284cbb71f0b",
                3,
            ),
            Triple(
                "sherpa-onnx-paraformer-zh-small-2024-03-09.tar.bz2",
                "da92b3db5218c5be53aad53e57d1b6e63e7fc98a0e054fbdd6dbe18e9c6b1450",
                2,
            ),
            Triple(
                "silero_vad.onnx",
                "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6",
                0,
            ),
        )

        assertEquals(expected.size, ModelPackageManager.PACKAGES.size)
        ModelPackageManager.PACKAGES.zip(expected).forEach { (modelPackage, expectation) ->
            val (fileName, archiveHash, extractedFileCount) = expectation
            assertEquals(listOf(mirror + fileName, mirror + fileName, official + fileName), modelPackage.sources)
            assertEquals(archiveHash, modelPackage.downloadSha256)
            assertEquals(extractedFileCount, modelPackage.archiveFiles.size)
        }
    }
}
