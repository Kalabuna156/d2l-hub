package com.d2lhub.app.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.d2lhub.app.AppViewModel
import com.d2lhub.app.data.Course
import com.d2lhub.app.data.OutlineFileReader

private val OUTLINE_TYPES = arrayOf(
    "application/pdf",
    "text/plain",
    "text/markdown",
)

@Composable
fun OutlineImportDialog(
    viewModel: AppViewModel,
    course: Course,
    onDismiss: () -> Unit,
    onImported: (added: Int, skipped: Int) -> Unit,
) {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            viewModel.readOutline(course, uri, OutlineFileReader.fileName(context, uri))
        }
    }

    val drafts = viewModel.outlineDrafts
    var selected by remember(drafts) { mutableStateOf(drafts.map { it.id }.toSet()) }
    val busy = viewModel.outlineBusy
    val chosen = drafts.filter { it.id in selected }

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        containerColor = HubColors.SurfaceAlt,
        title = {
            Column {
                Text("Import dates from an outline", color = HubColors.Text)
                if (viewModel.outlineFileName != null) {
                    Spacer(Modifier.height(3.dp))
                    Text(
                        viewModel.outlineFileName!!,
                        color = HubColors.Faint,
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 440.dp).verticalScroll(rememberScrollState()),
            ) {
                if (busy) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(
                            color = HubColors.Violet,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.size(12.dp))
                        Column {
                            Text(
                                if (viewModel.aiSettings.hasKey) "Reading with AI…" else "Reading the file…",
                                color = HubColors.Text,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium,
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                "Dates are only added after you review them.",
                                color = HubColors.Faint,
                                fontSize = 11.sp,
                            )
                        }
                    }
                } else if (drafts.isEmpty()) {
                    Text(
                        "Upload a course outline or syllabus PDF, or a plain text file. Dates are found locally; with an AI key the app also reads messy tables.",
                        color = HubColors.Muted,
                        fontSize = 12.5.sp,
                        lineHeight = 19.sp,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Nothing is added until you tick the dates you want.",
                        color = HubColors.Faint,
                        fontSize = 11.sp,
                        lineHeight = 16.sp,
                    )
                } else {
                    Text(
                        "${drafts.size} dated ${if (drafts.size == 1) "assessment" else "assessments"} found",
                        color = HubColors.Text,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (viewModel.outlineNote != null) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            viewModel.outlineNote!!,
                            color = HubColors.Faint,
                            fontSize = 11.sp,
                            lineHeight = 16.sp,
                        )
                    }

                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "${chosen.size} selected",
                            color = HubColors.Muted,
                            fontSize = 11.5.sp,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            if (chosen.size == drafts.size) "Clear" else "Select all",
                            color = HubColors.VioletLight,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .clickable {
                                    selected = if (chosen.size == drafts.size) {
                                        emptySet()
                                    } else {
                                        drafts.map { it.id }.toSet()
                                    }
                                }
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                        )
                    }

                    Spacer(Modifier.height(4.dp))
                    for (draft in drafts) {
                        DraftRow(
                            title = draft.title,
                            whenText = "${formatDay(draft.startsAt)} · ${formatTime(draft.startsAt)}",
                            detail = draft.detail,
                            checked = draft.id in selected,
                            onToggle = {
                                selected = if (draft.id in selected) {
                                    selected - draft.id
                                } else {
                                    selected + draft.id
                                }
                            },
                        )
                        Spacer(Modifier.height(6.dp))
                    }
                    Spacer(Modifier.height(4.dp))
                    TextButton(
                        onClick = { launcher.launch(OUTLINE_TYPES) },
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
                    ) {
                        Text("Choose a different file", color = HubColors.VioletLight, fontSize = 11.5.sp)
                    }
                }

                if (viewModel.outlineError != null) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        viewModel.outlineError!!,
                        color = HubColors.Rose,
                        fontSize = 11.5.sp,
                        lineHeight = 16.sp,
                    )
                }
                if (drafts.isEmpty() && !busy && viewModel.outlineNote != null) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        viewModel.outlineNote!!,
                        color = HubColors.Faint,
                        fontSize = 11.sp,
                        lineHeight = 16.sp,
                    )
                }
            }
        },
        confirmButton = {
            if (drafts.isEmpty()) {
                Button(
                    onClick = { launcher.launch(OUTLINE_TYPES) },
                    enabled = !busy,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = HubColors.Violet,
                        contentColor = Color.White,
                        disabledContainerColor = HubColors.Violet.copy(alpha = 0.3f),
                        disabledContentColor = Color.White.copy(alpha = 0.5f),
                    ),
                ) {
                    Text(if (viewModel.outlineError == null) "Choose file" else "Try another file")
                }
            } else {
                Button(
                    onClick = {
                        val (added, skipped) = viewModel.importOutline(course, chosen)
                        onImported(added, skipped)
                    },
                    enabled = !busy && chosen.isNotEmpty(),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = HubColors.Violet,
                        contentColor = Color.White,
                        disabledContainerColor = HubColors.Violet.copy(alpha = 0.3f),
                        disabledContentColor = Color.White.copy(alpha = 0.5f),
                    ),
                ) {
                    Text("Add ${chosen.size} ${if (chosen.size == 1) "date" else "dates"}")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) {
                Text("Cancel", color = HubColors.Muted)
            }
        },
    )
}

@Composable
private fun DraftRow(
    title: String,
    whenText: String,
    detail: String,
    checked: Boolean,
    onToggle: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(HubColors.Surface)
            .clickable { onToggle() }
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = { onToggle() },
            colors = CheckboxDefaults.colors(
                checkedColor = HubColors.Violet,
                uncheckedColor = HubColors.Faint,
                checkmarkColor = Color.White,
            ),
        )
        Spacer(Modifier.size(2.dp))
        Column(Modifier.weight(1f).padding(top = 8.dp, end = 4.dp)) {
            Text(
                title,
                color = HubColors.Text,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 17.sp,
            )
            Spacer(Modifier.height(2.dp))
            Text(whenText, color = HubColors.VioletLight, fontSize = 11.sp)
            if (detail.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    detail,
                    color = HubColors.Faint,
                    fontSize = 10.5.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 14.sp,
                )
            }
        }
    }
}
