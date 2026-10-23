package com.d2lhub.app.data

data class Profile(
    val name: String?,
    val id: String?,
)

data class Course(
    val id: String,
    val name: String,
    val code: String,
    val url: String,
)

data class Deadline(
    val id: String,
    val title: String,
    val courseCode: String?,
    val startsAt: Long?,
    val url: String,
    /** "d2l" for Brightspace's calendar, "outline" for an imported course outline. */
    val source: String = "d2l",
)

data class Announcement(
    val id: String,
    val title: String,
    val publishedAt: Long?,
    val body: String,
    val url: String,
)

data class CourseDetail(
    val course: Course,
    val announcements: List<Announcement>,
    val deadlines: List<Deadline>,
)

/**
 * One dated entry pulled from Google Calendar or Notion. D2L deadlines stay in
 * [Deadline] so the two sources can be shown without mixing up their badges.
 */
data class ExternalEvent(
    val id: String,
    val title: String,
    val startsAt: Long,
    val endsAt: Long? = null,
    val allDay: Boolean = false,
    val location: String? = null,
    val url: String? = null,
    val source: String,
    val calendarName: String? = null,
)

data class NotionDatabase(
    val id: String,
    val title: String,
    val dateProperty: String?,
)
