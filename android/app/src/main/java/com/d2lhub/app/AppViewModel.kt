package com.d2lhub.app

import android.app.Application
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.d2lhub.app.data.AiClient
import com.d2lhub.app.data.AiProvider
import com.d2lhub.app.data.AiSettings
import com.d2lhub.app.data.AiSettingsStore
import com.d2lhub.app.data.Announcement
import com.d2lhub.app.data.AppNotification
import com.d2lhub.app.data.AppearanceStore
import com.d2lhub.app.data.CalendarRange
import com.d2lhub.app.data.CalendarSource
import com.d2lhub.app.data.ContentModule
import com.d2lhub.app.data.ContentSpaceStore
import com.d2lhub.app.data.ContentTopic
import com.d2lhub.app.data.Course
import com.d2lhub.app.data.CourseContent
import com.d2lhub.app.data.CourseGrades
import com.d2lhub.app.data.D2lClient
import com.d2lhub.app.data.Deadline
import com.d2lhub.app.data.DownloadNotifier
import com.d2lhub.app.data.DriveEntry
import com.d2lhub.app.data.ExamBankClient
import com.d2lhub.app.data.ExamBankFolder
import com.d2lhub.app.data.ExamCrumb
import com.d2lhub.app.data.ExternalEvent
import com.d2lhub.app.data.MUES_FOLDER_ID
import com.d2lhub.app.data.GoogleCalendar
import com.d2lhub.app.data.IntegrationsStore
import com.d2lhub.app.data.NotificationFeed
import com.d2lhub.app.data.NOTIFICATION_PAGE
import com.d2lhub.app.data.NotificationsStore
import com.d2lhub.app.data.NotionClient
import com.d2lhub.app.data.NotionDatabase
import com.d2lhub.app.data.OutlineDraft
import com.d2lhub.app.data.OutlineFileReader
import com.d2lhub.app.data.OutlineParser
import com.d2lhub.app.data.OutlineStore
import com.d2lhub.app.data.Profile
import com.d2lhub.app.data.SavedFile
import com.d2lhub.app.data.SessionStore
import com.d2lhub.app.data.announcementNotifications
import com.d2lhub.app.data.MAX_NOTIFICATIONS
import com.d2lhub.app.data.notificationFeed
import com.d2lhub.app.data.offlineQueue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.File

data class CourseDetailState(
    val course: Course,
    val announcements: List<Announcement> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
)

data class GoogleState(
    val connected: Boolean = false,
    val label: String? = null,
    val lastSync: Long? = null,
    val error: String? = null,
    val count: Int = 0,
)

data class NotionState(
    val connected: Boolean = false,
    val title: String? = null,
    val lastSync: Long? = null,
    val error: String? = null,
    val count: Int = 0,
)

