package com.classroomradar.app.learning.api

import android.content.Context
import kotlinx.serialization.json.Json

/**
 * Caches the last account snapshot for offline display. Only the masked phone
 * number is ever written; the full number is sent once for activation and never stored.
 */
class AccountStatusStore(context: Context) {
    private val preferences = context.applicationContext
        .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    }

    fun load(): AccountStatusDto? = preferences.getString(KEY_STATUS, null)?.let { raw ->
        runCatching { json.decodeFromString(AccountStatusDto.serializer(), raw) }.getOrNull()
    }

    fun isSupported(): Boolean = preferences.getBoolean(KEY_SUPPORTED, true)

    fun save(status: AccountStatusDto) {
        preferences.edit()
            .putString(KEY_STATUS, json.encodeToString(AccountStatusDto.serializer(), status))
            .putBoolean(KEY_SUPPORTED, true)
            .apply()
    }

    fun markUnsupported() {
        preferences.edit()
            .remove(KEY_STATUS)
            .putBoolean(KEY_SUPPORTED, false)
            .apply()
    }

    fun clear() {
        preferences.edit().clear().apply()
    }

    companion object {
        private const val PREFERENCES_NAME = "learning_account_status"
        private const val KEY_STATUS = "status_json"
        private const val KEY_SUPPORTED = "supported"
    }
}
