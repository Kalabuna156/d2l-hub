package com.d2lhub.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

data class SavedFile(
    val id: String,
    val title: String,
    val fileName: String,
    val mime: String,
    val size: Long,
    /** "d2l" or "drive". */
    val source: String,
    val sourceUrl: String?,
    val courseId: String,
    val courseCode: String?,
    val courseName: String,
    /** Module or Drive folder path the file came from. */
    val folder: String?,
    val savedAt: Long,
)

/** D2L content types that are pages, not files, so offline saving skips them. */
private val NON_FILE_TOPICS = setOf(
    "link",
    "url",
    "external link",
    "quiz",
    "discussion",
    "discussion topic",
    "assignment",
    "checklist",
    "survey",
)

/**
 * Topics a module download should fetch: real, unique links that are not in
 * Content Space already, and not pages that only make sense online.
 */
fun offlineQueue(topics: List<ContentTopic>, savedUrls: Set<String>): List<ContentTopic> {
    val seen = mutableSetOf<String>()
    return topics.filter { topic ->
        val url = topic.url.trim()
        val type = topic.type?.trim()?.lowercase().orEmpty()
        url.isNotBlank() &&
            url !in savedUrls &&
            type !in NON_FILE_TOPICS &&
            seen.add(url)
    }
}

/**
 * Downloaded course files and saved exam-bank papers live in the app's private
 * files directory. A small JSON index remembers their titles and course, so a
 * wiped index never points outside content-space/.
 */
class ContentSpaceStore(context: Context) {
    private val app = context.applicationContext
    private val root = File(app.filesDir, "content-space")
    private val manifest = File(app.filesDir, "content-space-index.json")
    private val lock = Any()

    fun list(): List<SavedFile> = synchronized(lock) {
        readLocked().sortedByDescending { it.savedAt }
    }

    fun totalBytes(): Long = list().sumOf { it.size }

    fun fileFor(entry: SavedFile): File? {
        val file = File(File(root, entry.id), entry.fileName)
        return file.takeIf { it.isFile && insideRoot(it) }
    }

    fun isSaved(sourceUrl: String): Boolean = list().any { it.sourceUrl == sourceUrl }

    fun isDriveFileSaved(fileId: String): Boolean = list().any {
        it.source == "drive" && it.sourceUrl.orEmpty().contains("/file/d/$fileId/")
    }

    fun store(
        temp: File,
        title: String,
        fileName: String,
        mime: String,
        source: String,
        sourceUrl: String?,
        courseId: String,
        courseCode: String?,
        courseName: String,
        folder: String?,
    ): SavedFile = synchronized(lock) {
        if (!temp.isFile || temp.length() == 0L) throw IllegalStateException("That file came back empty.")
        if (temp.length() > MAX_DOWNLOAD_BYTES) {
            throw IllegalStateException("That file is too large to save (150 MB limit).")
        }

        val safeName = safeFileName(fileName)
        val previous = readLocked()
        val replaced = previous.filter { old ->
            sourceUrl != null && old.sourceUrl == sourceUrl
        }

        val id = "lib-${System.currentTimeMillis().toString(36)}-${UUID.randomUUID().toString().take(6)}"
        val folderDir = File(root, id)
        if (!folderDir.mkdirs() && !folderDir.isDirectory) {
            throw IllegalStateException("Content Space could not be created on this phone.")
        }
        val target = File(folderDir, safeName)
        try {
            temp.copyTo(target, overwrite = true)
        } catch (exception: Exception) {
            folderDir.deleteRecursively()
            throw IllegalStateException("That file could not be saved to Content Space.")
        } finally {
            temp.delete()
        }

        val entry = SavedFile(
            id = id,
            title = title.ifBlank { safeName.substringBeforeLast('.') },
            fileName = safeName,
            mime = mimeFor(extensionFor(mime, "", safeName), mime),
            size = target.length(),
            source = source,
            sourceUrl = sourceUrl,
            courseId = courseId,
            courseCode = courseCode,
            courseName = courseName,
            folder = folder,
            savedAt = System.currentTimeMillis(),
        )

        // The new copy is safely on disk before the old one is removed.
        for (old in replaced) {
            File(root, old.id).deleteRecursively()
        }
        val kept = previous.filterNot { old -> replaced.any { it.id == old.id } }
        writeLocked(listOf(entry) + kept)
        entry
    }

    fun remove(id: String): Boolean = synchronized(lock) {
        val existing = readLocked()
        if (existing.none { it.id == id }) return@synchronized false
        File(root, id).deleteRecursively()
        writeLocked(existing.filterNot { it.id == id })
        true
    }

    private fun insideRoot(file: File): Boolean = try {
        val base = root.canonicalPath + File.separator
        file.canonicalPath.startsWith(base)
    } catch (_: Exception) {
        false
    }

    private fun readLocked(): MutableList<SavedFile> {
        if (!manifest.isFile) return mutableListOf()
        return try {
            val array = JSONObject(manifest.readText()).optJSONArray("files") ?: JSONArray()
            val files = mutableListOf<SavedFile>()
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val id = item.optString("id")
                val fileName = item.optString("fileName")
                if (!Regex("lib-[A-Za-z0-9-]{6,80}").matches(id) || fileName.isBlank()) continue
                val stored = File(File(root, id), safeFileName(fileName))
                if (!stored.isFile || !insideRoot(stored)) continue
                files += SavedFile(
                    id = id,
                    title = item.optString("title").ifBlank { fileName.substringBeforeLast('.') },
                    fileName = fileName,
                    mime = item.optString("mime").ifBlank { mimeFromName(fileName) },
                    size = stored.length(),
                    source = item.optString("source").ifBlank { "d2l" },
                    sourceUrl = item.optString("sourceUrl").ifBlank { null },
                    courseId = item.optString("courseId").ifBlank { "course" },
                    courseCode = item.optString("courseCode").ifBlank { null },
                    courseName = item.optString("courseName").ifBlank { "My course" },
                    folder = item.optString("folder").ifBlank { null },
                    savedAt = item.optLong("savedAt"),
                )
            }
            files
        } catch (_: Exception) {
            mutableListOf()
        }
    }

    private fun writeLocked(files: List<SavedFile>) {
        val array = JSONArray()
        for (file in files) {
            array.put(
                JSONObject()
                    .put("id", file.id)
                    .put("title", file.title)
                    .put("fileName", file.fileName)
                    .put("mime", file.mime)
                    .put("size", file.size)
                    .put("source", file.source)
                    .put("sourceUrl", file.sourceUrl ?: "")
                    .put("courseId", file.courseId)
                    .put("courseCode", file.courseCode ?: "")
                    .put("courseName", file.courseName)
                    .put("folder", file.folder ?: "")
                    .put("savedAt", file.savedAt),
            )
        }
        val temp = File(app.filesDir, "content-space-index.tmp")
        temp.writeText(JSONObject().put("files", array).toString())
        if (manifest.exists()) manifest.delete()
        if (!temp.renameTo(manifest)) {
            temp.copyTo(manifest, overwrite = true)
            temp.delete()
        }
    }
}
