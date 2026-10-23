package com.d2lhub.app.data

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.Locale

/** One date found in an outline, before the user confirms it. */
data class OutlineDraft(
    val id: String,
    val title: String,
    val startsAt: Long,
    val detail: String = "",
)

/**
 * The fallback reader for a course outline. It looks for assessment words on a
 * line with a date, which covers clean schedule tables without needing an AI
 * key. Messy layouts rely on the AI reader instead.
 */
object OutlineParser {
    private val MONTHS = listOf(
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december",
    )

    private val ASSESSMENT = Regex(
        """\b(quiz|quizzes|test|midterm|final|exam|assignment|homework|project|proposal|paper|essay|report|presentation|deliverable|submission|due|deadline|submit)\b""",
        RegexOption.IGNORE_CASE,
    )
    private val IGNORE = Regex(
        """\b(no classes|study week|reading week|fall break|winter break|holiday)\b""",
        RegexOption.IGNORE_CASE,
    )
    private val ISO_DATE = Regex("""\b(20\d{2})-(\d{1,2})-(\d{1,2})\b""")
    private val SLASH_DATE = Regex("""\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b""")
    private val MONTH_FIRST = Regex(
        """\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?""",
        RegexOption.IGNORE_CASE,
    )
    private val DAY_FIRST = Regex(
        """\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?""",
        RegexOption.IGNORE_CASE,
    )
    private val AMPM_CLOCK = Regex(
        """\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\.?\b""",
        RegexOption.IGNORE_CASE,
    )
    private val HOUR_CLOCK = Regex("""\b([01]?\d|2[0-3]):([0-5]\d)\b""")
    private val RANGE_MARKER = Regex(
        """^\s*(?:(?:[-–—]|to)\s*\d{1,2}(?::\d{2})?\s*)?([ap])\.?\s?m\.?\b""",
        RegexOption.IGNORE_CASE,
    )

    private data class RawDate(val index: Int, val length: Int, val day: LocalDate)

    private data class Clock(val minutes: Int, val index: Int, val length: Int)

    fun parse(
        text: String,
        now: Long = System.currentTimeMillis(),
        zone: ZoneId = ZoneId.systemDefault(),
    ): List<OutlineDraft> {
        val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        val found = mutableListOf<OutlineDraft>()
        val seen = mutableSetOf<String>()

        for (rawLine in text.split(Regex("\\r?\\n"))) {
            val line = rawLine
                .replace('\u00a0', ' ')
                .replace(Regex("\\s+"), " ")
                .trim()
            if (line.length < 4) continue
            if (!ASSESSMENT.containsMatchIn(line) || IGNORE.containsMatchIn(line)) continue

            val dates = findDates(line, today)
            if (dates.isEmpty()) continue

            // The assessment column usually sits after the teaching-week dates,
            // so the last date on the line is the due date.
            val date = dates.last().day
            val clock = findClock(line)
            val minutes = clock?.minutes ?: 9 * 60
            val startsAt = date
                .atTime(LocalTime.of(minutes / 60, minutes % 60))
                .atZone(zone)
                .toInstant()
                .toEpochMilli()

            val title = cleanTitle(line, dates, clock).take(140)
            if (title.length < 3 || title.none { it.isLetter() }) continue

            val key = "$startsAt|${title.lowercase(Locale.US)}"
            if (!seen.add(key)) continue

            found += OutlineDraft(
                id = "form-${key.hashCode().toString(36)}",
                title = title,
                startsAt = startsAt,
                detail = line.take(200),
            )
        }

        return found.sortedBy { it.startsAt }.take(120)
    }

