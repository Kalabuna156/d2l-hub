package com.d2lhub.app.data

import android.content.Context

/**
 * Read state for the bell. Only ids and the last "mark all read" moment are
 * kept, never course names or announcement text.
 */
class NotificationsStore(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences("d2lhub", Context.MODE_PRIVATE)

    fun seenAt(): Long = prefs.getLong(KEY_SEEN_AT, 0L)

    fun seenIds(): Set<String> =
        prefs.getStringSet(KEY_SEEN_IDS, emptySet()).orEmpty().toSet()

    fun markAllRead(ids: Collection<String>, at: Long) {
        prefs.edit()
            .putLong(KEY_SEEN_AT, at)
            .putStringSet(KEY_SEEN_IDS, ids.toSet())
            .apply()
    }

    fun clear() {
        prefs.edit()
            .remove(KEY_SEEN_AT)
            .remove(KEY_SEEN_IDS)
            .apply()
    }

    private companion object {
        const val KEY_SEEN_AT = "notificationsSeenAt"
        const val KEY_SEEN_IDS = "notificationsSeenIds"
    }
}
