package com.d2lhub.app.ui

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.d2lhub.app.AppViewModel
import com.d2lhub.app.OfflineSave
import com.d2lhub.app.data.ContentModule
import com.d2lhub.app.data.ContentTopic
import com.d2lhub.app.data.Course
import com.d2lhub.app.data.offlineQueue

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CourseContentView(
    viewModel: AppViewModel,
    course: Course,
    onOpenLink: (String) -> Unit,
) {
    LaunchedEffect(course.id) { viewModel.loadContent(course) }
    val content = viewModel.courseContent
    val context = LocalContext.current

    LaunchedEffect(viewModel.libraryNotice) {
        val notice = viewModel.libraryNotice ?: return@LaunchedEffect
        Toast.makeText(context, notice, Toast.LENGTH_SHORT).show()
        viewModel.clearLibraryNotice()
    }

    if (viewModel.contentLoading && content == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = HubColors.Violet)
        }
        return
    }

    if (content == null) {
        Column(Modifier.padding(20.dp)) {
            ErrorBanner(
                viewModel.contentError ?: "Could not load the course content.",
                onRetry = { viewModel.loadContent(course, force = true) },
            )
        }
        return
    }

    val savedUrls = remember(viewModel.savedFiles) {
        viewModel.savedFiles.mapNotNull { it.sourceUrl }.toSet()
    }
    val queue = remember(content.topics, savedUrls) {
        offlineQueue(content.topics, savedUrls)
    }

    val chipState = rememberLazyListState()
    LaunchedEffect(content.moduleId, content.modules) {
        val index = content.modules.indexOfFirst { it.id == content.moduleId }
        if (index >= 0) chipState.animateScrollToItem(index)
    }

    PullToRefreshBox(
        isRefreshing = viewModel.contentLoading,
        onRefresh = { viewModel.loadContent(course, force = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (content.modules.isNotEmpty()) {
                item {
                    LazyRow(
                        state = chipState,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(end = 4.dp),
                    ) {
                        items(content.modules, key = { it.id }) { module ->
                            ModuleChip(
                                module = module,
                                selected = module.id == content.moduleId,
                                onClick = { viewModel.openContentModule(course, module) },
                            )
                        }
                    }
                }
            }

            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            content.moduleTitle ?: "Topics",
                            color = HubColors.Text,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            "${content.topics.size} ${if (content.topics.size == 1) "topic" else "topics"}",
                            color = HubColors.Faint,
                            fontSize = 11.sp,
                        )
                    }
                    Text(
                        "Open in D2L →",
                        color = HubColors.VioletLight,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { onOpenLink(content.contentUrl) }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }

            if (content.topics.isNotEmpty()) {
                item {
                    SaveOfflineBar(
                        queueSize = queue.size,
                        batch = viewModel.offlineSave,
                        onStart = { viewModel.saveModuleOffline(course) },
                        onCancel = { viewModel.cancelOfflineSave() },
                    )
                }
            }

            if (viewModel.contentError != null) {
                item {
                    ErrorBanner(
                        viewModel.contentError!!,
                        onRetry = { viewModel.loadContent(course, force = true) },
                    )
                }
            }

            if (viewModel.libraryError != null) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(HubColors.SurfaceAlt)
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            viewModel.libraryError!!,
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
                                .clickable { viewModel.clearLibraryError() }
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                        )
                    }
                }
            }

            if (viewModel.contentModuleLoading) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(
                            color = HubColors.Violet,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.size(10.dp))
                        Text("Loading this module…", color = HubColors.Muted, fontSize = 12.sp)
                    }
                }
            } else if (content.topics.isEmpty()) {
                item {
                    EmptyState(
                        if (content.modules.isEmpty()) "No content modules" else "No topics in this module",
                        "Sub-modules and files can still be opened from D2L using the link above.",
                    )
                }
            } else {
                items(content.topics, key = { it.id }) { topic ->
                    TopicRow(
                        topic = topic,
                        saved = viewModel.savedFiles.any { it.sourceUrl == topic.url },
                        busy = "topic:${topic.id}" in viewModel.transferKeys,
                        onClick = { onOpenLink(topic.url) },
                        onDownload = { viewModel.downloadTopic(course, topic) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SaveOfflineBar(
    queueSize: Int,
    batch: OfflineSave?,
    onStart: () -> Unit,
    onCancel: () -> Unit,
) {
    if (batch != null) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(HubColors.Surface)
                .padding(horizontal = 12.dp, vertical = 10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Saving ${batch.done} of ${batch.total} · ${batch.moduleLabel}",
                    color = HubColors.Text,
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    if (batch.cancelling) "Stopping…" else "Stop",
                    color = if (batch.cancelling) HubColors.Faint else HubColors.Rose,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .clip(RoundedCornerShape(7.dp))
                        .clickable(enabled = !batch.cancelling) { onCancel() }
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }
            Spacer(Modifier.height(7.dp))
            LinearProgressIndicator(
                progress = { if (batch.total > 0) batch.done.toFloat() / batch.total else 0f },
                color = HubColors.Violet,
                trackColor = HubColors.SurfaceAlt,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(3.dp)),
            )
            val current = batch.current
            if (!current.isNullOrBlank()) {
                Spacer(Modifier.height(5.dp))
                Text(
                    current,
                    color = HubColors.Faint,
                    fontSize = 10.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    } else if (queueSize > 0) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(HubColors.Violet.copy(alpha = 0.14f))
                .clickable { onStart() }
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("⤓", color = HubColors.VioletLight, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.size(9.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    "Save $queueSize ${if (queueSize == 1) "file" else "files"} for offline",
                    color = HubColors.VioletLight,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    "Shows progress in the notification shade",
                    color = HubColors.Faint,
                    fontSize = 10.sp,
                )
            }
            Text("→", color = HubColors.VioletLight, fontSize = 12.sp)
        }
    } else {
        Text(
            "Every file in this module is saved on this phone",
            color = HubColors.Faint,
            fontSize = 10.5.sp,
        )
    }
}

@Composable
private fun ModuleChip(module: ContentModule, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) HubColors.Violet.copy(alpha = 0.24f) else HubColors.Surface)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            (if (module.depth > 0) "↳ " else "") + module.name,
            color = if (selected) HubColors.VioletLight else HubColors.Muted,
            fontSize = 11.5.sp,
            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.sizeIn(maxWidth = 170.dp),
        )
        if (module.total != null) {
            Spacer(Modifier.size(6.dp))
            Text(
                if (module.remaining != null) "${module.remaining}/${module.total}" else "${module.total}",
                color = if (selected) HubColors.VioletLight else HubColors.Faint,
                fontSize = 9.5.sp,
            )
        }
    }
}

@Composable
private fun TopicRow(
    topic: ContentTopic,
    saved: Boolean,
    busy: Boolean,
    onClick: () -> Unit,
    onDownload: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(HubColors.Surface)
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(HubColors.Violet.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Text("▤", color = HubColors.VioletLight, fontSize = 14.sp)
        }
        Spacer(Modifier.size(11.dp))
        Column(Modifier.weight(1f)) {
            Text(
                topic.title,
                color = HubColors.Text,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 17.sp,
            )
            if (!topic.type.isNullOrBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(topic.type, color = HubColors.Faint, fontSize = 10.5.sp)
            }
        }
        Spacer(Modifier.size(8.dp))
        Box(
            modifier = Modifier
                .size(30.dp)
                .clip(RoundedCornerShape(9.dp))
                .background(
                    if (saved) HubColors.Green.copy(alpha = 0.14f) else HubColors.SurfaceAlt,
                )
                .clickable(enabled = !busy) { onDownload() },
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
        Spacer(Modifier.size(7.dp))
        Text("→", color = HubColors.VioletLight, fontSize = 13.sp)
    }
}
