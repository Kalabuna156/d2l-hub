package com.d2lhub.app.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.geometry.Offset
import com.d2lhub.app.data.AppearanceSettings
import com.d2lhub.app.data.AppearanceStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class BackdropGlow(
    val color: Color,
    val x: Float,
    val y: Float,
    val radius: Float,
    val alpha: Float,
)

data class BackdropPreset(
    val id: String,
    val label: String,
    val hint: String,
    val base: Color,
    val glows: List<BackdropGlow> = emptyList(),
)

/**
 * These are drawn instead of bundled images: no downloads, no licences and
 * almost no APK weight. A picked photo is the only bitmap involved.
 */
val BACKDROP_PRESETS = listOf(
    BackdropPreset(
        id = AppearanceStore.NOIR,
        label = "Noir",
        hint = "Flat and quiet",
        base = Color(0xFF07080D),
    ),
    BackdropPreset(
        id = "aurora",
        label = "Aurora",
        hint = "Violet and sky",
        base = Color(0xFF07080D),
        glows = listOf(
            BackdropGlow(Color(0xFF6D28D9), x = 0.2f, y = 0.18f, radius = 0.78f, alpha = 0.22f),
            BackdropGlow(Color(0xFF0EA5E9), x = 0.82f, y = 0.4f, radius = 0.72f, alpha = 0.12f),
        ),
    ),
    BackdropPreset(
        id = "sunset",
        label = "Sunset",
        hint = "Rose and amber",
        base = Color(0xFF120B0D),
        glows = listOf(
            BackdropGlow(Color(0xFFBE185D), x = 0.8f, y = 0.32f, radius = 0.74f, alpha = 0.2f),
            BackdropGlow(Color(0xFFB45309), x = 0.22f, y = 0.16f, radius = 0.76f, alpha = 0.15f),
        ),
    ),
    BackdropPreset(
        id = "ocean",
        label = "Ocean",
        hint = "Teal and deep blue",
        base = Color(0xFF06090F),
        glows = listOf(
            BackdropGlow(Color(0xFF0F766E), x = 0.24f, y = 0.2f, radius = 0.78f, alpha = 0.2f),
            BackdropGlow(Color(0xFF1D4ED8), x = 0.78f, y = 0.46f, radius = 0.72f, alpha = 0.15f),
        ),
    ),
    BackdropPreset(
        id = "meadow",
        label = "Meadow",
        hint = "Green and lime",
        base = Color(0xFF070B07),
        glows = listOf(
            BackdropGlow(Color(0xFF15803D), x = 0.2f, y = 0.24f, radius = 0.76f, alpha = 0.22f),
            BackdropGlow(Color(0xFF65A30D), x = 0.8f, y = 0.36f, radius = 0.72f, alpha = 0.14f),
        ),
    ),
    BackdropPreset(
        id = "voltage",
        label = "Voltage",
        hint = "Electric yellow and red",
        base = Color(0xFF0A0705),
        glows = listOf(
            BackdropGlow(Color(0xFFFACC15), x = 0.16f, y = 0.14f, radius = 0.7f, alpha = 0.22f),
            BackdropGlow(Color(0xFFDC2626), x = 0.84f, y = 0.72f, radius = 0.78f, alpha = 0.18f),
        ),
    ),
)

fun backdropLabel(settings: AppearanceSettings): String =
    if (settings.backgroundId == AppearanceStore.PHOTO) {
        "Your photo"
    } else {
        BACKDROP_PRESETS.firstOrNull { it.id == settings.backgroundId }?.label ?: "Noir"
    }

@Composable
fun HubBackground(settings: AppearanceSettings, modifier: Modifier = Modifier) {
    val hasPhoto =
        settings.backgroundId == AppearanceStore.PHOTO && !settings.photoPath.isNullOrBlank()
    val preset = BACKDROP_PRESETS.firstOrNull { it.id == settings.backgroundId }
        ?: BACKDROP_PRESETS.first()

    Box(modifier.fillMaxSize().background(preset.base)) {
        when {
            hasPhoto -> PhotoBackdrop(settings.photoPath!!, settings.photoVersion)
            else -> PresetBackdrop(preset)
        }
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    0f to Color.Black.copy(alpha = 0.35f),
                    0.24f to Color.Transparent,
                    0.8f to Color.Transparent,
                    1f to Color.Black.copy(alpha = 0.3f),
                ),
            ),
        )
    }
}

@Composable
fun PresetBackdrop(
    preset: BackdropPreset,
    modifier: Modifier = Modifier,
    intensity: Float = 1f,
) {
    Canvas(modifier.fillMaxSize()) {
        drawRect(preset.base)
        preset.glows.forEach { glow ->
            drawRect(
                brush = Brush.radialGradient(
                    colors = listOf(
                        glow.color.copy(alpha = (glow.alpha * intensity).coerceAtMost(0.85f)),
                        Color.Transparent,
                    ),
                    center = Offset(size.width * glow.x, size.height * glow.y),
                    radius = size.maxDimension * glow.radius,
                ),
            )
        }
    }
}

@Composable
private fun PhotoBackdrop(path: String, version: Long) {
    val bitmap by produceState<android.graphics.Bitmap?>(initialValue = null, path, version) {
        value = withContext(Dispatchers.IO) {
            runCatching { BitmapFactory.decodeFile(path) }.getOrNull()
        }
    }

    bitmap?.let { image ->
        Image(
            bitmap = image.asImageBitmap(),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
    }
    // The scrim keeps white text readable over bright or busy wallpapers.
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.55f)))
}

/** A small, slightly richer preview for the appearance picker. */
@Composable
fun BackdropPreview(preset: BackdropPreset, modifier: Modifier = Modifier) {
    Box(modifier) {
        PresetBackdrop(preset, intensity = 1.8f)
    }
}
