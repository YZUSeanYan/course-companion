package com.classroomradar.app.learning.api

import android.content.Context
import com.classroomradar.app.BuildConfig
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** Runtime AI endpoint settings shared by learning-pack generation and transcript translation. */
class AiServiceConfig(context: Context) {
    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    val baseUrl: String
        get() = preferences.getString(KEY_BASE_URL, null)
            ?.let { stored -> runCatching { normalize(stored, allowCleartext = BuildConfig.DEBUG) }.getOrNull() }
            ?: BuildConfig.LEARNING_API_BASE_URL

    val displayTarget: String
        get() = baseUrl.toHttpUrlOrNull()?.let { url ->
            buildString {
                append(url.host)
                if (url.port != (if (url.scheme == "https") 443 else 80)) append(":${url.port}")
            }
        } ?: baseUrl

    fun save(rawUrl: String): String {
        val normalized = normalize(rawUrl, allowCleartext = BuildConfig.DEBUG)
        if (normalized != baseUrl) {
            // A device token belongs to one backend only. Never carry it to a new origin.
            DeviceCredentialStore(appContext).clear()
            preferences.edit().putString(KEY_BASE_URL, normalized).apply()
        }
        return normalized
    }

    companion object {
        private const val PREFERENCES_NAME = "learning_api_service"
        private const val KEY_BASE_URL = "base_url"

        fun normalize(rawUrl: String, allowCleartext: Boolean): String {
            val url = rawUrl.trim().toHttpUrlOrNull()
                ?: throw IllegalArgumentException("请输入完整服务地址，例如 http://10.0.2.2:8765")
            require(url.scheme == "https" || (allowCleartext && url.scheme == "http")) {
                if (allowCleartext) "服务地址仅支持 http 或 https" else "正式版本必须使用 HTTPS 服务地址"
            }
            require(url.username.isEmpty() && url.password.isEmpty()) { "服务地址不能包含账号或密码" }
            require(url.query == null && url.fragment == null) { "服务地址不能包含查询参数或片段" }
            return url.toString().removeSuffix("/")
        }
    }
}
