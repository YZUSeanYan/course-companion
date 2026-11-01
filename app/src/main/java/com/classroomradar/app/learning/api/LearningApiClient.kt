package com.classroomradar.app.learning.api

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
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
    private fun learningPackJobsUrl(serviceBaseUrl: String) = endpoint(serviceBaseUrl, "v2/learning-pack/jobs")
    private fun learningPackJobUrl(serviceBaseUrl: String, jobId: String): HttpUrl =
        endpoint(serviceBaseUrl, "v2/learning-pack/jobs").newBuilder().addPathSegment(jobId).build()
    private fun translateUrl(serviceBaseUrl: String) = endpoint(serviceBaseUrl, "v2/translate")
    private fun documentAnalyzeUrl(serviceBaseUrl: String) = endpoint(serviceBaseUrl, "v2/documents/analyze")
    private fun accountMeUrl(serviceBaseUrl: String) = endpoint(serviceBaseUrl, "v1/accounts/me")
    private fun accountActivateUrl(serviceBaseUrl: String) = endpoint(serviceBaseUrl, "v1/accounts/activate")
    private fun accountRequestCodeUrl(serviceBaseUrl: String) =
        endpoint(serviceBaseUrl, "v1/accounts/activate/request-code")
    private fun trialCodeUrl(serviceBaseUrl: String) = endpoint(serviceBaseUrl, "v1/trial/request-code")
    private fun trialApplyUrl(serviceBaseUrl: String) = endpoint(serviceBaseUrl, "v1/trial/apply")
    private fun appConfigUrl(serviceBaseUrl: String) = endpoint(serviceBaseUrl, "v1/app-config")

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
        var token = ensureDevice(serviceBaseUrl).token
        val created = try {
            createLearningPackJob(serviceBaseUrl, token, body)
        } catch (error: LearningApiException.Http) {
            when (error.httpCode) {
                401 -> {
                    credentials.clear()
                    token = registerDevice(serviceBaseUrl).token
                    createLearningPackJob(serviceBaseUrl, token, body)
                }
                404, 405 -> {
                    // Older gateways do not expose the asynchronous endpoint yet.
                    return@withContext analyzeV2Synchronously(serviceBaseUrl, token, body, request)
                }
                else -> throw error
            }
        }
        if (!JOB_ID_PATTERN.matches(created.jobId)) {
            throw LearningApiException.InvalidResponse("Learning pack job", "jobId is invalid")
        }

        val deadline = System.nanoTime() + JOB_POLL_TIMEOUT_NANOS
        var consecutiveTransientFailures = 0
        while (System.nanoTime() < deadline) {
            val status = try {
                try {
                    getLearningPackJob(serviceBaseUrl, token, created.jobId)
                } catch (error: LearningApiException.Http) {
                    if (error.httpCode != 401) throw error
                    credentials.clear()
                    token = registerDevice(serviceBaseUrl).token
                    getLearningPackJob(serviceBaseUrl, token, created.jobId)
                }
            } catch (error: LearningApiException.Network) {
                consecutiveTransientFailures += 1
                if (consecutiveTransientFailures >= MAX_POLL_NETWORK_FAILURES) throw error
                delay(POLL_RETRY_MILLIS)
                continue
            } catch (error: LearningApiException.Http) {
                if (error.httpCode != 429 && error.httpCode !in 500..599) throw error
                consecutiveTransientFailures += 1
                if (consecutiveTransientFailures >= MAX_POLL_NETWORK_FAILURES) throw error
                delay(POLL_RETRY_MILLIS)
                continue
            }
            consecutiveTransientFailures = 0
            if (status.jobId != created.jobId) {
                throw LearningApiException.InvalidResponse("Learning pack job", "jobId mismatch")
            }
            when (status.status) {
                "queued", "processing" -> delay(POLL_INTERVAL_MILLIS)
                "succeeded" -> {
                    val response = status.result
                        ?: throw LearningApiException.InvalidResponse("Learning pack job", "succeeded without a result")
                    try {
                        response.validateV2Against(request)
                    } catch (error: IllegalArgumentException) {
                        throw LearningApiException.InvalidResponse(
                            "Learning pack job",
                            error.message ?: "validation failed",
                            error,
                        )
                    }
                    return@withContext response
                }
                "failed" -> throw LearningApiException.JobFailed(
                    code = status.error?.code.orEmpty().ifBlank { "internal" },
                    userMessage = status.error?.message.orEmpty().ifBlank {
                        "AI 学习包生成失败，请稍后重试。"
                    }.take(300),
                )
                else -> throw LearningApiException.InvalidResponse(
                    "Learning pack job",
                    "unknown status: ${status.status.take(40)}",
                )
            }
        }
        throw LearningApiException.JobFailed(
            code = "timeout",
            userMessage = "讲义分析用时较长，任务暂时未返回结果，请稍后重试。",
        )
    }

    private fun createLearningPackJob(
        serviceBaseUrl: String,
        token: String,
        body: okhttp3.RequestBody,
    ): LearningJobCreatedDto = executeHttp(
        Request.Builder()
            .url(learningPackJobsUrl(serviceBaseUrl))
            .header("Authorization", bearerToken(token))
            .post(body)
            .build(),
        "Learning pack job",
    ) { json.decodeFromString(LearningJobCreatedDto.serializer(), it) }

    private fun getLearningPackJob(serviceBaseUrl: String, token: String, jobId: String): LearningJobStatusDto = executeHttp(
        Request.Builder()
            .url(learningPackJobUrl(serviceBaseUrl, jobId))
            .header("Authorization", bearerToken(token))
            .get()
            .build(),
        "Learning pack job status",
    ) { json.decodeFromString(LearningJobStatusDto.serializer(), it) }

    private fun analyzeV2Synchronously(
        serviceBaseUrl: String,
        token: String,
        body: okhttp3.RequestBody,
        request: LearningPackRequestV2,
    ): AnalysisResultDto {
        var activeToken = token
        val response = try {
            requestSynchronousLearningPack(serviceBaseUrl, activeToken, body)
        } catch (error: LearningApiException.Http) {
            if (error.httpCode != 401) throw error
            credentials.clear()
            activeToken = registerDevice(serviceBaseUrl).token
            requestSynchronousLearningPack(serviceBaseUrl, activeToken, body)
        }
        try {
            response.validateV2Against(request)
        } catch (error: IllegalArgumentException) {
            throw LearningApiException.InvalidResponse("Learning pack v2", error.message ?: "validation failed", error)
        }
        return response
    }

    private fun requestSynchronousLearningPack(
        serviceBaseUrl: String,
        token: String,
        body: okhttp3.RequestBody,
    ): AnalysisResultDto = executeHttp(
        Request.Builder()
            .url(learningPackV2Url(serviceBaseUrl))
            .header("Authorization", bearerToken(token))
            .post(body)
            .build(),
        "Learning pack v2",
    ) { json.decodeFromString(AnalysisResultDto.serializer(), it) }

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

    suspend fun accountStatus(): AccountStatusDto = withContext(Dispatchers.IO) {
        val serviceBaseUrl = currentBaseUrl()
        var credential = ensureDevice(serviceBaseUrl)
        fun request(token: String) = Request.Builder()
            .url(accountMeUrl(serviceBaseUrl))
            .header("Authorization", bearerToken(token))
            .get()
            .build()
        try {
            executeHttp(request(credential.token), "Account status") {
                json.decodeFromString(AccountStatusDto.serializer(), it)
            }
        } catch (error: LearningApiException.Http) {
            if (error.httpCode != 401) throw error
            credentials.clear()
            credential = ensureDevice(serviceBaseUrl)
            executeHttp(request(credential.token), "Account status") {
                json.decodeFromString(AccountStatusDto.serializer(), it)
            }
        }
    }

    suspend fun activateAccount(phone: String, code: String? = null): AccountStatusDto = withContext(Dispatchers.IO) {
        val serviceBaseUrl = currentBaseUrl()
        var credential = ensureDevice(serviceBaseUrl)
        val normalizedPhone = normalizeAccountPhone(phone) ?: phone
        val body = json
            .encodeToString(AccountActivateRequest.serializer(), AccountActivateRequest(normalizedPhone, code))
            .toRequestBody(JSON_MEDIA_TYPE)
        fun request(token: String) = Request.Builder()
            .url(accountActivateUrl(serviceBaseUrl))
            .header("Authorization", bearerToken(token))
            .post(body)
            .build()
        try {
            executeHttp(request(credential.token), "Account activation") {
                json.decodeFromString(AccountStatusDto.serializer(), it)
            }
        } catch (error: LearningApiException.Http) {
            if (error.httpCode != 401) throw error
            credentials.clear()
            credential = ensureDevice(serviceBaseUrl)
            executeHttp(request(credential.token), "Account activation") {
                json.decodeFromString(AccountStatusDto.serializer(), it)
            }
        }
    }

    suspend fun requestActivationCode(phone: String): ActivationCodeResponse = withContext(Dispatchers.IO) {
        val serviceBaseUrl = currentBaseUrl()
        var credential = ensureDevice(serviceBaseUrl)
        val normalizedPhone = normalizeAccountPhone(phone) ?: phone
        val body = json
            .encodeToString(ActivationCodeRequest.serializer(), ActivationCodeRequest(normalizedPhone))
            .toRequestBody(JSON_MEDIA_TYPE)
        fun request(token: String) = Request.Builder()
            .url(accountRequestCodeUrl(serviceBaseUrl))
            .header("Authorization", bearerToken(token))
            .post(body)
            .build()
        try {
            executeHttp(request(credential.token), "Activation code") {
                json.decodeFromString(ActivationCodeResponse.serializer(), it)
            }
        } catch (error: LearningApiException.Http) {
            if (error.httpCode != 401) throw error
            credentials.clear()
            credential = ensureDevice(serviceBaseUrl)
            executeHttp(request(credential.token), "Activation code") {
                json.decodeFromString(ActivationCodeResponse.serializer(), it)
            }
        }
    }

    suspend fun requestTrialCode(phone: String): TrialCodeResponse = withContext(Dispatchers.IO) {
        val serviceBaseUrl = currentBaseUrl()
        var credential = ensureDevice(serviceBaseUrl)
        val normalizedPhone = normalizeAccountPhone(phone) ?: phone
        val body = json
            .encodeToString(TrialCodeRequest.serializer(), TrialCodeRequest(normalizedPhone))
            .toRequestBody(JSON_MEDIA_TYPE)
        fun request(token: String) = Request.Builder()
            .url(trialCodeUrl(serviceBaseUrl))
            .header("Authorization", bearerToken(token))
            .post(body)
            .build()
        try {
            executeHttp(request(credential.token), "Trial code") {
                json.decodeFromString(TrialCodeResponse.serializer(), it)
            }
        } catch (error: LearningApiException.Http) {
            if (error.httpCode != 401) throw error
            credentials.clear()
            credential = ensureDevice(serviceBaseUrl)
            executeHttp(request(credential.token), "Trial code") {
                json.decodeFromString(TrialCodeResponse.serializer(), it)
            }
        }
    }

    suspend fun applyTrial(phone: String, code: String, name: String, nickname: String): TrialApplicationResponse =
        withContext(Dispatchers.IO) {
            val serviceBaseUrl = currentBaseUrl()
            var credential = ensureDevice(serviceBaseUrl)
            val normalizedPhone = normalizeAccountPhone(phone) ?: phone
            val body = json
                .encodeToString(
                    TrialApplicationRequest.serializer(),
                    TrialApplicationRequest(normalizedPhone, code, name.trim(), nickname.trim()),
                )
                .toRequestBody(JSON_MEDIA_TYPE)
            fun request(token: String) = Request.Builder()
                .url(trialApplyUrl(serviceBaseUrl))
                .header("Authorization", bearerToken(token))
                .post(body)
                .build()
            try {
                executeHttp(request(credential.token), "Trial apply") {
                    json.decodeFromString(TrialApplicationResponse.serializer(), it)
                }
            } catch (error: LearningApiException.Http) {
                if (error.httpCode != 401) throw error
                credentials.clear()
                credential = ensureDevice(serviceBaseUrl)
                executeHttp(request(credential.token), "Trial apply") {
                    json.decodeFromString(TrialApplicationResponse.serializer(), it)
                }
            }
        }

    suspend fun syncPush(changes: List<SyncChange>): SyncPushResponse = withContext(Dispatchers.IO) {
        syncRequest("v1/sync/push", SyncPushRequest.serializer(), SyncPushRequest(changes), SyncPushResponse.serializer(), "Sync push")
    }

    suspend fun syncPull(entities: List<String> = emptyList()): SyncPullResponse = withContext(Dispatchers.IO) {
        syncRequest("v1/sync/pull", SyncPullRequest.serializer(), SyncPullRequest(entities), SyncPullResponse.serializer(), "Sync pull")
    }

    private suspend fun <Req, Resp> syncRequest(
        path: String,
        requestSerializer: kotlinx.serialization.KSerializer<Req>,
        payload: Req,
        responseSerializer: kotlinx.serialization.KSerializer<Resp>,
        operation: String,
    ): Resp {
        val serviceBaseUrl = currentBaseUrl()
        var credential = ensureDevice(serviceBaseUrl)
        val body = json.encodeToString(requestSerializer, payload).toRequestBody(JSON_MEDIA_TYPE)
        fun request(token: String) = Request.Builder()
            .url(endpoint(serviceBaseUrl, path))
            .header("Authorization", bearerToken(token))
            .post(body)
            .build()
        return try {
            executeHttp(request(credential.token), operation) { json.decodeFromString(responseSerializer, it) }
        } catch (error: LearningApiException.Http) {
            if (error.httpCode != 401) throw error
            credentials.clear()
            credential = ensureDevice(serviceBaseUrl)
            executeHttp(request(credential.token), operation) { json.decodeFromString(responseSerializer, it) }
        }
    }

    suspend fun appConfig(): AppConfigDto = withContext(Dispatchers.IO) {
        val serviceBaseUrl = currentBaseUrl()
        var credential = ensureDevice(serviceBaseUrl)
        fun request(token: String) = Request.Builder()
            .url(appConfigUrl(serviceBaseUrl))
            .header("Authorization", bearerToken(token))
            .get()
            .build()
        try {
            executeHttp(request(credential.token), "App config") {
                json.decodeFromString(AppConfigDto.serializer(), it)
            }
        } catch (error: LearningApiException.Http) {
            if (error.httpCode != 401) throw error
            credentials.clear()
            credential = ensureDevice(serviceBaseUrl)
            executeHttp(request(credential.token), "App config") {
                json.decodeFromString(AppConfigDto.serializer(), it)
            }
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
                    throw LearningApiException.Http(
                        response.code,
                        detail,
                        operation,
                        response.header("X-Zhixi-Error-Code"),
                        response.header("X-Zhixi-Quota-Scope"),
                    )
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
        val JOB_ID_PATTERN = Regex("[A-Za-z0-9-]{8,80}")
        val JOB_POLL_TIMEOUT_NANOS = TimeUnit.MINUTES.toNanos(15)
        const val POLL_INTERVAL_MILLIS = 2_000L
        const val POLL_RETRY_MILLIS = 3_000L
        const val MAX_POLL_NETWORK_FAILURES = 6

        fun endpoint(baseUrl: String, path: String): HttpUrl {
            val base = baseUrl.toHttpUrl()
            require(base != null && base.scheme in setOf("http", "https") && base.username.isEmpty() && base.password.isEmpty()) {
                "AI service URL must be a valid http/https URL without credentials"
            }
            return base.newBuilder().addPathSegments(path).build()
        }
    }
}
