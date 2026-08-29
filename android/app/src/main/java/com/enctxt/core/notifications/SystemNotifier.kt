package com.enctxt.core.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.widget.RemoteViews
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.enctxt.MainActivity
import com.enctxt.R
import com.enctxt.data.repository.IncomingMessageNotification
import java.time.Duration
import java.time.Instant

private const val CHANNEL_ID = "messages"

/**
 * Posts the OS-level heads-up notification for [IncomingMessageNotification] — the system-tray
 * counterpart to the in-app [com.enctxt.presentation.components.vade.MessageNotificationBanner],
 * so a message still surfaces when the app is backgrounded (not just foregrounded) as long as
 * the process — and with it the WebSocket connection — is still alive.
 *
 * Renders through a custom [RemoteViews] layout (`res/layout/notification_message.xml`) rather
 * than the stock title/text template, so the heads-up popup matches Vade's own design instead of
 * the OEM's default notification chrome. [NotificationCompat.DecoratedCustomViewStyle] keeps the
 * thin system header (app name, timestamp, expand affordance) so it still behaves like a normal
 * notification — swipe-to-dismiss, grouping, long-press settings — underneath the custom content.
 *
 * Same privacy rule as everywhere else: only the sender's name and a generic line ever appear,
 * never decrypted content.
 */
class SystemNotifier(context: Context) {

    private val appContext = context.applicationContext
    private val manager = NotificationManagerCompat.from(appContext)

    init {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "New encrypted messages from your conversations"
            }
            appContext.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

    fun notify(item: IncomingMessageNotification) {
        // A single bad render (or a permission revoked mid-flight) must never take down the
        // caller's collector — this is fed by a long-lived SharedFlow subscription that has to
        // keep working for every later message even if one notify() call fails.
        try {
            postNotification(item)
        } catch (_: Exception) {
            // Drop silently: the in-app banner is still the authoritative signal.
        }
    }

    private fun postNotification(item: IncomingMessageNotification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ActivityCompat.checkSelfPermission(appContext, android.Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val openIntent = Intent(appContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            appContext,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val body = if (item.isNewConversation) "Started a conversation" else "Sent an encrypted message"

        val views = RemoteViews(appContext.packageName, R.layout.notification_message).apply {
            setTextViewText(R.id.notif_avatar_initial, item.peerDisplayName.trim().take(1).uppercase().ifEmpty { "?" })
            setTextViewText(R.id.notif_name, item.peerDisplayName)
            setTextViewText(R.id.notif_body, body)
            setTextViewText(R.id.notif_time, formatRelativeTime(item.createdAt))
            setViewVisibility(R.id.notif_new_chip, if (item.isNewConversation) android.view.View.VISIBLE else android.view.View.GONE)
        }

        val notification = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(item.peerDisplayName)
            .setContentText(body)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(views)
            .setCustomBigContentView(views)
            .setCustomHeadsUpContentView(views)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        manager.notify(item.conversationId.hashCode(), notification)
    }
}

/** "now", "2m", "1h" — mirrors the in-app banner's timestamp so both read the same way. */
private fun formatRelativeTime(isoTimestamp: String): String = try {
    val instant = Instant.parse(isoTimestamp)
    val seconds = Duration.between(instant, Instant.now()).seconds.coerceAtLeast(0)
    when {
        seconds < 60 -> "now"
        seconds < 3600 -> "${seconds / 60}m"
        else -> "${seconds / 3600}h"
    }
} catch (_: Exception) {
    ""
}
