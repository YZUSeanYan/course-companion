package com.classroomradar.app.learning.api

import java.io.IOException

sealed class LearningApiException(
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause) {
    class Http(
        val httpCode: Int,
        val detail: String,
        operation: String = "Request",
    ) : LearningApiException("$operation failed with HTTP $httpCode: $detail")

    class Network(
        val operation: String,
        val kind: NetworkErrorKind,
        cause: IOException,
    ) : LearningApiException("$operation network error: ${kind.displayName}", cause)

    class InvalidRequest(
        detail: String,
    ) : LearningApiException("Invalid analysis request: $detail")

    class InvalidResponse(
        operation: String,
        detail: String,
        cause: Throwable? = null,
    ) : LearningApiException("$operation returned an invalid response: $detail", cause)

    class CredentialStorage(
        detail: String,
        cause: Throwable? = null,
    ) : LearningApiException("Secure device credential storage failed: $detail", cause)
}

enum class NetworkErrorKind(internal val displayName: String) {
    TIMEOUT("timeout"),
    CONNECTION("connection failure"),
    TLS("TLS failure"),
    IO("I/O failure"),
}
