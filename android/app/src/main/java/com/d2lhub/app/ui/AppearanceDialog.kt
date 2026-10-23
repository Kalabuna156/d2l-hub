package com.d2lhub.app.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.d2lhub.app.AppViewModel
import com.d2lhub.app.data.AppearanceStore

@Composable
fun AppearanceDialog(viewModel: AppViewModel, onDismiss: () -> Unit) {
    val appearance = viewModel.appearance
    val busy = viewModel.appearanceBusy
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) viewModel.useBackgroundPhoto(uri)
    }

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        containerColor = HubColors.SurfaceAlt,
        title = { Text("Appearance", color = HubColors.Text) },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 470.dp).verticalScroll(rememberScrollState()),
            ) {
                Text(
                    "Pick a backdrop, or use any photo from your gallery. Photos are dimmed so the text stays readable.",
                    color = HubColors.Muted,
                    fontSize = 12.5.sp,
                    lineHeight = 18.sp,
                )

                Spacer(Modifier.height(14.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    BACKDROP_PRESETS.chunked(2).forEach { rowPresets ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            rowPresets.forEach { preset ->
                                Box(Modifier.weight(1f)) {
                                    BackdropTile(
                                        preset = preset,
                                        selected = appearance.backgroundId == preset.id,
                                        enabled = !busy,
                                        onClick = { viewModel.selectBackground(preset.id) },
                                    )
                                }
                            }
                            if (rowPresets.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "YOUR PHOTO",
                        color = HubColors.Faint,
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 1.1.sp,
                        modifier = Modifier.weight(1f),
                    )
                    if (appearance.backgroundId == AppearanceStore.PHOTO) {
                        Text("IN USE", color = HubColors.Green, fontSize = 9.5.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Spacer(Modifier.height(2.dp))
                TextButton(
                    onClick = {
                        picker.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                        )
                    },
                    enabled = !busy,
                ) {
                    Text(
                        if (appearance.photoPath == null) "Choose from gallery" else "Choose a different photo",
                        color = HubColors.VioletLight,
                        fontSize = 12.sp,
                    )
                }

                if (appearance.photoPath != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (appearance.backgroundId != AppearanceStore.PHOTO) {
                            TextButton(
                                onClick = { viewModel.selectBackground(AppearanceStore.PHOTO) },
                                enabled = !busy,
                            ) {
                                Text("Use your photo", color = HubColors.VioletLight, fontSize = 12.sp)
                            }
                        }
                        Spacer(Modifier.weight(1f))
                        TextButton(
                            onClick = { viewModel.removeBackgroundPhoto() },
                            enabled = !busy,
                        ) {
                            Text("Remove photo", color = HubColors.Rose, fontSize = 12.sp)
                        }
                    }
                }

                if (busy) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(
                            color = HubColors.Violet,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.size(10.dp))
                        Text("Preparing your photo…", color = HubColors.Muted, fontSize = 12.sp)
                    }
                }

                if (viewModel.appearanceError != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        viewModel.appearanceError!!,
                        color = HubColors.Rose,
                        fontSize = 11.5.sp,
                        lineHeight = 16.sp,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss, enabled = !busy) {
                Text("Done", color = HubColors.VioletLight)
            }
        },
    )
}

@Composable
private fun BackdropTile(
    preset: BackdropPreset,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) HubColors.Violet.copy(alpha = 0.18f) else HubColors.Surface)
            .clickable(enabled = enabled) { onClick() }
            .padding(6.dp),
    ) {
        val shape = RoundedCornerShape(8.dp)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp)
                .clip(shape)
                .border(
                    width = if (selected) 1.5.dp else 1.dp,
                    color = if (selected) HubColors.VioletLight else HubColors.Border,
                    shape = shape,
                ),
        ) {
            BackdropPreview(preset)
        }
        Spacer(Modifier.height(5.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                preset.label,
                color = if (selected) HubColors.VioletLight else HubColors.Text,
                fontSize = 11.5.sp,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (selected) {
                Text("✓", color = HubColors.VioletLight, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
        Text(
            preset.hint,
            color = HubColors.Faint,
            fontSize = 9.5.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
