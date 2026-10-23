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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.d2lhub.app.AppViewModel
import com.d2lhub.app.data.CalendarEvent
import com.d2lhub.app.data.CalendarRange
import com.d2lhub.app.data.CalendarSource
import com.d2lhub.app.data.buildCalendarEntries
import com.d2lhub.app.data.calendarRangeDates
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val GoogleBlue = Color(0xFF8AB4F8)
private val NotionCream = Color(0xFFE2E6EF)
private val WEEKDAYS = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

private val FULL_DAY = DateTimeFormatter.ofPattern("EEEE, MMMM d", Locale.US)
private val MONTH_YEAR = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.US)
private val MONTH_SHORT = DateTimeFormatter.ofPattern("MMM", Locale.US)
private val WEEKDAY_SHORT = DateTimeFormatter.ofPattern("EEE", Locale.US)

@Composable
fun CalendarScreen(
    viewModel: AppViewModel,
    onOpenLink: (String) -> Unit,
    onOpenSettings: () -> Unit,
) {
    val zone = remember { ZoneId.systemDefault() }
    val today = remember { LocalDate.now(zone) }
    var anchor by remember { mutableStateOf(today) }
    val range = viewModel.calendarRange

    val entries = remember(viewModel.deadlines, viewModel.externalEvents) {
        buildCalendarEntries(viewModel.deadlines, viewModel.externalEvents)
    }
    val visible = remember(entries, viewModel.hiddenCalendarSources) {
        entries.filter { it.source !in viewModel.hiddenCalendarSources }
    }
    val byDay = remember(visible, zone) {
        visible.groupBy { localDateOf(it.startsAt, zone) }
    }
    val rangeDates = remember(range, anchor) { calendarRangeDates(range, anchor) }
    val listState = rememberLazyListState()

    // A new range starts at the top instead of keeping the old scroll offset.
    LaunchedEffect(range, anchor) {
        listState.scrollToItem(0)
    }

    val calendarError = listOfNotNull(
        viewModel.google.error?.let { "Google Calendar: $it" },
        viewModel.notion.error?.let { "Notion: $it" },
    ).firstOrNull()
    val missingConnections = listOfNotNull(
        if (!viewModel.google.connected) "Google Calendar" else null,
        if (!viewModel.notion.connected) "Notion" else null,
    )

    fun shift(direction: Int) {
        anchor = when (range) {
            CalendarRange.DAY -> anchor.plusDays(direction.toLong())
            CalendarRange.THREE_DAYS -> anchor.plusDays(3L * direction)
            CalendarRange.WEEK -> anchor.plusDays(7L * direction)
            CalendarRange.MONTH -> anchor.withDayOfMonth(1).plusMonths(direction.toLong())
        }
    }

    fun pickDay(date: LocalDate) {
        anchor = date
        viewModel.selectCalendarRange(CalendarRange.DAY)
    }

    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 6.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Calendar",
                    color = HubColors.Text,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                if (viewModel.calendarRefreshing) {
                    CircularProgressIndicator(
                        color = HubColors.Violet,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(14.dp),
                    )
                }
                if (anchor != today) {
                    Text(
                        "Today",
                        color = HubColors.VioletLight,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier
                            .clip(RoundedCornerShape(9.dp))
                            .clickable { anchor = today }
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                }
            }
        }

        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Arrow("‹") { shift(-1) }
                Text(
                    rangeTitle(range, anchor),
                    color = HubColors.Text,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f).padding(horizontal = 4.dp),
                )
                Arrow("›") { shift(1) }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                CalendarRange.values().forEach { option ->
                    RangePill(option.label, option == range) {
                        viewModel.selectCalendarRange(option)
                    }
                }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                CalendarSource.values().forEach { source ->
                    SourceFilter(
                        source = source,
                        enabled = source !in viewModel.hiddenCalendarSources,
                        onToggle = { viewModel.toggleCalendarSource(source) },
                    )
                }
            }
        }

        if (missingConnections.isNotEmpty()) {
            item {
                Text(
                    "Connect ${missingConnections.joinToString(" and ")} in Settings →",
                    color = HubColors.VioletLight,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { onOpenSettings() }
                        .padding(horizontal = 2.dp, vertical = 3.dp),
                )
            }
        }

        if (calendarError != null) {
            item {
                ErrorBanner(calendarError, onRetry = { viewModel.syncCalendars() })
            }
        }

        when (range) {
            CalendarRange.DAY -> {
                val dayEvents = byDay[anchor].orEmpty()
                item { DayHeader(anchor, today, dayEvents.size) }
                if (dayEvents.isEmpty()) {
                    item {
                        EmptyState(
                            "Nothing scheduled",
                            "No D2L, Google Calendar or Notion entries on ${anchor.format(FULL_DAY)}.",
                        )
                    }
                } else {
                    items(dayEvents, key = { it.id }) { event ->
                        DayEventRow(event) { event.url?.let(onOpenLink) }
                    }
                }
            }

            CalendarRange.MONTH -> {
                item { WeekdayHeader() }
                item {
                    MonthGrid(
                        weeks = rangeDates.chunked(7),
                        anchor = anchor,
                        today = today,
                        byDay = byDay,
                        onPickDay = ::pickDay,
                        onOpenEvent = { event -> event.url?.let(onOpenLink) },
                    )
                }
                item {
                    Text(
                        "Tap a day for its full list",
                        color = HubColors.Faint,
                        fontSize = 10.5.sp,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }

            else -> {
                item {
                    MultiDayBoard(
                        dates = rangeDates,
                        today = today,
                        byDay = byDay,
                        onPickDay = ::pickDay,
                        onOpenEvent = { event -> event.url?.let(onOpenLink) },
                    )
                }
            }
        }
    }
}

