package com.classroomradar.app.learning.api

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal data class DeviceCredential(
    val deviceId: String,
    val token: String,
)

internal interface CredentialStore {
    fun load(): DeviceCredential?

    fun save(credential: DeviceCredential)

    fun clear()
}

/** Stores only deviceId, AES-GCM ciphertext and IV in SharedPreferences. */
internal class DeviceCredentialStore(context: Context) : CredentialStore {
    private val preferences = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )

    override fun load(): DeviceCredential? {
        val deviceId = preferences.getString(KEY_DEVICE_ID, null)
        val ciphertext = preferences.getString(KEY_CIPHERTEXT, null)
        val iv = preferences.getString(KEY_IV, null)
        if (deviceId == null && ciphertext == null && iv == null) return null
        if (deviceId == null || ciphertext == null || iv == null) {
            clear()
            return null
        }

        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                getOrCreateKey(),
                GCMParameterSpec(GCM_TAG_BITS, Base64.decode(iv, Base64.NO_WRAP)),
            )
            val token = String(
                cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP)),
                Charsets.UTF_8,
            )
            if (deviceId.isBlank() || token.isBlank()) {
                clear()
                null
            } else {
                DeviceCredential(deviceId, token)
            }
        } catch (_: Exception) {
            // A restored preferences file or an invalidated Keystore key cannot be used.
            // Discard it so the client can register a fresh device exactly once on demand.
            clear()
            null
        }
    }

    override fun save(credential: DeviceCredential) {
        val plaintext = credential.token.toByteArray(Charsets.UTF_8)
        try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
            val ciphertext = cipher.doFinal(plaintext)
            preferences.edit()
                .putString(KEY_DEVICE_ID, credential.deviceId)
                .putString(KEY_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .putString(KEY_IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                .apply()
        } catch (exception: Exception) {
            throw LearningApiException.CredentialStorage(
                "could not encrypt the device token",
                exception,
            )
        } finally {
            plaintext.fill(0)
        }
    }

    override fun clear() {
        preferences.edit()
            .remove(KEY_DEVICE_ID)
            .remove(KEY_CIPHERTEXT)
            .remove(KEY_IV)
            .apply()
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val PREFERENCES_NAME = "learning_api_device_credentials"
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_CIPHERTEXT = "token_aes_gcm"
        const val KEY_IV = "token_aes_gcm_iv"
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "learning_api_device_token_v1"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_BITS = 128
    }
}
