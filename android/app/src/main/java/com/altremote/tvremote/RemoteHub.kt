package com.altremote.tvremote

/**
 * Process-wide home of the live remote session, so code outside React — the notification
 * buttons (RemoteActionReceiver) and the foreground service — can reach it.
 *
 * TvRemoteModule owns the session's lifecycle; the others only use it.
 */
object RemoteHub {
  @Volatile var session: RemoteSession? = null

  /** Name shown in the notification. Set from JS with setNotificationControls(). */
  @Volatile var tvName: String = "TV"

  /** Whether to show the notification / lock-screen controls while connected. */
  @Volatile var notificationsEnabled: Boolean = true

  /** Last connection state ("connected", "connecting", "error", …) for the notification. */
  @Volatile var state: String = "disconnected"

  /** Set by TvRemoteModule: disconnects and tells JS (used by the notification's ✕). */
  @Volatile var onDisconnectRequested: (() -> Unit)? = null

  /** Sends a key if a ready session exists. Returns false when not connected. */
  fun sendKey(keyCode: Int): Boolean {
    val s = session?.takeIf { it.isReady } ?: return false
    return try {
      s.sendKey(keyCode, RemoteSession.Direction.SHORT)
      true
    } catch (e: Exception) {
      false
    }
  }
}
