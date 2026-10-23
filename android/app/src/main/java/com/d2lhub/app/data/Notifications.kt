package com.d2lhub.app.data

/** One row in the bell: a course announcement, newest first. */
data class AppNotification(
    val id: String,
    val title: String,
    val courseId: String?,
    val courseName: String?,
    val courseCode: String?,
    val createdAt: Long?,
    val url: String?,
    val read: Boolean,
)

/** What the panel draws right now, plus the unread badge count. */
data class NotificationFeed(
    val items: List<AppNotification> = emptyList(),
    val unread: Int = 0,
    val total: Int = 0,
)

/** How many updates are kept; more than anyone scrolls through. */
const val MAX_NOTIFICATIONS = 80

/** The bell opens with the five newest updates, like the desktop app. */
const val NOTIFICATION_PAGE = 5

/** Cleared by id, or older than the last "mark all read". */
fun isNotificationRead(
    id: String,
    createdAt: Long?,
    seenAt: Long,
    seenIds: Set<String>,
): Boolean = id in seenIds || (createdAt != null && seenAt > 0L && createdAt <= seenAt)

/**
 * Course announcements drawn as bell rows. Every course is asked for its own
 * announcements page, so one unreadable course must not empty the bell.
 */
fun announcementNotifications(
    courses: List<Course>,
    announcements: Map<String, List<Announcement>>,
    seenAt: Long,
    seenIds: Set<String>,
): List<AppNotification> {
    val rows = mutableListOf<AppNotification>()
    for (course in courses) {
        for (announcement in announcements[course.id].orEmpty()) {
            if (announcement.title.isBlank()) continue
            val id = "news-${course.id}-${announcement.id}"
            rows += AppNotification(
                id = id,
                title = announcement.title,
                courseId = course.id,
                courseName = course.name.ifBlank { null },
                courseCode = course.code.ifBlank { null },
                createdAt = announcement.publishedAt,
                url = announcement.url.ifBlank { null },
                read = isNotificationRead(id, announcement.publishedAt, seenAt, seenIds),
            )
        }
    }
    return rows
        .distinctBy { it.id }
        .sortedWith(
            compareByDescending<AppNotification> { it.createdAt ?: 0L }
                .thenBy(String.CASE_INSENSITIVE_ORDER) { it.title },
        )
        .take(MAX_NOTIFICATIONS)
}

/** One page of the feed; unread and total still count every stored update. */
fun notificationFeed(rows: List<AppNotification>, limit: Int): NotificationFeed {
    val capped = rows.take(MAX_NOTIFICATIONS)
    val size = limit.coerceIn(1, MAX_NOTIFICATIONS)
    return NotificationFeed(
        items = capped.take(size),
        unread = capped.count { !it.read },
        total = capped.size,
    )
}
