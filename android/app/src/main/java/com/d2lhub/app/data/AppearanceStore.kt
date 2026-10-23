package com.d2lhub.app.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max

data class AppearanceSettings(
    /** A preset id such as "aurora", or "photo" for the student's own image. */
    val backgroundId: String = AppearanceStore.NOIR,
    val photoPath: String? = null,
    /** Changes whenever a new photo is saved, so the image is decoded again. */
    val photoVersion: Long = 0L,
)

/**
 * The chosen backdrop is a display preference, not a secret, so plain
 * preferences are enough. A picked photo is copied into the app's private
 * files directory, downscaled and rotated upright.
 */
class AppearanceStore(context: Context) {
    private val app = context.applicationContext
    private val prefs = app.getSharedPreferences("d2l-hub-appearance", Context.MODE_PRIVATE)
    private val photoFile = File(app.filesDir, "appearance-background.jpg")

    fun read(): AppearanceSettings {
        val stored = prefs.getString(KEY_BACKGROUND, NOIR) ?: NOIR
        val hasPhoto = photoFile.isFile && photoFile.length() > 0
        val id = if (stored == PHOTO && !hasPhoto) NOIR else stored
        return AppearanceSettings(
            backgroundId = id,
            photoPath = if (hasPhoto) photoFile.absolutePath else null,
            photoVersion = if (hasPhoto) prefs.getLong(KEY_PHOTO_VERSION, 0L) else 0L,
        )
    }

    fun select(id: String) {
        if (id == PHOTO && !photoFile.isFile) return
        prefs.edit().putString(KEY_BACKGROUND, id).apply()
    }

    /** Copy the picked image into app storage, upright and no larger than 1600 px. */
    fun importPhoto(uri: Uri) {
        val resolver = app.contentResolver
        val orientation = resolver.openInputStream(uri)?.use { stream ->
            runCatching {
                ExifInterface(stream).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL,
                )
            }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        } ?: ExifInterface.ORIENTATION_NORMAL

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            throw IllegalStateException("That image could not be read. Try a JPG or PNG.")
        }

        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_EDGE) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val decoded = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, options)
        } ?: throw IllegalStateException("That image could not be read.")

        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                matrix.postRotate(90f)
                matrix.postScale(-1f, 1f)
            }

            ExifInterface.ORIENTATION_TRANSVERSE -> {
                matrix.postRotate(270f)
                matrix.postScale(-1f, 1f)
            }
        }

        var upright = if (matrix.isIdentity) {
            decoded
        } else {
            Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        }
        if (upright !== decoded) decoded.recycle()

        val longEdge = max(upright.width, upright.height)
        if (longEdge > MAX_EDGE) {
            val scale = MAX_EDGE.toFloat() / longEdge
            val scaled = Bitmap.createScaledBitmap(
                upright,
                (upright.width * scale).toInt().coerceAtLeast(1),
                (upright.height * scale).toInt().coerceAtLeast(1),
                true,
            )
            if (scaled !== upright) upright.recycle()
            upright = scaled
        }

        val temp = File(app.filesDir, "appearance-background.tmp")
        try {
            FileOutputStream(temp).use { out ->
                if (!upright.compress(Bitmap.CompressFormat.JPEG, 88, out)) {
                    throw IllegalStateException("That image could not be saved.")
                }
            }
            if (photoFile.exists() && !photoFile.delete()) {
                throw IllegalStateException("The old background could not be replaced.")
            }
            if (!temp.renameTo(photoFile)) {
                temp.copyTo(photoFile, overwrite = true)
            }
            val nextVersion = prefs.getLong(KEY_PHOTO_VERSION, 0L) + 1L
            prefs.edit()
                .putString(KEY_BACKGROUND, PHOTO)
                .putLong(KEY_PHOTO_VERSION, nextVersion)
                .apply()
        } finally {
            if (!upright.isRecycled) upright.recycle()
            temp.delete()
        }
    }

    fun clearPhoto() {
        photoFile.delete()
        if ((prefs.getString(KEY_BACKGROUND, NOIR) ?: NOIR) == PHOTO) {
            prefs.edit().putString(KEY_BACKGROUND, NOIR).apply()
        }
    }

    companion object {
        const val NOIR = "noir"
        const val PHOTO = "photo"
        private const val KEY_BACKGROUND = "background"
        private const val KEY_PHOTO_VERSION = "photoVersion"
        private const val MAX_EDGE = 1600
    }
}