    private fun findDates(line: String, today: LocalDate): List<RawDate> {
        val found = mutableListOf<RawDate>()

        for (match in ISO_DATE.findAll(line)) {
            val date = dateOrNull(match.groupValues[1].toInt(), match.groupValues[2].toInt(), match.groupValues[3].toInt())
            if (date != null) {
                found += RawDate(match.range.first, match.value.length, date)
            }
        }

        for (match in SLASH_DATE.findAll(line)) {
            val first = match.groupValues[1].toInt()
            val second = match.groupValues[2].toInt()
            // 11/08 is November 8; 25/10 can only be 25 October.
            val month = if (first > 12 && second <= 12) second else first
            val day = if (first > 12 && second <= 12) first else second
            val explicit = match.groupValues[3].toIntOrNull()?.let { if (it < 100) 2000 + it else it }
            val year = resolveYear(month, day, explicit, today) ?: continue
            val date = dateOrNull(year, month, day) ?: continue
            found += RawDate(match.range.first, match.value.length, date)
        }

        for (match in MONTH_FIRST.findAll(line)) {
            val month = monthIndex(match.groupValues[1])
            val day = match.groupValues[2].toInt()
            val explicit = match.groupValues[3].toIntOrNull()
            val year = resolveYear(month, day, explicit, today) ?: continue
            val date = dateOrNull(year, month, day) ?: continue
            found += RawDate(match.range.first, match.value.length, date)
        }

        for (match in DAY_FIRST.findAll(line)) {
            val day = match.groupValues[1].toInt()
            val month = monthIndex(match.groupValues[2])
            val explicit = match.groupValues[3].toIntOrNull()
            val year = resolveYear(month, day, explicit, today) ?: continue
            val date = dateOrNull(year, month, day) ?: continue
            found += RawDate(match.range.first, match.value.length, date)
        }

        // "Week 2 Sep 15" also looks like "2 Sep"; keep the longest match.
        val accepted = mutableListOf<RawDate>()
        for (date in found.sortedWith(compareByDescending<RawDate> { it.length }.thenBy { it.index })) {
            val overlaps = accepted.any {
                date.index < it.index + it.length && it.index < date.index + date.length
            }
            if (!overlaps) accepted += date
        }
        return accepted.sortedBy { it.index }
    }

    private fun findClock(line: String): Clock? {
        val ampm = AMPM_CLOCK.find(line)
        val plain = HOUR_CLOCK.find(line)
        if (ampm == null && plain == null) return null

        if (ampm != null && (plain == null || ampm.range.first <= plain.range.first)) {
            val hour = ampm.groupValues[1].toInt().coerceIn(1, 12)
            val minutes = ampm.groupValues[2].ifBlank { "0" }.toInt()
            val pm = ampm.groupValues[3].equals("p", ignoreCase = true)
            return Clock(
                minutes = ((hour % 12) + if (pm) 12 else 0) * 60 + minutes,
                index = ampm.range.first,
                length = ampm.value.length,
            )
        }

        val found = plain ?: return null
        var hours = found.groupValues[1].toInt()
        val minutes = found.groupValues[2].toInt()
        var length = found.value.length
        val after = line.substring(found.range.last + 1)
        val marker = RANGE_MARKER.find(after)
        if (hours <= 12 && marker != null) {
            val pm = marker.groupValues[1].equals("p", ignoreCase = true)
            hours = (hours % 12) + if (pm) 12 else 0
            length += marker.value.length
        }
        return Clock(hours * 60 + minutes, found.range.first, length)
    }

    private fun cleanTitle(line: String, dates: List<RawDate>, clock: Clock?): String {
        var title = line
        val cuts = (dates.map { it.index to it.length } + listOfNotNull(clock?.let { it.index to it.length }))
            .sortedByDescending { it.first }

        for ((index, length) in cuts) {
            val end = (index + length).coerceAtMost(title.length)
            if (index in 0 until end) title = title.removeRange(index, end)
        }

        return title
            .replace(Regex("[|•·]"), " ")
            .replace(Regex("""\s*[,;:]\s*(?=[,;:]|$)"""), " ")
            .replace(Regex("""\s{2,}"""), " ")
            .replace(Regex("""^[\s\-–—,;:.]+|[\s\-–—,;:.]+$"""), "")
            .replace(Regex("""^(?:week\s*\d+|w\d{1,2})\b\s*[|:.\-–—]?\s*""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""^\s*\d{1,2}\s*[|:.\-–—]?\s*"""), "")
            .replace(Regex("""(?:\b(?:due|deadline|by|at|on|in class)\b[\s.,;:]*)+$""", RegexOption.IGNORE_CASE), "")
            .trim()
    }

    /** 1-based month number, or 0 when the name is not a month. */
    private fun monthIndex(name: String): Int {
        val index = MONTHS.indexOfFirst { it.startsWith(name.lowercase(Locale.US).take(3)) }
        return if (index >= 0) index + 1 else 0
    }

    private fun resolveYear(month: Int, day: Int, explicit: Int?, today: LocalDate): Int? {
        if (month !in 1..12) return null
        if (explicit != null) return explicit

        val candidate = dateOrNull(today.year, month, day) ?: return today.year
        // A Winter form uploaded in September names January; that is next year.
        return if (ChronoUnit.DAYS.between(candidate, today) > 180) today.year + 1 else today.year
    }

    private fun dateOrNull(year: Int, month: Int, day: Int): LocalDate? =
        runCatching { LocalDate.of(year, month, day) }.getOrNull()
}
