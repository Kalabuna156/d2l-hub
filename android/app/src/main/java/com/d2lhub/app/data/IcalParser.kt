package com.d2lhub.app.data

import java.io.IOException
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request

data class ParsedFeed(val name: String?, val events: List<ExternalEvent>)

/**
 * Reads the iCalendar feed behind Google Calendar's "Secret address in iCal
 * format". It covers what those feeds use in practice: all-day and timed
 * events, IANA time zones, cancelled entries, and common repeat rules.
 */
object IcalParser {
    const val PAST_DAYS = 30L
    const val FUTURE_DAYS = 120L
    private const val DAY_MS = 86_400_000L
    private const val MAX_ITERATIONS = 20_000

    private val DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("uuuuMMdd")
    private val DATE_TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("uuuuMMdd'T'HHmmss")

    private val BY_DAY = mapOf(
        "MO" to DayOfWeek.MONDAY,
        "TU" to DayOfWeek.TUESDAY,
        "WE" to DayOfWeek.WEDNESDAY,
        "TH" to DayOfWeek.THURSDAY,
        "FR" to DayOfWeek.FRIDAY,
        "SA" to DayOfWeek.SATURDAY,
        "SU" to DayOfWeek.SUNDAY,
    )

    fun parseFeed(
        text: String,
        source: String = "gcal",
        now: Long = System.currentTimeMillis(),
    ): ParsedFeed {
        val lines = unfold(text)
        val name = lines.firstNotNullOfOrNull { line ->
            propertyOf(line)?.takeIf { it.name == "X-WR-CALNAME" }?.let { unescape(it.value) }
        }?.takeIf { it.isNotBlank() }

        val events = mutableListOf<ExternalEvent>()
        var block: EventBlock? = null

        for (line in lines) {
            val property = propertyOf(line) ?: continue
            when {
                property.name == "BEGIN" && property.value.equals("VEVENT", ignoreCase = true) -> {
                    block = EventBlock()
                }

                property.name == "END" && property.value.equals("VEVENT", ignoreCase = true) -> {
                    val finished = block
                    block = null
                    if (finished != null) {
                        events += mapEvent(finished, name, source, now)
                    }
                }

                else -> block?.add(property)
            }
        }

        return ParsedFeed(name, events.sortedBy { it.startsAt })
    }

    // -----------------------------------------------------------------------
    // Event mapping
    // -----------------------------------------------------------------------

    private fun mapEvent(
        block: EventBlock,
        calendarName: String?,
        source: String,
        now: Long,
    ): List<ExternalEvent> {
        if (block.props["STATUS"]?.value.equals("CANCELLED", ignoreCase = true)) return emptyList()

        val zone = ZoneId.systemDefault()
        val start = timestamp(block.props["DTSTART"], zone) ?: return emptyList()
        val end = timestamp(block.props["DTEND"], zone)
        val startsAt = start.first
        val allDay = start.second
        val endsAt = end?.takeIf { !it.second }?.first?.takeIf { it > startsAt }

        val title = unescape(block.props["SUMMARY"]?.value.orEmpty()).ifBlank { "Untitled event" }
        val location = unescape(block.props["LOCATION"]?.value.orEmpty()).takeIf { it.isNotBlank() }
        val url = block.props["URL"]?.value?.trim()?.takeIf { it.startsWith("http") }
        val uid = block.props["UID"]?.value?.trim()?.takeIf { it.isNotBlank() } ?: title

        val base = ExternalEvent(
            id = "$source-$uid-$startsAt",
            title = title,
            startsAt = startsAt,
            endsAt = endsAt,
            allDay = allDay,
            location = location,
            url = url,
            source = source,
            calendarName = calendarName,
        )

        val windowStart = now - PAST_DAYS * DAY_MS
        val windowEnd = now + FUTURE_DAYS * DAY_MS
        val exdates = block.exdates.flatMap { valuesOf(it, zone) }.toSet()
        val extraDates = block.rdates.flatMap { valuesOf(it, zone) }

        val rule = block.props["RRULE"]?.value?.let { parseRule(it) }
        if (rule == null) {
            val events = if (startsAt in windowStart..windowEnd) mutableListOf(base) else mutableListOf()
            events += extraDates
                .filter { it in windowStart..windowEnd && !isExcluded(base, it, exdates, zone) }
                .map { withStart(base, it) }
            return events.distinctBy { it.id }
        }

        return expand(base, rule, zone, windowStart, windowEnd, exdates, extraDates)
    }

