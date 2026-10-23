package com.d2lhub.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.DayOfWeek
import java.time.LocalDate

class CalendarEntriesTest {
    @Test
    fun mergesDeadlinesGoogleAndNotionInTimeOrder() {
        val entries = buildCalendarEntries(
            deadlines = listOf(
                Deadline("d1", "Problem set 3", "CEN 100", 3_000L, "https://d2l/d/1"),
                Deadline("d2", "No date", "CEN 100", null, "https://d2l/d/2"),
            ),
            externalEvents = listOf(
                ExternalEvent("g1", "MTH 140 lecture", 2_000L, source = "gcal"),
                ExternalEvent("n1", "Essay", 1_000L, source = "notion", url = "https://notion/1"),
            ),
        )

        assertEquals(listOf("Essay", "MTH 140 lecture", "Problem set 3"), entries.map { it.title })
        assertEquals(CalendarSource.NOTION, entries[0].source)
        assertEquals(CalendarSource.GOOGLE, entries[1].source)
        assertEquals(CalendarSource.D2L, entries[2].source)
        assertEquals("CEN 100", entries[2].detail)
        assertEquals("https://notion/1", entries[0].url)
        assertNull(entries[1].url)
    }

    @Test
    fun importedOutlinesStillCountAsD2l() {
        val entries = buildCalendarEntries(
            deadlines = listOf(
                Deadline("o1", "Midterm", "MTH 140", 4_000L, "", source = "outline"),
            ),
            externalEvents = emptyList(),
        )

        assertEquals(CalendarSource.D2L, entries.single().source)
        assertNull(entries.single().url)
    }

    @Test
    fun monthGridStartsOnTheSundayBeforeTheFirst() {
        // October 2026 begins on a Thursday and ends on a Saturday.
        val dates = calendarRangeDates(CalendarRange.MONTH, LocalDate.of(2026, 10, 22))

        assertEquals(LocalDate.of(2026, 9, 27), dates.first())
        assertEquals(LocalDate.of(2026, 10, 31), dates.last())
        assertEquals(35, dates.size)
        assertEquals(DayOfWeek.SUNDAY, dates.first().dayOfWeek)
    }

    @Test
    fun aMonthThatNeedsSixRowsStillEndsOnSaturday() {
        // August 2026 begins on a Saturday, so the grid needs six rows.
        val dates = calendarRangeDates(CalendarRange.MONTH, LocalDate.of(2026, 8, 15))

        assertEquals(LocalDate.of(2026, 7, 26), dates.first())
        assertEquals(LocalDate.of(2026, 9, 5), dates.last())
        assertEquals(42, dates.size)
        assertEquals(0, dates.size % 7)
        assertEquals(DayOfWeek.SATURDAY, dates.last().dayOfWeek)
    }

    @Test
    fun weekRunsSundayToSaturdayAroundTheAnchor() {
        val dates = calendarRangeDates(CalendarRange.WEEK, LocalDate.of(2026, 10, 22))

        assertEquals(LocalDate.of(2026, 10, 18), dates.first())
        assertEquals(LocalDate.of(2026, 10, 24), dates.last())
        assertEquals(7, dates.size)
    }

    @Test
    fun aMonthThatFitsOneGridNeedsNoPadding() {
        // February 2026 begins on a Sunday and ends on a Saturday.
        val dates = calendarRangeDates(CalendarRange.MONTH, LocalDate.of(2026, 2, 10))

        assertEquals(LocalDate.of(2026, 2, 1), dates.first())
        assertEquals(LocalDate.of(2026, 2, 28), dates.last())
        assertEquals(28, dates.size)
    }

    @Test
    fun threeDayAndDayRangesStartAtTheAnchor() {
        val three = calendarRangeDates(CalendarRange.THREE_DAYS, LocalDate.of(2026, 10, 22))
        assertEquals(
            listOf(
                LocalDate.of(2026, 10, 22),
                LocalDate.of(2026, 10, 23),
                LocalDate.of(2026, 10, 24),
            ),
            three,
        )

        assertEquals(
            listOf(LocalDate.of(2026, 10, 22)),
            calendarRangeDates(CalendarRange.DAY, LocalDate.of(2026, 10, 22)),
        )
    }
}
