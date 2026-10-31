package com.classroomradar.app.data

import android.content.Context
import androidx.core.content.edit

/** Local settings. Legacy preference keys are left untouched but no longer drive question detection. */
class AppPreferences private constructor(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    var saveAudioEnabled: Boolean
        get() = preferences.getBoolean(KEY_SAVE_AUDIO, false)
        set(value) = preferences.edit { putBoolean(KEY_SAVE_AUDIO, value) }

    var usageNoticeAccepted: Boolean
        get() = preferences.getBoolean(KEY_USAGE_NOTICE, false)
        set(value) = preferences.edit { putBoolean(KEY_USAGE_NOTICE, value) }

    var translationEnabled: Boolean
        get() = preferences.getBoolean(KEY_TRANSLATION_ENABLED, false)
        set(value) = preferences.edit { putBoolean(KEY_TRANSLATION_ENABLED, value) }

    var translationNoticeAccepted: Boolean
        get() = preferences.getBoolean(KEY_TRANSLATION_NOTICE, false)
        set(value) = preferences.edit { putBoolean(KEY_TRANSLATION_NOTICE, value) }

    var cloudListeningEnabled: Boolean
        get() = preferences.getBoolean(KEY_CLOUD_LISTENING, false)
        set(value) = preferences.edit { putBoolean(KEY_CLOUD_LISTENING, value) }

    var cloudNoticeAccepted: Boolean
        get() = preferences.getBoolean(KEY_CLOUD_NOTICE, false)
        set(value) = preferences.edit { putBoolean(KEY_CLOUD_NOTICE, value) }

    var cloudTranslationEnabled: Boolean
        get() = preferences.getBoolean(KEY_CLOUD_TRANSLATION, true)
        set(value) = preferences.edit { putBoolean(KEY_CLOUD_TRANSLATION, value) }

    var cloudSpeakersEnabled: Boolean
        get() = preferences.getBoolean(KEY_CLOUD_SPEAKERS, false)
        set(value) = preferences.edit { putBoolean(KEY_CLOUD_SPEAKERS, value) }

    var cloudDigestEnabled: Boolean
        get() = preferences.getBoolean(KEY_CLOUD_DIGEST, true)
        set(value) = preferences.edit { putBoolean(KEY_CLOUD_DIGEST, value) }

    var cloudEnhanceEnabled: Boolean
        get() = preferences.getBoolean(KEY_CLOUD_ENHANCE, false)
        set(value) = preferences.edit { putBoolean(KEY_CLOUD_ENHANCE, value) }

    var cloudStoreEnabled: Boolean
        get() = preferences.getBoolean(KEY_CLOUD_STORE, false)
        set(value) = preferences.edit { putBoolean(KEY_CLOUD_STORE, value) }

    var cloudLanguageHints: String
        get() = preferences.getString(KEY_CLOUD_LANGUAGES, "en,zh") ?: "en,zh"
        set(value) = preferences.edit { putString(KEY_CLOUD_LANGUAGES, value) }

    var cloudTranslationPair: String
        get() = preferences.getString(KEY_CLOUD_PAIR, "en,zh") ?: "en,zh"
        set(value) = preferences.edit { putString(KEY_CLOUD_PAIR, value) }

    var cloudTranslationModel: String
        get() = preferences.getString(KEY_CLOUD_MODEL, "") ?: ""
        set(value) = preferences.edit { putString(KEY_CLOUD_MODEL, value) }

    var cloudTimestampsMode: String
        get() = preferences.getString(KEY_CLOUD_TIMESTAMPS, "segment") ?: "segment"
        set(value) = preferences.edit { putString(KEY_CLOUD_TIMESTAMPS, value) }

    var cloudVoicePolishEnabled: Boolean
        get() = preferences.getBoolean(KEY_VOICE_POLISH, true)
        set(value) = preferences.edit { putBoolean(KEY_VOICE_POLISH, value) }

    var cloudStrictLanguages: Boolean
        get() = preferences.getBoolean(KEY_CLOUD_STRICT, true)
        set(value) = preferences.edit { putBoolean(KEY_CLOUD_STRICT, value) }

    var cloudIdentifyLanguage: Boolean
        get() = preferences.getBoolean(KEY_CLOUD_IDENTIFY, true)
        set(value) = preferences.edit { putBoolean(KEY_CLOUD_IDENTIFY, value) }

    var cloudDisplayMode: String
        get() = preferences.getString(KEY_CLOUD_DISPLAY, "sentence") ?: "sentence"
        set(value) = preferences.edit { putString(KEY_CLOUD_DISPLAY, value) }

    var cloudSegmentation: String
        get() = preferences.getString(KEY_CLOUD_SEGMENTATION, "balanced") ?: "balanced"
        set(value) = preferences.edit { putString(KEY_CLOUD_SEGMENTATION, value) }

    var cloudRegion: String
        get() = preferences.getString(KEY_CLOUD_REGION, "auto") ?: "auto"
        set(value) = preferences.edit { putString(KEY_CLOUD_REGION, value) }

    var cloudHotwords: String
        get() = preferences.getString(KEY_CLOUD_HOTWORDS, "") ?: ""
        set(value) = preferences.edit { putString(KEY_CLOUD_HOTWORDS, value) }

    var cloudTermPairs: String
        get() = preferences.getString(KEY_CLOUD_PAIRS, "") ?: ""
        set(value) = preferences.edit { putString(KEY_CLOUD_PAIRS, value) }

    var cloudContext: String
        get() = preferences.getString(KEY_CLOUD_CONTEXT, "") ?: ""
        set(value) = preferences.edit { putString(KEY_CLOUD_CONTEXT, value) }

    // Read-only compatibility for the retired alert component; no new detection uses these.
    val vibrationEnabled: Boolean get() = false
    val soundEnabled: Boolean get() = false
    val vibrationPattern: String get() = VIBRATION_STANDARD

    companion object {
        const val VIBRATION_STANDARD = "standard"
        const val VIBRATION_URGENT = "urgent"
        const val VIBRATION_GENTLE = "gentle"
        private const val FILE_NAME = "water_class_radar_settings"
        private const val KEY_SAVE_AUDIO = "save_audio_enabled"
        private const val KEY_USAGE_NOTICE = "usage_notice_accepted"
        private const val KEY_TRANSLATION_ENABLED = "translation_enabled"
        private const val KEY_TRANSLATION_NOTICE = "translation_notice_accepted"
        private const val KEY_CLOUD_LISTENING = "cloud_listening_enabled"
        private const val KEY_CLOUD_NOTICE = "cloud_notice_accepted"
        private const val KEY_CLOUD_TRANSLATION = "cloud_translation_enabled"
        private const val KEY_CLOUD_SPEAKERS = "cloud_speakers_enabled"
        private const val KEY_CLOUD_DIGEST = "cloud_digest_enabled"
        private const val KEY_CLOUD_ENHANCE = "cloud_enhance_enabled"
        private const val KEY_CLOUD_STORE = "cloud_store_enabled"
        private const val KEY_CLOUD_LANGUAGES = "cloud_language_hints"
        private const val KEY_CLOUD_PAIR = "cloud_translation_pair"
        private const val KEY_CLOUD_MODEL = "cloud_translation_model"
        private const val KEY_CLOUD_TIMESTAMPS = "cloud_timestamps_mode"
        private const val KEY_VOICE_POLISH = "cloud_voice_polish"
        private const val KEY_CLOUD_STRICT = "cloud_strict_languages"
        private const val KEY_CLOUD_IDENTIFY = "cloud_identify_language"
        private const val KEY_CLOUD_DISPLAY = "cloud_display_mode"
        private const val KEY_CLOUD_SEGMENTATION = "cloud_segmentation"
        private const val KEY_CLOUD_REGION = "cloud_region"
        private const val KEY_CLOUD_HOTWORDS = "cloud_hotwords"
        private const val KEY_CLOUD_PAIRS = "cloud_term_pairs"
        private const val KEY_CLOUD_CONTEXT = "cloud_context"

        @Volatile private var instance: AppPreferences? = null

        fun get(context: Context): AppPreferences = instance ?: synchronized(this) {
            instance ?: AppPreferences(context).also { instance = it }
        }
    }
}
