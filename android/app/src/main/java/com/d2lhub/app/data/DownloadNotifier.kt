package com.d2lhub.app.data

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.d2lhub.app.MainActivity

/**
 * Progress and result notifications for "Save for offline". The channel is
 * silent, so a long module download never beeps while it runs.
 */
class DownloadNotifier(context: Context) {
    private val app = context.applicationContext
    private val manager = NotificationManagerCompat.from(app)

    private fun canPost(): Boolean = manager.areNotificationsEnabled() &&
        (
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ContextCompat.checkSelfPermission(app, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
            )

    private fun ensureChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Downloads",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Files saved from D2L and the exam bank"
            setShowBadge(false)
        }
        app.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }

    private fun openApp(): PendingIntent = PendingIntent.getActivity(
        app,
        0,
        Intent(app, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    /** Ongoing, non-dismissible progress while a module downloads. */
    fun progress(title: String, detail: String, done: Int, total: Int) {
        if (!canPost()) return
        ensureChannel()
        val size = total.coerceAtLeast(1)
        val notification = NotificationCompat.Builder(app, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setContentText(detail)
            .setStyle(NotificationCompat.BigTextStyle().bigText(detail))
            .setContentIntent(openApp())
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setProgress(size, done.coerceIn(0, size), false)
            .build()
        post(PROGRESS_ID, notification)
    }

    /** Replaces the progress bar with a dismissible summary. */
    fun finished(title: String, text: String, failed: Boolean = false) {
        manager.cancel(PROGRESS_ID)
        if (!canPost()) return
        ensureChannel()
        val notification = NotificationCompat.Builder(app, CHANNEL_ID)
            .setSmallIcon(
                if (failed) android.R.drawable.stat_notify_error
                else android.R.drawable.stat_sys_download_done,
            )
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(openApp())
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .build()
        post(RESULT_ID, notification)
    }

    /** Hides the progress bar without posting a result. */
    fun clearProgress() {
        manager.cancel(PROGRESS_ID)
    }

    private fun post(id: Int, notification: Notification) {
        try {
            manager.notify(id, notification)
        } catch (_: SecurityException) {
            // The permission was revoked between the check and the post.
        }
    }

    companion object {
        private const val CHANNEL_ID = "downloads"
        private const val PROGRESS_ID = 4101
        private const val RESULT_ID = 4102
    }
}
