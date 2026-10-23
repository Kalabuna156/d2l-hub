package com.d2lhub.app.ui

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

private val ZONE: ZoneId = ZoneId.systemDefault()
private val TIME_FORMAT = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
private val DAY_FORMAT = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US)
private val ACTIVITY_DAY_FORMAT = DateTimeFormatter.ofPattern("MMM d", Locale.US)
private val LONG_DAY_FORMAT = DateTimeFormatter.ofPattern("EEEE, MMMM d", Locale.US)

fun formatTime(millis: Long): String =
    Instant.ofEpochMilli(millis).atZone(ZONE).format(TIME_FORMAT)

fun formatDay(millis: Long): String =
    Instant.ofEpochMilli(millis).atZone(ZONE).format(DAY_FORMAT)

fun formatLongDay(millis: Long): String =
    Instant.ofEpochMilli(millis).atZone(ZONE).format(LONG_DAY_FORMAT)

/** "today at 11:54 AM", "yesterday at 4:33 PM", "Oct 20 at 1:48 PM". */
fun formatActivityTime(millis: Long?): String {
    if (millis == null) return ""
    val at = Instant.ofEpochMilli(millis).atZone(ZONE)
    val days = ChronoUnit.DAYS.between(at.toLocalDate(), LocalDate.now(ZONE))
    val time = at.format(TIME_FORMAT)
    return when (days) {
        0L -> "today at $time"
        1L -> "yesterday at $time"
        else -> "${at.format(ACTIVITY_DAY_FORMAT)} at $time"
    }
}

fun localDay(millis: Long): LocalDate =
    Instant.ofEpochMilli(millis).atZone(ZONE).toLocalDate()

/** "Today · 2:30 PM", "Tomorrow · 9:00 AM", "In 4 days", "Past due". */
fun relativeDue(millis: Long?): String {
    if (millis == null) return "No date"
    val today = LocalDate.now(ZONE)
    val day = localDay(millis)
    val days = ChronoUnit.DAYS.between(today, day)
    return when {
        days < 0L -> "Past due · ${formatDay(millis)}"
        days == 0L -> "Today · ${formatTime(millis)}"
        days == 1L -> "Tomorrow · ${formatTime(millis)}"
        days < 7L -> "In $days days · ${formatTime(millis)}"
        else -> formatDay(millis)
    }
}

fun initials(name: String, fallback: String = "?"): String {
    val words = name.split(Regex("\\s+"))
        .filter { it.isNotBlank() && !it.first().isDigit() }
    val letters = when {
        words.size >= 2 -> "${words[0].first()}${words[1].first()}"
        words.size == 1 -> words[0].take(2)
        else -> fallback.take(2)
    }
    return letters.uppercase(Locale.US)
}

fun greeting(): String {
    val hour = java.time.LocalTime.now(ZONE).hour
    return when {
        hour < 5 -> "Still up?"
        hour < 12 -> "Good morning"
        hour < 17 -> "Good afternoon"
        else -> "Good evening"
    }
}
