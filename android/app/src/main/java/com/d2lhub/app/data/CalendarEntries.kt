package com.d2lhub.app.data

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters

/** Where a calendar row came from; imported outline dates count as D2L work. */
enum class CalendarSource(val label: String) {
    D2L("D2L"),
    GOOGLE("Google"),
    NOTION("Notion"),
}

/** The view Google Calendar calls Day, 3 days, Week and Month. */
enum class CalendarRange(val label: String) {
    DAY("Day"),
    THREE_DAYS("3 days"),
    WEEK("Week"),
    MONTH("Month"),
}

/** One combined row for the grid and the day list. */
data class CalendarEvent(
    val id: String,
    val title: String,
    val startsAt: Long,
    val endsAt: Long?,
    val allDay: Boolean,
    val source: CalendarSource,
    val detail: String?,
    val location: String?,
    val url: String?,
)

/**
 * D2L deadlines (including imported outlines), Google Calendar events and
 * Notion entries, merged into one list. Entries without a date are dropped.
 */
fun buildCalendarEntries(
    deadlines: List<Deadline>,
    externalEvents: List<ExternalEvent>,
): List<CalendarEvent> {
    val rows = mutableListOf<CalendarEvent>()

    for (deadline in deadlines) {
        val startsAt = deadline.startsAt ?: continue
        rows += CalendarEvent(
            id = "d2l-${deadline.id}-$startsAt",
            title = deadline.title,
            startsAt = startsAt,
            endsAt = null,
            allDay = false,
            source = CalendarSource.D2L,
            detail = deadline.courseCode,
            location = null,
            url = deadline.url.takeIf { it.isNotBlank() },
        )
    }

    for (event in externalEvents) {
        rows += CalendarEvent(
            id = event.id,
            title = event.title,
            startsAt = event.startsAt,
            endsAt = event.endsAt,
            allDay = event.allDay,
            source = if (event.source == "notion") CalendarSource.NOTION else CalendarSource.GOOGLE,
            detail = event.calendarName,
            location = event.location,
            url = event.url,
        )
    }

    return rows.sortedWith(
        compareBy<CalendarEvent> { it.startsAt }
            .thenByDescending { it.allDay }
            .thenBy(String.CASE_INSENSITIVE_ORDER) { it.title },
    )
}

/**
 * The dates a view shows: one day, three days, the Sunday-to-Saturday week, or
 * every cell of the month grid including the days either side of it.
 */
fun calendarRangeDates(range: CalendarRange, anchor: LocalDate): List<LocalDate> {
    val start = when (range) {
        CalendarRange.DAY, CalendarRange.THREE_DAYS -> anchor
        CalendarRange.WEEK -> anchor.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY))
        CalendarRange.MONTH -> anchor.withDayOfMonth(1)
            .with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY))
    }

    val count = when (range) {
        CalendarRange.DAY -> 1
        CalendarRange.THREE_DAYS -> 3
        CalendarRange.WEEK -> 7
        CalendarRange.MONTH -> {
            val monthEnd = anchor.withDayOfMonth(anchor.lengthOfMonth())
            val gridEnd = monthEnd.with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY))
            (ChronoUnit.DAYS.between(start, gridEnd).toInt() + 1).coerceAtLeast(28)
        }
    }

    return (0 until count).map { start.plusDays(it.toLong()) }
}
