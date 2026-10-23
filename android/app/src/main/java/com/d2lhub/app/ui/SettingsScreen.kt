package com.d2lhub.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.d2lhub.app.AppViewModel
import com.d2lhub.app.BuildConfig
import com.d2lhub.app.data.NotionDatabase

private val GoogleBlue = Color(0xFF8AB4F8)
private val NotionGrey = Color(0xFFCDD3DF)

@Composable
fun SettingsScreen(
    viewModel: AppViewModel,
    onSignOut: () -> Unit,
) {
    var confirmSignOut by remember { mutableStateOf(false) }
    var showGoogle by remember { mutableStateOf(false) }
    var showNotion by remember { mutableStateOf(false) }
    var showAi by remember { mutableStateOf(false) }
    var showAppearance by remember { mutableStateOf(false) }
    var confirmDisconnect by remember { mutableStateOf<String?>(null) }
    val session = viewModel.session
    val name = viewModel.profile?.name ?: session?.userName

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 12.dp),
    ) {
        Text("Settings", color = HubColors.Text, fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(16.dp))

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(HubColors.Surface)
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(HubColors.Violet.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        initials(name ?: "D2L", "D2"),
                        color = HubColors.VioletLight,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Spacer(Modifier.size(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        name?.takeIf { it.isNotBlank() } ?: "D2L account",
                        color = HubColors.Text,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(3.dp))
                    Text(
                        session?.baseUrl?.replaceFirst("https://", "").orEmpty(),
                        color = HubColors.Faint,
                        fontSize = 11.5.sp,
                    )
                }
                Box(Modifier.size(8.dp).clip(CircleShape).background(HubColors.Green))
            }
            Spacer(Modifier.height(14.dp))
            Text(
                viewModel.lastUpdated?.let { "Last refreshed ${formatDay(it)} · ${formatTime(it)}" }
                    ?: "Not refreshed yet",
                color = HubColors.Faint,
                fontSize = 11.5.sp,
            )
        }

        Spacer(Modifier.height(18.dp))
        SectionTitle("APPEARANCE")
        Spacer(Modifier.height(8.dp))

        SettingRow(
            title = "Background",
            subtitle = "${backdropLabel(viewModel.appearance)} · tap to change the background",
            onClick = {
                viewModel.clearAppearanceError()
                showAppearance = true
            },
        ) {
            Text(
                "CHANGE",
                color = HubColors.VioletLight,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }

        Spacer(Modifier.height(18.dp))
        SectionTitle("SESSION")
        Spacer(Modifier.height(8.dp))

        SettingRow(
            title = if (viewModel.refreshing) "Refreshing…" else "Refresh now",
            subtitle = "Reload courses, due dates and connected calendars",
            onClick = { if (!viewModel.refreshing) viewModel.refresh() },
        ) {
            if (viewModel.refreshing) {
                CircularProgressIndicator(
                    color = HubColors.Violet,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        Spacer(Modifier.height(8.dp))
        SettingRow(
            title = "Sign out",
            subtitle = "Forget the saved D2L session on this phone",
            onClick = { confirmSignOut = true },
            danger = true,
        )

        Spacer(Modifier.height(18.dp))
        SectionTitle("CONNECTED APPS")
        Spacer(Modifier.height(8.dp))

        IntegrationRow(
            badge = "G",
            tint = GoogleBlue,
            title = "Google Calendar",
            subtitle = if (viewModel.google.connected) {
                listOfNotNull(
                    viewModel.google.label,
                    syncSummary(viewModel.google.count, "event", viewModel.google.lastSync),
                ).joinToString(" · ")
            } else {
                "Read classes and events from a private iCal link"
            },
            error = viewModel.google.error,
            connected = viewModel.google.connected,
            busy = viewModel.googleBusy,
            onClick = {
                if (viewModel.google.connected) {
                    confirmDisconnect = "google"
                } else {
                    viewModel.clearGoogleError()
                    showGoogle = true
                }
            },
        )

        Spacer(Modifier.height(8.dp))
        IntegrationRow(
            badge = "N",
            tint = NotionGrey,
            title = "Notion",
            subtitle = if (viewModel.notion.connected) {
                listOfNotNull(
                    viewModel.notion.title,
                    syncSummary(viewModel.notion.count, "entry", viewModel.notion.lastSync),
                ).joinToString(" · ")
            } else {
                "Read dated entries from one shared database"
            },
            error = viewModel.notion.error,
            connected = viewModel.notion.connected,
            busy = viewModel.notionBusy,
            onClick = {
                if (viewModel.notion.connected) {
                    confirmDisconnect = "notion"
                } else {
                    viewModel.clearNotionPicker()
                    showNotion = true
                }
            },
        )

        Spacer(Modifier.height(8.dp))
        Text(
            "These connections are read-only. Google Calendar uses the secret iCal address of one calendar; Notion uses an internal integration token that can only see the database you share with it.",
            color = HubColors.Faint,
            fontSize = 11.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(horizontal = 4.dp),
        )

        Spacer(Modifier.height(18.dp))
        SectionTitle("AI")
        Spacer(Modifier.height(8.dp))

        IntegrationRow(
            badge = "✦",
            tint = HubColors.Amber,
            title = "AI for outlines",
            subtitle = if (viewModel.aiSettings.hasKey) {
                "${viewModel.aiSettings.provider.label} · ${viewModel.aiSettings.effectiveModel} · ${viewModel.aiSettings.keyHint}"
            } else {
                "Optional — reads dates from messy outlines and tables"
            },
            error = null,
            connected = viewModel.aiSettings.hasKey,
            busy = viewModel.aiBusy,
            onClick = {
                viewModel.clearAiMessages()
                showAi = true
            },
        )

        Spacer(Modifier.height(8.dp))
        Text(
            "Upload an outline from a course's Import button, or from Courses → Import. It is read on this phone; with a key, the text is sent to your chosen provider only when you import.",
            color = HubColors.Faint,
            fontSize = 11.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(horizontal = 4.dp),
        )

        Spacer(Modifier.height(18.dp))
        SectionTitle("ABOUT")
        Spacer(Modifier.height(8.dp))
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(HubColors.Surface)
                .padding(16.dp),
        ) {
            Text("D2L Hub for Android", color = HubColors.Text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Text("Version ${BuildConfig.VERSION_NAME}", color = HubColors.Faint, fontSize = 11.5.sp)
            Spacer(Modifier.height(12.dp))
            Text(
                "An unofficial companion to your school's Brightspace. It is not affiliated with or endorsed by D2L or your institution.",
                color = HubColors.Muted,
                fontSize = 12.sp,
                lineHeight = 18.sp,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "Sign-in happens on your school's own page. The D2L cookie, the calendar link and the Notion token are stored encrypted on this device — there is no D2L Hub server.",
                color = HubColors.Faint,
                fontSize = 11.5.sp,
                lineHeight = 17.sp,
            )
        }

        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
            Text(
                "Open source · built for students",
                color = HubColors.Faint,
                fontSize = 11.sp,
            )
        }
        Spacer(Modifier.height(24.dp))
    }

    if (showGoogle) {
        GoogleCalendarDialog(viewModel, onDismiss = { showGoogle = false })
    }

    if (showNotion) {
        NotionDialog(viewModel, onDismiss = { showNotion = false })
    }

    if (showAi) {
        AiSettingsDialog(viewModel, onDismiss = { showAi = false })
    }

    if (showAppearance) {
        AppearanceDialog(viewModel, onDismiss = { showAppearance = false })
    }

    val disconnect = confirmDisconnect
    if (disconnect != null) {
        AlertDialog(
            onDismissRequest = { confirmDisconnect = null },
            containerColor = HubColors.SurfaceAlt,
            title = {
                Text(
                    if (disconnect == "google") "Disconnect Google Calendar?" else "Disconnect Notion?",
                    color = HubColors.Text,
                )
            },
            text = {
                Text(
                    if (disconnect == "google") {
                        "The saved calendar link is deleted from this phone. Your Google Calendar itself is not changed."
                    } else {
                        "The saved Notion token and database are deleted from this phone. Nothing in Notion is changed."
                    },
                    color = HubColors.Muted,
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (disconnect == "google") viewModel.disconnectGoogle() else viewModel.disconnectNotion()
                    confirmDisconnect = null
                }) {
                    Text("Disconnect", color = HubColors.Rose)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDisconnect = null }) {
                    Text("Cancel", color = HubColors.Muted)
                }
            },
        )
    }

    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            containerColor = HubColors.SurfaceAlt,
            title = { Text("Sign out of D2L?", color = HubColors.Text) },
            text = {
                Text(
                    "The saved session cookie is deleted from this phone. You can sign in again at any time.",
                    color = HubColors.Muted,
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmSignOut = false
                    onSignOut()
                }) {
                    Text("Sign out", color = HubColors.Rose)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmSignOut = false }) {
                    Text("Cancel", color = HubColors.Muted)
                }
            },
        )
    }
}

