package com.d2lhub.app.data

import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * Turns Notion API responses into dated entries. Kept free of Android code so
 * the mapping can be unit tested with real JSON payloads.
 */
object NotionMapper {
    const val PAST_DAYS = 30L
    const val FUTURE_DAYS = 120L
    private const val DAY_MS = 86_400_000L

    fun databases(json: String): List<NotionDatabase> {
        val results = runCatching { JSONObject(json).optJSONArray("results") }.getOrNull() ?: return emptyList()
        val databases = mutableListOf<NotionDatabase>()
        for (index in 0 until results.length()) {
            val database = results.optJSONObject(index) ?: continue
            val id = database.optString("id").trim()
            if (id.isEmpty()) continue
            databases += NotionDatabase(
                id = id,
                title = richText(database.optJSONArray("title")).ifBlank { "Untitled database" },
                dateProperty = pickDateProperty(database.optJSONObject("properties")),
            )
        }
        return databases.sortedBy { it.title.lowercase() }
    }

    fun events(
        json: String,
        databaseTitle: String,
        dateProperty: String?,
        now: Long = System.currentTimeMillis(),
    ): List<ExternalEvent> {
        val results = runCatching { JSONObject(json).optJSONArray("results") }.getOrNull() ?: return emptyList()
        val windowStart = now - PAST_DAYS * DAY_MS
        val windowEnd = now + FUTURE_DAYS * DAY_MS
        val events = mutableListOf<ExternalEvent>()

        for (index in 0 until results.length()) {
            val page = results.optJSONObject(index) ?: continue
            val raw = pageDate(page, dateProperty) ?: continue
            val startsAt = timestamp(raw) ?: continue
            if (startsAt !in windowStart..windowEnd) continue

            val id = page.optString("id").trim()
            val url = page.optString("url").trim().takeIf { it.startsWith("http") }
            events += ExternalEvent(
                id = "notion-${id.ifBlank { raw.hashCode().toString() }}",
                title = pageTitle(page),
                startsAt = startsAt,
                url = url,
                source = "notion",
                calendarName = databaseTitle,
            )
        }

        return events.sortedBy { it.startsAt }
    }

    /** The date property the database uses, preferring obvious names. */
    fun pickDateProperty(properties: JSONObject?): String? {
        if (properties == null) return null
        val dates = properties.keys().asSequence()
            .filter { properties.optJSONObject(it)?.optString("type") == "date" }
            .toList()
        if (dates.isEmpty()) return null
        return dates.firstOrNull { name -> Regex("due|deadline|date|when", RegexOption.IGNORE_CASE).containsMatchIn(name) }
            ?: dates.first()
    }

    private fun pageDate(page: JSONObject, dateProperty: String?): String? {
        val properties = page.optJSONObject("properties") ?: return null
        val names = if (dateProperty != null) listOf(dateProperty) else properties.keys().asSequence().toList()
        for (name in names) {
            val property = properties.optJSONObject(name) ?: continue
            if (property.optString("type") != "date") continue
            val date = property.optJSONObject("date") ?: continue
            val start = date.optString("start").trim()
            if (start.isNotEmpty()) return start
        }
        return null
    }

    private fun pageTitle(page: JSONObject): String {
        val properties = page.optJSONObject("properties") ?: return "Untitled entry"
        for (name in properties.keys()) {
            val property = properties.optJSONObject(name) ?: continue
            if (property.optString("type") != "title") continue
            val title = richText(property.optJSONArray("title"))
            if (title.isNotBlank()) return title
        }
        return "Untitled entry"
    }

    private fun richText(parts: JSONArray?): String {
        if (parts == null) return ""
        val text = StringBuilder()
        for (index in 0 until parts.length()) {
            val part = parts.optJSONObject(index) ?: continue
            text.append(part.optString("plain_text"))
        }
        return text.toString().trim()
    }

    /** Date-only entries land at local noon so they don't drift across a day. */
    private fun timestamp(raw: String): Long? {
        if (Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(raw)) {
            val date = runCatching { LocalDate.parse(raw) }.getOrNull() ?: return null
            return date.atTime(12, 0).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        }
        runCatching { OffsetDateTime.parse(raw).toInstant().toEpochMilli() }.getOrNull()?.let { return it }
        runCatching { Instant.parse(raw).toEpochMilli() }.getOrNull()?.let { return it }
        return runCatching {
            LocalDateTime.parse(raw).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        }.getOrNull()
    }
}

/**
 * Small Notion API client for one internal integration token. Only the two
 * read calls the app needs are implemented: search databases, query one of
 * them. No Notion data is written back.
 */
class NotionClient(private val token: String) {
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    fun listDatabases(): List<NotionDatabase> {
        val body = JSONObject()
            .put("filter", JSONObject().put("property", "object").put("value", "database"))
            .put("page_size", 100)
        val json = post("/search", body)
        return NotionMapper.databases(json.toString())
    }

    fun events(
        database: NotionDatabase,
        now: Long = System.currentTimeMillis(),
    ): List<ExternalEvent> {
        val pages = JSONArray()
        val filter = database.dateProperty?.let { property ->
            JSONObject()
                .put("property", property)
                .put(
                    "date",
                    JSONObject().put(
                        "on_or_after",
                        LocalDate.now().minusDays(NotionMapper.PAST_DAYS).toString(),
                    ),
                )
        }

        var cursor: String? = null
        for (page in 0 until 3) {
            val body = JSONObject().put("page_size", 100)
            if (filter != null) body.put("filter", filter)
            if (cursor != null) body.put("start_cursor", cursor)

            val json = post("/databases/${database.id}/query", body)
            val results = json.optJSONArray("results") ?: break
            for (index in 0 until results.length()) {
                results.optJSONObject(index)?.let { pages.put(it) }
            }
            if (!json.optBoolean("has_more")) break
            cursor = json.optString("next_cursor").takeIf { it.isNotBlank() } ?: break
        }

        return NotionMapper.events(
            JSONObject().put("results", pages).toString(),
            database.title,
            database.dateProperty,
            now,
        )
    }

    private fun post(path: String, body: JSONObject): JSONObject {
        val request = Request.Builder()
            .url("https://api.notion.com/v1$path")
            .header("Authorization", "Bearer $token")
            .header("Notion-Version", "2022-06-28")
            .header("Content-Type", "application/json")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()

        val text = try {
            http.newCall(request).execute().use { response ->
                val payload = response.body?.string().orEmpty()
                if (!response.isSuccessful) throw notionError(response.code, payload)
                payload
            }
        } catch (exception: IntegrationException) {
            throw exception
        } catch (_: IOException) {
            throw IntegrationException("Could not reach Notion. Check your connection and try again.")
        }

        return runCatching { JSONObject(text) }.getOrElse {
            throw IntegrationException("Notion sent back something unexpected. Try again in a moment.")
        }
    }

    private fun notionError(status: Int, payload: String): IntegrationException {
        val code = runCatching { JSONObject(payload).optString("code") }.getOrNull()
        return IntegrationException(
            when {
                status == 401 -> "Notion rejected that token. Copy the Internal Integration Secret again."
                status == 404 -> "Notion cannot see that database. Share it with your integration, then retry."
                code == "validation_error" -> "Notion could not read that database. Try a single-source database."
                else -> "Notion returned $status. Check the token and the database, then retry."
            },
        )
    }
}
