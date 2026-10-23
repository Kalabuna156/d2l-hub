package com.d2lhub.app.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper

/**
 * Reads the text layer of a picked PDF, or a plain text outline. Everything
 * stays on the phone; only the text goes to the AI provider when one is set.
 */
object OutlineFileReader {
    private const val MAX_BYTES = 8 * 1024 * 1024
    private const val MAX_TEXT = 60_000

    fun fileName(context: Context, uri: Uri): String? = runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
    }.getOrNull()

    fun read(context: Context, uri: Uri, fileName: String?): String {
        val resolver = context.contentResolver
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw IllegalStateException("That file could not be opened.")
        if (bytes.isEmpty()) throw IllegalStateException("That file is empty.")
        if (bytes.size > MAX_BYTES) {
            throw IllegalStateException("That file is too large. Use an outline under 8 MB.")
        }

        val mime = resolver.getType(uri).orEmpty()
        val header = String(bytes, 0, minOf(5, bytes.size), Charsets.ISO_8859_1)
        val isPdf = mime.contains("pdf", ignoreCase = true) ||
            header == "%PDF-" ||
            fileName?.endsWith(".pdf", ignoreCase = true) == true

        val text = if (isPdf) pdfText(bytes) else String(bytes, Charsets.UTF_8)
        if (text.isBlank()) {
            throw IllegalStateException(
                "No text was found in that file. A scanned PDF has no text layer — export it as text or upload a digital outline.",
            )
        }
        return text.trim().take(MAX_TEXT)
    }

    private fun pdfText(bytes: ByteArray): String {
        val document = try {
            PDDocument.load(bytes)
        } catch (_: Exception) {
            throw IllegalStateException("That PDF could not be opened. It may be password-protected.")
        }

        return try {
            document.use { PDFTextStripper().getText(it).orEmpty() }
        } catch (_: Exception) {
            throw IllegalStateException("Could not read that PDF. Try exporting it as text.")
        }
    }
}
