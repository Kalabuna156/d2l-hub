package com.d2lhub.app.data

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AgendaTest {
    private val zone = ZoneId.systemDefault()
    private val from = LocalDate.of(2026, 10, 22).atStartOfDay(zone).toInstant().toEpochMilli()
    private val until = LocalDate.of(2026, 11, 21).atStartOfDay(zone).toInstant().toEpochMilli()

    private fun millis(day: Int, hour: Int = 12): Long =
        LocalDateTime.of(2026, 10, day, hour, 0).atZone(zone).toInstant().toEpochMilli()

    private fun deadline(id: String, title: String, at: Long?, code: String? = null) = Deadline(
        id = id,
        title = title,
        courseCode = code,
        startsAt = at,
        url = "https://courses.example.edu/d2l/home/1",
    )

    private fun notion(id: String, title: String, at: Long) = ExternalEvent(
        id = id,
        title = title,
        startsAt = at,
        source = "notion",
        calendarName = "Deadlines",
        url = "https://notion.so/$id",
    )

    private fun google(id: String, title: String, at: Long) = ExternalEvent(
        id = id,
        title = title,
        startsAt = at,
        source = "gcal",
        calendarName = "School",
    )

    @Test
    fun `merges D2L and Notion entries in time order`() {
        val days = buildCalendarAgenda(
            deadlines = listOf(deadline("a", "Essay 1", millis(24), "CEN100_F26_03")),
            externalEvents = listOf(notion("n1", "Read chapter 4", millis(23, 9))),
            from = from,
            until = until,
            zone = zone,
        )

        assertEquals(2, days.size)
        assertEquals(LocalDate.of(2026, 10, 23), days[0].date)
        assertEquals(AgendaSource.NOTION, days[0].items.single().source)
        assertEquals("Deadlines", days[0].items.single().detail)
        assertEquals(LocalDate.of(2026, 10, 24), days[1].date)
        assertEquals(AgendaSource.D2L, days[1].items.single().source)
        assertEquals("CEN100_F26_03", days[1].items.single().detail)
    }

    @Test
    fun `groups several entries on the same day`() {
        val days = buildCalendarAgenda(
            deadlines = listOf(deadline("a", "Quiz", millis(25, 9))),
            externalEvents = listOf(notion("n1", "Submit notes", millis(25, 15))),
            from = from,
            until = until,
            zone = zone,
        )

        assertEquals(1, days.size)
        assertEquals(listOf("Quiz", "Submit notes"), days[0].items.map { it.title })
    }

    @Test
    fun `leaves Google events out of the agenda`() {
        val days = buildCalendarAgenda(
            deadlines = emptyList(),
            externalEvents = listOf(google("g1", "Calculus lecture", millis(23, 10))),
            from = from,
            until = until,
            zone = zone,
        )

        assertTrue(days.isEmpty())
    }

    @Test
    fun `drops undated and out-of-window entries`() {
        val days = buildCalendarAgenda(
            deadlines = listOf(
                deadline("none", "No date", null),
                deadline("old", "Last month", millis(1)),
                deadline("soon", "Next week", millis(29)),
            ),
            externalEvents = listOf(notion("late", "Next semester", millis(30).let { it + 60L * 86_400_000L })),
            from = from,
            until = until,
            zone = zone,
        )

        assertEquals(1, days.size)
        assertEquals("Next week", days[0].items.single().title)
        assertEquals(LocalDate.of(2026, 10, 29), days[0].date)
        assertEquals(
            Instant.ofEpochMilli(days[0].items.single().startsAt).atZone(zone).toLocalDate(),
            LocalDate.of(2026, 10, 29),
        )
    }

    @Test
    fun `caps the number of entries`() {
        val deadlines = (1..10).map { day -> deadline("d$day", "Task $day", millis(day + 21)) }

        val days = buildCalendarAgenda(deadlines, emptyList(), from, until, maxItems = 4, zone = zone)

        assertEquals(4, days.sumOf { it.items.size })
        assertEquals("Task 1", days.first().items.first().title)
    }
}
