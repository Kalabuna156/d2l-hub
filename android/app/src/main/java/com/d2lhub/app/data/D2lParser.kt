package com.d2lhub.app.data

import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import java.net.URL
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

/**
 * The desktop server parses the same Brightspace pages. These functions are the
 * Android port of server/parse.ts for the parts the first mobile build needs.
 */
object D2lParser {
    private val COURSE_CODE_RE =
        Regex("\\b([A-Z]{2,6}(?:\\d{2,4}[A-Z]?)?)_([A-Z0-9]{2,20})_([A-Z0-9_]{2,24})\\b")
    private val MONTHS = listOf(
        "jan", "feb", "mar", "apr", "may", "jun",
        "jul", "aug", "sep", "oct", "nov", "dec",
    )
    private val MONTH_NAMES = listOf(
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december",
    )

    private fun normalize(text: String): String =
        text.replace('\u00a0', ' ').replace(Regex("\\s+"), " ").trim()

    private fun absolute(href: String, baseUrl: String): String? = try {
        URL(URL(baseUrl.trimEnd('/') + "/"), href).toString()
    } catch (_: Exception) {
        null
    }

    fun findCourseCode(text: String): String? =
        COURSE_CODE_RE.find(text.uppercase(Locale.US))?.value

    private fun cleanCourseName(raw: String, code: String?): String {
        var name = normalize(raw)
        if (!code.isNullOrBlank()) name = name.replace(code, " ")
        name = name.replace(Regex("\\s*[-–|]\\s*$"), "")
            .replace(Regex("^[\\s\\-–|]+"), "")
        return normalize(name)
    }

    private fun cardRoot(anchor: Element, linkSelector: String, maxTextLength: Int = 900): Element {
        var node = anchor
        var root = anchor
        repeat(4) {
            val parent = node.parent() ?: return root
            if (parent.normalName() == "body" || parent.normalName() == "html") return root
            if (normalize(parent.text()).length > maxTextLength) return root
            if (parent.select(linkSelector).size > 1) return root
            root = parent
            node = parent
            if (root.select("h1, h2, h3, h4, h5, [class*=title], [class*=name]").isNotEmpty()) {
                return root
            }
        }
        return root
    }

    /** Tiles link to /d2l/home/<orgUnitId>; parse them when the JSON API is unavailable. */
    fun parseCourses(html: String, baseUrl: String): List<Course> {
        val doc = Jsoup.parse(html)
        val found = LinkedHashMap<String, Course>()

        doc.select("a[href*=/d2l/home/]").forEach { anchor ->
            val rawHref = anchor.attr("href")
            val resolved = absolute(rawHref, baseUrl) ?: return@forEach
            val id = Regex("/d2l/home/(\\d+)").find(resolved)?.groupValues?.get(1)
                ?: return@forEach

            val root = cardRoot(anchor, "a[href*=/d2l/home/]")
            val cardText = normalize(root.text())
            val code = findCourseCode(cardText) ?: findCourseCode(rawHref)

            val candidates = listOfNotNull(
                anchor.attr("aria-label"),
                root.selectFirst("h2, h3, h4, h5")?.text(),
                root.selectFirst("[class*=title], [class*=name]")?.text(),
                anchor.text(),
                anchor.attr("title"),
            )

            var name = ""
            for (candidate in candidates) {
                val cleaned = cleanCourseName(candidate, code)
                if (cleaned.length >= 3 &&
                    !cleaned.equals("view all", ignoreCase = true) &&
                    !cleaned.equals("open", ignoreCase = true)
                ) {
                    name = cleaned
                    break
                }
            }
            if (name.isEmpty()) name = code ?: ""
            if (name.isEmpty()) return@forEach
            if (Regex("^(view all|all courses|my courses|course home|home)\\b", RegexOption.IGNORE_CASE)
                    .containsMatchIn(name)
            ) {
                return@forEach
            }

            val existing = found[id]
            if (existing == null || (existing.name == existing.code && name != code)) {
                found[id] = Course(id, name, code ?: "", resolved)
            }
        }

        return found.values.toList()
    }

    // -----------------------------------------------------------------------
    // Course content and grades
    // -----------------------------------------------------------------------

