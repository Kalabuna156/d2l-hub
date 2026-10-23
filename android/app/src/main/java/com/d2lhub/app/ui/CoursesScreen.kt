package com.d2lhub.app.ui

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.d2lhub.app.AppViewModel
import com.d2lhub.app.data.Course

@Composable
fun CoursesScreen(
    viewModel: AppViewModel,
    onOpenCourse: (Course) -> Unit,
    onOpenLink: (String) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var showImport by remember { mutableStateOf(false) }
    var libraryTab by remember { mutableStateOf(-1) }
    val context = LocalContext.current
    val filtered = viewModel.courses.filter { course ->
        query.isBlank() ||
            course.name.contains(query, ignoreCase = true) ||
            course.code.contains(query, ignoreCase = true)
    }

    if (libraryTab >= 0) {
        LibraryScreen(
            viewModel = viewModel,
            initialTab = libraryTab,
            onBack = { libraryTab = -1 },
            onOpenLink = onOpenLink,
        )
        return
    }

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Courses",
                    color = HubColors.Text,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                Text("${viewModel.courses.size}", color = HubColors.Faint, fontSize = 13.sp)
                Spacer(Modifier.size(10.dp))
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(9.dp))
                        .background(HubColors.Violet.copy(alpha = 0.16f))
                        .clickable { showImport = true }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("↑", color = HubColors.VioletLight, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.size(4.dp))
                    Text("Import", color = HubColors.VioletLight, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Search courses", color = HubColors.Faint, fontSize = 13.sp) },
                singleLine = true,
                leadingIcon = {
                    Icon(Icons.Default.Search, contentDescription = null, tint = HubColors.Faint)
                },
                shape = RoundedCornerShape(12.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = HubColors.Violet,
                    unfocusedBorderColor = HubColors.Border,
                    focusedContainerColor = HubColors.Surface,
                    unfocusedContainerColor = HubColors.Surface,
                    cursorColor = HubColors.VioletLight,
                ),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(9.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LibraryShortcut(
                    title = "Content Space",
                    subtitle = if (viewModel.savedFiles.isEmpty()) {
                        "Saved course files"
                    } else {
                        "${viewModel.savedFiles.size} saved ${if (viewModel.savedFiles.size == 1) "file" else "files"}"
                    },
                    glyph = "▤",
                    tint = HubColors.Violet,
                    modifier = Modifier.weight(1f),
                    onClick = { libraryTab = 0 },
                )
                LibraryShortcut(
                    title = "Exam bank",
                    subtitle = "MUES past exams",
                    glyph = "★",
                    tint = HubColors.Amber,
                    modifier = Modifier.weight(1f),
                    onClick = { libraryTab = 1 },
                )
            }
        }

        if (filtered.isEmpty()) {
            Column(Modifier.padding(20.dp)) {
                EmptyState(
                    if (viewModel.courses.isEmpty()) "No courses yet" else "No matches",
                    if (viewModel.courses.isEmpty()) {
                        "Pull the dashboard refresh once your D2L session is active."
                    } else {
                        "Try a different course name or code."
                    },
                )
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 28.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(filtered, key = { it.id }) { course ->
                    CourseTile(course, viewModel) { onOpenCourse(course) }
                }
            }
        }
    }

    if (showImport) {
        OutlineImportFlow(
            viewModel = viewModel,
            courses = viewModel.courses,
            onDismiss = { showImport = false },
            onImported = { course, added, skipped ->
                val label = course.code.ifBlank { course.name }
                val message = when {
                    added == 0 -> "No new dates were added for $label."
                    skipped > 0 -> "Added $added dates to $label ($skipped already there)."
                    else -> "Added $added dates to $label."
                }
                Toast.makeText(context, message, Toast.LENGTH_LONG).show()
                showImport = false
            },
        )
    }
}

@Composable
private fun LibraryShortcut(
    title: String,
    subtitle: String,
    glyph: String,
    tint: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(13.dp))
            .background(HubColors.Surface)
            .clickable { onClick() }
            .padding(horizontal = 11.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(30.dp)
                .clip(RoundedCornerShape(9.dp))
                .background(tint.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(glyph, color = tint, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.size(9.dp))
        Column(Modifier.weight(1f)) {
            Text(
                title,
                color = HubColors.Text,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                subtitle,
                color = HubColors.Faint,
                fontSize = 9.5.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun CourseTile(course: Course, viewModel: AppViewModel, onClick: () -> Unit) {
    val due = viewModel.deadlines.count {
        it.courseCode != null && it.courseCode == course.code && (it.startsAt ?: 0L) >= System.currentTimeMillis()
    }

    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(18.dp))
            .background(HubColors.Surface)
            .clickable { onClick() }
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CourseGlyph(course, 36)
            Spacer(Modifier.weight(1f))
            if (due > 0) {
                Text(
                    "$due due",
                    color = HubColors.Amber,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(HubColors.Amber.copy(alpha = 0.12f))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Text(
            course.name,
            color = HubColors.Text,
            fontSize = 13.5.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            lineHeight = 18.sp,
        )
        Spacer(Modifier.height(5.dp))
        Text(
            course.code.ifBlank { "Course" },
            color = HubColors.Faint,
            fontSize = 10.5.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.size(2.dp))
    }
}
