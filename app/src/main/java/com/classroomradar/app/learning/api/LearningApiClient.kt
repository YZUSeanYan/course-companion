package com.classroomradar.app.learning.api

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.io.IOException
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLException

class LearningApiClient(
    context: Context,
    private val baseUrl: String,
    private val json: Json = Json { ignoreUnknownKeys = false; explicitNulls = false; encodeDefaults = true },
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(75, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build(),
    private val baseUrlProvider: (() -> String)? = null,
) {
    private val credentials: CredentialStore = DeviceCredentialStore(context)

    private fun currentBaseUrl(): String = baseUrlProvider?.invoke() ?: baseUrl
    private fun bearerToken(token: String): String = "Bearer ".plus(token)
    private fun healthUrl() = endpoint(currentBaseUrl(), "health")
    private fun registerUrl(serviceBaseUrl: String) = endpoint(serviceBaseUrl, "v1/devices/register")
    private fun analyzeUrl(serviceBaseUrl: String) = endpoint(serviceBaseUrl, "v1/analyze")
    private fun learningPackV2Url(serviceBaseUrl: String) = endpoint(serviceBaseUrl, "v2/learning-pack")
    private fun translateUrl(serviceBaseUrl: String) = endpoint(serviceBaseUrl, "v2/translate")
    private fun documentAnalyzeUrl(serviceBaseUrl: String) = endpoint(serviceBaseUrl, "v2/documents/analyze")

    suspend fun health(): HealthResponse = withContext(Dispatchers.IO) {
        executeHttp(Request.Builder().url(healthUrl()).get().build(), "Health") {
            json.decodeFromString(HealthResponse.serializer(), it)
        }
    }

    private suspend fun ensureDevice(serviceBaseUrl: String): DeviceCredential = withContext(Dispatchers.IO) {
        credentials.load() ?: registerDevice(serviceBaseUrl)
    }

    suspend fun analyze(request: AnalysisRequest): AnalysisResultDto = withContext(Dispatchers.IO) {
        val serviceBaseUrl = currentBaseUrl()
        try {
            requestAnalysis(serviceBaseUrl, request, ensureDevice(serviceBaseUrl).token)
        } catch (error: LearningApiException.Http) {
            if (error.httpCode != 401) throw error
            credentials.clear()
            requestAnalysis(serviceBaseUrl, request, registerDevice(serviceBaseUrl).token)
        }
    }

    suspend fun translate(
        lineId: Long,
        sourceText: String,
        sourceHash: String,
        targetLang: String,
    ): TranslationResultDto = withContext(Dispatchers.IO) {
        val serviceBaseUrl = currentBaseUrl()
        val payload = TranslationRequest(lineId, sourceText, sourceHash, targetLang)
        val body = json.encodeToString(TranslationRequest.serializer(), payload).toRequestBody(JSON_MEDIA_TYPE)
        val response = try {
            executeHttp(
                Request.Builder().url(translateUrl(serviceBaseUrl)).header("Authorization", bearerToken(ensureDevice(serviceBaseUrl).token)).post(body).build(),
                "Translation",
            ) { json.decodeFromString(TranslationResultDto.serializer(), it) }
        } catch (error: LearningApiException.Http) {
            if (error.httpCode != 401) throw error
            credentials.clear()
            executeHttp(
                Request.Builder().url(translateUrl(serviceBaseUrl)).header("Authorization", bearerToken(registerDevice(serviceBaseUrl).token)).post(body).build(),
                "Translation",
            ) { json.decodeFromString(TranslationResultDto.serializer(), it) }
        }
        if (response.lineId != lineId || response.sourceHash != sourceHash || response.translation.isBlank()) {
            throw LearningApiException.InvalidResponse("Translation", "lineId, sourceHash or translation is invalid")
        }
        response
    }

    suspend fun analyzeV2(request: LearningPackRequestV2): AnalysisResultDto = withContext(Dispatchers.IO) {
        val serviceBaseUrl = currentBaseUrl()
        val body = json.encodeToString(LearningPackRequestV2.serializer(), request).toRequestBody(JSON_MEDIA_TYPE)
        val response = try {
            executeHttp(
                Request.Builder().url(learningPackV2Url(serviceBaseUrl)).header("Authorization", bearerToken(ensureDevice(serviceBaseUrl).token)).post(body).build(),
                "Learning pack v2",
            ) { json.decodeFromString(AnalysisResultDto.serializer(), it) }
        } catch (error: LearningApiException.Http) {
            if (error.httpCode != 401) throw error
            credentials.clear()
            executeHttp(
                Request.Builder().url(learningPackV2Url(serviceBaseUrl)).header("Authorization", bearerToken(registerDevice(serviceBaseUrl).token)).post(body).build(),
                "Learning pack v2",
            ) { json.decodeFromString(AnalysisResultDto.serializer(), it) }
        }
        try {
            response.validateV2Against(request)
        } catch (error: IllegalArgumentException) {
            throw LearningApiException.InvalidResponse("Learning pack v2", error.message ?: "validation failed", error)
        }
        response
    }

    suspend fun analyzeDocument(file: File, mimeType: String): DocumentAssetDto = withContext(Dispatchers.IO) {
        val serviceBaseUrl = currentBaseUrl()
        require(file.isFile && file.length() in 1..50 * 1024 * 1024) { "Document must be between 1 byte and 50MB" }
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", file.name, file.asRequestBody(mimeType.toMediaType()))
            .build()
        try {
            executeHttp(
                Request.Builder().url(documentAnalyzeUrl(serviceBaseUrl)).header("Authorization", bearerToken(ensureDevice(serviceBaseUrl).token)).post(body).build(),
                "Document analysis",
            ) { json.decodeFromString(DocumentAssetDto.serializer(), it) }
        } catch (error: LearningApiException.Http) {
            if (error.httpCode != 401) throw error
            credentials.clear()
            executeHttp(
                Request.Builder().url(documentAnalyzeUrl(serviceBaseUrl)).header("Authorization", bearerToken(registerDevice(serviceBaseUrl).token)).post(body).build(),
                "Document analysis",
            ) { json.decodeFromString(DocumentAssetDto.serializer(), it) }
        }
    }

    suspend fun pageImage(documentId: String, filename: String): ByteArray = withContext(Dispatchers.IO) {
        val serviceBaseUrl = currentBaseUrl()
        val url = endpoint(serviceBaseUrl, "v2/documents/$documentId/pages/$filename")
        try {
            pageImage(url, ensureDevice(serviceBaseUrl).token)
        } catch (error: LearningApiException.Http) {
            if (error.httpCode != 401) throw error
            credentials.clear()
            pageImage(url, registerDevice(serviceBaseUrl).token)
        }
    }

    private fun pageImage(url: HttpUrl, token: String): ByteArray {
        client.newCall(
            Request.Builder().url(url).header("Authorization", bearerToken(token)).get().build(),
        ).execute().use { response ->
            if (!response.isSuccessful) throw LearningApiException.Http(response.code, "Unable to load page", "Page image")
            return response.body?.bytes() ?: throw LearningApiException.InvalidResponse("Page image", "empty body")
        }
    }

    private fun registerDevice(serviceBaseUrl: String): DeviceCredential {
        val response = executeHttp(
            Request.Builder().url(registerUrl(serviceBaseUrl)).post(ByteArray(0).toRequestBody()).build(),
            "Device registration",
        ) { json.decodeFromString(DeviceRegistration.serializer(), it) }
        if (response.deviceId.isBlank() || response.token.isBlank()) {
            throw LearningApiException.InvalidResponse("Device registration", "deviceId and token are required")
        }
        return DeviceCredential(response.deviceId, response.token).also(credentials::save)
    }

    private fun requestAnalysis(serviceBaseUrl: String, request: AnalysisRequest, token: String): AnalysisResultDto {
        val body = json.encodeToString(AnalysisRequest.serializer(), request).toRequestBody(JSON_MEDIA_TYPE)
        val response = executeHttp(
            Request.Builder().url(analyzeUrl(serviceBaseUrl)).header("Authorization", bearerToken(token)).post(body).build(),
            "Analysis",
        ) { json.decodeFromString(AnalysisResultDto.serializer(), it) }
        try {
            response.validateAgainst(request)
        } catch (error: IllegalArgumentException) {
            throw LearningApiException.InvalidResponse("Analysis", error.message ?: "validation failed", error)
        }
        return response
    }

    private fun <T> executeHttp(request: Request, operation: String, decoder: (String) -> T): T {
        try {
            val call = if (request.url.encodedPath.endsWith("/v2/learning-pack")) {
                client.newBuilder().readTimeout(600, TimeUnit.SECONDS).build().newCall(request)
            } else {
                client.newCall(request)
            }
            call.execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val detail = runCatching {
                        json.decodeFromString(ApiErrorResponse.serializer(), body).userDetail()
                    }.getOrNull()?.take(300) ?: "Request failed"
                    throw LearningApiException.Http(response.code, detail, operation)
                }
                if (body.isBlank()) throw LearningApiException.InvalidResponse(operation, "empty body")
                return try {
                    decoder(body)
                } catch (error: Exception) {
                    throw LearningApiException.InvalidResponse(operation, "malformed JSON", error)
                }
            }
        } catch (error: LearningApiException) {
            throw error
        } catch (error: SocketTimeoutException) {
            throw LearningApiException.Network(operation, NetworkErrorKind.TIMEOUT, error)
        } catch (error: SSLException) {
            throw LearningApiException.Network(operation, NetworkErrorKind.TLS, error)
        } catch (error: IOException) {
            throw LearningApiException.Network(operation, NetworkErrorKind.CONNECTION, error)
        }
    }

    private companion object {
        val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

        fun endpoint(baseUrl: String, path: String): HttpUrl {
            val base = baseUrl.toHttpUrl()
            require(base != null && base.scheme in setOf("http", "https") && base.username.isEmpty() && base.password.isEmpty()) {
                "AI service URL must be a valid http/https URL without credentials"
            }
            return base.newBuilder().addPathSegments(path).build()
        }
    }
}
