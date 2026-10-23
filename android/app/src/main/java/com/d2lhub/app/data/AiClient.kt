package com.d2lhub.app.data

import java.io.IOException
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.Locale
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

class AiException(
    message: String,
    internal val retryable: Boolean = false,
    internal val rateLimited: Boolean = false,
) : Exception(message)

/**
 * One small text request to whichever provider the user connected. The key is
 * read from encrypted preferences and only travels to that provider.
 *
 * A busy or retired model must not break the whole feature: every known
 * sibling model is tried, and for Gemini the provider's own model catalogue
 * supplies any remaining text models this key can use.
 */
class AiClient(private val settings: AiSettings) {
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    fun test(): String {
        val reply = ask("Reply with the single word OK.", json = false, maxTokens = 20)
        return reply.trim().take(40).ifBlank { "OK" }
    }

    fun readOutline(
        course: Course,
        text: String,
        now: Long = System.currentTimeMillis(),
    ): List<OutlineDraft> {
        val reply = ask(outlinePrompt(course, text, now), json = true, maxTokens = 4096)
        return OutlineAi.parse(reply, now)
    }

    private fun ask(prompt: String, json: Boolean, maxTokens: Int): String {
        if (!settings.hasKey) throw AiException("Add your AI API key in Settings → AI first.")

        val tried = mutableListOf<String>()
        var last: AiException? = null

        fun tryModel(model: String): String? {
            tried += model
            var result = runCatching { generate(model, prompt, json, maxTokens) }
            var error = result.exceptionOrNull()

            // A rate limit is often brief; one short retry on the same model.
            if (error is AiException && error.retryable && error.rateLimited) {
                try {
                    Thread.sleep(600)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                }
                result = runCatching { generate(model, prompt, json, maxTokens) }
                error = result.exceptionOrNull()
            }

            result.getOrNull()?.let { return it }

            val failure = error as? AiException ?: AiException("The AI request failed. Try again.")
            if (!failure.retryable) throw failure
            last = failure
            return null
        }

        for (model in modelCandidates()) {
            tryModel(model)?.let { return it }
        }

        // Every known sibling is unavailable: ask Gemini what this key can use.
        if (settings.provider == AiProvider.GEMINI && last?.retryable == true) {
            for (model in discoverGeminiModels()) {
                if (model in tried) continue
                tryModel(model)?.let { return it }
            }
        }

        val detail = last?.message ?: "The AI could not answer."
        val suffix = if (tried.size > 1) " Tried ${tried.size} models." else ""
        throw AiException("$detail$suffix")
    }

    private fun modelCandidates(): List<String> {
        val configured = settings.effectiveModel
        val siblings = when (settings.provider) {
            AiProvider.GEMINI -> listOf("gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite")
            AiProvider.OPENAI -> listOf("gpt-4o-mini", "gpt-4.1-mini")
            AiProvider.ANTHROPIC -> listOf("claude-sonnet-4-5", "claude-3-5-haiku-latest")
            AiProvider.CUSTOM -> emptyList()
        }
        return (listOf(configured) + siblings).distinct()
    }

    private fun generate(model: String, prompt: String, json: Boolean, maxTokens: Int): String =
        when (settings.provider) {
            AiProvider.GEMINI -> askGemini(model, prompt, json, maxTokens)
            AiProvider.ANTHROPIC -> askAnthropic(model, prompt, maxTokens)
            AiProvider.OPENAI, AiProvider.CUSTOM -> askOpenAi(model, prompt, json, maxTokens)
        }

