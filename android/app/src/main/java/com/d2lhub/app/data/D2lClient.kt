package com.d2lhub.app.data

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import org.jsoup.Jsoup
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

/**
 * Talks to Brightspace directly with the cookies captured by the sign-in
 * WebView. Everything stays on the phone; no proxy server is involved.
 */
class D2lClient(baseUrl: String, private val cookie: String) {
    private val base = baseUrl.trimEnd('/')
    private var apiVersion: String? = null

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private fun get(path: String, accept: String = "text/html,application/xhtml+xml"): String? {
        val request = Request.Builder()
            .url(base + path)
            .header("Cookie", cookie)
            .header("Accept", accept)
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("User-Agent", USER_AGENT)
            .get()
            .build()

        return try {
            http.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful) return null
                val requestPath = response.request.url.encodedPath
                if (requestPath.contains("/d2l/login")) return null
                if (body.take(2500).contains("<title>Login", ignoreCase = true)) return null
                if (body.take(2500).contains("name=\"Username\"", ignoreCase = true) &&
                    body.take(2500).contains("type=\"password\"", ignoreCase = true)
                ) {
                    return null
                }
                body
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun lpVersion(): String {
        apiVersion?.let { return it }
        val body = get("/d2l/api/versions/", "application/json")
        if (body != null) {
            try {
                val versions = JSONArray(body)
                for (index in 0 until versions.length()) {
                    val product = versions.getJSONObject(index)
                    if (product.optString("ProductCode").equals("lp", ignoreCase = true)) {
                        val latest = product.opt("LatestVersion")?.toString()
                        if (!latest.isNullOrBlank()) {
                            apiVersion = latest
                            return latest
                        }
                    }
                }
            } catch (_: Exception) {
                // Fall back to a known-good LP version.
            }
        }
        apiVersion = "1.47"
        return "1.47"
    }

    fun whoAmI(): Profile? {
        val body = get("/d2l/api/lp/${lpVersion()}/users/whoami", "application/json") ?: return null
        return try {
            val json = JSONObject(body)
            val name = listOf(json.optString("FirstName"), json.optString("LastName"))
                .filter { it.isNotBlank() }
                .joinToString(" ")
                .trim()
            val identifier = json.opt("Identifier")?.toString()
            Profile(name.ifBlank { null }, identifier?.ifBlank { null })
        } catch (_: Exception) {
            null
        }
    }

    fun courses(): List<Course> {
        val body = get("/d2l/le/manageCourses/api/mycourses", "application/json")
        val courses = mutableListOf<Course>()

        if (body != null) {
            try {
                val items = JSONObject(body).optJSONArray("Courses")
                if (items != null) {
                    for (index in 0 until items.length()) {
                        val item = items.getJSONObject(index)
                        val id = item.opt("OrgUnitId")?.toString()?.trim().orEmpty()
                        if (!Regex("\\d+").matches(id)) continue
                        val rawName = Jsoup.parse(item.optString("Name")).text()
                        val name = rawName.replace(Regex("\\s+"), " ").trim()
                        val code = item.optString("Code").trim().uppercase()
                        if (name.isBlank() && code.isBlank()) continue
                        courses.add(
                            Course(
                                id = id,
                                name = name.ifBlank { code },
                                code = code,
                                url = "$base/d2l/home/$id",
                            ),
                        )
                    }
                }
            } catch (_: Exception) {
                // The HTML tiles below still work when this endpoint changes.
            }
        }

        if (courses.isEmpty()) {
            val home = get("/d2l/home") ?: return emptyList()
            return D2lParser.parseCourses(home, base)
        }
        return courses
    }

    private fun homeOrgUnit(home: String): String? =
        Regex("/d2l/le/calendar/(\\d+)").find(home)?.groupValues?.get(1)
            ?: Regex("/d2l/lp/ouHome/home\\.d2l\\?ou=(\\d+)").find(home)?.groupValues?.get(1)

    fun deadlines(courses: List<Course>): List<Deadline> {
        val home = get("/d2l/home")
        val orgUnit = home?.let { homeOrgUnit(it) }

        if (orgUnit != null) {
            val url = "$base/d2l/le/calendar/$orgUnit"
            val html = get("/d2l/le/calendar/$orgUnit")
            if (html != null) {
                val events = D2lParser.parseCalendarMonth(html, url, courses)
                if (events.isNotEmpty()) return events
            }
        }

        return home?.let { D2lParser.parseEvents(it, base) } ?: emptyList()
    }

    fun announcements(course: Course): List<Announcement> {
        val fallbackUrl = "$base/d2l/lms/news/main.d2l?ou=${course.id}"
        val html = get("/d2l/lms/news/main.d2l?ou=${course.id}") ?: return emptyList()
        return D2lParser.parseAnnouncements(html, fallbackUrl)
    }

    /** The student's gradebook rows for one course. */
    fun grades(course: Course): CourseGrades? {
        val path = "/d2l/lms/grades/my_grades/main.d2l?ou=${course.id}"
        val html = get(path) ?: return null
        return CourseGrades(D2lParser.parseGrades(html, base), "$base$path")
    }

    /**
     * Modules plus the topics D2L renders for the selected module. Passing no
     * module lets D2L pick the one it opened by default.
     */
    fun content(course: Course, moduleId: String? = null): CourseContent? {
        val path = if (moduleId != null) {
            "/d2l/le/content/${course.id}/Home?itemIdentifier=ModuleCO-$moduleId"
        } else {
            "/d2l/le/content/${course.id}/Home"
        }
        val html = get(path) ?: return null
        val modules = D2lParser.parseContentModules(html)
        val moduleTitle = D2lParser.parseContentModuleTitle(html)
        val resolved = moduleId ?: modules.firstOrNull { it.name == moduleTitle }?.id

        return CourseContent(
            modules = modules,
            moduleId = resolved,
            moduleTitle = moduleTitle,
            topics = D2lParser.parseContentTopics(html, base),
            contentUrl = "$base/d2l/le/content/${course.id}/Home",
        )
    }

    // -----------------------------------------------------------------------
    // Content Space downloads
    // -----------------------------------------------------------------------

    private val downloadHttp: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        // Redirects are followed by hand so the D2L cookie never goes to a CDN.
        .followRedirects(false)
        .build()

    private val baseHost: String? = base.toHttpUrlOrNull()?.host

    /** Download one content topic to a temporary file for Content Space. */
    fun downloadTopic(topicUrl: String, fallbackTitle: String, destination: File): DownloadedFile {
        val start = topicUrl.toHttpUrlOrNull()
            ?: throw IllegalStateException("That topic link is not valid.")
        val baseUrl = base.toHttpUrlOrNull()
            ?: throw IllegalStateException("Your D2L address is not valid.")
        if (!start.isHttps || start.host != baseUrl.host || start.port != baseUrl.port) {
            throw IllegalStateException("That link does not point at your D2L site.")
        }
        if (!start.encodedPath.startsWith("/d2l/")) {
            throw IllegalStateException("That link is not a D2L content page.")
        }

        val attempts = listOfNotNull(
            directTopicDownloadUrl(start.toString())?.toHttpUrlOrNull(),
            start,
        ).distinctBy { it.toString() }
        var lastError: Exception? = null
        for (attempt in attempts) {
            try {
                return fetchTopicFile(attempt, fallbackTitle, destination, referer = null, depth = 0)
            } catch (exception: Exception) {
                lastError = exception
            }
        }
        destination.delete()
        throw IllegalStateException(lastError?.message ?: "Could not download that topic.")
    }

    private fun fetchTopicFile(
        url: HttpUrl,
        fallbackTitle: String,
        destination: File,
        referer: HttpUrl?,
        depth: Int,
    ): DownloadedFile {
        if (depth > 3) throw IllegalStateException("D2L kept redirecting that file.")

        var current = url
        var response: Response? = null
        for (hop in 0..6) {
            val builder = Request.Builder()
                .url(current)
                .header("Accept", "*/*")
                .header("Accept-Language", "en-US,en;q=0.9")
                .header("User-Agent", USER_AGENT)
                .get()
            // Never leak the session cookie to a file CDN.
            if (current.host == baseHost && current.encodedPath.startsWith("/d2l/")) {
                builder.header("Cookie", cookie)
            }
            if (referer != null && referer.host == current.host) {
                builder.header("Referer", referer.toString())
            }

            val next = try {
                downloadHttp.newCall(builder.build()).execute()
            } catch (_: Exception) {
                throw IllegalStateException("Could not reach D2L for that file.")
            }

            if (next.isRedirect) {
                val location = next.header("Location") ?: run {
                    next.close()
                    throw IllegalStateException("D2L gave an empty redirect for that file.")
                }
                next.close()
                val resolved = current.resolve(location)
                    ?: throw IllegalStateException("D2L redirected to an invalid address.")
                if (!resolved.isHttps) throw IllegalStateException("D2L redirected to an insecure address.")
                current = resolved
                continue
            }

            response = next
            break
        }

        val result = response ?: throw IllegalStateException("D2L kept redirecting that file.")
        try {
            if (result.request.url.encodedPath.contains("/d2l/login")) {
                throw IllegalStateException("Your D2L session has expired — sign in again.")
            }
            if (!result.isSuccessful) {
                throw IllegalStateException(
                    if (result.code == 401 || result.code == 403) {
                        "D2L refused that file. Your session may have expired — sign in again."
                    } else {
                        "D2L returned ${result.code} for that file."
                    },
                )
            }

            val mime = result.header("Content-Type").orEmpty()
            if (mime.startsWith("text/html", ignoreCase = true)) {
                val html = result.body?.string().orEmpty()
                if (html.take(2500).contains("name=\"Username\"", ignoreCase = true) &&
                    html.take(2500).contains("type=\"password\"", ignoreCase = true)
                ) {
                    throw IllegalStateException("Your D2L session has expired — sign in again.")
                }
                val next = findFileLink(html, result.request.url)
                    ?: throw IllegalStateException("This topic is a web page, not a downloadable file.")
                return fetchTopicFile(next, fallbackTitle, destination, result.request.url, depth + 1)
            }

            val body = result.body ?: throw IllegalStateException("D2L returned an empty file.")
            val declared = body.contentLength()
            if (declared > MAX_DOWNLOAD_BYTES) {
                throw IllegalStateException("That file is too large to save (150 MB limit).")
            }

            val disposition = result.header("Content-Disposition")
            val proposed = dispositionName(disposition) ?: fallbackTitle
            val extension = extensionFor(mime, result.request.url.toString(), proposed)
            val name = safeFileName(
                if (extensionFrom(proposed) != null) proposed else "$proposed.$extension",
            )

            var written = 0L
            try {
                destination.parentFile?.mkdirs()
                FileOutputStream(destination).use { out ->
                    body.byteStream().use { input ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            written += read
                            if (written > MAX_DOWNLOAD_BYTES) {
                                throw IllegalStateException("That file is too large to save (150 MB limit).")
                            }
                            out.write(buffer, 0, read)
                        }
                    }
                }
            } catch (exception: Exception) {
                destination.delete()
                throw exception
            }

            if (written == 0L) throw IllegalStateException("That file came back empty.")
            return DownloadedFile(
                file = destination,
                fileName = name,
                mime = mimeFor(extensionFor(mime, "", name), mime),
                size = written,
            )
        } finally {
            result.close()
        }
    }