    /** The module tree on a content home page; bookmarks and the TOC are skipped. */
    fun parseContentModules(html: String): List<ContentModule> {
        val doc = Jsoup.parse(html)
        val modules = mutableListOf<ContentModule>()
        val seen = mutableSetOf<String>()

        doc.select("li[data-key*=ModuleCO-]").forEach { node ->
            val id = Regex("ModuleCO-(\\d+)").find(node.attr("data-key"))?.groupValues?.get(1)
                ?: return@forEach
            if (!seen.add(id)) return@forEach

            val name = normalize(
                node.select(".d2l-textblock").not(".d2l-offscreen").firstOrNull()?.text().orEmpty(),
            )
            if (name.isBlank()) return@forEach

            val badge = node.selectFirst("d2l-count-badge")?.attr("title").orEmpty()
            val counts = Regex("(\\d+)\\s+out of\\s+(\\d+)", RegexOption.IGNORE_CASE).find(badge)
            val depth = node.parents().count { it.normalName() == "li" }

            modules += ContentModule(
                id = id,
                name = name,
                depth = depth,
                remaining = counts?.groupValues?.get(1)?.toIntOrNull(),
                total = counts?.groupValues?.get(2)?.toIntOrNull(),
            )
        }

        return modules
    }

    /** The module D2L selected when the page was rendered, e.g. "Tutorials F26". */
    fun parseContentModuleTitle(html: String): String? {
        val match = Regex("List of Topics and Sub-Modules for ([^<]+)", RegexOption.IGNORE_CASE)
            .find(html) ?: return null
        return normalize(Jsoup.parse(match.groupValues[1]).text()).ifBlank { null }
    }

    /** Topics rendered for the selected module. */
    fun parseContentTopics(html: String, baseUrl: String): List<ContentTopic> {
        val doc = Jsoup.parse(html)
        val topics = LinkedHashMap<String, ContentTopic>()

        doc.select("a[href*=/viewContent/]").forEach { anchor ->
            val url = absolute(anchor.attr("href"), baseUrl) ?: return@forEach
            val id = Regex("viewContent/(\\d+)").find(url)?.groupValues?.get(1) ?: url
            if (topics.containsKey(id)) return@forEach

            val title = normalize(anchor.text()).ifBlank { normalize(anchor.attr("title")) }
            if (title.length < 2) return@forEach

            val typeText = normalize(
                anchor.closest(".d2l-topic-view")
                    ?.selectFirst(".d2l-container-icon .d2l-textblock")
                    ?.text().orEmpty(),
            )
            val titleType = Regex("[-–]\\s*([^-–]+)$")
                .find(anchor.attr("title"))
                ?.groupValues
                ?.get(1)

            topics[id] = ContentTopic(
                id = id,
                title = title,
                type = typeText.ifBlank { normalize(titleType.orEmpty()) }.ifBlank { null },
                url = url,
            )
        }

        return topics.values.toList()
    }

    /** Read the gradebook table from the student's grades page. */
    fun parseGrades(html: String, baseUrl: String): List<GradeItem> {
        val doc = Jsoup.parse(html)
        val table = doc.select("table[summary]")
            .firstOrNull { it.attr("summary").contains("grade items", ignoreCase = true) }
            ?: return emptyList()

        val items = mutableListOf<GradeItem>()
        table.select("tr").forEach { row ->
            if (row.hasClass("d_gh")) return@forEach

            val nameCell = row.children().firstOrNull { it.normalName() == "th" } ?: return@forEach
            val name = normalize(nameCell.text())
            if (name.isBlank()) return@forEach

            val depth = row.children().count { it.hasClass("d_g_treeNodeImage") }
            val cells = row.children().filter {
                it.normalName() == "td" && !it.hasClass("d_g_treeNodeImage")
            }
            val last = cells.lastOrNull()
            val href = last?.selectFirst("a[href]")?.attr("href").orEmpty()
            val comment = normalize(last?.text().orEmpty())
                .replace(Regex("\\s*View Quiz Attempts\\s*", RegexOption.IGNORE_CASE), "")
                .trim()
                .ifBlank { null }

            items += GradeItem(
                id = "$depth-$name-${items.size}",
                name = name,
                depth = depth,
                isGroup = false,
                points = gradeCell(cells, 0),
                achieved = gradeCell(cells, 1),
                grade = gradeCell(cells, 2),
                comment = comment,
                url = if (href.isNotBlank() && !href.startsWith("javascript:", ignoreCase = true)) {
                    absolute(href, baseUrl)
                } else {
                    null
                },
            )
        }

        // A top-level row is a category when the row beneath it is indented.
        for (index in 0 until items.size - 1) {
            if (items[index].depth == 0 && items[index + 1].depth > 0) {
                items[index] = items[index].copy(isGroup = true)
            }
        }

        return items
    }

    private fun gradeCell(cells: List<Element>, index: Int): String? {
        val value = normalize(cells.getOrNull(index)?.text().orEmpty()).trim()
        if (value.isBlank()) return null
        // D2L writes "&nbsp;" for an empty cell and "- %" for an ungraded item.
        if (Regex("^[\\s/–—-]+$").matches(value)) return null
        return value
    }