    private fun askGemini(model: String, prompt: String, json: Boolean, maxTokens: Int): String {
        val encoded = URLEncoder.encode(model, "UTF-8")
        val body = JSONObject()
            .put(
                "contents",
                JSONArray().put(
                    JSONObject()
                        .put("role", "user")
                        .put("parts", JSONArray().put(JSONObject().put("text", prompt))),
                ),
            )
            .put(
                "generationConfig",
                JSONObject()
                    .put("temperature", 0.2)
                    .put("maxOutputTokens", maxTokens)
                    .apply { if (json) put("responseMimeType", "application/json") },
            )

        val response = post(
            "https://generativelanguage.googleapis.com/v1beta/models/$encoded:generateContent",
            mapOf("x-goog-api-key" to settings.apiKey),
            body,
        )
        check(response, settings.provider)

        val parts = runCatching {
            JSONObject(response.body)
                .optJSONArray("candidates")
                ?.optJSONObject(0)
                ?.optJSONObject("content")
                ?.optJSONArray("parts")
        }.getOrNull()

        val text = buildString {
            if (parts != null) {
                for (index in 0 until parts.length()) {
                    val part = parts.optJSONObject(index) ?: continue
                    if (part.optBoolean("thought")) continue
                    append(part.optString("text"))
                }
            }
        }.trim()

        if (text.isEmpty()) {
            throw AiException("Gemini sent back an empty reply. Try again.", retryable = true)
        }
        return text
    }

    private fun askOpenAi(model: String, prompt: String, json: Boolean, maxTokens: Int): String {
        val base = if (settings.provider == AiProvider.CUSTOM) {
            settings.customBaseUrl.trim().trimEnd('/')
        } else {
            "https://api.openai.com/v1"
        }
        val url = if (base.endsWith("/chat/completions", ignoreCase = true)) {
            base
        } else {
            "$base/chat/completions"
        }

        val body = JSONObject()
            .put("model", model)
            .put(
                "messages",
                JSONArray().put(JSONObject().put("role", "user").put("content", prompt)),
            )
            .put("temperature", 0.2)
            .put("max_tokens", maxTokens)
            .apply { if (json) put("response_format", JSONObject().put("type", "json_object")) }

        val response = post(url, mapOf("Authorization" to "Bearer ${settings.apiKey}"), body)
        check(response, settings.provider)

        val content = runCatching {
            JSONObject(response.body)
                .optJSONArray("choices")
                ?.optJSONObject(0)
                ?.optJSONObject("message")
                ?.opt("content")
        }.getOrNull()

        val text = when (content) {
            is String -> content
            is JSONArray -> buildString {
                for (index in 0 until content.length()) {
                    val part = content.optJSONObject(index) ?: continue
                    append(part.optString("text"))
                }
            }

            else -> ""
        }.trim()

        if (text.isEmpty()) {
            throw AiException(
                "${settings.provider.label} sent back an empty reply. Try again.",
                retryable = true,
            )
        }
        return text
    }

    private fun askAnthropic(model: String, prompt: String, maxTokens: Int): String {
        val body = JSONObject()
            .put("model", model)
            .put("max_tokens", maxTokens)
            .put("temperature", 0.2)
            .put(
                "messages",
                JSONArray().put(JSONObject().put("role", "user").put("content", prompt)),
            )

        val response = post(
            "https://api.anthropic.com/v1/messages",
            mapOf(
                "x-api-key" to settings.apiKey,
                "anthropic-version" to "2023-06-01",
            ),
            body,
        )
        check(response, settings.provider)

        val parts = runCatching { JSONObject(response.body).optJSONArray("content") }.getOrNull()
        val text = buildString {
            if (parts != null) {
                for (index in 0 until parts.length()) {
                    val part = parts.optJSONObject(index) ?: continue
                    if (part.optString("type") != "text") continue
                    append(part.optString("text"))
                }
            }
        }.trim()

        if (text.isEmpty()) {
            throw AiException("Claude sent back an empty reply. Try again.", retryable = true)
        }
        return text
    }

    private data class Response(val code: Int, val body: String)

