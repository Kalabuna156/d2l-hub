package com.d2lhub.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * The Cookie header for Brightspace, captured from the sign-in WebView and kept
 * encrypted at rest (with a plain fallback if the device keystore is missing).
 */
class SessionStore(context: Context) {
    private val prefs: SharedPreferences = try {
        val key = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "d2l-hub-session",
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (_: Exception) {
        context.getSharedPreferences("d2l-hub-session-fallback", Context.MODE_PRIVATE)
    }

    fun save(baseUrl: String, cookie: String, userName: String?) {
        prefs.edit()
            .putString("baseUrl", baseUrl)
            .putString("cookie", cookie)
            .putString("userName", userName)
            .putString("lastBaseUrl", baseUrl)
            .apply()
    }

    fun read(): Session? {
        val baseUrl = prefs.getString("baseUrl", null) ?: return null
        val cookie = prefs.getString("cookie", null) ?: return null
        if (baseUrl.isBlank() || cookie.isBlank()) return null
        return Session(baseUrl, cookie, prefs.getString("userName", null))
    }

    /** The address is remembered across sign-outs so it can be pre-filled. */
    fun lastBaseUrl(): String? = prefs.getString("lastBaseUrl", null)

    fun clear() {
        val remembered = prefs.getString("baseUrl", null) ?: prefs.getString("lastBaseUrl", null)
        prefs.edit().clear().apply()
        if (remembered != null) prefs.edit().putString("lastBaseUrl", remembered).apply()
    }
}

data class Session(
    val baseUrl: String,
    val cookie: String,
    val userName: String?,
)
