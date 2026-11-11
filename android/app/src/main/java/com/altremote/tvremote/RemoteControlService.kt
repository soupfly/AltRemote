package com.altremote.tvremote

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.altremote.BuildConfig
import com.altremote.MainActivity
import com.altremote.R

/**
 * Foreground service that shows the remote in a notification (also on the lock screen)
 * while connected to a TV.
 *
 * Being a foreground service also keeps the connection alive in the background: without
 * it, Samsung (and other) phones freeze the app and block its network within a minute.
 */
class RemoteControlService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = buildNotification(this)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      isRunning = true
    } catch (e: Exception) {
      // e.g. started from the background on Android 12+, or notifications blocked.
      if (BuildConfig.DEBUG) Log.w(TAG, "Couldn't start notification controls", e)
      stopSelf()
    }
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // App swiped away from Recents: end the session and remove the controls.
    RemoteHub.onDisconnectRequested?.invoke() ?: RemoteHub.session?.close()
    stopSelf()
  }

  override fun onDestroy() {
    isRunning = false
    super.onDestroy()
  }

  companion object {
    private const val TAG = "AltRemote.Service"
    private const val CHANNEL_ID = "remote_controls"
    const val NOTIFICATION_ID = 6466

    @Volatile var isRunning = false
      private set

    fun start(context: Context) {
      try {
        ContextCompat.startForegroundService(context, Intent(context, RemoteControlService::class.java))
      } catch (e: Exception) {
        if (BuildConfig.DEBUG) Log.w(TAG, "Couldn't start the service", e)
      }
    }

    fun stop(context: Context) {
      if (!isRunning) return
      context.stopService(Intent(context, RemoteControlService::class.java))
      isRunning = false
    }

    /** Updates the notification text (connection state, TV name) if it's showing. */
    fun refresh(context: Context) {
      if (!isRunning) return
      try {
        context.getSystemService(NotificationManager::class.java)
          ?.notify(NOTIFICATION_ID, buildNotification(context))
      } catch (_: Exception) {}
    }

    private fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = context.getSystemService(NotificationManager::class.java) ?: return
      if (nm.getNotificationChannel(CHANNEL_ID) != null) return
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "TV remote controls", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Remote buttons in the notification shade and on the lock screen"
          setShowBadge(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
          setSound(null, null)
          enableVibration(false)
        }
      )
    }

    private fun statusText(): String =
      when (RemoteHub.state) {
        "connected" -> "Connected"
        "connecting" -> "Connecting…"
        "error" -> "Reconnecting…"
        else -> "Not connected"
      }

    fun buildNotification(context: Context): Notification {
      ensureChannel(context)
      val title = RemoteHub.tvName
      val status = statusText()

      val small = RemoteViews(context.packageName, R.layout.notification_remote_small).apply {
        setTextViewText(R.id.remote_title, title)
        setTextViewText(R.id.remote_status, status)
        bindKey(context, R.id.btn_vol_down, KEY_VOLUME_DOWN)
        bindKey(context, R.id.btn_play_pause, KEY_PLAY_PAUSE)
        bindKey(context, R.id.btn_vol_up, KEY_VOLUME_UP)
      }
      val big = RemoteViews(context.packageName, R.layout.notification_remote_big).apply {
        setTextViewText(R.id.remote_title, title)
        setTextViewText(R.id.remote_status, status)
        bindKey(context, R.id.btn_back, KEY_BACK)
        bindKey(context, R.id.btn_up, KEY_UP)
        bindKey(context, R.id.btn_home, KEY_HOME)
        bindKey(context, R.id.btn_left, KEY_LEFT)
        bindKey(context, R.id.btn_ok, KEY_OK)
        bindKey(context, R.id.btn_right, KEY_RIGHT)
        bindKey(context, R.id.btn_vol_down, KEY_VOLUME_DOWN)
        bindKey(context, R.id.btn_down, KEY_DOWN)
        bindKey(context, R.id.btn_vol_up, KEY_VOLUME_UP)
        bindKey(context, R.id.btn_play_pause, KEY_PLAY_PAUSE)
        bindKey(context, R.id.btn_mute, KEY_MUTE)
        setOnClickPendingIntent(R.id.btn_disconnect, RemoteActionReceiver.disconnectIntent(context))
      }

      val open =
        PendingIntent.getActivity(
          context,
          0,
          Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
          PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

      return NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_remote)
        .setContentTitle(title)
        .setContentText(status)
        .setCustomContentView(small)
        .setCustomBigContentView(big)
        .setStyle(NotificationCompat.DecoratedCustomViewStyle())
        .setContentIntent(open)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setShowWhen(false)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .build()
    }

    private fun RemoteViews.bindKey(context: Context, viewId: Int, keyCode: Int) {
      setOnClickPendingIntent(viewId, RemoteActionReceiver.keyIntent(context, keyCode))
    }

    // Android KeyEvent codes
    private const val KEY_HOME = 3
    private const val KEY_BACK = 4
    private const val KEY_UP = 19
    private const val KEY_DOWN = 20
    private const val KEY_LEFT = 21
    private const val KEY_RIGHT = 22
    private const val KEY_OK = 23
    private const val KEY_VOLUME_UP = 24
    private const val KEY_VOLUME_DOWN = 25
    private const val KEY_PLAY_PAUSE = 85
    private const val KEY_MUTE = 164
  }
}
