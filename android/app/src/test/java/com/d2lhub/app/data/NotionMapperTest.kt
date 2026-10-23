package com.d2lhub.app.data

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotionMapperTest {
    private val now = Instant.parse("2026-10-22T12:00:00Z").toEpochMilli()

    @Test
    fun `lists databases with their date property`() {
        val json = """
            {"results":[
              {"id":"db-1","title":[{"plain_text":"Deadlines"}],
               "properties":{"Name":{"type":"title"},"Due":{"type":"date"}}},
              {"id":"db-2","title":[{"plain_text":"Notes"}],
               "properties":{"Created":{"type":"date"},"When":{"type":"date"}}},
              {"id":"db-3","title":[],"properties":{"Name":{"type":"title"}}}
            ]}
        """.trimIndent()

        val databases = NotionMapper.databases(json)

        assertEquals(listOf("Deadlines", "Notes", "Untitled database"), databases.map { it.title })
        assertEquals("Due", databases[0].dateProperty)
        assertEquals("When", databases[1].dateProperty)
        assertNull(databases[2].dateProperty)
    }

    @Test
    fun `maps dated pages inside the sync window`() {
        val json = """
            {"results":[
              {"id":"p1","url":"https://notion.so/p1",
               "properties":{
                 "Name":{"type":"title","title":[{"plain_text":"Essay 2"}]},
                 "Due":{"type":"date","date":{"start":"2026-11-05"}}}},
              {"id":"p2","url":"https://notion.so/p2",
               "properties":{
                 "Name":{"type":"title","title":[{"plain_text":"Old task"}]},
                 "Due":{"type":"date","date":{"start":"2025-01-01"}}}},
              {"id":"p3",
               "properties":{
                 "Name":{"type":"title","title":[{"plain_text":"Timed task"}]},
                 "Due":{"type":"date","date":{"start":"2026-10-28T15:30:00.000-04:00"}}}}
            ]}
        """.trimIndent()

        val events = NotionMapper.events(json, "Deadlines", "Due", now)

        assertEquals(2, events.size)
        val essay = events.first { it.title == "Essay 2" }
        val local = Instant.ofEpochMilli(essay.startsAt).atZone(ZoneId.systemDefault())
        assertEquals(LocalDate.of(2026, 11, 5), local.toLocalDate())
        assertEquals(12, local.hour)
        assertEquals("notion-p1", essay.id)
        assertEquals("https://notion.so/p1", essay.url)
        assertEquals("Deadlines", essay.calendarName)
        assertEquals("notion", essay.source)

        val timed = events.first { it.title == "Timed task" }
        assertEquals(Instant.parse("2026-10-28T19:30:00Z").toEpochMilli(), timed.startsAt)
        assertNull(timed.url)
    }

    @Test
    fun `skips pages without a date`() {
        val json = """
            {"results":[
              {"id":"p1","properties":{
                "Name":{"type":"title","title":[{"plain_text":"Someday"}]}}}
            ]}
        """.trimIndent()

        assertEquals(0, NotionMapper.events(json, "Deadlines", "Due", now).size)
    }
}