@Composable
private fun GoogleCalendarDialog(viewModel: AppViewModel, onDismiss: () -> Unit) {
    var link by remember { mutableStateOf("") }

    LaunchedEffect(viewModel.google.connected) {
        if (viewModel.google.connected) onDismiss()
    }

    AlertDialog(
        onDismissRequest = { if (!viewModel.googleBusy) onDismiss() },
        containerColor = HubColors.SurfaceAlt,
        title = { Text("Connect Google Calendar", color = HubColors.Text) },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 380.dp).verticalScroll(rememberScrollState()),
            ) {
                Text(
                    "In Google Calendar open Settings → your calendar → “Secret address in iCal format”, then paste that address here.",
                    color = HubColors.Muted,
                    fontSize = 12.5.sp,
                    lineHeight = 19.sp,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    "A calendar's secret address works like a password — anyone with it can read that calendar.",
                    color = HubColors.Faint,
                    fontSize = 11.sp,
                    lineHeight = 16.sp,
                )
                Spacer(Modifier.height(14.dp))
                OutlinedTextField(
                    value = link,
                    onValueChange = { link = it },
                    placeholder = {
                        Text("https://calendar.google.com/calendar/ical/…/basic.ics", color = HubColors.Faint, fontSize = 11.sp)
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Uri,
                        imeAction = ImeAction.Done,
                    ),
                    colors = dialogFieldColors(),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (viewModel.google.error != null) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        viewModel.google.error!!,
                        color = HubColors.Rose,
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { viewModel.connectGoogle(link) },
                enabled = !viewModel.googleBusy && link.isNotBlank(),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = HubColors.Violet,
                    contentColor = Color.White,
                    disabledContainerColor = HubColors.Violet.copy(alpha = 0.3f),
                    disabledContentColor = Color.White.copy(alpha = 0.5f),
                ),
            ) {
                if (viewModel.googleBusy) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(16.dp),
                    )
                } else {
                    Text("Connect")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !viewModel.googleBusy) {
                Text("Cancel", color = HubColors.Muted)
            }
        },
    )
}

