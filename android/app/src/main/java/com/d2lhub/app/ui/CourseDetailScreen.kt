package com.d2lhub.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
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
import com.d2lhub.app.data.Announcement
import com.d2lhub.app.data.Course

@Composable
fun CourseDetailScreen(
    viewModel: AppViewModel,
    course: Course,
    onBack: () -> Unit,
    onOpenLink: (String) -> Unit,
) {
    var tab by remember(course.id) { mutableStateOf(0) }
    var showOutline by remember(course.id) { mutableStateOf(false) }
    var outlineNotice by remember(course.id) { mutableStateOf<String?>(null) }
    val detail = viewModel.courseDetail?.takeIf { it.course.id == course.id }
    val due = viewModel.deadlines.filter {
        it.courseCode != null &&
            (it.courseCode == course.code || (course.code.isBlank() && it.courseCode == course.name))
    }
    val announcements = detail?.announcements.orEmpty()

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 4.dp, end = 16.dp, top = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = HubColors.Text)
            }
            CourseGlyph(course, 34)
            Spacer(Modifier.size(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    course.name,
                    color = HubColors.Text,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    course.code.ifBlank { "Course" },
                    color = HubColors.Faint,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.size(8.dp))
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(HubColors.Violet.copy(alpha = 0.18f))
                    .clickable {
                        viewModel.resetOutline()
                        showOutline = true
                    }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("↑", color = HubColors.VioletLight, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.size(4.dp))
                Text("Import", color = HubColors.VioletLight, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            TabPill("Announcements", announcements.size, tab == 0) { tab = 0 }
            TabPill("Due dates", due.size, tab == 1) { tab = 1 }
            TabPill("Content", viewModel.courseContent?.topics?.size ?: 0, tab == 2) { tab = 2 }
            TabPill("Grades", viewModel.courseGrades?.items?.size ?: 0, tab == 3) { tab = 3 }
        }

        when {
            detail == null || (detail.loading && tab == 0) -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = HubColors.Violet)
                }
            }

            detail.error != null && tab == 0 -> {
                Column(Modifier.padding(20.dp)) {
                    ErrorBanner(detail.error, onRetry = { viewModel.openCourse(course) })
                }
            }

            tab == 0 -> {
                if (announcements.isEmpty()) {
                    Column(Modifier.padding(20.dp)) {
                        EmptyState("No announcements", "This course hasn't posted anything yet.")
                    }
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 28.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(announcements, key = { it.id }) { announcement ->
                            AnnouncementCard(announcement, onOpenLink)
                        }
                    }
                }
            }

            tab == 2 -> CourseContentView(viewModel, course, onOpenLink)

            tab == 3 -> CourseGradesView(viewModel, course, onOpenLink)

            else -> {
                LazyColumn(
                    contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 28.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    item {
                        OutlineImportCard(
                            onClick = {
                                viewModel.resetOutline()
                                showOutline = true
                            },
                        )
                    }
                    if (outlineNotice != null) {
                        item {
                            Text(
                                outlineNotice!!,
                                color = HubColors.Green,
                                fontSize = 11.5.sp,
                                lineHeight = 16.sp,
                            )
                        }
                    }
                    if (due.isEmpty()) {
                        item {
                            EmptyState(
                                "No due dates found",
                                "D2L's calendar doesn't show a date tied to this course's code yet. An imported outline can fill the gaps.",
                            )
                        }
                    } else {
                        items(due, key = { it.id + (it.startsAt ?: 0L) }) { deadline ->
                            DeadlineRow(
                                deadline,
                                showCourse = false,
                                onClick = { if (deadline.url.isNotBlank()) onOpenLink(deadline.url) },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showOutline) {
        OutlineImportDialog(
            viewModel = viewModel,
            course = course,
            onDismiss = { showOutline = false },
            onImported = { added, skipped ->
                outlineNotice = when {
                    added == 0 -> "No new dates were added — they may already be there."
                    skipped > 0 -> "Added $added dates from the outline ($skipped already there)."
                    else -> "Added $added due dates from the outline."
                }
                showOutline = false
            },
        )
    }
}

@Composable
private fun OutlineImportCard(onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(HubColors.Surface)
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(RoundedCornerShape(11.dp))
                .background(HubColors.Violet.copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center,
        ) {
            Text("↑", color = HubColors.VioletLight, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.size(11.dp))
        Column(Modifier.weight(1f)) {
            Text(
                "Import from outline",
                color = HubColors.Text,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                "PDF or text · review dates before adding",
                color = HubColors.Faint,
                fontSize = 11.sp,
            )
        }
        Text("→", color = HubColors.VioletLight, fontSize = 14.sp)
    }
}

@Composable
private fun TabPill(label: String, count: Int, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) HubColors.Violet.copy(alpha = 0.22f) else HubColors.Surface)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            color = if (selected) HubColors.VioletLight else HubColors.Muted,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
        )
        Spacer(Modifier.size(6.dp))
        Text(
            count.toString(),
            color = if (selected) HubColors.VioletLight else HubColors.Faint,
            fontSize = 11.sp,
        )
    }
}

@Composable
private fun AnnouncementCard(announcement: Announcement, onOpenLink: (String) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(HubColors.Surface)
            .padding(16.dp),
    ) {
        Text(
            announcement.title,
            color = HubColors.Text,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            lineHeight = 19.sp,
        )
        if (announcement.publishedAt != null) {
            Spacer(Modifier.height(4.dp))
            Text(formatDay(announcement.publishedAt), color = HubColors.Faint, fontSize = 11.sp)
        }
        if (announcement.body.isNotBlank()) {
            Spacer(Modifier.height(8.dp))
            Text(
                announcement.body,
                color = HubColors.Muted,
                fontSize = 12.sp,
                lineHeight = 18.sp,
                maxLines = 7,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "Open in D2L →",
            color = HubColors.VioletLight,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .clickable { onOpenLink(announcement.url) }
                .padding(vertical = 4.dp),
        )
    }
}
