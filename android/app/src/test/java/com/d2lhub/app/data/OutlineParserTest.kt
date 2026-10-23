package com.d2lhub.app.data

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OutlineParserTest {
    private val zone = ZoneId.systemDefault()
    private val now = LocalDateTime.of(2026, 10, 22, 12, 0).atZone(zone).toInstant().toEpochMilli()

    private fun parse(text: String) = OutlineParser.parse(text, now, zone)

    private fun local(millis: Long) = Instant.ofEpochMilli(millis).atZone(zone)

    @Test
    fun `reads an assessment with a date and time`() {
        val draft = parse("Assignment 2 due Oct 9 at 11:59 PM").single()

        assertEquals("Assignment 2", draft.title)
        val at = local(draft.startsAt)
        assertEquals(LocalDate.of(2026, 10, 9), at.toLocalDate())
        assertEquals(23, at.hour)
        assertEquals(59, at.minute)
    }

    @Test
    fun `uses the last date on a schedule row and drops the week number`() {
        val draft = parse("Week 3 | Sep 15 | Quiz 1").single()

        assertEquals("Quiz 1", draft.title)
        assertEquals(LocalDate.of(2026, 9, 15), local(draft.startsAt).toLocalDate())
    }

    @Test
    fun `reads the start of a time range`() {
        val draft = parse("Final exam Oct 20, 6:30 - 8:30 PM").single()
        val at = local(draft.startsAt)

        assertEquals(LocalDate.of(2026, 10, 20), at.toLocalDate())
        assertEquals(18, at.hour)
        assertEquals(30, at.minute)
    }

    @Test
    fun `skips lecture topics without an assessment word`() {
        assertTrue(parse("Week 2 | Sep 8 | Limits and continuity").isEmpty())
        assertTrue(parse("Reading week Oct 12 - 16").isEmpty())
    }

    @Test
    fun `rolls a spring month into next year`() {
        val september = LocalDateTime.of(2026, 9, 20, 12, 0).atZone(zone).toInstant().toEpochMilli()
        val draft = OutlineParser.parse("Midterm Jan 8", september, zone).single()

        assertEquals(LocalDate.of(2027, 1, 8), local(draft.startsAt).toLocalDate())
    }

    @Test
    fun `sorts several assessments in date order`() {
        val drafts = parse(
            """
            Essay 1 due Oct 30
            Quiz 2 due Oct 28
            Participation due Nov 2
            """.trimIndent(),
        )

        assertEquals(listOf("Quiz 2", "Essay 1", "Participation"), drafts.map { it.title })
        assertTrue(drafts[0].startsAt < drafts[1].startsAt)
    }
}
