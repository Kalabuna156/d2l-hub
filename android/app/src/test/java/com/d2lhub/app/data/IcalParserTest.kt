package com.d2lhub.app.data

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class IcalParserTest {
    private val now = Instant.parse("2026-10-22T12:00:00Z").toEpochMilli()

    private fun feed(vararg body: String): String =
        (listOf(
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
            "X-WR-CALNAME:School",
        ) + body + listOf("END:VCALENDAR")).joinToString("\r\n")

    @Test
    fun `expands a weekly class into every occurrence`() {
        val text = feed(
            "BEGIN:VEVENT",
            "UID:calc-1",
            "SUMMARY:Calculus Lecture",
            "DTSTART;TZID=America/Toronto:20261026T100000",
            "DTEND;TZID=America/Toronto:20261026T113000",
            "LOCATION:ENG 103",
            "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261130T235959Z",
            "END:VEVENT",
        )

        val parsed = IcalParser.parseFeed(text, now = now)

        assertEquals("School", parsed.name)
        assertEquals(11, parsed.events.size)
        val first = parsed.events.first()
        assertEquals(Instant.parse("2026-10-26T14:00:00Z").toEpochMilli(), first.startsAt)
        assertEquals(Instant.parse("2026-10-26T15:30:00Z").toEpochMilli(), first.endsAt)
        assertEquals("ENG 103", first.location)
        assertEquals("gcal", first.source)
        assertEquals("School", first.calendarName)
    }

    @Test
    fun `drops an occurrence listed in EXDATE`() {
        val text = feed(
            "BEGIN:VEVENT",
            "UID:calc-1",
            "SUMMARY:Calculus Lecture",
            "DTSTART;TZID=America/Toronto:20261026T100000",
            "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261130T235959Z",
            "EXDATE;TZID=America/Toronto:20261102T100000",
            "END:VEVENT",
        )

        val events = IcalParser.parseFeed(text, now = now).events
        val days = events.map { Instant.ofEpochMilli(it.startsAt).atZone(ZoneId.of("America/Toronto")).toLocalDate() }

        assertEquals(10, events.size)
        assertFalse(days.contains(LocalDate.of(2026, 11, 2)))
    }

    @Test
    fun `keeps all-day entries at local noon`() {
        val text = feed(
            "BEGIN:VEVENT",
            "UID:reading-week",
            "SUMMARY:Reading week",
            "DTSTART;VALUE=DATE:20261101",
            "DTEND;VALUE=DATE:20261102",
            "END:VEVENT",
        )

        val event = IcalParser.parseFeed(text, now = now).events.single()
        val local = Instant.ofEpochMilli(event.startsAt).atZone(ZoneId.systemDefault())

        assertTrue(event.allDay)
        assertEquals(LocalDate.of(2026, 11, 1), local.toLocalDate())
        assertEquals(12, local.hour)
        assertNull(event.endsAt)
    }

    @Test
    fun `honours COUNT and skips cancelled entries`() {
        val text = feed(
            "BEGIN:VEVENT",
            "UID:daily-1",
            "SUMMARY:Study sprint",
            "DTSTART:20261025T090000Z",
            "DTEND:20261025T100000Z",
            "RRULE:FREQ=DAILY;COUNT=3",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "UID:cancelled-1",
            "SUMMARY:Cancelled office hour",
            "DTSTART:20261026T120000Z",
            "STATUS:CANCELLED",
            "END:VEVENT",
        )

        val events = IcalParser.parseFeed(text, now = now).events

        assertEquals(3, events.size)
        assertEquals(
            listOf("2026-10-25T09:00:00Z", "2026-10-26T09:00:00Z", "2026-10-27T09:00:00Z"),
            events.map { Instant.ofEpochMilli(it.startsAt).toString() },
        )
    }

    @Test
    fun `unfolds long summary lines`() {
        val text = feed(
            "BEGIN:VEVENT",
            "UID:project-1",
            "SUMMARY:Project Outline and User ",
            " Research (Milestone 2)",
            "DTSTART:20261030T235900Z",
            "END:VEVENT",
        )

        val event = IcalParser.parseFeed(text, now = now).events.single()

        assertEquals("Project Outline and User Research (Milestone 2)", event.title)
    }

    @Test
    fun `ignores entries outside the sync window`() {
        val text = feed(
            "BEGIN:VEVENT",
            "UID:old-1",
            "SUMMARY:Last spring",
            "DTSTART:20260301T120000Z",
            "END:VEVENT",
            "BEGIN:VEVENT",
            "UID:far-1",
            "SUMMARY:Next summer",
            "DTSTART:20270701T120000Z",
            "END:VEVENT",
        )

        assertTrue(IcalParser.parseFeed(text, now = now).events.isEmpty())
    }

    @Test
    fun `normalizes webcal links`() {
        assertEquals(
            "https://calendar.google.com/calendar/ical/example/basic.ics",
            GoogleCalendar.normalizeUrl("webcal://calendar.google.com/calendar/ical/example/basic.ics"),
        )
        assertNull(GoogleCalendar.normalizeUrl("not a link"))
        assertNull(GoogleCalendar.normalizeUrl("ftp://example.com/feed.ics"))
    }
}
