package com.d2lhub.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.CookieManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.d2lhub.app.data.SessionStore
import com.d2lhub.app.ui.CalendarScreen
import com.d2lhub.app.ui.CourseDetailScreen
import com.d2lhub.app.ui.CoursesScreen
import com.d2lhub.app.ui.D2lHubTheme
import com.d2lhub.app.ui.DashboardScreen
import com.d2lhub.app.ui.HubBackground
import com.d2lhub.app.ui.HubColors
import com.d2lhub.app.ui.NotificationsBell
import com.d2lhub.app.ui.NotificationsPanel
import com.d2lhub.app.ui.SettingsScreen
import com.d2lhub.app.ui.SignInScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            D2lHubTheme {
                val viewModel: AppViewModel = viewModel()

                Box(Modifier.fillMaxSize()) {
                    HubBackground(viewModel.appearance)
                    if (viewModel.session == null) {
                        val store = remember { SessionStore(this@MainActivity) }
                        SignInScreen(
                            initialBaseUrl = store.lastBaseUrl(),
                            onSignedIn = viewModel::signedIn,
                        )
                    } else {
                        AppShell(viewModel)
                    }
                }
            }
        }
    }
}

@Composable
private fun AppShell(viewModel: AppViewModel) {
    var tab by remember { mutableStateOf(0) }
    var showNotifications by remember { mutableStateOf(false) }
    val detail = viewModel.courseDetail
    val context = LocalContext.current
    val notificationPermission =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}

    // Ask once, after sign-in, so download progress can appear in the shade.
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            val prefs = context.getSharedPreferences("d2lhub", Context.MODE_PRIVATE)
            if (!prefs.getBoolean("askedForNotifications", false)) {
                prefs.edit().putBoolean("askedForNotifications", true).apply()
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    val openLink: (String) -> Unit = remember(context) {
        { url ->
            context.startActivity(
                Intent(context, WebLinkActivity::class.java)
                    .putExtra(WebLinkActivity.EXTRA_URL, url),
            )
        }
    }

    BackHandler(enabled = detail != null) { viewModel.closeCourse() }

    Scaffold(
        containerColor = Color.Transparent,
        bottomBar = {
            if (detail == null) {
                NavigationBar(
                    containerColor = HubColors.Surface.copy(alpha = 0.9f),
                    tonalElevation = 0.dp,
                ) {
                    val colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = HubColors.VioletLight,
                        selectedTextColor = HubColors.VioletLight,
                        indicatorColor = HubColors.Violet.copy(alpha = 0.16f),
                        unselectedIconColor = HubColors.Faint,
                        unselectedTextColor = HubColors.Faint,
                    )
                    NavigationBarItem(
                        selected = tab == 0,
                        onClick = { tab = 0 },
                        icon = { Icon(Icons.Default.Home, contentDescription = null) },
                        label = { Text("Home", fontSize = 10.sp) },
                        colors = colors,
                    )
                    NavigationBarItem(
                        selected = tab == 1,
                        onClick = { tab = 1 },
                        icon = { Icon(Icons.Default.DateRange, contentDescription = null) },
                        label = { Text("Calendar", fontSize = 10.sp) },
                        colors = colors,
                    )
                    NavigationBarItem(
                        selected = tab == 2,
                        onClick = { tab = 2 },
                        icon = { Icon(Icons.AutoMirrored.Filled.List, contentDescription = null) },
                        label = { Text("Courses", fontSize = 10.sp) },
                        colors = colors,
                    )
                    NavigationBarItem(
                        selected = tab == 3,
                        onClick = { tab = 3 },
                        icon = { Icon(Icons.Default.Settings, contentDescription = null) },
                        label = { Text("Settings", fontSize = 10.sp) },
                        colors = colors,
                    )
                }
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (detail != null) {
                CourseDetailScreen(
                    viewModel = viewModel,
                    course = detail.course,
                    onBack = { viewModel.closeCourse() },
                    onOpenLink = openLink,
                )
            } else {
                TopBar(
                    viewModel = viewModel,
                    onOpenNotifications = {
                        viewModel.openNotifications()
                        showNotifications = true
                    },
                )
                when (tab) {
                    0 -> DashboardScreen(
                        viewModel = viewModel,
                        onOpenCourse = { viewModel.openCourse(it) },
                        onOpenLink = openLink,
                        onOpenSettings = { tab = 3 },
                    )

                    1 -> CalendarScreen(
                        viewModel = viewModel,
                        onOpenLink = openLink,
                        onOpenSettings = { tab = 3 },
                    )

                    2 -> CoursesScreen(
                        viewModel = viewModel,
                        onOpenCourse = { viewModel.openCourse(it) },
                        onOpenLink = openLink,
                    )

                    else -> SettingsScreen(
                        viewModel = viewModel,
                        onSignOut = {
                            CookieManager.getInstance().removeAllCookies(null)
                            CookieManager.getInstance().flush()
                            viewModel.signOut()
                        },
                    )
                }
            }
        }
    }

    if (showNotifications) {
        NotificationsPanel(
            viewModel = viewModel,
            onDismiss = { showNotifications = false },
            onOpenLink = { url ->
                showNotifications = false
                openLink(url)
            },
        )
    }
}

@Composable
private fun TopBar(viewModel: AppViewModel, onOpenNotifications: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 10.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(24.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(HubColors.Violet),
            contentAlignment = Alignment.Center,
        ) {
            Text("D", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.size(9.dp))
        Text("D2L Hub", color = HubColors.Text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.weight(1f))
        NotificationsBell(viewModel.notifications.unread, onOpenNotifications)
        if (viewModel.refreshing) {
            CircularProgressIndicator(
                color = HubColors.Violet,
                strokeWidth = 2.dp,
                modifier = Modifier.size(16.dp).padding(end = 8.dp),
            )
        } else {
            IconButton(onClick = { viewModel.refresh() }, modifier = Modifier.size(36.dp)) {
                Icon(
                    Icons.Default.Refresh,
                    contentDescription = "Refresh",
                    tint = HubColors.Muted,
                    modifier = Modifier.size(19.dp),
                )
            }
        }
    }
}