/** Progress of a module-wide "Save for offline"; null when nothing is running. */
data class OfflineSave(
    val moduleId: String?,
    val moduleLabel: String,
    val total: Int,
    val done: Int = 0,
    val failed: Int = 0,
    val current: String? = null,
    val cancelling: Boolean = false,
)

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val store = SessionStore(application)
    private val integrations = IntegrationsStore(application)
    private val aiStore = AiSettingsStore(application)
    private val outlineStore = OutlineStore(application)
    private val appearanceStore = AppearanceStore(application)
    private val contentSpaceStore = ContentSpaceStore(application)
    private val examBankClient = ExamBankClient()
    private val downloadNotifier = DownloadNotifier(application)
    private val notificationsStore = NotificationsStore(application)

    var session by mutableStateOf(store.read())
        private set

    var courses by mutableStateOf<List<Course>>(emptyList())
        private set

    var deadlines by mutableStateOf<List<Deadline>>(emptyList())
        private set

    var profile by mutableStateOf<Profile?>(null)
        private set

    var loading by mutableStateOf(session != null)
        private set

    var refreshing by mutableStateOf(false)
        private set

    var error by mutableStateOf<String?>(null)
        private set

    var lastUpdated by mutableStateOf<Long?>(null)
        private set

    var courseDetail by mutableStateOf<CourseDetailState?>(null)
        private set

    var courseGrades by mutableStateOf<CourseGrades?>(null)
        private set

    var gradesLoading by mutableStateOf(false)
        private set

    var gradesError by mutableStateOf<String?>(null)
        private set

    var courseContent by mutableStateOf<CourseContent?>(null)
        private set

    var contentLoading by mutableStateOf(false)
        private set

    var contentModuleLoading by mutableStateOf(false)
        private set

    var contentError by mutableStateOf<String?>(null)
        private set

    // -----------------------------------------------------------------------
    // Appearance
    // -----------------------------------------------------------------------

    var appearance by mutableStateOf(appearanceStore.read())
        private set

    var appearanceBusy by mutableStateOf(false)
        private set

    var appearanceError by mutableStateOf<String?>(null)
        private set

    // -----------------------------------------------------------------------
    // Content Space and the exam bank
    // -----------------------------------------------------------------------

    var savedFiles by mutableStateOf(contentSpaceStore.list())
        private set

    /** Row keys with a download in progress, e.g. "topic:123" or "drive:abc". */
    var transferKeys by mutableStateOf<Set<String>>(emptySet())
        private set

    var libraryNotice by mutableStateOf<String?>(null)
        private set

    var libraryError by mutableStateOf<String?>(null)
        private set

    var offlineSave by mutableStateOf<OfflineSave?>(null)
        private set

    private var offlineSaveCancelled = false

    var examBankFolder by mutableStateOf<ExamBankFolder?>(null)
        private set

    var examBankCrumbs by mutableStateOf<List<ExamCrumb>>(emptyList())
        private set

    var examBankLoading by mutableStateOf(false)
        private set

    var examBankError by mutableStateOf<String?>(null)
        private set

    private val examBankCache = mutableMapOf<String, ExamBankFolder>()

    // -----------------------------------------------------------------------
    // Notifications bell
    // -----------------------------------------------------------------------

    var notifications by mutableStateOf(NotificationFeed())
        private set

    var notificationsLoading by mutableStateOf(false)
        private set

    var notificationsError by mutableStateOf<String?>(null)
        private set

    private var notificationRows: List<AppNotification> = emptyList()
    private var notificationsFetchedAt = 0L
    private var notificationsLimit = NOTIFICATION_PAGE

    // -----------------------------------------------------------------------
    // Connected calendars
    // -----------------------------------------------------------------------

    var google by mutableStateOf(GoogleState())
        private set

    var notion by mutableStateOf(NotionState())
        private set

    /** Google Calendar and Notion entries, merged and sorted for the dashboard. */
    var externalEvents by mutableStateOf<List<ExternalEvent>>(emptyList())
        private set

    var googleBusy by mutableStateOf(false)
        private set

    var notionBusy by mutableStateOf(false)
        private set

    var notionDatabases by mutableStateOf<List<NotionDatabase>?>(null)
        private set

    var notionPickerError by mutableStateOf<String?>(null)
        private set

    var calendarRefreshing by mutableStateOf(false)
        private set

    private var googleEvents: List<ExternalEvent> = emptyList()
    private var notionEvents: List<ExternalEvent> = emptyList()

    /** Day / 3 days / Week / Month, kept while switching tabs. */
    var calendarRange by mutableStateOf(CalendarRange.MONTH)
        private set

    /** Sources the student unchecked in the Calendar tab. */
    var hiddenCalendarSources by mutableStateOf<Set<CalendarSource>>(emptySet())
        private set

    // -----------------------------------------------------------------------
    // AI + course outlines
    // -----------------------------------------------------------------------

    var aiSettings by mutableStateOf(aiStore.read())
        private set

    var aiBusy by mutableStateOf(false)
        private set

    var aiError by mutableStateOf<String?>(null)
        private set

    var aiNotice by mutableStateOf<String?>(null)
        private set

    var outlineDrafts by mutableStateOf<List<OutlineDraft>>(emptyList())
        private set

    var outlineBusy by mutableStateOf(false)
        private set

    var outlineError by mutableStateOf<String?>(null)
        private set

    var outlineNote by mutableStateOf<String?>(null)
        private set

    var outlineFileName by mutableStateOf<String?>(null)
        private set

    private var d2lDeadlines: List<Deadline> = emptyList()

    init {
        // A progress bar left behind by a killed process would otherwise stay
        // in the shade forever.
        downloadNotifier.clearProgress()
        val stored = integrations.read()
        google = GoogleState(
            connected = stored.hasGoogle,
            label = stored.googleLabel,
            lastSync = stored.googleLastSync,
            error = stored.googleError,
        )
        notion = NotionState(
            connected = stored.hasNotion,
            title = stored.notionTitle,
            lastSync = stored.notionLastSync,
            error = stored.notionError,
        )
        publishDeadlines()
        if (session != null) refresh()
    }

    fun signedIn(baseUrl: String, cookie: String) {
        store.save(baseUrl, cookie, null)
        session = store.read()
        refresh()
    }

    fun signOut() {
        store.clear()
        session = null
        profile = null
        courses = emptyList()
        d2lDeadlines = emptyList()
        deadlines = emptyList()
        lastUpdated = null
        error = null
        courseDetail = null
        courseGrades = null
        gradesError = null
        gradesLoading = false
        courseContent = null
        contentError = null
        contentLoading = false
        contentModuleLoading = false
        loading = false
        notifications = NotificationFeed()
        notificationRows = emptyList()
        notificationsFetchedAt = 0L
        notificationsError = null
        notificationsLoading = false
        notificationsLimit = NOTIFICATION_PAGE
        notificationsStore.clear()
    }

    fun refresh() {
        val current = session ?: return
        if (refreshing) return
        refreshing = true
        loading = courses.isEmpty()
        error = null

        viewModelScope.launch {
            val client = D2lClient(current.baseUrl, current.cookie)
            try {
                val loadedProfile = withContext(Dispatchers.IO) { client.whoAmI() }
                val loadedCourses = withContext(Dispatchers.IO) { client.courses() }
                if (loadedCourses.isEmpty()) {
                    throw IllegalStateException(
                        "No courses came back — your D2L session may have expired. Sign in again.",
                    )
                }
                val loadedDeadlines = withContext(Dispatchers.IO) { client.deadlines(loadedCourses) }

                profile = loadedProfile
                courses = loadedCourses.sortedBy { it.name.lowercase() }
                d2lDeadlines = loadedDeadlines.sortedBy { it.startsAt ?: Long.MAX_VALUE }
                publishDeadlines()
                lastUpdated = System.currentTimeMillis()
                loading = false
                loadNotifications()

                loadedProfile?.name?.let { name ->
                    store.save(current.baseUrl, current.cookie, name)
                    session = store.read()
                }
            } catch (exception: Exception) {
                error = exception.message ?: "Could not reach D2L."
                loading = false
            } finally {
                refreshing = false
            }
        }

        syncCalendars()
    }

    fun syncCalendars() {
        val stored = integrations.read()
        if (!stored.hasGoogle && !stored.hasNotion) return
        if (calendarRefreshing) return
        calendarRefreshing = true

        viewModelScope.launch {
            val now = System.currentTimeMillis()
            var fetchedGoogle = emptyList<ExternalEvent>()
            var fetchedNotion = emptyList<ExternalEvent>()
            var googleError: String? = null
            var notionError: String? = null
            var googleLabel = stored.googleLabel

            if (stored.hasGoogle) {
                withContext(Dispatchers.IO) {
                    runCatching { GoogleCalendar.fetch(stored.googleUrl.orEmpty(), now) }
                }.onSuccess { feed ->
                    fetchedGoogle = feed.events
                    googleLabel = feed.name ?: stored.googleLabel ?: hostOf(stored.googleUrl.orEmpty())
                }.onFailure {
                    googleError = it.message ?: "Could not read that Google Calendar feed."
                }
            }

            if (stored.hasNotion) {
                withContext(Dispatchers.IO) {
                    runCatching {
                        NotionClient(stored.notionToken.orEmpty()).events(
                            NotionDatabase(
                                id = stored.notionDatabaseId.orEmpty(),
                                title = stored.notionTitle.orEmpty().ifBlank { "Notion" },
                                dateProperty = stored.notionDateProperty,
                            ),
                            now,
                        )
                    }
                }.onSuccess { fetchedNotion = it }.onFailure {
                    notionError = it.message ?: "Could not read that Notion database."
                }
            }

            if (stored.hasGoogle) integrations.saveGoogleSync(googleLabel, now, googleError)
            if (stored.hasNotion) integrations.saveNotionSync(now, notionError)

            google = GoogleState(
                connected = stored.hasGoogle,
                label = googleLabel,
                lastSync = if (stored.hasGoogle) now else stored.googleLastSync,
                error = googleError,
                count = fetchedGoogle.size,
            )
            notion = NotionState(
                connected = stored.hasNotion,
                title = stored.notionTitle,
                lastSync = if (stored.hasNotion) now else stored.notionLastSync,
                error = notionError,
                count = fetchedNotion.size,
            )

            googleEvents = fetchedGoogle
            notionEvents = fetchedNotion
            publishEvents()
            calendarRefreshing = false
        }
    }

    fun clearGoogleError() {
        google = google.copy(error = null)
    }

    fun selectCalendarRange(range: CalendarRange) {
        calendarRange = range
    }

    fun toggleCalendarSource(source: CalendarSource) {
        hiddenCalendarSources = if (source in hiddenCalendarSources) {
            hiddenCalendarSources - source
        } else {
            hiddenCalendarSources + source
        }
    }

    fun connectGoogle(rawUrl: String) {
        val url = GoogleCalendar.normalizeUrl(rawUrl)
        if (url == null) {
            google = google.copy(error = "Paste the full https:// address of the calendar.")
            return
        }
        if (googleBusy) return
        googleBusy = true
        google = google.copy(error = null)

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { GoogleCalendar.fetch(url) } }
            googleBusy = false
            result.onSuccess { feed ->
                val label = feed.name ?: hostOf(url)
                integrations.saveGoogle(url, label)
                googleEvents = feed.events
                publishEvents()
                google = GoogleState(
                    connected = true,
                    label = label,
                    lastSync = System.currentTimeMillis(),
                    error = null,
                    count = feed.events.size,
                )
            }.onFailure {
                google = google.copy(error = it.message ?: "Could not connect that calendar.")
            }
        }
    }

    fun disconnectGoogle() {
        integrations.clearGoogle()
        google = GoogleState()
        googleEvents = emptyList()
        publishEvents()
    }

    /** Step one of the Notion flow: check the token and list databases it can see. */
    fun findNotionDatabases(rawToken: String) {
        val token = rawToken.trim()
        if (token.isEmpty()) {
            notionPickerError = "Paste the integration token first."
            return
        }
        if (notionBusy) return
        notionBusy = true
        notionPickerError = null
        notionDatabases = null

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { NotionClient(token).listDatabases() } }
            notionBusy = false
            result.onSuccess { databases ->
                notionDatabases = databases
                if (databases.isEmpty()) {
                    notionPickerError =
                        "No databases are shared with that integration yet. Add the connection in Notion."
                }
            }.onFailure {
                notionPickerError = it.message ?: "Could not reach Notion."
            }
        }
    }

    /** Step two: read the chosen database and remember it. */
    fun connectNotion(rawToken: String, database: NotionDatabase) {
        val token = rawToken.trim()
        if (token.isEmpty()) {
            notionPickerError = "Paste the integration token first."
            return
        }
        if (notionBusy) return
        notionBusy = true
        notionPickerError = null

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { NotionClient(token).events(database) }
            }
            notionBusy = false
            result.onSuccess { events ->
                integrations.saveNotion(token, database.id, database.title, database.dateProperty)
                notionEvents = events
                publishEvents()
                notion = NotionState(
                    connected = true,
                    title = database.title,
                    lastSync = System.currentTimeMillis(),
                    error = null,
                    count = events.size,
                )
                notionDatabases = null
            }.onFailure {
                notionPickerError = it.message ?: "Could not read that database."
            }
        }
    }

    fun disconnectNotion() {
        integrations.clearNotion()
        notion = NotionState()
        notionEvents = emptyList()
        notionDatabases = null
        notionPickerError = null
        publishEvents()
    }

    fun clearNotionPicker() {
        notionDatabases = null
        notionPickerError = null
    }

    private fun publishEvents() {
        externalEvents = (googleEvents + notionEvents).sortedBy { it.startsAt }
    }

    private fun hostOf(url: String): String? =
        runCatching { java.net.URI(url).host }.getOrNull()?.takeIf { it.isNotBlank() }

    // -----------------------------------------------------------------------
    // Appearance
    // -----------------------------------------------------------------------

    fun selectBackground(id: String) {
        appearanceStore.select(id)
        appearance = appearanceStore.read()
        appearanceError = null
    }

    fun useBackgroundPhoto(uri: Uri) {
        if (appearanceBusy) return
        appearanceBusy = true
        appearanceError = null

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { appearanceStore.importPhoto(uri) }
            }
            appearanceBusy = false
            result.onSuccess {
                appearance = appearanceStore.read()
            }.onFailure {
                appearanceError = it.message ?: "That image could not be used."
            }
        }
    }

    fun removeBackgroundPhoto() {
        if (appearanceBusy) return
        appearanceStore.clearPhoto()
        appearance = appearanceStore.read()
        appearanceError = null
    }

    fun clearAppearanceError() {
        appearanceError = null
    }

    // -----------------------------------------------------------------------
    // Content Space and the exam bank
    // -----------------------------------------------------------------------

    fun refreshLibrary() {
        savedFiles = contentSpaceStore.list()
    }

    fun clearLibraryMessages() {
        libraryNotice = null
        libraryError = null
    }

    fun localFileFor(file: SavedFile): File? = contentSpaceStore.fileFor(file)

    fun downloadTopic(course: Course, topic: ContentTopic) {
        val key = "topic:${topic.id}"
        if (key in transferKeys) return
        if (session == null) {
            libraryError = "Sign in to D2L again before saving course files."
            return
        }
        if (topic.url.isBlank()) return
        transferKeys = transferKeys + key
        libraryError = null
        libraryNotice = null
        val folder = courseContent?.moduleTitle

        viewModelScope.launch {
            val result = runCatching { storeTopic(course, topic, folder) }
            result.onSuccess { saved ->
                savedFiles = contentSpaceStore.list()
                libraryNotice = "Saved “${saved.title}” to Content Space."
            }.onFailure {
                libraryError = it.message ?: "Could not save that file."
            }
            transferKeys = transferKeys - key
        }
    }

    /**
     * Downloads every file in the open module that is not saved yet, one at a
     * time, with an ongoing notification and a result at the end.
     */
    fun saveModuleOffline(course: Course) {
        val content = courseContent ?: return
        if (offlineSave != null) return
        if (session == null) {
            libraryError = "Sign in to D2L again before saving course files."
            return
        }

        val queue = offlineQueue(
            content.topics,
            savedFiles.mapNotNull { it.sourceUrl }.toSet(),
        )
        if (queue.isEmpty()) {
            libraryNotice = "Every file in this module is already saved."
            return
        }

        val label = content.moduleTitle ?: "this module"
        val folder = content.moduleTitle
        libraryError = null
        libraryNotice = null
        offlineSaveCancelled = false
        offlineSave = OfflineSave(
            moduleId = content.moduleId,
            moduleLabel = label,
            total = queue.size,
            current = queue.first().title,
        )
        downloadNotifier.progress(
            title = "Saving $label for offline",
            detail = "0 of ${queue.size} files",
            done = 0,
            total = queue.size,
        )

        viewModelScope.launch {
            var done = 0
            var failed = 0
            var firstError: String? = null

            for (topic in queue) {
                if (offlineSaveCancelled) break
                offlineSave = offlineSave?.copy(current = topic.title, done = done, failed = failed)
                val key = "topic:${topic.id}"
                transferKeys = transferKeys + key
                val result = runCatching { storeTopic(course, topic, folder) }
                transferKeys = transferKeys - key
                if (result.isSuccess) {
                    done++
                } else {
                    failed++
                    if (firstError == null) firstError = result.exceptionOrNull()?.message
                }
                savedFiles = contentSpaceStore.list()
                offlineSave = offlineSave?.copy(done = done, failed = failed, current = topic.title)
                downloadNotifier.progress(
                    title = "Saving $label for offline",
                    detail = "$done of ${queue.size} files",
                    done = done,
                    total = queue.size,
                )
            }

            val stopped = offlineSaveCancelled
            val total = queue.size
            val message = when {
                stopped && done == 0 -> "Saved nothing — the download was stopped."
                stopped -> "Stopped after saving $done of $total files."
                failed == 0 -> "Saved all $total ${if (total == 1) "file" else "files"} for offline."
                done == 0 -> firstError ?: "None of the files could be saved."
                else -> "Saved $done of $total files; $failed could not be downloaded."
            }
            offlineSave = null
            offlineSaveCancelled = false
            if (done == 0 && failed > 0 && !stopped) {
                libraryError = message
            } else {
                libraryNotice = message
            }
            downloadNotifier.finished(
                title = "Save for offline · $label",
                text = message,
                failed = done == 0 && failed > 0 && !stopped,
            )
        }
    }

    fun cancelOfflineSave() {
        if (offlineSave == null || offlineSaveCancelled) return
        offlineSaveCancelled = true
        offlineSave = offlineSave?.copy(cancelling = true)
    }

    /** One topic, downloaded and moved into Content Space. Call off the main thread. */
    private suspend fun storeTopic(
        course: Course,
        topic: ContentTopic,
        folder: String?,
    ): SavedFile {
        val current = session
            ?: throw IllegalStateException("Sign in to D2L again before saving course files.")
        return withContext(Dispatchers.IO) {
            val temp = tempDownloadFile()
            try {
                val downloaded = D2lClient(current.baseUrl, current.cookie)
                    .downloadTopic(topic.url, topic.title, temp)
                contentSpaceStore.store(
                    temp = downloaded.file,
                    title = topic.title,
                    fileName = downloaded.fileName,
                    mime = downloaded.mime,
                    source = "d2l",
                    sourceUrl = topic.url,
                    courseId = course.id,
                    courseCode = course.code.ifBlank { null },
                    courseName = course.name,
                    folder = folder,
                )
            } finally {
                temp.delete()
            }
        }
    }

    fun saveExamFile(entry: DriveEntry) {
        val key = "drive:${entry.id}"
        if (key in transferKeys) return
        transferKeys = transferKeys + key
        libraryError = null
        libraryNotice = null
        val folder = examBankCrumbs.drop(1).joinToString(" / ") { it.name }
            .ifBlank { examBankFolder?.name ?: "MUES Exam Bank" }

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val temp = tempDownloadFile()
                    try {
                        val downloaded = examBankClient.download(entry.id, entry.name, temp)
                        contentSpaceStore.store(
                            temp = downloaded.file,
                            title = entry.name.substringBeforeLast('.').ifBlank { entry.name },
                            fileName = downloaded.fileName,
                            mime = downloaded.mime,
                            source = "drive",
                            sourceUrl = driveFileViewUrl(entry.id),
                            courseId = "exam-bank",
                            courseCode = "MUES",
                            courseName = "MUES Exam Bank",
                            folder = folder,
                        )
                    } finally {
                        temp.delete()
                    }
                }
            }
            result.onSuccess { saved ->
                savedFiles = contentSpaceStore.list()
                libraryNotice = "Saved “${saved.title}” to Content Space."
            }.onFailure {
                libraryError = it.message ?: "Could not save that exam-bank file."
            }
            transferKeys = transferKeys - key
        }
    }

    fun removeSavedFile(file: SavedFile) {
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { contentSpaceStore.remove(file.id) }
            }
            result.onSuccess { removed ->
                savedFiles = contentSpaceStore.list()
                libraryNotice = if (removed) {
                    "Removed “${file.title}”."
                } else {
                    "That file was already gone."
                }
            }.onFailure {
                libraryError = it.message ?: "Could not remove that file."
            }
        }
    }

    fun clearLibraryError() {
        libraryError = null
    }

    fun clearLibraryNotice() {
        libraryNotice = null
    }

    // -----------------------------------------------------------------------
    // Notifications bell
    // -----------------------------------------------------------------------

    /** Opening the bell always starts from the five newest updates. */
    fun openNotifications() {
        notificationsLimit = NOTIFICATION_PAGE
        publishNotifications()
        loadNotifications()
    }

    fun refreshNotifications() {
        loadNotifications(force = true)
    }

    fun showMoreNotifications() {
        notificationsLimit = (notificationsLimit + NOTIFICATION_PAGE)
            .coerceAtMost(MAX_NOTIFICATIONS)
        publishNotifications()
        if (notificationRows.isEmpty()) loadNotifications()
    }

    fun markAllNotificationsRead() {
        if (notifications.unread == 0) return
        val at = System.currentTimeMillis()
        notificationsStore.markAllRead(notificationRows.map { it.id }, at)
        notificationRows = notificationRows.map { it.copy(read = true) }
        publishNotifications()
    }

    private fun publishNotifications() {
        notifications = notificationFeed(notificationRows, notificationsLimit)
    }

    /**
     * Course announcements stand in for D2L's alert feed, which many schools
     * keep closed to student sessions. Cached for a minute; three courses are
     * read at a time so a long course list does not keep every request open.
     */
    fun loadNotifications(force: Boolean = false) {
        val current = session ?: return
        if (notificationsLoading) return
        val knownCourses = courses
        if (knownCourses.isEmpty()) return
        if (!force && notificationsFetchedAt > 0L &&
            System.currentTimeMillis() - notificationsFetchedAt < 60_000L
        ) {
            publishNotifications()
            return
        }
        notificationsLoading = true
        notificationsError = null

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val client = D2lClient(current.baseUrl, current.cookie)
                    val permits = Semaphore(3)
                    coroutineScope {
                        knownCourses.map { course ->
                            async {
                                permits.withPermit {
                                    runCatching { client.announcements(course) }
                                        .getOrDefault(emptyList())
                                }
                            }
                        }.awaitAll()
                    }
                }
            }

            val rows = result.getOrNull()
            if (rows != null) {
                val byCourse = knownCourses.mapIndexed { index, course ->
                    course.id to rows.getOrElse(index) { emptyList() }
                }.toMap()
                notificationRows = announcementNotifications(
                    courses = knownCourses,
                    announcements = byCourse,
                    seenAt = notificationsStore.seenAt(),
                    seenIds = notificationsStore.seenIds(),
                )
                notificationsFetchedAt = System.currentTimeMillis()
            }
            notificationsLoading = false
            notificationsError = result.exceptionOrNull()?.message
            publishNotifications()
        }
    }

    private fun tempDownloadFile(): File {
        val dir = File(getApplication<Application>().cacheDir, "downloads").apply { mkdirs() }
        return File.createTempFile("content-", ".tmp", dir)
    }

    private fun driveFileViewUrl(fileId: String) = "https://drive.google.com/file/d/$fileId/view"

    // -----------------------------------------------------------------------
    // Exam bank
    // -----------------------------------------------------------------------

    fun openExamBank(force: Boolean = false) {
        if (examBankCrumbs.isEmpty()) {
            examBankCrumbs = listOf(ExamCrumb(MUES_FOLDER_ID, "MUES Exam Bank"))
        }
        val current = examBankCrumbs.last()
        if (!force && examBankFolder?.id == current.id) return
        loadExamCrumb(current, force)
    }

    fun openExamFolder(entry: DriveEntry) {
        if (!entry.isFolder || examBankLoading) return
        val crumb = ExamCrumb(entry.id, entry.name)
        examBankCrumbs = examBankCrumbs + crumb
        loadExamCrumb(crumb, force = false)
    }

    fun goToExamCrumb(index: Int) {
        if (examBankLoading) return
        val crumb = examBankCrumbs.getOrNull(index) ?: return
        examBankCrumbs = examBankCrumbs.take(index + 1)
        if (examBankFolder?.id == crumb.id) return
        loadExamCrumb(crumb, force = false)
    }

    fun refreshExamBank() {
        if (examBankCrumbs.isEmpty()) {
            examBankCrumbs = listOf(ExamCrumb(MUES_FOLDER_ID, "MUES Exam Bank"))
        }
        loadExamCrumb(examBankCrumbs.last(), force = true)
    }

    fun clearExamBankError() {
        examBankError = null
    }

    private fun loadExamCrumb(crumb: ExamCrumb, force: Boolean) {
        if (examBankLoading) return
        val cached = examBankCache[crumb.id]
        if (!force && cached != null) {
            examBankFolder = cached
            examBankError = null
            if (System.currentTimeMillis() - cached.fetchedAt < 5 * 60_000L) return
        }

        val previousId = examBankFolder?.id
        examBankLoading = true
        examBankError = null
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { examBankClient.folder(crumb.id) }
            }
            examBankLoading = false
            result.onSuccess { folder ->
                examBankCache[crumb.id] = folder
                examBankFolder = folder
                examBankError = null
                if (crumb.id == MUES_FOLDER_ID && !folder.name.isNullOrBlank()) {
                    val name = folder.name!!
                    examBankCrumbs = examBankCrumbs.map {
                        if (it.id == MUES_FOLDER_ID) it.copy(name = name) else it
                    }
                }
            }.onFailure {
                if (previousId != crumb.id) examBankFolder = null
                examBankError = it.message ?: "Could not open that exam-bank folder."
            }
        }
    }

    // -----------------------------------------------------------------------
    // AI + course outlines
    // -----------------------------------------------------------------------

    fun clearAiMessages() {
        aiError = null
        aiNotice = null
    }

    fun saveAiSettings(provider: AiProvider, apiKey: String, model: String, baseUrl: String) {
        if (aiBusy) return
        aiError = null
        aiNotice = null

        val current = aiStore.read()
        val key = apiKey.trim().ifBlank { current.apiKey }
        if (key.isBlank()) {
            aiError = "Add the API key for ${provider.label}."
            return
        }
        if (key.length > 300) {
            aiError = "That API key is too long."
            return
        }

        val trimmedBase = baseUrl.trim().trimEnd('/')
        if (provider == AiProvider.CUSTOM) {
            val uri = runCatching { java.net.URI(trimmedBase) }.getOrNull()
            if (uri == null || uri.host.isNullOrBlank() || uri.scheme != "https") {
                aiError = "Add the full https:// endpoint, for example https://host/v1."
                return
            }
        }

        val settings = AiSettings(
            provider = provider,
            apiKey = key,
            model = model.trim().take(80),
            customBaseUrl = if (provider == AiProvider.CUSTOM) trimmedBase else "",
        )
        aiStore.save(settings)
        aiSettings = settings
        aiNotice = "Saved. ${provider.label} is ready for outlines."
    }

    fun forgetAiKey() {
        aiStore.clearKey()
        aiSettings = aiStore.read()
        aiError = null
        aiNotice = "The AI key was removed from this phone."
    }

    fun testAi() {
        if (aiBusy) return
        val settings = aiSettings
        if (!settings.hasKey) {
            aiError = "Save an API key first."
            return
        }
        aiBusy = true
        aiError = null
        aiNotice = null

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { AiClient(settings).test() } }
            aiBusy = false
            result.onSuccess { reply ->
                aiNotice = "${settings.provider.label} answered “$reply”."
            }.onFailure {
                aiError = it.message ?: "The AI test failed."
            }
        }
    }

    fun resetOutline() {
        outlineDrafts = emptyList()
        outlineBusy = false
        outlineError = null
        outlineNote = null
        outlineFileName = null
    }

    /** Read a picked outline, then let the AI (or the basic reader) find dates. */
    fun readOutline(course: Course, uri: Uri, fileName: String?) {
        if (outlineBusy) return
        outlineBusy = true
        outlineError = null
        outlineNote = null
        outlineDrafts = emptyList()
        outlineFileName = fileName ?: "Course outline"

        viewModelScope.launch {
            val extracted = withContext(Dispatchers.IO) {
                runCatching { OutlineFileReader.read(getApplication(), uri, fileName) }
            }
            val text = extracted.getOrElse {
                outlineError = it.message ?: "Could not read that file."
                outlineBusy = false
                return@launch
            }

            val heuristic = withContext(Dispatchers.Default) { OutlineParser.parse(text) }
            var drafts = heuristic

            val settings = aiSettings
            if (settings.hasKey) {
                val reply = withContext(Dispatchers.IO) {
                    runCatching { AiClient(settings).readOutline(course, text) }
                }
                reply.onSuccess { aiDrafts ->
                    drafts = mergeDrafts(aiDrafts, heuristic)
                    outlineNote = if (aiDrafts.isEmpty()) {
                        "The AI found no dated assessments. Check the file and the dates below."
                    } else {
                        "Read with ${settings.provider.label} · ${settings.effectiveModel}."
                    }
                }.onFailure { error ->
                    outlineNote = "AI could not read it: ${error.message ?: "unknown error"} Using the basic date reader instead."
                }
            } else {
                outlineNote = "Basic date reader used. Add an AI key in Settings → AI for messy tables and unusual layouts."
            }

            outlineDrafts = drafts.take(120)
            if (drafts.isEmpty()) {
                outlineError =
                    "No dated assessments were found. A PDF with selectable text works best; a scan has no text to read."
            }
            outlineBusy = false
        }
    }

    fun importOutline(course: Course, drafts: List<OutlineDraft>): Pair<Int, Int> {
        val result = outlineStore.add(course, drafts)
        publishDeadlines()
        return result.added to result.skipped
    }

    private fun mergeDrafts(primary: List<OutlineDraft>, fallback: List<OutlineDraft>): List<OutlineDraft> {
        val seen = mutableSetOf<Long>()
        val merged = mutableListOf<OutlineDraft>()
        for (draft in primary + fallback) {
            if (draft.startsAt <= 0L) continue
            if (!seen.add(draft.startsAt)) continue
            merged += draft
        }
        return merged.sortedBy { it.startsAt }
    }

    /** D2L dates win when an outline lists the same thing, so nothing doubles up. */
    private fun publishDeadlines() {
        val imported = outlineStore.read()
        val known = d2lDeadlines
            .map { "${it.title.lowercase()}|${it.startsAt}" }
            .toHashSet()
        val extra = imported.filter { "${it.title.lowercase()}|${it.startsAt}" !in known }
        deadlines = (d2lDeadlines + extra).sortedBy { it.startsAt ?: Long.MAX_VALUE }
    }

    // -----------------------------------------------------------------------
    // Courses
    // -----------------------------------------------------------------------

    fun openCourse(course: Course) {
        courseDetail = CourseDetailState(course = course)
        courseGrades = null
        gradesError = null
        gradesLoading = false
        courseContent = null
        contentError = null
        contentLoading = false
        contentModuleLoading = false
        val current = session ?: return

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { D2lClient(current.baseUrl, current.cookie).announcements(course) }
            }
            val detail = courseDetail
            if (detail == null || detail.course.id != course.id) return@launch

            courseDetail = result.fold(
                onSuccess = { detail.copy(announcements = it, loading = false, error = null) },
                onFailure = {
                    detail.copy(
                        loading = false,
                        error = it.message ?: "Could not load the course page.",
                    )
                },
            )
        }
    }

    fun closeCourse() {
        courseDetail = null
        courseGrades = null
        gradesError = null
        gradesLoading = false
        courseContent = null
        contentError = null
        contentLoading = false
        contentModuleLoading = false
    }

    /** The gradebook tab asks for this the first time it is opened; pull-to-refresh forces it. */
    fun loadGrades(course: Course, force: Boolean = false) {
        val current = session ?: return
        if (gradesLoading) return
        if (!force && courseGrades != null) return
        gradesLoading = true
        gradesError = null

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { D2lClient(current.baseUrl, current.cookie).grades(course) }
            }
            result.onSuccess { grades ->
                if (grades == null) {
                    gradesError = "D2L did not return this course's gradebook. Your session may have expired — sign in again."
                } else {
                    courseGrades = grades
                }
            }.onFailure {
                gradesError = it.message ?: "Could not load the grades."
            }
            gradesLoading = false
        }
    }

    /**
     * Modules and the topics of the module D2L opens by default. A refresh keeps
     * the module the student is looking at instead of jumping back to D2L's default.
     */
    fun loadContent(course: Course, force: Boolean = false) {
        val current = session ?: return
        if (contentLoading || contentModuleLoading) return
        if (!force && courseContent != null) return
        val keepModule = courseContent?.moduleId
        contentLoading = true
        contentError = null

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { D2lClient(current.baseUrl, current.cookie).content(course, keepModule) }
            }
            result.onSuccess { content ->
                if (content == null) {
                    contentError = "D2L did not return this course's content. Your session may have expired — sign in again."
                } else {
                    courseContent = content
                }
            }.onFailure {
                contentError = it.message ?: "Could not load the course content."
            }
            contentLoading = false
        }
    }

    fun openContentModule(course: Course, module: ContentModule) {
        val current = session ?: return
        val loaded = courseContent ?: return
        if (contentLoading || contentModuleLoading || loaded.moduleId == module.id) return
        contentModuleLoading = true
        contentError = null

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { D2lClient(current.baseUrl, current.cookie).content(course, module.id) }
            }
            result.onSuccess { content ->
                if (content == null) {
                    contentError = "Could not load that module."
                } else {
                    courseContent = loaded.copy(
                        moduleId = module.id,
                        moduleTitle = content.moduleTitle ?: module.name,
                        topics = content.topics,
                    )
                }
            }.onFailure {
                contentError = it.message ?: "Could not load that module."
            }
            contentModuleLoading = false
        }
    }
}
