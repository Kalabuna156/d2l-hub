package com.d2lhub.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.d2lhub.app.AppViewModel
import com.d2lhub.app.data.AppNotification

/** The bell beside the refresh button, with an unread badge. */
@Composable
fun NotificationsBell(unread: Int, onClick: () -> Unit) {
    Box(contentAlignment = Alignment.TopEnd) {
        IconButton(onClick = onClick, modifier = Modifier.size(36.dp)) {
            Icon(
                Icons.Default.Notifications,
                contentDescription = if (unread > 0) "Notifications ($unread unread)" else "Notifications",
                tint = if (unread > 0) HubColors.VioletLight else HubColors.Muted,
                modifier = Modifier.size(19.dp),
            )
        }
        if (unread > 0) {
            Box(
                modifier = Modifier
                    .padding(top = 2.dp, end = 0.dp)
                    .size(15.dp)
                    .clip(CircleShape)
                    .background(HubColors.Rose),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (unread > 9) "9+" else unread.toString(),
                    color = Color(0xFF2A0910),
                    fontSize = 8.5.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

/**
 * The dropdown the bell opens: course announcements, newest first, five at a
 * time, with refresh and "mark all as read". Mirrors the desktop panel.
 */
@Composable
fun NotificationsPanel(
    viewModel: AppViewModel,
    onDismiss: () -> Unit,
    onOpenLink: (String) -> Unit,
) {
    val feed = viewModel.notifications
    val loading = viewModel.notificationsLoading
    val error = viewModel.notificationsError

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(Modifier.fillMaxSize()) {
            // Tapping the dimmed area closes the panel. The card below swallows
            // taps so only a touch truly outside it dismisses.
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { onDismiss() },
            )

            Column(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(start = 12.dp, end = 12.dp, top = 54.dp)
                    .fillMaxWidth()
                    .widthIn(max = 380.dp)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) { }
                    .clip(RoundedCornerShape(18.dp))
                    .background(HubColors.SurfaceAlt)
                    .border(1.dp, HubColors.Border, RoundedCornerShape(18.dp)),
            ) {
                Header(
                    unread = feed.unread,
                    loading = loading,
                    onRefresh = { viewModel.refreshNotifications() },
                    onMarkRead = { viewModel.markAllNotificationsRead() },
                    onClose = onDismiss,
                )

                if (error != null) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(HubColors.Amber.copy(alpha = 0.08f))
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                    ) {
                        Text(
                            error,
                            color = HubColors.Amber,
                            fontSize = 11.sp,
                            lineHeight = 15.sp,
                        )
                    }
                }

                when {
                    loading && feed.items.isEmpty() -> LoadingRow()
                    feed.items.isEmpty() -> EmptyFeed(error != null)
                    else -> LazyColumn(
                        modifier = Modifier.heightIn(max = 430.dp),
                        contentPadding = PaddingValues(vertical = 2.dp),
                    ) {
                        items(feed.items, key = { it.id }) { item ->
                            NotificationRow(
                                item = item,
                                onClick = {
                                    val url = item.url
                                    if (!url.isNullOrBlank()) {
                                        onDismiss()
                                        onOpenLink(url)
                                    }
                                },
                            )
                        }
                    }
                }

                if (feed.items.isNotEmpty() && feed.items.size < feed.total) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(10.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(HubColors.Surface)
                            .clickable(enabled = !loading) { viewModel.showMoreNotifications() }
                            .padding(vertical = 10.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            if (loading) "Loading…" else "Load more",
                            color = HubColors.Text,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Header(
    unread: Int,
    loading: Boolean,
    onRefresh: () -> Unit,
    onMarkRead: () -> Unit,
    onClose: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 14.dp, end = 6.dp, top = 11.dp, bottom = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Default.Notifications,
            contentDescription = null,
            tint = HubColors.VioletLight,
            modifier = Modifier.size(15.dp),
        )
        Spacer(Modifier.size(8.dp))
        Text(
            "Notifications",
            color = HubColors.Text,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
        )
        if (unread > 0) {
            Spacer(Modifier.size(8.dp))
            Text(
                "$unread new",
                color = HubColors.VioletLight,
                fontSize = 10.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(HubColors.Violet.copy(alpha = 0.16f))
                    .padding(horizontal = 7.dp, vertical = 2.dp),
            )
        }
        Spacer(Modifier.weight(1f))
        IconButton(onClick = onRefresh, enabled = !loading, modifier = Modifier.size(32.dp)) {
            if (loading) {
                CircularProgressIndicator(
                    color = HubColors.Violet,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(14.dp),
                )
            } else {
                Icon(
                    Icons.Default.Refresh,
                    contentDescription = "Refresh notifications",
                    tint = HubColors.Faint,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
        IconButton(
            onClick = onMarkRead,
            enabled = unread > 0,
            modifier = Modifier.size(32.dp),
        ) {
            Icon(
                Icons.Default.Check,
                contentDescription = "Mark all as read",
                tint = if (unread > 0) HubColors.VioletLight else HubColors.Faint.copy(alpha = 0.5f),
                modifier = Modifier.size(17.dp),
            )
        }
        IconButton(onClick = onClose, modifier = Modifier.size(32.dp)) {
            Icon(
                Icons.Default.Close,
                contentDescription = "Close notifications",
                tint = HubColors.Muted,
                modifier = Modifier.size(17.dp),
            )
        }
    }
}

@Composable
private fun NotificationRow(item: AppNotification, onClick: () -> Unit) {
    val meta = listOfNotNull(
        "Announcement",
        item.courseCode,
        item.courseName,
    ).joinToString(" - ")

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (item.read) Color.Transparent else HubColors.Surface.copy(alpha = 0.75f))
            .clickable(enabled = !item.url.isNullOrBlank()) { onClick() }
            .padding(horizontal = 13.dp, vertical = 11.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .padding(top = 1.dp)
                .size(29.dp)
                .clip(RoundedCornerShape(9.dp))
                .background(HubColors.SurfaceAlt)
                .border(1.dp, HubColors.Border.copy(alpha = 0.7f), RoundedCornerShape(9.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Default.Notifications,
                contentDescription = null,
                tint = HubColors.Muted,
                modifier = Modifier.size(14.dp),
            )
        }
        Spacer(Modifier.size(10.dp))
        Column(Modifier.weight(1f)) {
            Text(
                item.title,
                color = if (item.read) HubColors.Muted else HubColors.VioletLight,
                fontSize = 12.5.sp,
                fontWeight = if (item.read) FontWeight.Normal else FontWeight.Medium,
                lineHeight = 17.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(3.dp))
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    meta,
                    color = HubColors.Faint,
                    fontSize = 10.5.sp,
                    lineHeight = 14.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    formatActivityTime(item.createdAt),
                    color = HubColors.Faint,
                    fontSize = 10.sp,
                    modifier = Modifier.widthIn(min = 0.dp),
                )
            }
        }
        if (!item.read) {
            Spacer(Modifier.size(7.dp))
            Box(
                modifier = Modifier
                    .padding(top = 6.dp)
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(HubColors.VioletLight),
            )
        }
    }
}

@Composable
private fun LoadingRow() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(
            color = HubColors.Violet,
            strokeWidth = 2.dp,
            modifier = Modifier.size(15.dp),
        )
        Spacer(Modifier.size(9.dp))
        Text("Loading updates…", color = HubColors.Faint, fontSize = 12.sp)
    }
}

@Composable
private fun EmptyFeed(hasError: Boolean) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 36.dp)) {
        Text(
            if (hasError) "Nothing to show yet" else "You're all caught up",
            color = HubColors.Text,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Medium,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            if (hasError) {
                "Updates appear here as D2L reports them. Use refresh if you just added a course."
            } else {
                "Nothing new in your courses right now."
            },
            color = HubColors.Faint,
            fontSize = 11.sp,
            lineHeight = 15.sp,
        )
    }
}