    private fun post(url: String, headers: Map<String, String>, body: JSONObject): Response {
        val builder = Request.Builder()
            .url(url)
            .header("Content-Type", "application/json")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
        headers.forEach { (name, value) -> builder.header(name, value) }

        return try {
            http.newCall(builder.build()).execute().use { response ->
                Response(response.code, response.body?.string().orEmpty())
            }
        } catch (_: IOException) {
            throw AiException(
                "Could not reach ${settings.provider.label}. Check your connection and try again.",
            )
        } catch (_: IllegalArgumentException) {
            throw AiException("That AI endpoint is not a valid URL. Check it in Settings → AI.")
        }
    }

    private fun check(response: Response, provider: AiProvider) {
        if (response.code in 200..299) return

        val detail = runCatching {
            JSONObject(response.body).optJSONObject("error")?.optString("message")
        }.getOrNull().orEmpty()

        when {
            response.code == 401 || response.code == 403 ||
                detail.contains("api key", ignoreCase = true) ||
                detail.contains("api_key_invalid", ignoreCase = true) ->
                throw AiException("${provider.label} rejected that API key. Check it in Settings → AI.")

            response.code == 404 ->
                throw AiException(
                    "${provider.label} did not recognise that model. Trying another one.",
                    retryable = true,
                )

            response.code == 429 ->
                throw AiException(
                    "${provider.label} is rate-limiting this key. Trying another model.",
                    retryable = true,
                    rateLimited = true,
                )

            response.code >= 500 ->
                throw AiException(
                    "${provider.label} had a server problem. Trying another model.",
                    retryable = true,
                )

            else -> throw AiException(
                if (detail.isBlank()) {
                    "${provider.label} rejected the request (${response.code})."
                } else {
                    "${provider.label} rejected the request: ${detail.replace(Regex("\\s+"), " ").take(160)}"
                },
            )
        }
    }

    /** The text models Gemini says this key can use, newest first. */
    private fun discoverGeminiModels(): List<String> {
        val request = Request.Builder()
            .url("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200")
            .header("x-goog-api-key", settings.apiKey)
            .get()
            .build()

        val body = try {
            http.newCall(request).execute().use { response ->
                if (response.isSuccessful) response.body?.string() else null
            }
        } catch (_: IOException) {
            null
        } ?: return emptyList()

        val models = runCatching { JSONObject(body).optJSONArray("models") }.getOrNull()
            ?: return emptyList()

        val names = mutableListOf<String>()
        for (index in 0 until models.length()) {
            val item = models.optJSONObject(index) ?: continue
            val name = item.optString("name").removePrefix("models/").trim()
            if (name.isEmpty() || !name.startsWith("gemini", ignoreCase = true)) continue
            if (Regex("image|imagen|tts|audio|embedding|robotics|veo|learnlm", RegexOption.IGNORE_CASE)
                    .containsMatchIn(name)
            ) {
                continue
            }

            val methods = item.optJSONArray("supportedGenerationMethods") ?: continue
            var supported = false
            for (method in 0 until methods.length()) {
                if (methods.optString(method) == "generateContent") {
                    supported = true
                    break
                }
            }
            if (supported) names += name
        }

        return names.distinct()
            .sortedWith(
                compareByDescending<String> { versionOf(it) }
                    .thenBy { if (it.contains("preview", true)) 1 else 0 },
            )
            .take(8)
    }

    private fun versionOf(name: String): Double {
        val match = Regex("gemini-(\\d+(?:\\.\\d+)?)", RegexOption.IGNORE_CASE).find(name) ?: return 0.0
        return match.groupValues[1].toDoubleOrNull() ?: 0.0
    }

