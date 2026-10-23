package com.d2lhub.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LibraryDataTest {
    private val driveHtml = """
        <html><head><title>MUES Exam Bank - Google Drive</title></head><body>
          <div class="flip-entry" id="entry-folder1">
            <a href="https://drive.google.com/drive/folders/folder1">
              <div class="flip-entry-title">Midterms</div>
            </a>
            <div class="flip-entry-icon"><div aria-label="Folder"></div></div>
          </div>
          <div class="flip-entry" id="entry-file1">
            <a href="https://drive.google.com/file/d/file1/view">
              <div class="flip-entry-title">CEN 100 Final 2024.pdf</div>
            </a>
            <div class="flip-entry-icon"><div aria-label="PDF document"></div></div>
            <div class="flip-entry-last-modified">Aug 2, 2025</div>
          </div>
          <div class="flip-entry" id="entry-file2">
            <a href="https://drive.google.com/file/d/file2/view">
              <div class="flip-entry-title">AERO 201 Midterm.pdf</div>
            </a>
            <div class="flip-entry-icon"><div aria-label="PDF document"></div></div>
          </div>
          <div class="flip-entry" id="entry-file1">
            <a href="https://drive.google.com/file/d/file1/view">
              <div class="flip-entry-title">A duplicate of the same file</div>
            </a>
          </div>
        </body></html>
    """.trimIndent()

    @Test
    fun readsDriveFoldersAndFilesInFolderFirstOrder() {
        val folder = ExamBankParser.parse(driveHtml, "folder-root")

        assertEquals("MUES Exam Bank", folder.name)
        assertEquals(
            listOf("Midterms", "AERO 201 Midterm.pdf", "CEN 100 Final 2024.pdf"),
            folder.entries.map { it.name },
        )
        assertTrue(folder.entries.first().isFolder)
        assertEquals("Folder", folder.entries.first().type)
        assertEquals("Aug 2, 2025", folder.entries.last().modifiedAt)
        assertEquals("PDF document", folder.entries[1].type)
        assertTrue(folder.fetchedAt > 0L)
    }

    @Test
    fun ignoresBlankAndDuplicateDriveEntries() {
        val folder = ExamBankParser.parse(driveHtml, "folder-root")
        assertEquals(3, folder.entries.size)
        assertEquals(1, folder.entries.count { it.id == "file1" })
    }

    @Test
    fun readsDriveTitleWithoutTheGoogleSuffix() {
        val folder = ExamBankParser.parse(
            "<html><head><title>Old Exams - Google Drive</title></head><body></body></html>",
            "root",
        )
        assertEquals("Old Exams", folder.name)
        assertTrue(folder.entries.isEmpty())
    }

    @Test
    fun buildsTheDirectDownloadRouteForAViewedTopic() {
        assertEquals(
            "https://courses.torontomu.ca/d2l/le/content/1194174/topics/files/download/7249214/DirectFileTopicDownload",
            D2lClient.directTopicDownloadUrl(
                "https://courses.torontomu.ca/d2l/le/content/1194174/viewContent/7249214/View",
            ),
        )
        assertEquals(
            "http://localhost:8080/d2l/le/content/1/topics/files/download/2/DirectFileTopicDownload",
            D2lClient.directTopicDownloadUrl(
                "http://localhost:8080/d2l/le/content/1/viewContent/2/View?ou=1",
            ),
        )
    }

    @Test
    fun ignoresLinksThatAreNotD2LViewerTopics() {
        assertNull(D2lClient.directTopicDownloadUrl("https://example.com/notes.pdf"))
        assertNull(D2lClient.directTopicDownloadUrl("not a url"))
        assertNull(
            D2lClient.directTopicDownloadUrl(
                "https://courses.torontomu.ca/d2l/le/content/1194174/Home",
            ),
        )
    }

    @Test
    fun sanitizesNamesAndReadsDownloadHeaders() {
        assertEquals("a-b-c-.pdf", safeFileName("a/b:c?.pdf"))
        assertEquals("file", safeFileName("   "))
        assertEquals("notes.pdf", dispositionName("attachment; filename=\"notes.pdf\""))
        assertEquals(
            "My Notes.pdf",
            dispositionName("attachment; filename*=UTF-8''My%20Notes.pdf"),
        )
        assertNull(dispositionName(null))
    }

    @Test
    fun offlineQueueSkipsSavedBlankLinksAndDuplicates() {
        val topics = listOf(
            ContentTopic("1", "Week 1 slides", "File", "https://d2l.example/d2l/le/content/1/viewContent/1/View"),
            ContentTopic("2", "Reading", "LINK", "https://example.com/reading"),
            ContentTopic("3", "Week 2 slides", "File", "https://d2l.example/d2l/le/content/1/viewContent/3/View"),
            ContentTopic("4", "Week 2 again", null, "https://d2l.example/d2l/le/content/1/viewContent/3/View"),
            ContentTopic("5", "Already saved", "File", "https://d2l.example/d2l/le/content/1/viewContent/5/View"),
            ContentTopic("6", "No link", "File", "   "),
        )

        val queue = offlineQueue(
            topics,
            setOf("https://d2l.example/d2l/le/content/1/viewContent/5/View"),
        )

        assertEquals(listOf("1", "3"), queue.map { it.id })
    }

    @Test
    fun offlineQueueKeepsTopicsWhoseTypeIsUnknown() {
        val topics = listOf(
            ContentTopic("1", "Handout", null, "https://d2l.example/d2l/le/content/1/viewContent/1/View"),
            ContentTopic("2", "Slide deck", "PowerPoint", "https://d2l.example/d2l/le/content/1/viewContent/2/View"),
        )

        assertEquals(2, offlineQueue(topics, emptySet()).size)
    }

    @Test
    fun fallsBackToTheExtensionWhenD2lSendsOctetStream() {
        assertEquals("pdf", extensionFor("application/pdf", "", "handout"))
        assertEquals("docx", extensionFor("application/octet-stream", "", "handout.docx"))
        assertEquals("application/pdf", mimeFor("pdf", "application/octet-stream"))
        assertEquals("text/plain", mimeFor("txt", "text/plain; charset=utf-8"))
        assertTrue(isPdf("application/pdf", "x"))
        assertTrue(isPdf("application/octet-stream", "x.PDF"))
    }
}
