package com.d2lhub.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

enum class AiProvider(val id: String, val label: String, val defaultModel: String) {
    GEMINI("gemini", "Google Gemini", "gemini-3.8-flash"),
    OPENAI("openai", "OpenAI", "gpt-4o-mini"),
    ANTHROPIC("anthropic", "Anthropic Claude", "claude-sonnet-4-5"),
    CUSTOM("custom", "OpenAI-compatible endpoint", "gpt-4o-mini");

    companion object {
        fun fromId(id: String?): AiProvider = entries.firstOrNull { it.id == id } ?: GEMINI
    }
}

data class AiSettings(
    val provider: AiProvider = AiProvider.GEMINI,
    val apiKey: String = "",
    val model: String = "",
    val customBaseUrl: String = "",
) {
    val hasKey: Boolean get() = apiKey.isNotBlank()

    val effectiveModel: String get() = model.trim().ifBlank { provider.defaultModel }

    /** Only ever show the end of the key, never the whole secret. */
    val keyHint: String
        get() = if (apiKey.isBlank()) {
            ""
        } else if (apiKey.length <= 4) {
            "••••"
        } else {
            "••••${apiKey.takeLast(4)}"
        }
}

/**
 * The key is a secret, so it is kept encrypted at rest like the D2L session and
 * Notion token. It is only ever sent to the provider the user picked.
 */
class AiSettingsStore(context: Context) {
    private val prefs: SharedPreferences = try {
        val key = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "d2l-hub-ai",
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (_: Exception) {
        context.getSharedPreferences("d2l-hub-ai-fallback", Context.MODE_PRIVATE)
    }

    fun read(): AiSettings = AiSettings(
        provider = AiProvider.fromId(prefs.getString("provider", null)),
        apiKey = prefs.getString("apiKey", null).orEmpty(),
        model = prefs.getString("model", null).orEmpty(),
        customBaseUrl = prefs.getString("customBaseUrl", null).orEmpty(),
    )

    fun save(settings: AiSettings) {
        prefs.edit()
            .putString("provider", settings.provider.id)
            .putString("apiKey", settings.apiKey)
            .putString("model", settings.model)
            .putString("customBaseUrl", settings.customBaseUrl)
            .apply()
    }

    fun clearKey() {
        prefs.edit().remove("apiKey").apply()
    }
}
