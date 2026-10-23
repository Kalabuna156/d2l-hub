package com.d2lhub.app.ui

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.d2lhub.app.AppViewModel
import com.d2lhub.app.data.Course
import com.d2lhub.app.data.GradeItem

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CourseGradesView(
    viewModel: AppViewModel,
    course: Course,
    onOpenLink: (String) -> Unit,
) {
    LaunchedEffect(course.id) { viewModel.loadGrades(course) }
    val grades = viewModel.courseGrades

    if (viewModel.gradesLoading && grades == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = HubColors.Violet)
        }
        return
    }

    if (grades == null) {
        Column(Modifier.padding(20.dp)) {
            ErrorBanner(
                viewModel.gradesError ?: "Could not load the gradebook.",
                onRetry = { viewModel.loadGrades(course, force = true) },
            )
        }
        return
    }

    val graded = grades.items.count { percentageOf(it.grade) != null }

    PullToRefreshBox(
        isRefreshing = viewModel.gradesLoading,
        onRefresh = { viewModel.loadGrades(course, force = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            "Grade breakdown",
                            color = HubColors.Text,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            "$graded of ${grades.items.size} items graded",
                            color = HubColors.Faint,
                            fontSize = 11.sp,
                        )
                    }
                    Text(
                        "Open in D2L →",
                        color = HubColors.VioletLight,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { onOpenLink(grades.gradesUrl) }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }
            item { Spacer(Modifier.height(2.dp)) }

            if (viewModel.gradesError != null) {
                item {
                    ErrorBanner(
                        viewModel.gradesError!!,
                        onRetry = { viewModel.loadGrades(course, force = true) },
                    )
                }
            }

            if (grades.items.isEmpty()) {
                item {
                    EmptyState(
                        "No grade items yet",
                        "D2L shows nothing in this course's gradebook. Check back after the first assessment is graded.",
                    )
                }
            } else {
                items(grades.items, key = { it.id }) { item ->
                    GradeRow(item, onClick = { item.url?.let(onOpenLink) })
                }
                item {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Totals match what D2L shows; ungraded items stay in the list so you can see what's ahead.",
                        color = HubColors.Faint,
                        fontSize = 10.5.sp,
                        lineHeight = 15.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun GradeRow(item: GradeItem, onClick: () -> Unit) {
    val tone = gradeTone(item.grade)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(if (item.isGroup) 14.dp else 11.dp))
            .background(if (item.isGroup) HubColors.SurfaceAlt else HubColors.Surface)
            .then(if (item.url != null) Modifier.clickable { onClick() } else Modifier)
            .padding(
                start = (14 + item.depth.coerceAtMost(2) * 14).dp,
                end = 14.dp,
                top = if (item.isGroup) 12.dp else 10.dp,
                bottom = if (item.isGroup) 12.dp else 10.dp,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                item.name,
                color = HubColors.Text,
                fontSize = if (item.isGroup) 13.5.sp else 12.5.sp,
                fontWeight = if (item.isGroup) FontWeight.SemiBold else FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 17.sp,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                detailLine(item),
                color = if (item.comment != null) HubColors.Muted else HubColors.Faint,
                fontSize = 10.5.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 14.sp,
            )
        }
        Spacer(Modifier.size(10.dp))
        GradeChip(item.grade, tone)
        if (item.url != null) {
            Spacer(Modifier.size(8.dp))
            Text("→", color = HubColors.VioletLight, fontSize = 13.sp)
        }
    }
}

@Composable
private fun GradeChip(grade: String?, tone: Color) {
    val label = grade?.trim()
    val shown = if (label.isNullOrBlank() || label == "- %") "—" else label
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(tone.copy(alpha = 0.16f))
            .padding(horizontal = 9.dp, vertical = 5.dp),
    ) {
        Text(
            shown,
            color = tone,
            fontSize = 11.5.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun detailLine(item: GradeItem): String {
    val parts = mutableListOf<String>()
    if (!item.achieved.isNullOrBlank()) parts += item.achieved
    else if (!item.points.isNullOrBlank()) parts += "${item.points} possible"
    if (!item.comment.isNullOrBlank()) parts += item.comment
    return if (parts.isEmpty()) "Not graded yet" else parts.joinToString(" · ")
}

/** D2L writes \"26 %\"; ungraded rows carry \"- %\", which has no number to read. */
private fun percentageOf(grade: String?): Double? =
    Regex("(\\d+(?:\\.\\d+)?)\\s*%").find(grade.orEmpty())
        ?.groupValues?.get(1)?.toDoubleOrNull()

private fun gradeTone(grade: String?): Color {
    val pct = percentageOf(grade) ?: return HubColors.Faint
    return when {
        pct >= 80 -> HubColors.Green
        pct >= 60 -> HubColors.VioletLight
        pct >= 50 -> HubColors.Amber
        else -> HubColors.Rose
    }
}
