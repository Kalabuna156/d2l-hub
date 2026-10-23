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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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

@Composable
fun DashboardScreen(
    viewModel: AppViewModel,
    onOpenCourse: (Course) -> Unit,
    onOpenLink: (String) -> Unit,
    onOpenSettings: () -> Unit,
) {
    val now = System.currentTimeMillis()
    val dated = viewModel.deadlines.filter { it.startsAt != null }
    val upcoming = dated.filter { (it.startsAt ?: 0L) >= now }
    val next = upcoming.minByOrNull { it.startsAt ?: Long.MAX_VALUE }
    val week = upcoming.filter { (it.startsAt ?: Long.MAX_VALUE) <= now + 7L * 86_400_000L }
    val overdue = dated.filter { (it.startsAt ?: 0L) < now }
    val name = viewModel.profile?.name ?: viewModel.session?.userName

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(greeting(), color = HubColors.Muted, fontSize = 13.sp)
                    Spacer(Modifier.height(2.dp))
                    Text(
                        name?.takeIf { it.isNotBlank() } ?: "Your dashboard",
                        color = HubColors.Text,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(HubColors.Violet.copy(alpha = 0.22f))
                        .clickable { onOpenSettings() },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        initials(name ?: "D2L", "D2"),
                        color = HubColors.VioletLight,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }

        if (viewModel.error != null) {
            item { ErrorBanner(viewModel.error!!, onRetry = { viewModel.refresh() }) }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatCard("Courses", viewModel.courses.size.toString(), HubColors.VioletLight, Modifier.weight(1f))
                StatCard("This week", week.size.toString(), HubColors.Amber, Modifier.weight(1f))
                StatCard("Overdue", overdue.size.toString(), HubColors.Rose, Modifier.weight(1f))
            }
        }

        item { SectionTitle("UP NEXT") }
        item {
            if (next == null) {
                EmptyState("Nothing due", "When your D2L calendar has upcoming work, it shows up here.")
            } else {
                HubCard {
                    Column(Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                next.courseCode ?: "Upcoming",
                                color = HubColors.VioletLight,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.weight(1f))
                            Text(relativeDue(next.startsAt), color = HubColors.Muted, fontSize = 11.sp)
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            next.title,
                            color = HubColors.Text,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold,
                            lineHeight = 21.sp,
                        )
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "Open in D2L →",
                            color = HubColors.VioletLight,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { onOpenLink(next.url) }
                                .padding(vertical = 4.dp),
                        )
                    }
                }
            }
        }

        if (week.isNotEmpty()) {
            item { SectionTitle("NEXT 7 DAYS", "${week.size} due") }
            items(week, key = { it.id + (it.startsAt ?: 0L) }) { deadline ->
                DeadlineRow(deadline, onClick = { onOpenLink(deadline.url) })
            }
        }

        if (viewModel.courses.isNotEmpty()) {
            item { SectionTitle("COURSES", "${viewModel.courses.size}") }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(viewModel.courses, key = { it.id }) { course ->
                        HubCard(
                            modifier = Modifier
                                .width(168.dp)
                                .clickable { onOpenCourse(course) },
                        ) {
                            Column(Modifier.padding(14.dp)) {
                                CourseGlyph(course, 36)
                                Spacer(Modifier.height(10.dp))
                                Text(
                                    course.name,
                                    color = HubColors.Text,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                    lineHeight = 17.sp,
                                )
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    course.code.ifBlank { "Course" },
                                    color = HubColors.Faint,
                                    fontSize = 10.5.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }
        }

        item {
            Text(
                if (viewModel.refreshing) "Refreshing…" else "Data stays on this phone.",
                color = HubColors.Faint,
                fontSize = 11.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

@Composable
private fun HubCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .background(HubColors.Surface),
    ) {
        content()
    }
}

@Composable
private fun StatCard(label: String, value: String, tint: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(HubColors.Surface)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Text(value, color = tint, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(2.dp))
        Text(label, color = HubColors.Faint, fontSize = 11.sp)
    }
}