@Composable
private fun NotionDialog(viewModel: AppViewModel, onDismiss: () -> Unit) {
    var token by remember { mutableStateOf("") }
    val databases = viewModel.notionDatabases

    LaunchedEffect(viewModel.notion.connected) {
        if (viewModel.notion.connected) onDismiss()
    }

    AlertDialog(
        onDismissRequest = { if (!viewModel.notionBusy) onDismiss() },
        containerColor = HubColors.SurfaceAlt,
        title = { Text("Connect Notion", color = HubColors.Text) },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 400.dp).verticalScroll(rememberScrollState()),
            ) {
                if (databases == null) {
                    Text(
                        "Create an internal integration at notion.so/my-integrations, share the database with it, then paste its Internal Integration Secret here.",
                        color = HubColors.Muted,
                        fontSize = 12.5.sp,
                        lineHeight = 19.sp,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Only databases shared with that integration are visible.",
                        color = HubColors.Faint,
                        fontSize = 11.sp,
                        lineHeight = 16.sp,
                    )
                    Spacer(Modifier.height(14.dp))
                    OutlinedTextField(
                        value = token,
                        onValueChange = { token = it },
                        placeholder = { Text("ntn_…", color = HubColors.Faint, fontSize = 12.sp) },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done,
                        ),
                        colors = dialogFieldColors(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                } else {
                    Text(
                        "Choose the database that holds your deadlines.",
                        color = HubColors.Muted,
                        fontSize = 12.5.sp,
                        lineHeight = 19.sp,
                    )
                    Spacer(Modifier.height(10.dp))
                    databases.forEach { database ->
                        DatabaseRow(
                            database = database,
                            enabled = !viewModel.notionBusy,
                            onClick = { viewModel.connectNotion(token, database) },
                        )
                        Spacer(Modifier.height(8.dp))
                    }
                }

                if (viewModel.notionBusy && databases != null) {
                    Spacer(Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(
                            color = HubColors.Violet,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.size(10.dp))
                        Text("Reading the database…", color = HubColors.Muted, fontSize = 12.sp)
                    }
                }

                if (viewModel.notionPickerError != null) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        viewModel.notionPickerError!!,
                        color = HubColors.Rose,
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                    )
                }
            }
        },
        confirmButton = {
            if (databases == null) {
                Button(
                    onClick = { viewModel.findNotionDatabases(token) },
                    enabled = !viewModel.notionBusy && token.isNotBlank(),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = HubColors.Violet,
                        contentColor = Color.White,
                        disabledContainerColor = HubColors.Violet.copy(alpha = 0.3f),
                        disabledContentColor = Color.White.copy(alpha = 0.5f),
                    ),
                ) {
                    if (viewModel.notionBusy) {
                        CircularProgressIndicator(
                            color = Color.White,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp),
                        )
                    } else {
                        Text("Find databases")
                    }
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !viewModel.notionBusy) {
                Text("Cancel", color = HubColors.Muted)
            }
        },
    )
}

