package com.altremote.tvremote

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.util.concurrent.Executors

/** Handles the notification / lock-screen buttons. Not exported: only our PendingIntents reach it. */
class RemoteActionReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync()
    // Sending is network I/O, so never on the main thread.
    executor.execute {
      try {
        when (intent.action) {
          ACTION_KEY -> {
            val keyCode = intent.getIntExtra(EXTRA_KEY_CODE, -1)
            if (keyCode >= 0) {
              Haptics(context).play(Haptics.Kind.TAP)
              RemoteHub.sendKey(keyCode)
            }
          }
          ACTION_DISCONNECT -> {
            RemoteHub.onDisconnectRequested?.invoke()
              ?: run {
                RemoteHub.session?.close()
                RemoteControlService.stop(context)
              }
          }
        }
      } finally {
        pending.finish()
      }
    }
  }

  companion object {
    private const val ACTION_KEY = "com.altremote.action.KEY"
    private const val ACTION_DISCONNECT = "com.altremote.action.DISCONNECT"
    private const val EXTRA_KEY_CODE = "keyCode"
    private val executor = Executors.newSingleThreadExecutor()

    fun keyIntent(context: Context, keyCode: Int): PendingIntent =
      PendingIntent.getBroadcast(
        context,
        keyCode, // distinct request code per key so the PendingIntents don't collapse
        Intent(context, RemoteActionReceiver::class.java)
          .setAction(ACTION_KEY)
          .putExtra(EXTRA_KEY_CODE, keyCode),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )

    fun disconnectIntent(context: Context): PendingIntent =
      PendingIntent.getBroadcast(
        context,
        -1,
        Intent(context, RemoteActionReceiver::class.java).setAction(ACTION_DISCONNECT),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
  }
}
