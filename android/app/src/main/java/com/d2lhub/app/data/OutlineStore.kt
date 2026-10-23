package com.d2lhub.app.data

import android.content.Context
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

data class OutlineImportResult(
    val deadlines: List<Deadline>,
    val added: Int,
    val skipped: Int,
)

/** Pure merge of confirmed draft dates into the saved outline list. */
object OutlineImport {
    fun merge(
        existing: List<Deadline>,
        course: Course,
        drafts: List<OutlineDraft>,
    ): OutlineImportResult {
        val merged = existing.toMutableList()
        val seen = existing
            .map { "${it.title.lowercase(Locale.US)}|${it.startsAt}" }
            .toMutableSet()
        var added = 0
        var skipped = 0

        for (draft in drafts) {
            val title = draft.title.trim().take(140)
            if (title.length < 3 || draft.startsAt <= 0L) {
                skipped += 1
                continue
            }
            val key = "${title.lowercase(Locale.US)}|${draft.startsAt}"
            if (!seen.add(key)) {
                skipped += 1
                continue
            }
            merged += Deadline(
                id = "outline-${draft.id}",
                title = title,
                courseCode = course.code.ifBlank { course.name },
                startsAt = draft.startsAt,
                url = course.url,
                source = "outline",
            )
            added += 1
        }

        return OutlineImportResult(merged, added, skipped)
    }
}

/** Dates imported from course outlines, kept as plain data (they are not secrets). */
class OutlineStore(context: Context) {
    private val prefs = context.getSharedPreferences("d2l-hub-outlines", Context.MODE_PRIVATE)

    fun read(): List<Deadline> {
        val raw = prefs.getString("deadlines", null) ?: return emptyList()
        val array = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        val result = mutableListOf<Deadline>()
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            val title = item.optString("title").trim()
            val startsAt = item.optLong("startsAt", 0L)
            if (title.isBlank() || startsAt <= 0L) continue
            result += Deadline(
                id = item.optString("id").ifBlank { "outline-$startsAt" },
                title = title,
                courseCode = item.optString("courseCode").takeIf { it.isNotBlank() },
                startsAt = startsAt,
                url = item.optString("url"),
                source = "outline",
            )
        }
        return result
    }

    fun add(course: Course, drafts: List<OutlineDraft>): OutlineImportResult {
        val result = OutlineImport.merge(read(), course, drafts)
        if (result.added > 0) save(result.deadlines)
        return result
    }

    private fun save(deadlines: List<Deadline>) {
        val array = JSONArray()
        for (deadline in deadlines) {
            array.put(
                JSONObject()
                    .put("id", deadline.id)
                    .put("title", deadline.title)
                    .put("courseCode", deadline.courseCode.orEmpty())
                    .put("startsAt", deadline.startsAt ?: 0L)
                    .put("url", deadline.url),
            )
        }
        prefs.edit().putString("deadlines", array.toString()).apply()
    }
}