@Composable
private fun DatabaseRow(database: NotionDatabase, enabled: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(HubColors.Surface)
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                database.title,
                color = HubColors.Text,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                database.dateProperty?.let { "Date property: $it" } ?: "No date property",
                color = if (database.dateProperty == null) HubColors.Amber else HubColors.Faint,
                fontSize = 10.5.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text("→", color = HubColors.VioletLight, fontSize = 14.sp)
    }
}

@Composable
private fun dialogFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = HubColors.Violet,
    unfocusedBorderColor = HubColors.Border,
    focusedContainerColor = HubColors.Surface,
    unfocusedContainerColor = HubColors.Surface,
    cursorColor = HubColors.VioletLight,
    focusedTextColor = HubColors.Text,
    unfocusedTextColor = HubColors.Text,
)

@Composable
private fun IntegrationRow(
    badge: String,
    tint: Color,
    title: String,
    subtitle: String,
    error: String?,
    connected: Boolean,
    busy: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(HubColors.Surface)
            .clickable(enabled = !busy) { onClick() }
            .padding(horizontal = 14.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(tint.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(badge, color = tint, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.size(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                title,
                color = HubColors.Text,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(3.dp))
            Text(
                subtitle,
                color = HubColors.Faint,
                fontSize = 11.5.sp,
                lineHeight = 16.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (error != null) {
                Spacer(Modifier.height(3.dp))
                Text(
                    error,
                    color = HubColors.Rose,
                    fontSize = 11.sp,
                    lineHeight = 15.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.size(8.dp))
        when {
            busy -> CircularProgressIndicator(
                color = HubColors.Violet,
                strokeWidth = 2.dp,
                modifier = Modifier.size(16.dp),
            )

            connected -> Text("CONNECTED", color = HubColors.Green, fontSize = 9.5.sp, fontWeight = FontWeight.SemiBold)
            else -> Text("CONNECT", color = HubColors.VioletLight, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun SettingRow(
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    danger: Boolean = false,
    trailing: @Composable (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(HubColors.Surface)
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                title,
                color = if (danger) HubColors.Rose else HubColors.Text,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(3.dp))
            Text(subtitle, color = HubColors.Faint, fontSize = 11.5.sp, lineHeight = 16.sp)
        }
        if (trailing != null) trailing()
    }
}

private fun syncSummary(count: Int, noun: String, lastSync: Long?): String {
    val item = if (count == 1) "1 $noun" else "$count ${noun}s"
    val whenText = lastSync?.let { "synced ${formatDay(it)} · ${formatTime(it)}" } ?: "not synced yet"
    return "$item · $whenText"
}