    private fun expand(
        base: ExternalEvent,
        rule: Rule,
        zone: ZoneId,
        windowStart: Long,
        windowEnd: Long,
        exdates: Set<Long>,
        extraDates: List<Long>,
    ): List<ExternalEvent> {
        val start = Instant.ofEpochMilli(base.startsAt).atZone(zone)
        val startTime = start.toLocalTime()
        val results = mutableListOf<ExternalEvent>()
        val seen = mutableSetOf<Long>()
        var generated = 0
        var iterations = 0

        fun consider(candidate: ZonedDateTime): Boolean {
            if (candidate.isBefore(start)) return true
            val millis = candidate.toInstant().toEpochMilli()
            if (rule.until != null && millis > rule.until) return false
            if (millis > windowEnd) return false

            if (rule.count != null && generated >= rule.count) return false
            generated += 1

            if (millis >= windowStart && !isExcluded(base, millis, exdates, zone) && seen.add(millis)) {
                results += withStart(base, millis)
            }
            return rule.count == null || generated < rule.count
        }

        when (rule.freq) {
            "WEEKLY" -> {
                val days = rule.byDay.ifEmpty { listOf(start.dayOfWeek) }.sortedBy { it.value }
                val weekStart = start.toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                var week = 0L
                while (iterations < MAX_ITERATIONS) {
                    val monday = weekStart.plusWeeks(week * rule.interval)
                    for (day in days) {
                        iterations += 1
                        val candidate = monday.plusDays((day.value - 1).toLong())
                            .atTime(startTime)
                            .atZone(zone)
                        if (!consider(candidate)) return finish(results, extraDates, base, windowStart, windowEnd, exdates, seen, zone)
                    }
                    week += 1
                    if (monday.plusWeeks(rule.interval.toLong()).atStartOfDay(zone)
                            .toInstant().toEpochMilli() > windowEnd
                    ) {
                        break
                    }
                }
            }

            "DAILY", "MONTHLY", "YEARLY" -> {
                var step = 0L
                while (iterations < MAX_ITERATIONS) {
                    iterations += 1
                    val candidate = when (rule.freq) {
                        "DAILY" -> start.plusDays(step * rule.interval)
                        "MONTHLY" -> start.plusMonths(step * rule.interval)
                        else -> start.plusYears(step * rule.interval)
                    }
                    if (!consider(candidate)) break
                    step += 1
                }
            }

            else -> {
                if (base.startsAt in windowStart..windowEnd) results += base
            }
        }

        return finish(results, extraDates, base, windowStart, windowEnd, exdates, seen, zone)
    }

    private fun finish(
        results: MutableList<ExternalEvent>,
        extraDates: List<Long>,
        base: ExternalEvent,
        windowStart: Long,
        windowEnd: Long,
        exdates: Set<Long>,
        seen: MutableSet<Long>,
        zone: ZoneId,
    ): List<ExternalEvent> {
        for (millis in extraDates) {
            if (millis !in windowStart..windowEnd) continue
            if (isExcluded(base, millis, exdates, zone)) continue
            if (seen.add(millis)) results += withStart(base, millis)
        }
        return results.sortedBy { it.startsAt }
    }

    private fun withStart(base: ExternalEvent, millis: Long): ExternalEvent {
        val duration = base.endsAt?.let { it - base.startsAt } ?: 0L
        return base.copy(
            id = "${base.id}-$millis",
            startsAt = millis,
            endsAt = base.endsAt?.let { millis + duration },
        )
    }

    private fun isExcluded(
        @Suppress("UNUSED_PARAMETER") base: ExternalEvent,
        millis: Long,
        exdates: Set<Long>,
        zone: ZoneId,
    ): Boolean {
        if (exdates.isEmpty()) return false
        val candidate = Instant.ofEpochMilli(millis).atZone(zone).toLocalDateTime()
        return exdates.any { excluded ->
            Instant.ofEpochMilli(excluded).atZone(zone).toLocalDateTime() == candidate
        }
    }

    // -----------------------------------------------------------------------
    // Property parsing
    // -----------------------------------------------------------------------

    private data class Property(val name: String, val params: Map<String, String>, val value: String)

    private class EventBlock {
        val props = mutableMapOf<String, Property>()
        val exdates = mutableListOf<Property>()
        val rdates = mutableListOf<Property>()

        fun add(property: Property) {
            when (property.name) {
                "EXDATE" -> exdates += property
                "RDATE" -> rdates += property
                else -> if (!props.containsKey(property.name)) props[property.name] = property
            }
        }
    }

    /** Undo the line folding RFC 5545 allows at 75 octets. */
    private fun unfold(text: String): List<String> {
        val result = mutableListOf<String>()
        for (line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")) {
            if ((line.startsWith(" ") || line.startsWith("\t")) && result.isNotEmpty()) {
                result[result.size - 1] = result.last() + line.substring(1)
            } else {
                result += line
            }
        }
        return result
    }

    private fun propertyOf(line: String): Property? {
        val colon = line.indexOf(':')
        if (colon <= 0) return null
        val head = line.substring(0, colon)
        val value = line.substring(colon + 1)
        val parts = head.split(';')
        val name = parts.firstOrNull()?.trim()?.uppercase() ?: return null
        if (name.isBlank()) return null
        val params = parts.drop(1).mapNotNull { part ->
            val eq = part.indexOf('=')
            if (eq <= 0) null
            else part.substring(0, eq).trim().uppercase() to part.substring(eq + 1).trim().trim('"')
        }.toMap()
        return Property(name, params, value)
    }

