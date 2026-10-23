package com.d2lhub.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** What the user connected, plus the last sync result for each app. */
data class Integrations(
    val googleUrl: String? = null,
    val googleLabel: String? = null,
    val googleLastSync: Long? = null,
    val googleError: String? = null,
    val notionToken: String? = null,
    val notionDatabaseId: String? = null,
    val notionTitle: String? = null,
    val notionDateProperty: String? = null,
    val notionLastSync: Long? = null,
    val notionError: String? = null,
) {
    val hasGoogle: Boolean get() = !googleUrl.isNullOrBlank()
    val hasNotion: Boolean get() = !notionToken.isNullOrBlank() && !notionDatabaseId.isNullOrBlank()
}

/**
 * Calendar links and the Notion token are secrets: the link lets anyone read
 * the calendar and the token grants access to the shared database. They are
 * kept encrypted at rest, in a separate preferences file from the D2L session.
 */
class IntegrationsStore(context: Context) {
    private val prefs: SharedPreferences = try {
        val key = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "d2l-hub-integrations",
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (_: Exception) {
        context.getSharedPreferences("d2l-hub-integrations-fallback", Context.MODE_PRIVATE)
    }

    fun read(): Integrations = Integrations(
        googleUrl = prefs.getString("googleUrl", null),
        googleLabel = prefs.getString("googleLabel", null),
        googleLastSync = prefs.getLong("googleLastSync", 0L).takeIf { it > 0L },
        googleError = prefs.getString("googleError", null),
        notionToken = prefs.getString("notionToken", null),
        notionDatabaseId = prefs.getString("notionDatabaseId", null),
        notionTitle = prefs.getString("notionTitle", null),
        notionDateProperty = prefs.getString("notionDateProperty", null),
        notionLastSync = prefs.getLong("notionLastSync", 0L).takeIf { it > 0L },
        notionError = prefs.getString("notionError", null),
    )

    fun saveGoogle(url: String, label: String?) {
        prefs.edit()
            .putString("googleUrl", url)
            .putString("googleLabel", label)
            .putLong("googleLastSync", System.currentTimeMillis())
            .remove("googleError")
            .apply()
    }

    fun clearGoogle() {
        prefs.edit()
            .remove("googleUrl")
            .remove("googleLabel")
            .remove("googleLastSync")
            .remove("googleError")
            .apply()
    }

    fun saveNotion(token: String, databaseId: String, title: String?, dateProperty: String?) {
        prefs.edit()
            .putString("notionToken", token)
            .putString("notionDatabaseId", databaseId)
            .putString("notionTitle", title)
            .putString("notionDateProperty", dateProperty)
            .putLong("notionLastSync", System.currentTimeMillis())
            .remove("notionError")
            .apply()
    }

    fun clearNotion() {
        prefs.edit()
            .remove("notionToken")
            .remove("notionDatabaseId")
            .remove("notionTitle")
            .remove("notionDateProperty")
            .remove("notionLastSync")
            .remove("notionError")
            .apply()
    }

    fun saveGoogleSync(label: String?, syncedAt: Long, error: String?) {
        prefs.edit()
            .putString("googleLabel", label)
            .putLong("googleLastSync", syncedAt)
            .putString("googleError", error)
            .apply()
    }

    fun saveNotionSync(syncedAt: Long, error: String?) {
        prefs.edit()
            .putLong("notionLastSync", syncedAt)
            .putString("notionError", error)
            .apply()
    }
}

class IntegrationException(message: String) : Exception(message)
