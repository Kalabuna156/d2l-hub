package com.d2lhub.app.data

import okhttp3.OkHttpClient
import okhttp3.Request
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

/** The public MUES exam bank. Same folder the desktop app ships with. */
const val MUES_FOLDER_ID = "1hF1JzgFmI4vS9mgDZilNSuVwN52VuZl3"

data class DriveEntry(
    val id: String,
    val name: String,
    val isFolder: Boolean,
    /** Google's label, e.g. "PDF document" or "Folder". */
    val type: String,
    val modifiedAt: String?,
)

data class ExamBankFolder(
    val id: String,
    val name: String?,
    val entries: List<DriveEntry>,
    val fetchedAt: Long,
)

data class ExamCrumb(val id: String, val name: String)

/** Pure HTML parsing so it can be tested without a device. */
object ExamBankParser {
    fun parse(html: String, folderId: String): ExamBankFolder {
        val doc = Jsoup.parse(html)
        val name = doc.title()
            .replace(Regex("\\s+-\\s+Google Drive\\s*$", RegexOption.IGNORE_CASE), "")
            .replace(Regex("\\s+"), " ")
            .trim()
            .ifBlank { null }

        val entries = mutableListOf<DriveEntry>()
        val seen = mutableSetOf<String>()
        doc.select(".flip-entry").forEach { node ->
            val id = node.attr("id").removePrefix("entry-").trim()
            val title = node.selectFirst(".flip-entry-title")?.text()
                ?.replace(Regex("\\s+"), " ")?.trim().orEmpty()
            if (id.isBlank() || title.isBlank() || !seen.add(id)) return@forEach

            val href = node.selectFirst("a[href]")?.attr("href").orEmpty()
            val isFolder = href.contains("/drive/folders/")
            val label = node.selectFirst(".flip-entry-icon div[aria-label]")
                ?.attr("aria-label")?.trim().orEmpty()
            val modified = node.selectFirst(".flip-entry-last-modified")
                ?.text()?.replace(Regex("\\s+"), " ")?.trim()?.ifBlank { null }

            entries += DriveEntry(
                id = id,
                name = title,
                isFolder = isFolder,
                type = label.ifBlank { if (isFolder) "Folder" else "File" },
                modifiedAt = modified,
            )
        }

        return ExamBankFolder(
            id = folderId,
            name = name,
            entries = entries.sortedWith(
                compareByDescending<DriveEntry> { it.isFolder }
                    .thenBy(String.CASE_INSENSITIVE_ORDER) { it.name },
            ),
            fetchedAt = System.currentTimeMillis(),
        )
    }
}

class ExamBankClient {
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private fun get(url: String, accept: String): okhttp3.Response {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", D2lClient.USER_AGENT)
            .header("Accept", accept)
            .get()
            .build()
        return try {
            http.newCall(request).execute()
        } catch (_: Exception) {
            throw IllegalStateException("Could not reach Google Drive. Check your connection and try again.")
        }
    }

    fun folder(folderId: String): ExamBankFolder {
        if (!Regex("^[A-Za-z0-9_-]{10,100}$").matches(folderId)) {
            throw IllegalStateException("That exam-bank folder is not valid.")
        }
        get("https://drive.google.com/embeddedfolderview?id=$folderId#list", "text/html").use { response ->
            if (response.code == 404) throw IllegalStateException("That exam-bank folder is no longer shared.")
            if (!response.isSuccessful) throw IllegalStateException("Google Drive returned ${response.code}.")
            val html = response.body?.string().orEmpty()
            if (html.isBlank()) throw IllegalStateException("Google Drive returned an empty folder page.")
            return ExamBankParser.parse(html, folderId)
        }
    }

    /**
     * Public Drive files download without a Google account. Large files first
     * return the virus-scan form, whose fields must be posted back.
     */
    fun download(fileId: String, fallbackName: String, destination: File): DownloadedFile {
        if (!Regex("^[A-Za-z0-9_-]{10,100}$").matches(fileId)) {
            throw IllegalStateException("That exam-bank file could not be found.")
        }

        var response = get(
            "https://drive.usercontent.google.com/download?id=$fileId&export=download&confirm=t",
            "*/*",
        )
        var mime = response.header("Content-Type").orEmpty()
        var disposition = response.header("Content-Disposition")

        if (mime.startsWith("text/html", ignoreCase = true)) {
            val html = response.body?.string().orEmpty()
            response.close()
            if (html.isBlank()) throw IllegalStateException("Google Drive did not return that file.")

            val doc = Jsoup.parse(html)
            val form = doc.selectFirst("form#download-form")
                ?: throw IllegalStateException(
                    "Google did not return that file. It may be a folder or a Google Doc.",
                )
            val action = form.attr("action").ifBlank {
                "https://drive.usercontent.google.com/download"
            }
            val params = buildList {
                form.select("input[name]").forEach { input: Element ->
                    val name = input.attr("name")
                    if (name.isNotBlank()) add(name to input.attr("value"))
                }
            }
            val url = if (params.isEmpty()) {
                action
            } else {
                action + "?" + params.joinToString("&") { (key, value) ->
                    java.net.URLEncoder.encode(key, "UTF-8") + "=" +
                        java.net.URLEncoder.encode(value, "UTF-8")
                }
            }
            response = get(url, "*/*")
            mime = response.header("Content-Type").orEmpty()
            disposition = response.header("Content-Disposition")
            if (mime.startsWith("text/html", ignoreCase = true)) {
                response.close()
                throw IllegalStateException("Google did not return that file. It may be a folder or a Google Doc.")
            }
        }

        try {
            if (!response.isSuccessful) {
                throw IllegalStateException("Google Drive returned ${response.code} for that file.")
            }
            val body = response.body ?: throw IllegalStateException("Google Drive returned an empty file.")
            if (body.contentLength() > MAX_DOWNLOAD_BYTES) {
                throw IllegalStateException("That file is too large to save (150 MB limit).")
            }
            val declaredName = dispositionName(disposition)
            val baseName = declaredName?.takeIf { it.isNotBlank() } ?: fallbackName
            val extension = extensionFor(mime, "", baseName)
            val name = safeFileName(
                if (extensionFrom(baseName) != null) baseName else "$baseName.$extension",
            )

            var written = 0L
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
            if (written == 0L) throw IllegalStateException("That file came back empty.")
            return DownloadedFile(
                file = destination,
                fileName = name,
                mime = mimeFor(extensionFor(mime, "", name), mime),
                size = written,
            )
        } catch (exception: Exception) {
            destination.delete()
            throw if (exception is IllegalStateException) exception
            else IllegalStateException("Could not save that exam-bank file.")
        } finally {
            response.close()
        }
    }
}