@Composable
private fun Arrow(symbol: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(30.dp)
            .clip(CircleShape)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(symbol, color = HubColors.Faint, fontSize = 20.sp)
    }
}

@Composable
private fun RangePill(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        color = if (selected) HubColors.VioletLight else HubColors.Muted,
        fontSize = 11.5.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier
            .clip(RoundedCornerShape(9.dp))
            .background(if (selected) HubColors.Violet.copy(alpha = 0.22f) else HubColors.Surface)
            .clickable { onClick() }
            .padding(horizontal = 10.dp, vertical = 6.dp),
    )
}

@Composable
private fun SourceFilter(source: CalendarSource, enabled: Boolean, onToggle: () -> Unit) {
    val accent = sourceAccent(source)
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(9.dp))
            .background(if (enabled) accent.copy(alpha = 0.13f) else HubColors.Surface)
            .clickable { onToggle() }
            .padding(horizontal = 9.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(7.dp)
                .clip(CircleShape)
                .background(if (enabled) accent else HubColors.Faint.copy(alpha = 0.6f)),
        )
        Spacer(Modifier.width(5.dp))
        Text(
            source.label,
            color = if (enabled) HubColors.Text else HubColors.Faint,
            fontSize = 10.5.sp,
            fontWeight = FontWeight.Medium,
        )
        if (enabled) {
            Spacer(Modifier.width(5.dp))
            Text("✓", color = accent, fontSize = 9.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun WeekdayHeader() {
    Row(Modifier.fillMaxWidth()) {
        WEEKDAYS.forEach { label ->
            Text(
                label,
                color = HubColors.Faint,
                fontSize = 9.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun MonthGrid(
    weeks: List<List<LocalDate>>,
    anchor: LocalDate,
    today: LocalDate,
    byDay: Map<LocalDate, List<CalendarEvent>>,
    onPickDay: (LocalDate) -> Unit,
    onOpenEvent: (CalendarEvent) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        for (week in weeks) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                for (date in week) {
                    val inMonth = date.month == anchor.month && date.year == anchor.year
                    MonthDayCell(
                        date = date,
                        inMonth = inMonth,
                        isToday = date == today,
                        events = byDay[date].orEmpty(),
                        onPickDay = onPickDay,
                        onOpenEvent = onOpenEvent,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun MonthDayCell(
    date: LocalDate,
    inMonth: Boolean,
    isToday: Boolean,
    events: List<CalendarEvent>,
    onPickDay: (LocalDate) -> Unit,
    onOpenEvent: (CalendarEvent) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .height(82.dp)
            .clip(RoundedCornerShape(5.dp))
            .background(if (inMonth) HubColors.Surface.copy(alpha = 0.55f) else Color.Transparent)
            .clickable { onPickDay(date) }
            .padding(horizontal = 2.dp, vertical = 3.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(17.dp)
                .clip(CircleShape)
                .background(if (isToday) HubColors.Text else Color.Transparent),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                date.dayOfMonth.toString(),
                color = when {
                    isToday -> HubColors.Background
                    inMonth -> HubColors.Muted
                    else -> HubColors.Faint
                },
                fontSize = 9.5.sp,
                fontWeight = FontWeight.Medium,
            )
        }
        Spacer(Modifier.height(2.dp))
        for (event in events.take(3)) {
            EventChip(
                event = event,
                dim = !inMonth,
                wide = false,
                onClick = { onOpenEvent(event) },
            )
            Spacer(Modifier.height(2.dp))
        }
        if (events.size > 3) {
            Text(
                "+${events.size - 3}",
                color = HubColors.Faint,
                fontSize = 7.5.sp,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun MultiDayBoard(
    dates: List<LocalDate>,
    today: LocalDate,
    byDay: Map<LocalDate, List<CalendarEvent>>,
    onPickDay: (LocalDate) -> Unit,
    onOpenEvent: (CalendarEvent) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        for (date in dates) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(9.dp))
                    .background(HubColors.Surface)
                    .padding(3.dp),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(6.dp))
                        .clickable { onPickDay(date) }
                        .padding(vertical = 1.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        date.format(WEEKDAY_SHORT),
                        color = HubColors.Faint,
                        fontSize = 8.5.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Box(
                        modifier = Modifier
                            .padding(top = 1.dp)
                            .size(19.dp)
                            .clip(CircleShape)
                            .background(if (date == today) HubColors.Text else Color.Transparent),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            date.dayOfMonth.toString(),
                            color = if (date == today) HubColors.Background else HubColors.Muted,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
                Spacer(Modifier.height(3.dp))
                val events = byDay[date].orEmpty()
                if (events.isEmpty()) {
                    Text(
                        "—",
                        color = HubColors.Faint.copy(alpha = 0.6f),
                        fontSize = 9.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
                    )
                } else {
                    for (event in events) {
                        EventChip(
                            event = event,
                            dim = false,
                            wide = true,
                            onClick = { onOpenEvent(event) },
                        )
                        Spacer(Modifier.height(2.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun EventChip(
    event: CalendarEvent,
    dim: Boolean,
    wide: Boolean,
    onClick: () -> Unit,
) {
    val accent = sourceAccent(event.source)
    val alpha = if (dim) 0.5f else 1f
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(3.dp))
            .background(accent.copy(alpha = 0.2f * alpha))
            .clickable(enabled = event.url != null) { onClick() }
            .padding(horizontal = 2.dp, vertical = 1.dp),
    ) {
        if (wide && !event.allDay) {
            Text(
                formatTime(event.startsAt),
                color = accent.copy(alpha = 0.85f * alpha),
                fontSize = 7.5.sp,
                maxLines = 1,
            )
        }
        Text(
            event.title,
            color = accent.copy(alpha = alpha),
            fontSize = if (wide) 9.sp else 7.5.sp,
            lineHeight = if (wide) 11.sp else 9.sp,
            maxLines = if (wide) 2 else 1,
            overflow = TextOverflow.Clip,
        )
    }
}

@Composable
private fun DayHeader(date: LocalDate, today: LocalDate, count: Int) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (date == today) "TODAY" else "SCHEDULE",
            color = HubColors.Muted,
            fontSize = 10.5.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.8.sp,
            modifier = Modifier.weight(1f),
        )
        Text(
            if (count == 1) "1 item" else "$count items",
            color = HubColors.Faint,
            fontSize = 10.5.sp,
        )
    }
}

@Composable
private fun DayEventRow(event: CalendarEvent, onOpen: () -> Unit) {
    val accent = sourceAccent(event.source)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(HubColors.Surface)
            .then(if (event.url != null) Modifier.clickable { onOpen() } else Modifier)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.width(56.dp)) {
            Text(
                if (event.allDay) "All day" else formatTime(event.startsAt),
                color = accent,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
            if (!event.allDay && event.endsAt != null) {
                Spacer(Modifier.height(2.dp))
                Text(formatTime(event.endsAt), color = HubColors.Faint, fontSize = 10.sp)
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                event.title,
                color = HubColors.Text,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 18.sp,
            )
            Spacer(Modifier.height(3.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(5.dp)
                        .clip(CircleShape)
                        .background(accent),
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    listOfNotNull(event.source.label, event.detail, event.location)
                        .joinToString(" · "),
                    color = HubColors.Faint,
                    fontSize = 10.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (event.url != null) {
            Spacer(Modifier.width(6.dp))
            Text("→", color = HubColors.VioletLight, fontSize = 14.sp)
        }
    }
}

private fun sourceAccent(source: CalendarSource): Color = when (source) {
    CalendarSource.D2L -> HubColors.VioletLight
    CalendarSource.GOOGLE -> GoogleBlue
    CalendarSource.NOTION -> NotionCream
}

private fun localDateOf(millis: Long, zone: ZoneId): LocalDate =
    Instant.ofEpochMilli(millis).atZone(zone).toLocalDate()

private fun rangeTitle(range: CalendarRange, anchor: LocalDate): String {
    val dates = calendarRangeDates(range, anchor)
    return when (range) {
        CalendarRange.DAY -> anchor.format(FULL_DAY)
        CalendarRange.MONTH -> anchor.format(MONTH_YEAR)
        else -> {
            val first = dates.first()
            val last = dates.last()
            if (first.month == last.month) {
                "${first.format(MONTH_SHORT)} ${first.dayOfMonth} – ${last.dayOfMonth}, ${last.year}"
            } else {
                "${first.format(MONTH_SHORT)} ${first.dayOfMonth} – " +
                    "${last.format(MONTH_SHORT)} ${last.dayOfMonth}, ${last.year}"
            }
        }
    }
}
