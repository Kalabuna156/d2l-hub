package com.d2lhub.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.d2lhub.app.AppViewModel
import com.d2lhub.app.data.Course

/**
 * Where an outline is uploaded from: first choose the course, then pick the
 * file. Opening it from inside a course passes [initialCourse] so the picker is
 * skipped.
 */
@Composable
fun OutlineImportFlow(
    viewModel: AppViewModel,
    courses: List<Course>,
    initialCourse: Course? = null,
    onDismiss: () -> Unit,
    onImported: (Course, Int, Int) -> Unit,
) {
    var course by remember { mutableStateOf(initialCourse) }
    val chosenCourse = course

    if (chosenCourse == null) {
        AlertDialog(
            onDismissRequest = onDismiss,
            containerColor = HubColors.SurfaceAlt,
            title = { Text("Import a course outline", color = HubColors.Text) },
            text = {
                Column(
                    modifier = Modifier.heightIn(max = 430.dp).verticalScroll(rememberScrollState()),
                ) {
                    Text(
                        "Choose the course this outline belongs to, then pick its PDF or text file.",
                        color = HubColors.Muted,
                        fontSize = 12.5.sp,
                        lineHeight = 19.sp,
                    )
                    Spacer(Modifier.height(12.dp))

                    if (courses.isEmpty()) {
                        Text(
                            "No courses are loaded yet. Refresh the dashboard once your D2L session is active.",
                            color = HubColors.Faint,
                            fontSize = 12.sp,
                            lineHeight = 18.sp,
                        )
                    } else {
                        for (option in courses.sortedBy { it.name.lowercase() }) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(HubColors.Surface)
                                    .clickable {
                                        viewModel.resetOutline()
                                        course = option
                                    }
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                CourseGlyph(option, 32)
                                Spacer(Modifier.size(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        option.name,
                                        color = HubColors.Text,
                                        fontSize = 12.5.sp,
                                        fontWeight = FontWeight.Medium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        option.code.ifBlank { "Course" },
                                        color = HubColors.Faint,
                                        fontSize = 10.5.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                Text("→", color = HubColors.VioletLight, fontSize = 13.sp)
                            }
                            Spacer(Modifier.height(7.dp))
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = onDismiss) {
                    Text("Cancel", color = HubColors.Muted)
                }
            },
        )
    } else {
        OutlineImportDialog(
            viewModel = viewModel,
            course = chosenCourse,
            onDismiss = onDismiss,
            onImported = { added, skipped -> onImported(chosenCourse, added, skipped) },
        )
    }
}
