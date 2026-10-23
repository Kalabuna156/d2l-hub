package com.d2lhub.app.ui

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.d2lhub.app.AppViewModel
import com.d2lhub.app.data.DriveEntry
import com.d2lhub.app.data.SavedFile
import com.d2lhub.app.data.isPdf
import java.io.File

@Composable
fun LibraryScreen(
    viewModel: AppViewModel,
    initialTab: Int,
    onBack: () -> Unit,
    onOpenLink: (String) -> Unit,
) {
    var tab by remember { mutableIntStateOf(initialTab.coerceIn(0, 1)) }
    var pdfFile by remember { mutableStateOf<SavedFile?>(null) }
    val context = LocalContext.current

    // Back goes up one exam-bank folder before leaving the Library.
    BackHandler {
        val crumbs = viewModel.examBankCrumbs
        if (tab == 1 && crumbs.size > 1) {
            viewModel.goToExamCrumb(crumbs.size - 2)
        } else {
            onBack()
        }
    }
    LaunchedEffect(Unit) { viewModel.refreshLibrary() }
    LaunchedEffect(viewModel.libraryNotice) {
        val notice = viewModel.libraryNotice ?: return@LaunchedEffect
        Toast.makeText(context, notice, Toast.LENGTH_SHORT).show()
        viewModel.clearLibraryNotice()
    }

    val viewing = pdfFile
    if (viewing != null) {
        val path = remember(viewing.id) { viewModel.localFileFor(viewing) }
        if (path != null) {
            PdfViewerScreen(file = viewing, path = path, onClose = { pdfFile = null })
            return
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 4.dp, end = 12.dp, top = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = HubColors.Text)
            }
            Column(Modifier.weight(1f)) {
                Text("Library", color = HubColors.Text, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    "Saved files and public past exams",
                    color = HubColors.Faint,
                    fontSize = 11.sp,
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            LibraryTabPill("Content Space", viewModel.savedFiles.size, tab == 0) { tab = 0 }
            LibraryTabPill("Exam bank", viewModel.examBankFolder?.entries?.count { !it.isFolder } ?: 0, tab == 1) {
                tab = 1
            }
        }

        when (tab) {
            0 -> ContentSpaceView(viewModel, onOpenPdf = { pdfFile = it })
            else -> ExamBankView(viewModel, onOpenLink)
        }
    }
}

@Composable
private fun ContentSpaceView(viewModel: AppViewModel, onOpenPdf: (SavedFile) -> Unit) {
    val files = viewModel.savedFiles
    var pendingDelete by remember { mutableStateOf<SavedFile?>(null) }
    val context = LocalContext.current
    val groups = remember(files) {
        files.groupBy { it.courseId }
            .values
            .map { entries -> entries.sortedByDescending { it.savedAt } }
            .sortedBy { entries -> entries.firstOrNull()?.courseName.orEmpty().lowercase() }
    }
    val totalBytes = files.sumOf { it.size }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    "${files.size} ${if (files.size == 1) "file" else "files"}",
                    color = HubColors.Text,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text("${formatSize(totalBytes)} on this phone", color = HubColors.Faint, fontSize = 11.sp)
            }
            IconButton(onClick = { viewModel.refreshLibrary() }, modifier = Modifier.size(34.dp)) {
                Icon(
                    Icons.Default.Refresh,
                    contentDescription = "Refresh Content Space",
                    tint = HubColors.Muted,
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        if (viewModel.libraryError != null) {
            DismissibleError(viewModel.libraryError!!, onDismiss = { viewModel.clearLibraryError() })
        }

        if (files.isEmpty()) {
            Column(Modifier.padding(20.dp)) {
                EmptyState(
                    "Nothing saved yet",
                    "Open a course's Content tab and tap Save for offline for the whole module (or ↓ for one file), or save a paper from the Exam bank. Downloads stay on this phone.",
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                for (group in groups) {
                    item(key = "header-${group.first().courseId}") {
                        SectionTitle(
                            group.first().courseCode ?: group.first().courseName,
                            "${group.size} ${if (group.size == 1) "file" else "files"}",
                        )
                    }
                    items(group, key = { it.id }) { file ->
                        SavedFileRow(
                            file = file,
                            onClick = {
                                val path = viewModel.localFileFor(file)
                                if (path != null && isPdf(file.mime, file.fileName)) {
                                    onOpenPdf(file)
                                } else {
                                    openSavedFile(context, file, path)?.let {
                                        Toast.makeText(context, it, Toast.LENGTH_LONG).show()
                                    }
                                }
                            },
                            onDelete = { pendingDelete = file },
                        )
                    }
                    item { Spacer(Modifier.height(6.dp)) }
                }
                item {
                    Text(
                        "Files are copied from D2L only when you tap ↓. Removing one deletes the copy on this phone, never the course file.",
                        color = HubColors.Faint,
                        fontSize = 10.5.sp,
                        lineHeight = 15.sp,
                    )
                }
            }
        }
    }

    val pending = pendingDelete
    if (pending != null) {
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            containerColor = HubColors.SurfaceAlt,
            title = { Text("Remove “${pending.title}”?", color = HubColors.Text) },
            text = {
                Text(
                    "The downloaded copy is deleted from this phone. Your D2L course and the original file are not changed.",
                    color = HubColors.Muted,
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.removeSavedFile(pending)
                    pendingDelete = null
                }) {
                    Text("Remove", color = HubColors.Rose)
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) {
                    Text("Cancel", color = HubColors.Muted)
                }
            },
        )
    }
}