    private fun timestamp(property: Property?, defaultZone: ZoneId): Pair<Long, Boolean>? {
        val raw = property?.value?.trim() ?: return null
        if (raw.length == 8) {
            val date = runCatching { LocalDate.parse(raw, DATE) }.getOrNull() ?: return null
            return date.atTime(12, 0).atZone(defaultZone).toInstant().toEpochMilli() to true
        }

        val cleaned = raw.removeSuffix("Z").removeSuffix("z")
        val parsed = runCatching { LocalDateTime.parse(cleaned, DATE_TIME) }.getOrNull() ?: return null
        val zone = when {
            raw.endsWith("Z", ignoreCase = true) -> ZoneId.of("UTC")
            property.params["TZID"] != null ->
                runCatching { ZoneId.of(property.params["TZID"]) }.getOrDefault(defaultZone)

            else -> defaultZone
        }
        return parsed.atZone(zone).toInstant().toEpochMilli() to false
    }

    private fun valuesOf(property: Property, zone: ZoneId): List<Long> =
        property.value.split(',')
            .mapNotNull { timestamp(property.copy(value = it), zone)?.first }

    private fun unescape(raw: String): String = raw
        .replace("\\n", "\n", ignoreCase = true)
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
        .trim()

    // -----------------------------------------------------------------------
    // Recurrence
    // -----------------------------------------------------------------------

    private data class Rule(
        val freq: String,
        val interval: Int,
        val count: Int?,
        val until: Long?,
        val byDay: List<DayOfWeek>,
    )

    private fun parseRule(raw: String): Rule? {
        val parts = raw.split(';').mapNotNull { part ->
            val eq = part.indexOf('=')
            if (eq <= 0) null
            else part.substring(0, eq).trim().uppercase() to part.substring(eq + 1).trim().uppercase()
        }.toMap()

        val freq = parts["FREQ"] ?: return null
        val byDay = parts["BYDAY"]
            ?.split(',')
            ?.mapNotNull { BY_DAY[it.trim().takeLast(2)] }
            ?: emptyList()

        return Rule(
            freq = freq,
            interval = parts["INTERVAL"]?.toIntOrNull()?.coerceIn(1, 365) ?: 1,
            count = parts["COUNT"]?.toIntOrNull()?.takeIf { it > 0 },
            until = parts["UNTIL"]?.let { parseUntil(it) },
            byDay = byDay,
        )
    }

    private fun parseUntil(raw: String): Long? {
        val cleaned = raw.trim()
        return if (cleaned.length == 8) {
            runCatching {
                LocalDate.parse(cleaned, DATE)
                    .atTime(23, 59, 59)
                    .atZone(ZoneId.of("UTC"))
                    .toInstant()
                    .toEpochMilli()
            }.getOrNull()
        } else {
            runCatching {
                LocalDateTime.parse(cleaned.removeSuffix("Z").removeSuffix("z"), DATE_TIME)
                    .atZone(if (cleaned.endsWith("Z", ignoreCase = true)) ZoneId.of("UTC") else ZoneId.systemDefault())
                    .toInstant()
                    .toEpochMilli()
            }.getOrNull()
        }
    }
}

/**
 * Fetches the private calendar address. Google serves the feed without any
 * sign-in, so the request is a plain GET over the same network stack as D2L.
 */
object GoogleCalendar {
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    fun normalizeUrl(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null
        val withScheme = trimmed.replaceFirst(Regex("^webcal://", RegexOption.IGNORE_CASE), "https://")
        val parsed = runCatching { java.net.URI(withScheme) }.getOrNull() ?: return null
        val scheme = parsed.scheme?.lowercase() ?: return null
        if (scheme != "https" && scheme != "http") return null
        if (parsed.host.isNullOrBlank()) return null
        return withScheme
    }

    fun fetch(url: String, now: Long = System.currentTimeMillis()): ParsedFeed {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "D2L-Hub/1.0")
            .get()
            .build()

        val text = try {
            http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    throw IntegrationException(
                        if (response.code == 404) {
                            "That calendar address was not found. Re-copy it from Google Calendar settings."
                        } else {
                            "Google Calendar returned ${response.code}. Check the address and try again."
                        },
                    )
                }
                response.body?.string().orEmpty()
            }
        } catch (exception: IntegrationException) {
            throw exception
        } catch (_: IOException) {
            throw IntegrationException(
                "Could not reach that calendar address. Check the link and your connection.",
            )
        }

        if (!Regex("BEGIN:VCALENDAR", RegexOption.IGNORE_CASE).containsMatchIn(text)) {
            throw IntegrationException(
                "That address did not return a calendar. Use the “Secret address in iCal format”.",
            )
        }

        return IcalParser.parseFeed(text, "gcal", now)
    }
}
