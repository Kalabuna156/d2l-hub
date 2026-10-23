package com.d2lhub.app.data

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

enum class AgendaSource { D2L, NOTION }

data class AgendaItem(
    val id: String,
    val title: String,
    val startsAt: Long,
    val source: AgendaSource,
    val detail: String?,
    val url: String?,
)

data class AgendaDay(
    val date: LocalDate,
    val items: List<AgendaItem>,
)

/**
 * Merges D2L deadlines with Notion entries for the Calendar tab. Google
 * Calendar is deliberately excluded: its days are class times, not coursework.
 */
fun buildCalendarAgenda(
    deadlines: List<Deadline>,
    externalEvents: List<ExternalEvent>,
    from: Long,
    until: Long,
    maxItems: Int = 60,
    zone: ZoneId = ZoneId.systemDefault(),
): List<AgendaDay> {
    val items = mutableListOf<AgendaItem>()

    for (deadline in deadlines) {
        val startsAt = deadline.startsAt ?: continue
        if (startsAt < from || startsAt > until) continue
        items += AgendaItem(
            id = "d2l-${deadline.id}-$startsAt",
            title = deadline.title,
            startsAt = startsAt,
            source = AgendaSource.D2L,
            detail = deadline.courseCode,
            url = deadline.url,
        )
    }

    for (event in externalEvents) {
        if (event.source != "notion") continue
        if (event.startsAt < from || event.startsAt > until) continue
        items += AgendaItem(
            id = event.id,
            title = event.title,
            startsAt = event.startsAt,
            source = AgendaSource.NOTION,
            detail = event.calendarName,
            url = event.url,
        )
    }

    return items
        .sortedBy { it.startsAt }
        .take(maxItems)
        .groupBy { Instant.ofEpochMilli(it.startsAt).atZone(zone).toLocalDate() }
        .map { (date, entries) -> AgendaDay(date, entries) }
        .sortedBy { it.date }
}