    /** Upcoming events widget on the Brightspace home page. */
    fun parseEvents(html: String, baseUrl: String): List<Deadline> {
        val doc = Jsoup.parse(html)
        val found = LinkedHashMap<String, Deadline>()

        doc.select("a[href*=/d2l/le/calendar]").forEach { anchor ->
            val rawHref = anchor.attr("href")
            if (Regex("/d2l/le/calendar/?$", RegexOption.IGNORE_CASE).containsMatchIn(rawHref)) {
                return@forEach
            }
            val href = absolute(rawHref, baseUrl) ?: return@forEach
            val text = normalize(
                anchor.text().ifBlank { anchor.attr("aria-label") },
            )
            if (text.length < 3) return@forEach
            if (Regex("^(calendar|upcoming events|view all)$", RegexOption.IGNORE_CASE).matches(text)) {
                return@forEach
            }
            if (Regex("^\\d+$").matches(text)) return@forEach

            val root = cardRoot(anchor, "a[href*=/d2l/le/calendar]", 600)
            val container = normalize(root.text())
            val datetime = root.selectFirst("time[datetime]")?.attr("datetime")
                ?: anchor.selectFirst("time")?.attr("datetime")
            val startsAt = parseWhen(container, datetime, rawHref)
            val courseCode = findCourseCode(container)
            val key = "$href|$text"
            found.putIfAbsent(key, Deadline(key, text, courseCode, startsAt, href))
        }

        return found.values.toList()
    }

    /** The month grid at /d2l/le/calendar/<home org unit>. */
    fun parseCalendarMonth(
        html: String,
        calendarUrl: String,
        courses: List<Course>,
    ): List<Deadline> {
        val doc = Jsoup.parse(html)
        val found = LinkedHashMap<String, Deadline>()

        var month = -1
        var year = 0
        val next = Regex("aria-label=\"Next: ([A-Za-z]+) (\\d{4})\"").find(html)
        val previous = Regex("aria-label=\"Previous: ([A-Za-z]+) (\\d{4})\"").find(html)
        val shifted = next ?: previous
        if (shifted != null) {
            val name = shifted.groupValues[1].lowercase(Locale.US).take(3)
            val index = MONTHS.indexOf(name)
            if (index >= 0) {
                val delta = if (next != null) -1 else 1
                year = shifted.groupValues[2].toInt()
                month = index + delta
                if (month < 0) {
                    month = 11
                    year -= 1
                } else if (month > 11) {
                    month = 0
                    year += 1
                }
            }
        }

        doc.select("a.d2l-le-calendar-event").forEach { node ->
            val rawTitle = normalize(
                node.attr("title").ifBlank {
                    node.selectFirst(".d2l-le-calendar-event-title")?.text().orEmpty()
                },
            )
            if (rawTitle.length < 3) return@forEach

            val cell = node.closest("td") ?: return@forEach
            if (cell.hasClass("d2l-le-calendar-month-other")) return@forEach

            val dayCell = node.closest(".d2l-le-calendar-month-day") ?: cell
            val dayNode = dayCell.clone()
            dayNode.select("a, .d2l-floating-container, .d2l-le-calendar-event-time").remove()
            val day = Regex("(\\d{1,2})").find(normalize(dayNode.text()))?.groupValues?.get(1)?.toInt() ?: 0

            val time = clockTime(
                normalize(node.selectFirst(".d2l-le-calendar-event-time")?.text().orEmpty()),
            )

            val startsAt = if (month >= 0 && day > 0) {
                date(year, month, day, time?.first ?: 0, time?.second ?: 0)
            } else {
                null
            }

            val (title, courseCode) = cleanEventTitle(rawTitle, courses)
            val key = "$title|${startsAt ?: ""}"
            found.putIfAbsent(
                key,
                Deadline(key, title, courseCode, startsAt, calendarUrl),
            )
        }

        return found.values.toList()
    }

