package com.d2lhub.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationsTest {
    private val cen = Course("1", "CEN 100 - Introduction to Engineering - F2026", "CEN 100", "https://d2l/c/1")
    private val mth = Course("2", "MTH 140 - Calculus I - F2026", "MTH 140", "https://d2l/c/2")

    private fun announcement(id: String, title: String, at: Long?) =
        Announcement(id, title, at, "", "https://d2l/n/$id")

    @Test
    fun buildsRowsNewestFirstWithTheirCourse() {
        val rows = announcementNotifications(
            courses = listOf(cen, mth),
            announcements = mapOf(
                "1" to listOf(announcement("10", "Older", 1_000L)),
                "2" to listOf(announcement("20", "Newer", 3_000L)),
            ),
            seenAt = 0L,
            seenIds = emptySet(),
        )

        assertEquals(listOf("Newer", "Older"), rows.map { it.title })
        assertEquals("MTH 140", rows.first().courseCode)
        assertEquals("MTH 140 - Calculus I - F2026", rows.first().courseName)
        assertEquals("news-2-20", rows.first().id)
        assertFalse(rows.first().read)
    }

    @Test
    fun dropsDuplicatesAndUndatedRowsStillAppearLast() {
        val rows = announcementNotifications(
            courses = listOf(cen),
            announcements = mapOf(
                "1" to listOf(
                    announcement("1", "Pinned", null),
                    announcement("1", "Pinned again", null),
                    announcement("2", "Dated", 5_000L),
                ),
            ),
            seenAt = 0L,
            seenIds = emptySet(),
        )

        assertEquals(listOf("Dated", "Pinned"), rows.map { it.title })
        assertEquals(2, rows.size)
    }

    @Test
    fun marksRowsReadByIdOrByTheLastClearTime() {
        val rows = announcementNotifications(
            courses = listOf(cen, mth),
            announcements = mapOf(
                "1" to listOf(announcement("1", "Already seen", 10_000L)),
                "2" to listOf(announcement("2", "Cleared at the same time", 20_000L)),
            ),
            seenAt = 20_000L,
            seenIds = emptySet(),
        )

        assertTrue(rows.all { it.read })
        assertEquals(0, notificationFeed(rows, 5).unread)
    }

    @Test
    fun aClearedIdStaysReadEvenWhenItsDateIsAhead() {
        val rows = announcementNotifications(
            courses = listOf(cen),
            announcements = mapOf(
                "1" to listOf(announcement("7", "Clock skew", 9_000_000L)),
            ),
            seenAt = 1_000L,
            seenIds = setOf("news-1-7"),
        )

        assertTrue(rows.single().read)
    }

    @Test
    fun pagingKeepsUnreadAndTotalAcrossTheWholeFeed() {
        val list = (1..12).map { announcement("$it", "Update $it", it * 1_000L) }
        val rows = announcementNotifications(
            courses = listOf(cen),
            announcements = mapOf("1" to list),
            seenAt = 0L,
            seenIds = setOf("news-1-1", "news-1-2"),
        )

        val firstPage = notificationFeed(rows, 5)
        assertEquals(5, firstPage.items.size)
        assertEquals(12, firstPage.total)
        assertEquals(10, firstPage.unread)
        assertEquals("Update 12", firstPage.items.first().title)
    }

    @Test
    fun theFeedIsCappedAtEightyRows() {
        val list = (1..95).map { announcement("$it", "Update $it", it.toLong()) }
        val rows = announcementNotifications(
            courses = listOf(cen),
            announcements = mapOf("1" to list),
            seenAt = 0L,
            seenIds = emptySet(),
        )

        assertEquals(MAX_NOTIFICATIONS, rows.size)
        assertEquals(MAX_NOTIFICATIONS, notificationFeed(rows, 80).total)
    }
}
