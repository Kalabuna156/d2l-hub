package com.d2lhub.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

object HubColors {
    val Background = Color(0xFF07080D)
    val Surface = Color(0xFF0E1119)
    val SurfaceAlt = Color(0xFF151A26)
    val Border = Color(0xFF232A38)
    val Text = Color(0xFFE9EDF5)
    val Muted = Color(0xFF8D97AA)
    val Faint = Color(0xFF646E80)
    val Violet = Color(0xFF8B5CF6)
    val VioletLight = Color(0xFFB69CFF)
    val Indigo = Color(0xFF4F46E5)
    val Green = Color(0xFF6EE7B7)
    val Amber = Color(0xFFFBBF7A)
    val Rose = Color(0xFFFDA4AF)
}

private val DarkScheme = darkColorScheme(
    primary = HubColors.VioletLight,
    onPrimary = Color(0xFF14082B),
    primaryContainer = HubColors.Violet,
    onPrimaryContainer = Color.White,
    secondary = HubColors.Indigo,
    onSecondary = Color.White,
    background = HubColors.Background,
    onBackground = HubColors.Text,
    surface = HubColors.Surface,
    onSurface = HubColors.Text,
    surfaceVariant = HubColors.SurfaceAlt,
    onSurfaceVariant = HubColors.Muted,
    outline = HubColors.Border,
    outlineVariant = HubColors.Border,
    error = HubColors.Rose,
    onError = Color(0xFF2A0910),
)

private val HubTypography = Typography()

@Composable
fun D2lHubTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkScheme,
        typography = HubTypography,
        content = content,
    )
}