    /** The course announcements page (/d2l/lms/news/main.d2l?ou=<id>). */
    fun parseAnnouncements(html: String, baseUrl: String): List<Announcement> {
        val doc = Jsoup.parse(html)
        val found = LinkedHashMap<String, Announcement>()

        doc.select("a[href*=/d2l/le/news/]").forEach { anchor ->
            val rawHref = anchor.attr("href")
            if (!Regex("/view(?:\\?|$)").containsMatchIn(rawHref)) return@forEach
            val url = absolute(rawHref, baseUrl) ?: return@forEach
            val id = Regex("/news/\\d+/(\\d+)/").find(rawHref)?.groupValues?.get(1) ?: url

            val title = normalize(anchor.text().ifBlank { anchor.attr("title") })
            if (title.length < 3) return@forEach

            val row = anchor.closest("tr")
            val dateText = normalize(
                row?.select("td label")?.lastOrNull()?.text().orEmpty(),
            )
            val published = parseFuzzyDate(dateText)

            val bodyNode = row?.nextElementSibling()?.selectFirst("d2l-html-block")
            val rawBody = bodyNode?.attr("html").orEmpty().ifBlank { bodyNode?.html().orEmpty() }
            val bodyText = normalize(Jsoup.parse(rawBody).text()).take(600)

            found.putIfAbsent(
                id,
                Announcement(id, title, published, bodyText, url),
            )
        }

        return found.values.toList()
    }

    private fun cleanEventTitle(raw: String, courses: List<Course>): Pair<String, String?> {
        var text = normalize(raw)
        var code: String? = null

        for (course in courses.sortedByDescending { it.name.length }) {
            if (course.name.isNotBlank() && text.endsWith(course.name)) {
                text = normalize(text.dropLast(course.name.length))
                    .replace(Regex("[\\s\\-–|]+$"), "")
                code = course.code.ifBlank { null }
                break
            }
        }

        text = text.replace(Regex("\\s*[-–|]\\s*(due|ends|starts|event)\\s*$", RegexOption.IGNORE_CASE), "").trim()
        return (text.ifBlank { normalize(raw) }) to (code ?: findCourseCode(raw))
    }

    private fun clockTime(text: String): Pair<Int, Int>? {
        val match = Regex("(\\d{1,2}):(\\d{2})\\s*([AP])\\.?\\s*M\\.?", RegexOption.IGNORE_CASE)
            .find(text) ?: return null
        var hours = match.groupValues[1].toInt() % 12
        if (match.groupValues[3].uppercase(Locale.US) == "P") hours += 12
        return hours to match.groupValues[2].toInt()
    }

    private fun parseFuzzyDate(text: String): Long? {
        val match = Regex("([A-Za-z]{3,9})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})").find(text)
            ?: return null
        val index = MONTH_NAMES.indexOfFirst {
            it.startsWith(match.groupValues[1].lowercase(Locale.US).take(3))
        }
        if (index < 0) return null
        val time = clockTime(text)
        return try {
            LocalDateTime.of(
                match.groupValues[3].toInt(),
                index + 1,
                match.groupValues[2].toInt(),
                time?.first ?: 0,
                time?.second ?: 0,
            ).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        } catch (_: Exception) {
            null
        }
    }

    private fun parseWhen(container: String, datetime: String?, href: String?): Long? {
        if (!datetime.isNullOrBlank()) {
            // `<time datetime>` values are wall-clock times on the D2L site, so
            // read them in the phone's zone before trying explicit offsets.
            try {
                return LocalDateTime.parse(datetime).atZone(ZoneId.systemDefault())
                    .toInstant().toEpochMilli()
            } catch (_: Exception) {
                // Try the other ISO shapes below.
            }
            try {
                return OffsetDateTime.parse(datetime).toInstant().toEpochMilli()
            } catch (_: Exception) {
                // Brightspace sometimes uses a plain UTC timestamp.
            }
            try {
                return Instant.parse(datetime).toEpochMilli()
            } catch (_: Exception) {
                // Fall through to the visible date text.
            }
        }

        val urlDate = href?.let {
            Regex("[?&]d=(\\d{4}-\\d{2}-\\d{2})").find(it)?.groupValues?.get(1)
        }
        val match = Regex(
            "\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s+(\\d{1,2})(?:,?\\s*(\\d{4}))?",
            RegexOption.IGNORE_CASE,
        ).find(container)

        if (match == null) {
            return urlDate?.let {
                try {
                    LocalDate.parse(it).atStartOfDay(ZoneId.systemDefault())
                        .toInstant().toEpochMilli()
                } catch (_: Exception) {
                    null
                }
            }
        }

        val month = MONTHS.indexOf(match.groupValues[1].lowercase(Locale.US).take(3))
        if (month < 0) return null
        val day = match.groupValues[2].toInt()
        val year = match.groupValues[3].ifBlank { LocalDate.now().year.toString() }.toInt()
        val time = clockTime(container)
        return date(year, month, day, time?.first ?: 0, time?.second ?: 0)
    }

    private fun date(year: Int, month: Int, day: Int, hours: Int, minutes: Int): Long? = try {
        LocalDateTime.of(year, month + 1, day, hours, minutes)
            .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
    } catch (_: Exception) {
        null
    }
}