    private fun outlinePrompt(course: Course, text: String, now: Long): String {
        val today = Instant.ofEpochMilli(now).atZone(ZoneId.systemDefault()).toLocalDate()
        val code = course.code.ifBlank { course.name }
        return """
            You are reading the course outline for ${course.name} ($code).
            Today is $today.

            Extract every graded assessment that has a specific calendar due date: quizzes, tests, midterms, exams,
            assignments, essays, projects, presentations, reports and submissions.

            Rules:
            - One entry per date. A date cell like "Oct 5, Nov 2 and Nov 30" becomes three entries with the same title.
            - Prefer a date written inside the assessment cell. Ignore the week's Monday-Sunday range
              (for example "Sept 15 - 21" is a teaching week, not a due date).
            - Never invent a date. "TBD", "during the examination period", "week of" without a day, and
              "see D2L" have no date and must be left out.
            - Use a 24-hour HH:MM time. For a range like 6:30 - 8:30 pm use the start. If no time is given, use null.
            - Use the year the outline is for. If a date has no year, choose the year that keeps it in that term.
            - Keep titles short and specific ("Midterm 1", "Lab Quiz 2"); leave weights, chapters and rooms in detail.

            Return JSON only:
            {"assessments":[{"title":"Midterm 1","date":"2026-10-09","time":"18:30","kind":"midterm","detail":"Chapters 1-4, 6"}]}

            Outline text:
            ${text.take(42_000)}
        """.trimIndent()
    }
}

/** Maps the AI's JSON reply to reviewable dates. Kept pure for unit tests. */
object OutlineAi {
    private val DATE = Regex("^\\d{4}-\\d{2}-\\d{2}$")
    private val TIME = Regex("^(\\d{1,2}):(\\d{2})")

    fun parse(
        reply: String,
        now: Long = System.currentTimeMillis(),
        zone: ZoneId = ZoneId.systemDefault(),
    ): List<OutlineDraft> {
        val assessments = extractJsonObject(reply).optJSONArray("assessments") ?: return emptyList()
        val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        val found = mutableListOf<OutlineDraft>()
        val seen = mutableSetOf<String>()

        for (index in 0 until assessments.length()) {
            val item = assessments.optJSONObject(index) ?: continue
            val date = item.optString("date").trim()
            if (!DATE.matches(date)) continue

            val day = runCatching { LocalDate.parse(date) }.getOrNull() ?: continue
            if (day.year !in (today.year - 1)..(today.year + 2)) continue

            val time = parseTime(item.optString("time").trim()) ?: LocalTime.of(9, 0)
            val startsAt = day.atTime(time).atZone(zone).toInstant().toEpochMilli()

            val rawTitle = clean(item.optString("title"), 120)
            val kind = clean(item.optString("kind"), 20).lowercase(Locale.US)
            val title = rawTitle.ifBlank {
                if (kind.isNotBlank()) kind.replaceFirstChar { it.uppercase() } else "Assessment"
            }
            if (title.length < 3) continue

            val key = "$startsAt|${title.lowercase(Locale.US)}"
            if (!seen.add(key)) continue

            found += OutlineDraft(
                id = "ai-${key.hashCode().toString(36)}",
                title = title,
                startsAt = startsAt,
                detail = clean(item.optString("detail"), 160),
            )
        }

        return found.sortedBy { it.startsAt }.take(120)
    }

    /** Replies sometimes arrive in a code fence or with a sentence around them. */
    fun extractJsonObject(reply: String): JSONObject {
        val trimmed = reply.trim()
            .replace(Regex("^```(?:json)?\\s*", RegexOption.IGNORE_CASE), "")
            .replace(Regex("\\s*```$"), "")
            .trim()
        val start = trimmed.indexOf('{')
        val end = trimmed.lastIndexOf('}')
        if (start < 0 || end <= start) {
            throw AiException("The AI reply was not valid JSON. Try again.")
        }
        return runCatching { JSONObject(trimmed.substring(start, end + 1)) }.getOrElse {
            throw AiException("The AI reply was not valid JSON. Try again.")
        }
    }

    private fun parseTime(raw: String): LocalTime? {
        val match = TIME.find(raw) ?: return null
        val hours = match.groupValues[1].toIntOrNull() ?: return null
        val minutes = match.groupValues[2].toIntOrNull() ?: return null
        if (hours !in 0..23 || minutes !in 0..59) return null
        return LocalTime.of(hours, minutes)
    }

    private fun clean(value: String, max: Int): String =
        value.replace(Regex("\\s+"), " ").trim().take(max)
}
