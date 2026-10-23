package com.d2lhub.app.data

import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

class OutlineImportTest {
    private val zone = ZoneId.systemDefault()
    private val course = Course(
        id = "123",
        name = "Calculus I",
        code = "MTH140_F26_01",
        url = "https://courses.example.edu/d2l/home/123",
    )

    private fun at(day: Int, hour: Int = 9): Long =
        LocalDateTime.of(2026, 11, day, hour, 0).atZone(zone).toInstant().toEpochMilli()

    @Test
    fun `adds drafts with the course and source attached`() {
        val result = OutlineImport.merge(
            existing = emptyList(),
            course = course,
            drafts = listOf(OutlineDraft("a", "Midterm 1", at(10))),
        )

        assertEquals(1, result.added)
        assertEquals(0, result.skipped)
        val saved = result.deadlines.single()
        assertEquals("Midterm 1", saved.title)
        assertEquals(course.code, saved.courseCode)
        assertEquals(course.url, saved.url)
        assertEquals("outline", saved.source)
        assertEquals(at(10), saved.startsAt)
    }

    @Test
    fun `skips a date that is already saved`() {
        val first = OutlineImport.merge(
            emptyList(),
            course,
            listOf(OutlineDraft("a", "Midterm 1", at(10))),
        )

        val second = OutlineImport.merge(
            first.deadlines,
            course,
            listOf(
                OutlineDraft("b", "Midterm 1", at(10)),
                OutlineDraft("c", "Essay 2", at(12)),
            ),
        )

        assertEquals(1, second.added)
        assertEquals(1, second.skipped)
        assertEquals(2, second.deadlines.size)
    }

    @Test
    fun `uses the course name when it has no code`() {
        val result = OutlineImport.merge(
            emptyList(),
            course.copy(code = ""),
            listOf(OutlineDraft("a", "Lab 1", at(3))),
        )

        assertEquals(course.name, result.deadlines.single().courseCode)
    }

    @Test
    fun `ignores blank titles`() {
        val result = OutlineImport.merge(
            emptyList(),
            course,
            listOf(OutlineDraft("a", "  ", at(3))),
        )

        assertEquals(0, result.added)
        assertEquals(1, result.skipped)
    }
}
