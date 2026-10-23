package com.d2lhub.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class D2lParserTest {
    private val base = "https://courses.torontomu.ca"

    private val homeHtml = """
        <html><body>
          <h1>Welcome back, Shafin</h1>
          <div class="courses-widget">
            <div class="d2l-card">
              <a href="/d2l/home/11111" aria-label="MTH140 - Calculus I - F2026">
                <img src="/content/enforced/11111/banner.png" alt="" />
              </a>
              <h3>MTH140 - Calculus I - F2026</h3>
              <p>MTH140_F26_01</p>
            </div>
            <div class="d2l-card">
              <a href="/d2l/home/22222" aria-label="CHY102 - General Chemistry - F2026">
                <h3>CHY102 - General Chemistry - F2026</h3>
                <p>CHY102_F26_01</p>
              </a>
            </div>
            <div class="d2l-card">
              <a href="/d2l/home/22222">CHY102_F26_01</a>
            </div>
            <div class="d2l-card">
              <a href="/d2l/home/33333">PD_EHS_WHMIS_STUDENTS</a>
              <h4>WHMIS for Students</h4>
            </div>
          </div>
          <a href="/d2l/home">Home</a>
          <a href="/d2l/home/44444">View All Courses (9)</a>
        </body></html>
    """.trimIndent()

    private val eventsHtml = """
        <html><body>
          <div class="upcoming-events">
            <div class="event">
              <span>OCT 28</span>
              <a href="/d2l/le/calendar/6606/events/9001">Academic Integrity Quiz - Availability Ends</a>
              <time datetime="2026-10-28T15:00:00">3:00 PM</time>
              <span>CEN100_F26_03</span>
            </div>
            <div class="event">
              <span>Nov 4</span>
              <a href="/d2l/le/calendar/6606/events/9002">Assignment 4 - Problem Set Due</a>
              <span>11:59 PM</span>
              <span>MTH140_F26_01</span>
            </div>
            <a href="/d2l/le/calendar">Calendar</a>
          </div>
        </body></html>
    """.trimIndent()

    private val calendarCourses = listOf(
        Course(
            id = "1194174",
            name = "CEN100 - 3 - Introduction to Engineering - F2026",
            code = "CEN100_F26_03",
            url = "$base/d2l/home/1194174",
        ),
        Course(
            id = "1202805",
            name = "CHY102 - General Chemistry - F2026",
            code = "CHY102_F26_01",
            url = "$base/d2l/home/1202805",
        ),
    )

    private val calendarHtml = """
        <html><body>
          <a class="d2l-iterator-button-next" aria-label="Next: November 2026" href="javascript:void(0);">Next</a>
          <a class="d2l-iterator-button-prev" aria-label="Previous: September 2026" href="javascript:void(0);">Prev</a>
          <table><tbody><tr>
            <td class="d2l-le-calendar-month-other"><div class="d2l-le-calendar-month-day"> 30</div></td>
            <td>
              <div class="d2l-le-calendar-month-day"> 2<a title="Project Outline and User Research (Milestone 2) - Due - CEN100 - 3 - Introduction to Engineering - F2026" class="d2l-le-calendar-event" href="javascript:void(0);">
                <span class="d2l-le-calendar-event-time">11:59 PM</span>
                <span class="d2l-le-calendar-event-title">Project Outline and User Research (Milestone 2) - Due</span>
              </a>
              <div class="d2l-floating-container d2l-hidden"><div class="d2l-le-calendar-event-overlay">
                <abbr class="d2l-fuzzydate" data-date="1790999999000" title="Oct 2, 2026 11:59 PM">October 2 at 11:59 PM</abbr>
              </div></div>
              <div class="d2l-le-calendar-month-day"> 14<a title="Academic Integrity Quiz - Ends - CHY102 - General Chemistry - F2026" class="d2l-le-calendar-event" href="javascript:void(0);">
                <span class="d2l-le-calendar-event-time">3:00 PM</span>
              </a></div>
            </td>
            <td><div class="d2l-le-calendar-month-day"> 31</div></td>
          </tr></tbody></table>
        </body></html>
    """.trimIndent()

    @Test
    fun readsCourseTilesCodesAndUrls() {
        val courses = D2lParser.parseCourses(homeHtml, base)

        assertEquals(3, courses.size)
        val calculus = courses.first { it.id == "11111" }
        assertEquals("MTH140 - Calculus I - F2026", calculus.name)
        assertEquals("MTH140_F26_01", calculus.code)
        assertEquals("$base/d2l/home/11111", calculus.url)
    }

    @Test
    fun deduplicatesOrgUnitsAndSkipsNavigation() {
        val courses = D2lParser.parseCourses(homeHtml, base)
        val ids = courses.map { it.id }

        assertEquals(ids.size, ids.toSet().size)
        assertFalse(ids.contains("44444"))
        assertTrue(courses.none { it.name.startsWith("View All", ignoreCase = true) })
    }

    @Test
    fun fallsBackToTheEnrollmentCodeWhenNoHeadingExists() {
        val whmis = D2lParser.parseCourses(homeHtml, base).first { it.id == "33333" }

        assertEquals("WHMIS for Students", whmis.name)
        assertEquals("PD_EHS_WHMIS_STUDENTS", whmis.code)
    }

    @Test
    fun returnsNothingWithoutCourseTiles() {
        assertTrue(D2lParser.parseCourses("<html><body><p>Sign in</p></body></html>", base).isEmpty())
    }

    @Test
    fun readsUpcomingEventsWithDatesAndCodes() {
        val events = D2lParser.parseEvents(eventsHtml, base)

        assertEquals(2, events.size)
        val quiz = events.first { it.title.startsWith("Academic Integrity") }
        assertEquals("CEN100_F26_03", quiz.courseCode)
        assertEquals("$base/d2l/le/calendar/6606/events/9001", quiz.url)

        val quizTime = Instant.ofEpochMilli(quiz.startsAt!!).atZone(ZoneId.systemDefault())
        assertEquals(10, quizTime.monthValue)
        assertEquals(28, quizTime.dayOfMonth)
        assertEquals(15, quizTime.hour)
    }

    @Test
    fun parsesMonthDayTextWhenNoTimeElementExists() {
        val events = D2lParser.parseEvents(eventsHtml, base)
        val assignment = events.first { it.title.startsWith("Assignment 4") }
        val parsed = Instant.ofEpochMilli(assignment.startsAt!!).atZone(ZoneId.systemDefault())

        assertEquals("MTH140_F26_01", assignment.courseCode)
        assertEquals(11, parsed.monthValue)
        assertEquals(4, parsed.dayOfMonth)
        assertEquals(23, parsed.hour)
        assertEquals(59, parsed.minute)
    }

    @Test
    fun skipsTheCalendarNavigationLink() {
        val events = D2lParser.parseEvents(eventsHtml, base)
        assertTrue(events.none { it.title.equals("Calendar", ignoreCase = true) })
    }

    @Test
    fun readsTheMonthGridWithCleanedTitlesAndCodes() {
        val events = D2lParser.parseCalendarMonth(calendarHtml, "$base/d2l/le/calendar/6606", calendarCourses)

        assertEquals(2, events.size)
        val milestone = events.first { it.title.startsWith("Project Outline") }
        assertEquals("Project Outline and User Research (Milestone 2)", milestone.title)
        assertEquals("CEN100_F26_03", milestone.courseCode)
        assertEquals("$base/d2l/le/calendar/6606", milestone.url)

        val startsAt = Instant.ofEpochMilli(milestone.startsAt!!).atZone(ZoneId.systemDefault())
        assertEquals(10, startsAt.monthValue)
        assertEquals(2, startsAt.dayOfMonth)
        assertEquals(23, startsAt.hour)
        assertEquals(59, startsAt.minute)
    }

    @Test
    fun handlesSeveralEventsInOneDayAndSkipsOtherMonths() {
        val events = D2lParser.parseCalendarMonth(calendarHtml, "$base/d2l/le/calendar/6606", calendarCourses)
        val quiz = events.first { it.title.startsWith("Academic Integrity") }
        val parsed = Instant.ofEpochMilli(quiz.startsAt!!).atZone(ZoneId.systemDefault())

        assertEquals("CHY102_F26_01", quiz.courseCode)
        assertEquals(14, parsed.dayOfMonth)
        assertEquals(15, parsed.hour)
    }

    @Test
    fun returnsNothingForAnEmptyCalendar() {
        assertTrue(
            D2lParser.parseCalendarMonth("<html><body></body></html>", "$base/d2l/le/calendar/6606", emptyList())
                .isEmpty(),
        )
    }

    @Test
    fun readsAnnouncementsWithDatesAndBodies() {
        val html = """
            <html><body>
              <table>
                <tr>
                  <td>
                    <a href="/d2l/le/news/12345/98765/view">Lab 1 posted</a>
                    <label>Oct 3, 2026</label>
                  </td>
                </tr>
                <tr class="d_detailsRow">
                  <td><d2l-html-block html="&lt;p&gt;Read the lab handout.&lt;/p&gt;"><p>Read the lab handout.</p></d2l-html-block></td>
                </tr>
              </table>
            </body></html>
        """.trimIndent()

        val announcements = D2lParser.parseAnnouncements(html, "$base/d2l/lms/news/main.d2l?ou=12345")

        assertEquals(1, announcements.size)
        val announcement = announcements.single()
        assertEquals("Lab 1 posted", announcement.title)
        assertEquals("Read the lab handout.", announcement.body)
        assertEquals("$base/d2l/le/news/12345/98765/view", announcement.url)
        assertNotNull(announcement.publishedAt)
    }

    @Test
    fun announcementWithoutABodyStillParses() {
        val html = """
            <table><tr><td>
              <a href="/d2l/le/news/1/2/view">Welcome</a>
            </td></tr></table>
        """.trimIndent()

        val announcement = D2lParser.parseAnnouncements(html, base).single()
        assertEquals("Welcome", announcement.title)
        assertEquals("", announcement.body)
        assertNull(announcement.publishedAt)
    }

    private val contentHtml = """
        <html><body>
          <h2>List of Topics and Sub-Modules for Tutorials F26</h2>
          <ul id="D2L_LE_Content_TreeBrowser" class="d2l-le-TreeAccordion">
            <li data-key="TOC" class="d2l-le-TreeAccordionItem">
              <a class="d2l-le-TreeAccordionItem-anchor"><div class="d2l-textblock">Table of Contents</div></a>
            </li>
            <li data-key="D2L.LE.Content.ContentObject.ModuleCO-7128748" class="d2l-le-TreeAccordionItem">
              <a class="d2l-le-TreeAccordionItem-anchor"><div class="d2l-textblock">Course Outline 2026</div></a>
            </li>
            <li data-key="D2L.LE.Content.ContentObject.ModuleCO-7240902" class="d2l-le-TreeAccordionItem">
              <a class="d2l-le-TreeAccordionItem-anchor">
                <div class="d2l-textblock">Assignments F26</div>
                <d2l-count-badge number="12" title="12 out of 19 topics remaining"></d2l-count-badge>
              </a>
              <ul>
                <li data-key="D2L.LE.Content.ContentObject.ModuleCO-7128766" class="d2l-le-TreeAccordionItem">
                  <a class="d2l-le-TreeAccordionItem-anchor"><div class="d2l-textblock">Personal Introduction Assignment</div></a>
                </li>
              </ul>
            </li>
          </ul>
          <div class="d2l-datalist-container">
            <div class="d2l-topic-view">
              <a class="d2l-link" href="/d2l/le/content/1194174/viewContent/7249214/View" title="'CEN100_Lab1' - PDF document">CEN100_Lab1_TeamworkTeamContract_F26</a>
              <div class="d2l-container-icon"><div class="d2l-textblock">PDF document</div></div>
            </div>
          </div>
          <div class="d2l-datalist-container">
            <div class="d2l-topic-view">
              <a class="d2l-link" href="/d2l/le/content/1194174/viewContent/7249225/View">Predictive_FMEA_Template_F26_.xlsx</a>
              <div class="d2l-container-icon"><div class="d2l-textblock">Excel Spreadsheet</div></div>
            </div>
          </div>
          <div class="d2l-datalist-container">
            <div class="d2l-topic-view">
              <a class="d2l-link" href="/d2l/le/content/1194174/viewContent/7249214/View">Duplicate topic link</a>
            </div>
          </div>
        </body></html>
    """.trimIndent()

    @Test
    fun readsContentModulesWithoutTheTableOfContents() {
        val modules = D2lParser.parseContentModules(contentHtml)

        assertEquals(
            listOf("Course Outline 2026", "Assignments F26", "Personal Introduction Assignment"),
            modules.map { it.name },
        )
        assertEquals(0, modules[0].depth)
        assertEquals("7240902", modules[1].id)
        assertEquals(12, modules[1].remaining)
        assertEquals(19, modules[1].total)
        assertEquals(1, modules[2].depth)
    }

    @Test
    fun readsTheSelectedContentModuleTitle() {
        assertEquals("Tutorials F26", D2lParser.parseContentModuleTitle(contentHtml))
        assertNull(D2lParser.parseContentModuleTitle("<html></html>"))
    }

    @Test
    fun readsContentTopicsWithTypeAndAbsoluteLink() {
        val topics = D2lParser.parseContentTopics(contentHtml, base)

        assertEquals(2, topics.size)
        assertEquals("7249214", topics[0].id)
        assertEquals("CEN100_Lab1_TeamworkTeamContract_F26", topics[0].title)
        assertEquals("PDF document", topics[0].type)
        assertEquals("$base/d2l/le/content/1194174/viewContent/7249214/View", topics[0].url)
        assertEquals("Excel Spreadsheet", topics[1].type)
    }

    private val gradesHtml = """
        <html><body>
          <table class="d2l-table" summary="List of grade items and their values">
            <tr class="d_gh" header>
              <th scope="col" colspan="2">Grade Item</th>
              <th scope="col">Points</th>
              <th scope="col">Weight Achieved</th>
              <th scope="col">Grade</th>
              <th scope="col">Comments and Assessments</th>
            </tr>
            <tr>
              <th scope="row" colspan="2" class="d_gt d_ich"><label>Quizzes</label></th>
              <td class="d_gn d_gr d_gt">&nbsp;</td>
              <td class="d_gn d_gr d_gt"><span>5.2 / 20</span></td>
              <td class="d_gn d_gr d_gt"><span>26 %</span></td>
              <td class="d_gt"></td>
            </tr>
            <tr>
              <td class="d_g_treeNodeImage d_g_l_e"></td>
              <th scope="row" class="d_gt d_ich"><label>Quiz 1</label></th>
              <td class="d_gn d_gr d_gt">&nbsp;</td>
              <td class="d_gn d_gr d_gt"><span>3.2 / 4</span></td>
              <td class="d_gn d_gr d_gt"><span>80 %</span></td>
              <td class="d_gt"><a class="d2l-link" href="/d2l/lms/quizzing/user/quiz_submissions.d2l?ou=1188064&amp;qi=507834">View Quiz Attempts</a></td>
            </tr>
            <tr>
              <td class="d_g_treeNodeImage d_g_l_e"></td>
              <th scope="row" class="d_gt d_ich"><label>Quiz 2</label></th>
              <td class="d_gn d_gr d_gt">&nbsp;</td>
              <td class="d_gn d_gr d_gt"><span>2 / 4</span></td>
              <td class="d_gn d_gr d_gt"><span>50 %</span></td>
              <td class="d_gt"></td>
            </tr>
            <tr>
              <th scope="row" colspan="2" class="d_gt d_ich"><label>Final Exam</label></th>
              <td class="d_gn d_gr d_gt">&nbsp;</td>
              <td class="d_gn d_gr d_gt"><span>0 / 45</span></td>
              <td class="d_gn d_gr d_gt"><span>- %</span></td>
              <td class="d_gt"></td>
            </tr>
          </table>
        </body></html>
    """.trimIndent()

    @Test
    fun readsGradeRowsWithWeightsAndGrades() {
        val items = D2lParser.parseGrades(gradesHtml, base)

        assertEquals(4, items.size)
        assertEquals("Quizzes", items[0].name)
        assertTrue(items[0].isGroup)
        assertEquals(0, items[0].depth)
        assertEquals("5.2 / 20", items[0].achieved)
        assertEquals("26 %", items[0].grade)
        assertEquals("Quiz 1", items[1].name)
        assertFalse(items[1].isGroup)
        assertEquals(1, items[1].depth)
        assertEquals("80 %", items[1].grade)
    }

    @Test
    fun linksGradedItemsBackToD2l() {
        val items = D2lParser.parseGrades(gradesHtml, base)

        assertEquals(
            "$base/d2l/lms/quizzing/user/quiz_submissions.d2l?ou=1188064&qi=507834",
            items[1].url,
        )
        assertNull(items[1].comment)
        assertNull(items[2].url)
    }

    @Test
    fun keepsUngradedItemsAndHandlesPagesWithoutAGradebook() {
        val items = D2lParser.parseGrades(gradesHtml, base)
        assertEquals("Final Exam", items[3].name)
        assertEquals("- %", items[3].grade)
        assertFalse(items[3].isGroup)

        assertTrue(D2lParser.parseGrades("<html><body><p>No grades</p></body></html>", base).isEmpty())
    }
}