    /** D2L often wraps a file in an HTML viewer; find the real file behind it. */
    private fun findFileLink(html: String, pageUrl: HttpUrl): HttpUrl? {
        val doc = Jsoup.parse(html, pageUrl.toString())
        val candidates = mutableListOf<String>()
        doc.select("iframe[src], embed[src], object[data]").forEach { node ->
            candidates += node.attr("src").ifBlank { node.attr("data") }
        }
        doc.select("a[href]").forEach { anchor ->
            val href = anchor.attr("href")
            if (href.isNotBlank() && !href.startsWith("#")) candidates += href
        }

        val fileish = Regex("\\.(pdf|docx?|pptx?|xlsx?|zip|txt|csv|rtf|png|jpe?g|gif|mp4|mp3)(?:$|[?#])", RegexOption.IGNORE_CASE)
        val downloadish = Regex("/(content/enforced|topics/files|download)/", RegexOption.IGNORE_CASE)
        for (raw in candidates) {
            val resolved = pageUrl.resolve(raw) ?: continue
            if (!resolved.isHttps) continue
            if (!fileish.containsMatchIn(resolved.encodedPath) &&
                !downloadish.containsMatchIn(resolved.encodedPath)
            ) {
                continue
            }
            return resolved
        }
        return null
    }

    companion object {
        /**
         * Brightspace and the parsers both expect the desktop site: the mobile
         * layout uses different markup and class names.
         */
        const val USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

        /**
         * D2L's viewer is a JavaScript shell, so its own download route is used
         * for the same topic. Pure so the mapping can be unit tested.
         */
        internal fun directTopicDownloadUrl(topicUrl: String): String? {
            val url = topicUrl.toHttpUrlOrNull() ?: return null
            val match = Regex("/d2l/le/content/(\\d+)/viewContent/(\\d+)(?:/|$)")
                .find(url.encodedPath) ?: return null
            val defaultPort = (url.scheme == "https" && url.port == 443) ||
                (url.scheme == "http" && url.port == 80)
            val origin = "${url.scheme}://${url.host}" + if (defaultPort) "" else ":${url.port}"
            return origin +
                "/d2l/le/content/${match.groupValues[1]}/topics/files/download/" +
                "${match.groupValues[2]}/DirectFileTopicDownload"
        }
    }
}
