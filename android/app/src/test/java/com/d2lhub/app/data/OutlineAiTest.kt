package com.d2lhub.app.data

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OutlineAiTest {
    private val zone = ZoneId.systemDefault()
    private val now = LocalDateTime.of(2026, 10, 22, 12, 0).atZone(zone).toInstant().toEpochMilli()

    private fun local(millis: Long) = Instant.ofEpochMilli(millis).atZone(zone)

    @Test
    fun `reads assessments from a fenced reply`() {
        val reply = """
            Here are the dates:
            ```json
            {"assessments":[
              {"title":"Midterm 1","date":"2026-11-10","time":"18:30","kind":"midterm","detail":"Chapters 1-4"},
              {"title":"Final exam","date":"2026-12-15","time":null}
            ]}
            ```
        """.trimIndent()

        val drafts = OutlineAi.parse(reply, now, zone)

        assertEquals(2, drafts.size)
        assertEquals("Midterm 1", drafts[0].title)
        val midterm = local(drafts[0].startsAt)
        assertEquals(LocalDate.of(2026, 11, 10), midterm.toLocalDate())
        assertEquals(18, midterm.hour)
        assertEquals(30, midterm.minute)
        assertEquals("Chapters 1-4", drafts[0].detail)
        assertEquals(9, local(drafts[1].startsAt).hour)
    }

    @Test
    fun `falls back to the kind when the title is empty`() {
        val reply = """{"assessments":[{"title":"","date":"2026-11-01","time":"09:00","kind":"quiz"}]}"""

        assertEquals("Quiz", OutlineAi.parse(reply, now, zone).single().title)
    }

    @Test
    fun `skips impossible dates and old years`() {
        val reply = """
            {"assessments":[
              {"title":"Bad day","date":"2026-02-31","time":null},
              {"title":"Old","date":"2024-01-01","time":null},
              {"title":"Future","date":"2027-01-05","time":"10:00"}
            ]}
        """.trimIndent()

        val drafts = OutlineAi.parse(reply, now, zone)

        assertEquals(listOf("Future"), drafts.map { it.title })
    }

    @Test
    fun `rejects a reply that is not JSON`() {
        val failed = runCatching { OutlineAi.parse("I could not read that.", now, zone) }

        assertTrue(failed.isFailure)
    }

    @Test
    fun `deduplicates the same title and moment`() {
        val reply = """
            {"assessments":[
              {"title":"Quiz 1","date":"2026-11-02","time":"10:00"},
              {"title":"Quiz 1","date":"2026-11-02","time":"10:00"}
            ]}
        """.trimIndent()

        assertEquals(1, OutlineAi.parse(reply, now, zone).size)
    }
}
