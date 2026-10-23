package com.d2lhub.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
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
import com.d2lhub.app.data.Course
import com.d2lhub.app.data.Deadline
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val GLYPH_COLORS = listOf(
    Color(0xFF8B5CF6),
    Color(0xFF4F46E5),
    Color(0xFF0EA5E9),
    Color(0xFF14B8A6),
    Color(0xFFF59E0B),
    Color(0xFFEC4899),
)

fun glyphColor(key: String): Color {
    if (key.isEmpty()) return GLYPH_COLORS[0]
    return GLYPH_COLORS[(key.hashCode() and 0x7FFFFFFF) % GLYPH_COLORS.size]
}

val MonthDayFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM", Locale.US)
val DayOnlyFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("d", Locale.US)

@Composable
fun CourseGlyph(course: Course, size: Int = 44) {
    val color = glyphColor(course.code.ifBlank { course.id })
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(RoundedCornerShape((size / 3.2).dp))
            .background(color.copy(alpha = 0.18f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials(course.code.ifBlank { course.name }, "D2"),
            color = color,
            fontSize = (size / 3.2).sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
fun SectionTitle(text: String, trailing: String? = null) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text,
            color = HubColors.Muted,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 1.1.sp,
            modifier = Modifier.weight(1f),
        )
        if (trailing != null) {
            Text(trailing, color = HubColors.Faint, fontSize = 11.sp)
        }
    }
}

@Composable
fun DeadlineRow(
    deadline: Deadline,
    showCourse: Boolean = true,
    onClick: (() -> Unit)? = null,
) {
    val zone = ZoneId.systemDefault()
    val whenDate = deadline.startsAt?.let { Instant.ofEpochMilli(it).atZone(zone) }
    val overdue = deadline.startsAt != null && deadline.startsAt < System.currentTimeMillis()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(HubColors.Surface)
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier.size(42.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            if (whenDate != null) {
                Text(
                    whenDate.format(MonthDayFormat).uppercase(Locale.US),
                    color = if (overdue) HubColors.Rose else HubColors.VioletLight,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    whenDate.format(DayOnlyFormat),
                    color = HubColors.Text,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            } else {
                Text("–", color = HubColors.Faint, fontSize = 18.sp)
            }
        }

        Spacer(Modifier.size(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                deadline.title,
                color = HubColors.Text,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 18.sp,
            )
            Spacer(Modifier.height(3.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (showCourse && !deadline.courseCode.isNullOrBlank()) {
                    Text(
                        deadline.courseCode,
                        color = HubColors.Faint,
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    Text(" · ", color = HubColors.Faint, fontSize = 11.sp)
                }
                if (deadline.source == "outline") {
                    Text(
                        "Outline",
                        color = HubColors.Amber,
                        fontSize = 9.5.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(" · ", color = HubColors.Faint, fontSize = 11.sp)
                }
                Text(
                    relativeDue(deadline.startsAt),
                    color = when {
                        overdue -> HubColors.Rose
                        deadline.startsAt != null &&
                            deadline.startsAt - System.currentTimeMillis() < 2 * 86_400_000L -> HubColors.Amber
                        else -> HubColors.Muted
                    },
                    fontSize = 11.sp,
                )
            }
        }
    }
}

@Composable
fun EmptyState(title: String, body: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(HubColors.Surface)
            .padding(horizontal = 20.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, color = HubColors.Text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(6.dp))
        Text(body, color = HubColors.Faint, fontSize = 12.sp, lineHeight = 18.sp)
    }
}

@Composable
fun ErrorBanner(message: String, onRetry: (() -> Unit)? = null) {
    Surface(
        color = Color(0xFF2A1116),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                message,
                color = HubColors.Rose,
                fontSize = 12.sp,
                lineHeight = 17.sp,
                modifier = Modifier.weight(1f),
            )
            if (onRetry != null) {
                Text(
                    "Retry",
                    color = HubColors.VioletLight,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { onRetry() }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        }
    }
}
