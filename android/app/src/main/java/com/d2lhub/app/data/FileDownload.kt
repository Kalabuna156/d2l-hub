package com.d2lhub.app.data

import java.io.File

/** Upload and download limits match the desktop app: 150 MB per file. */
const val MAX_DOWNLOAD_BYTES: Long = 150L * 1024 * 1024

data class DownloadedFile(
    /** A temporary file; the Content Space store moves it into place. */
    val file: File,
    val fileName: String,
    val mime: String,
    val size: Long,
)

private val MIME_EXT = mapOf(
    "application/pdf" to "pdf",
    "application/msword" to "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" to "docx",
    "application/vnd.ms-powerpoint" to "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation" to "pptx",
    "application/vnd.ms-excel" to "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" to "xlsx",
    "application/zip" to "zip",
    "application/x-zip-compressed" to "zip",
    "text/plain" to "txt",
    "text/csv" to "csv",
    "image/png" to "png",
    "image/jpeg" to "jpg",
    "image/gif" to "gif",
    "image/webp" to "webp",
    "video/mp4" to "mp4",
    "audio/mpeg" to "mp3",
    "application/rtf" to "rtf",
)

private val EXT_MIME = mapOf(
    "pdf" to "application/pdf",
    "doc" to "application/msword",
    "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "ppt" to "application/vnd.ms-powerpoint",
    "pptx" to "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "xls" to "application/vnd.ms-excel",
    "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "zip" to "application/zip",
    "txt" to "text/plain",
    "csv" to "text/csv",
    "png" to "image/png",
    "jpg" to "image/jpeg",
    "jpeg" to "image/jpeg",
    "gif" to "image/gif",
    "webp" to "image/webp",
    "mp4" to "video/mp4",
    "mp3" to "audio/mpeg",
    "rtf" to "application/rtf",
)

fun safeFileName(value: String): String {
    val cleaned = value
        .replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "-")
        .replace(Regex("\\s+"), " ")
        .trim()
        .take(110)
    return cleaned.ifBlank { "file" }
}

fun extensionFrom(value: String): String? =
    Regex("\\.([A-Za-z0-9]{2,5})(?:$|[?#])").find(value.trim())
        ?.groupValues?.get(1)?.lowercase()

fun extensionFor(mime: String, url: String, name: String): String {
    val declared = mime.substringBefore(';').trim().lowercase()
    MIME_EXT[declared]?.let { return it }
    return extensionFrom(url) ?: extensionFrom(name) ?: "bin"
}

fun mimeFor(extension: String, declared: String): String {
    val clean = declared.substringBefore(';').trim().lowercase()
    if (clean.isNotBlank() && clean != "application/octet-stream") return clean
    return EXT_MIME[extension.lowercase()] ?: "application/octet-stream"
}

fun mimeFromName(name: String): String =
    EXT_MIME[extensionFrom(name).orEmpty()] ?: "application/octet-stream"

/** Reads both the plain `filename=` and the RFC 5987 `filename*=` forms. */
fun dispositionName(header: String?): String? {
    if (header.isNullOrBlank()) return null
    Regex("filename\\*=UTF-8''([^;]+)", RegexOption.IGNORE_CASE).find(header)?.let { match ->
        runCatching { java.net.URLDecoder.decode(match.groupValues[1], "UTF-8") }
            .getOrNull()?.let { return it }
    }
    return Regex("filename=\"?([^\";]+)\"?", RegexOption.IGNORE_CASE).find(header)
        ?.groupValues?.get(1)
}

fun isPdf(mime: String, fileName: String): Boolean =
    mime.equals("application/pdf", ignoreCase = true) || fileName.endsWith(".pdf", ignoreCase = true)