@Composable
private fun ExamBankView(viewModel: AppViewModel, onOpenLink: (String) -> Unit) {
    val folder = viewModel.examBankFolder
    val crumbs = viewModel.examBankCrumbs
    val busyKeys = viewModel.transferKeys

    LaunchedEffect(Unit) { viewModel.openExamBank() }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    folder?.name ?: crumbs.lastOrNull()?.name ?: "MUES Exam Bank",
                    color = HubColors.Text,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    if (folder != null) {
                        "${folder.entries.count { !it.isFolder }} files · public Google Drive folder"
                    } else {
                        "Public Drive folder · no Google account needed"
                    },
                    color = HubColors.Faint,
                    fontSize = 11.sp,
                )
            }
            if (viewModel.examBankLoading) {
                CircularProgressIndicator(
                    color = HubColors.Violet,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(18.dp),
                )
            } else {
                IconButton(onClick = { viewModel.refreshExamBank() }, modifier = Modifier.size(34.dp)) {
                    Icon(
                        Icons.Default.Refresh,
                        contentDescription = "Refresh exam bank",
                        tint = HubColors.Muted,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            crumbs.forEachIndexed { index, crumb ->
                if (index > 0) {
                    Text("›", color = HubColors.Faint, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 3.dp))
                }
                val last = index == crumbs.lastIndex
                Text(
                    crumb.name,
                    color = if (last) HubColors.Text else HubColors.VioletLight,
                    fontSize = 11.sp,
                    fontWeight = if (last) FontWeight.Medium else FontWeight.Normal,
                    maxLines = 1,
                    modifier = Modifier
                        .clip(RoundedCornerShape(7.dp))
                        .clickable(enabled = !last && !viewModel.examBankLoading) {
                            viewModel.goToExamCrumb(index)
                        }
                        .padding(horizontal = 7.dp, vertical = 4.dp),
                )
            }
        }

        if (viewModel.examBankError != null) {
            DismissibleError(viewModel.examBankError!!, onDismiss = { viewModel.clearExamBankError() })
        }
        if (viewModel.libraryError != null) {
            DismissibleError(viewModel.libraryError!!, onDismiss = { viewModel.clearLibraryError() })
        }

        if (folder == null) {
            if (!viewModel.examBankLoading) {
                Column(Modifier.padding(20.dp)) {
                    EmptyState(
                        "Could not open the exam bank",
                        "Check your connection, then tap Refresh. The MUES archive is read from its public Google Drive folder.",
                    )
                }
            }
        } else if (folder.entries.isEmpty()) {
            Column(Modifier.padding(20.dp)) {
                EmptyState("This folder is empty", "Go back a level and pick another folder.")
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                items(folder.entries, key = { it.id }) { entry ->
                    val saved = viewModel.savedFiles.any {
                        it.source == "drive" &&
                            it.sourceUrl.orEmpty().contains("/file/d/${entry.id}/")
                    }
                    DriveRow(
                        entry = entry,
                        saved = saved,
                        busy = "drive:${entry.id}" in busyKeys,
                        onClick = {
                            if (entry.isFolder) {
                                viewModel.openExamFolder(entry)
                            } else {
                                onOpenLink("https://drive.google.com/file/d/${entry.id}/view")
                            }
                        },
                        onSave = { viewModel.saveExamFile(entry) },
                    )
                }
                item {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "The MUES exam bank is a public Drive folder run by the society. Files you save stay on this phone; nothing is uploaded.",
                        color = HubColors.Faint,
                        fontSize = 10.5.sp,
                        lineHeight = 15.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun SavedFileRow(file: SavedFile, onClick: () -> Unit, onDelete: () -> Unit) {
    val extension = file.fileName.substringAfterLast('.', "").take(4).uppercase()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(HubColors.Surface)
            .clickable { onClick() }
            .padding(start = 12.dp, end = 4.dp, top = 11.dp, bottom = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(
                    if (isPdf(file.mime, file.fileName)) HubColors.Rose.copy(alpha = 0.13f)
                    else HubColors.Violet.copy(alpha = 0.14f),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                extension.ifBlank { "FILE" },
                color = if (isPdf(file.mime, file.fileName)) HubColors.Rose else HubColors.VioletLight,
                fontSize = 8.5.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.size(11.dp))
        Column(Modifier.weight(1f)) {
            Text(
                file.title,
                color = HubColors.Text,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 16.sp,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                listOfNotNull(
                    extension.ifBlank { "File" },
                    formatSize(file.size),
                    formatDay(file.savedAt),
                    file.folder?.takeIf { it.isNotBlank() },
                ).joinToString(" · "),
                color = HubColors.Faint,
                fontSize = 10.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(onClick = onDelete, modifier = Modifier.size(38.dp)) {
            Icon(
                Icons.Default.Delete,
                contentDescription = "Remove ${file.title}",
                tint = HubColors.Faint,
                modifier = Modifier.size(17.dp),
            )
        }
    }
}

@Composable
private fun DriveRow(
    entry: DriveEntry,
    saved: Boolean,
    busy: Boolean,
    onClick: () -> Unit,
    onSave: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(HubColors.Surface)
            .clickable { onClick() }
            .padding(start = 12.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(
                    if (entry.isFolder) HubColors.Amber.copy(alpha = 0.12f)
                    else HubColors.SurfaceAlt,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                if (entry.isFolder) "DIR" else entry.name.substringAfterLast('.', "").take(4).uppercase().ifBlank { "FILE" },
                color = if (entry.isFolder) HubColors.Amber else HubColors.Muted,
                fontSize = 8.5.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.size(11.dp))
        Column(Modifier.weight(1f)) {
            Text(
                entry.name,
                color = HubColors.Text,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 16.sp,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                listOfNotNull(entry.type, entry.modifiedAt, if (saved) "saved" else null).joinToString(" · "),
                color = HubColors.Faint,
                fontSize = 10.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (entry.isFolder) {
            Text(
                "Open →",
                color = HubColors.VioletLight,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(horizontal = 8.dp),
            )
        } else {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(if (saved) HubColors.Green.copy(alpha = 0.14f) else HubColors.SurfaceAlt)
                    .clickable(enabled = !busy) { onSave() },
                contentAlignment = Alignment.Center,
            ) {
                when {
                    busy -> CircularProgressIndicator(
                        color = HubColors.VioletLight,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(14.dp),
                    )

                    saved -> Text("✓", color = HubColors.Green, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    else -> Text("↓", color = HubColors.VioletLight, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
            }
            Text("→", color = HubColors.VioletLight, fontSize = 12.sp, modifier = Modifier.padding(start = 6.dp, end = 2.dp))
        }
    }
}

@Composable
private fun DismissibleError(message: String, onDismiss: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(HubColors.SurfaceAlt)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            message,
            color = HubColors.Rose,
            fontSize = 11.5.sp,
            lineHeight = 16.sp,
            modifier = Modifier.weight(1f),
        )
        Text(
            "Dismiss",
            color = HubColors.VioletLight,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .clickable { onDismiss() }
                .padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun LibraryTabPill(label: String, count: Int, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) HubColors.Violet.copy(alpha = 0.22f) else HubColors.Surface)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            color = if (selected) HubColors.VioletLight else HubColors.Muted,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
        )
        Spacer(Modifier.size(6.dp))
        Text(count.toString(), color = if (selected) HubColors.VioletLight else HubColors.Faint, fontSize = 11.sp)
    }
}

internal fun openSavedFile(context: Context, file: SavedFile, path: File?): String? {
    if (path == null) return "That file is missing from Content Space."
    return try {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", path)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, file.mime.ifBlank { "application/octet-stream" })
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            clipData = ClipData.newRawUri(file.fileName, uri)
        }
        context.startActivity(intent)
        null
    } catch (_: ActivityNotFoundException) {
        "No app on this phone can open ${file.fileName}. Install a document viewer and try again."
    } catch (_: Exception) {
        "Could not open that file."
    }
}

private fun formatSize(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "${Math.round(bytes / 1024.0)} KB"
    else -> String.format(java.util.Locale.US, "%.1f MB", bytes / (1024.0 * 1024.0))
}
