package com.altremote.tvremote

import android.util.Log
import com.altremote.BuildConfig
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.net.InetSocketAddress
import java.net.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * JS-facing entry point for talking to Google TV ("TvRemote" in NativeModules).
 *
 * - Client identity (CertManager)
 * - TV discovery and reachability checks (TvDiscovery)
 * - Pairing (PairingManager)
 * - Remote session: keys, app links, text, TV state events (RemoteSession)
 *
 * All work runs on Dispatchers.IO, never on the UI thread.
 */
class TvRemoteModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  override fun getName() = NAME

  private fun run(promise: Promise, block: suspend kotlinx.coroutines.CoroutineScope.() -> Any?) {
    scope.launch {
      try {
        promise.resolve(coroutineScope { block() })
      } catch (e: Exception) {
        if (BuildConfig.DEBUG) Log.e(TAG, "TvRemote call failed", e)
        val code =
          (e as? PairingManager.PairingException)?.code
            ?: (e as? RemoteSession.RemoteException)?.code
            ?: "TV_REMOTE_ERROR"
        promise.reject(code, e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  private fun identityMap(created: Boolean? = null): WritableMap {
    val info = CertManager.info()
    return Arguments.createMap().apply {
      putString("subject", info.subject)
      putString("serialNumber", info.serialNumber)
      putDouble("notBefore", info.notBefore.time.toDouble())
      putDouble("notAfter", info.notAfter.time.toDouble())
      putInt("keySizeBits", info.keySizeBits)
      putString("sha256Fingerprint", info.sha256Fingerprint)
      putString("securityLevel", info.securityLevel)
      if (created != null) putBoolean("created", created)
    }
  }

  // ---------- Identity (step 1) ----------

  /** Creates the client key pair and certificate on first use. Resolves with its info. */
  @ReactMethod
  fun generateIdentityIfNeeded(promise: Promise) = run(promise) {
    val created = CertManager.generateIfNeeded()
    if (BuildConfig.DEBUG) Log.d(TAG, if (created) "Generated client identity" else "Client identity exists")
    identityMap(created)
  }

  /** Resolves with the identity info, or null if none exists yet. */
  @ReactMethod
  fun getIdentityInfo(promise: Promise) = run(promise) {
    if (CertManager.hasIdentity()) identityMap() else null
  }

  /** Deletes the identity. All TVs must be paired again. */
  @ReactMethod
  fun resetIdentity(promise: Promise) = run(promise) {
    CertManager.reset()
    null
  }

  // ---------- Discovery (step 2) ----------

  private val discovery by lazy {
    TvDiscovery(
      reactApplicationContext,
      object : TvDiscovery.Listener {
        override fun onFound(tv: TvDiscovery.FoundTv) {
          emit(
            "onDeviceFound",
            Arguments.createMap().apply {
              putString("name", tv.serviceName)
              putString("host", tv.host)
              putInt("port", tv.port)
              putMap(
                "attributes",
                Arguments.createMap().apply { tv.attributes.forEach { (k, v) -> putString(k, v) } },
              )
            },
          )
        }

        override fun onLost(serviceName: String) {
          emit("onDeviceLost", Arguments.createMap().apply { putString("name", serviceName) })
        }

        override fun onStateChanged(running: Boolean, error: String?) {
          emit(
            "onDiscoveryState",
            Arguments.createMap().apply {
              putBoolean("running", running)
              if (error != null) putString("error", error)
            },
          )
        }
      },
    )
  }

  private fun emit(event: String, payload: WritableMap) {
    if (reactApplicationContext.hasActiveReactInstance()) {
      reactApplicationContext.emitDeviceEvent(event, payload)
    }
  }

  /** Starts browsing for TVs. Results arrive as onDeviceFound / onDeviceLost events. */
  @ReactMethod
  fun startDiscovery(promise: Promise) = run(promise) {
    discovery.start()
    null
  }

  @ReactMethod
  fun stopDiscovery(promise: Promise) = run(promise) {
    discovery.stop()
    null
  }

  /**
   * Checks whether the TV's remote (6466) and pairing (6467) ports accept TCP connections.
   * Used for TVs added by IP, which mDNS can't vouch for.
   */
  @ReactMethod
  fun checkReachable(host: String, promise: Promise) = run(promise) {
    val remote = async { tcpOpen(host, REMOTE_PORT) }
    val pairing = async { tcpOpen(host, PAIRING_PORT) }
    Arguments.createMap().apply {
      putBoolean("remote", remote.await())
      putBoolean("pairing", pairing.await())
    }
  }

  private fun tcpOpen(host: String, port: Int): Boolean =
    try {
      Socket().use { it.connect(InetSocketAddress(host, port), REACHABLE_TIMEOUT_MS) }
      true
    } catch (e: Exception) {
      false
    }

  // ---------- Pairing (step 3) ----------

  private val pairing = PairingManager()

  private val clientName: String
    get() = "AltRemote (${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL})"

  /**
   * Connects to the TV's pairing port. Resolves once the TV is showing its code.
   * Resolves with { serverName }.
   */
  @ReactMethod
  fun startPairing(host: String, promise: Promise) = run(promise) {
    val started = pairing.start(host, clientName)
    Arguments.createMap().apply { putString("serverName", started.serverName) }
  }

  /**
   * Sends the code shown on the TV. Resolves with { serverName, serverCertFingerprint }.
   * Rejects with BAD_CODE (typo caught locally, retry allowed), CODE_REJECTED,
   * CONNECTION_CLOSED, TIMEOUT, NO_SESSION or PAIRING_FAILED.
   */
  @ReactMethod
  fun finishPairing(code: String, promise: Promise) = run(promise) {
    val paired = pairing.finish(code)
    Arguments.createMap().apply {
      putString("serverName", paired.serverName)
      putString("serverCertFingerprint", paired.serverCertFingerprint)
    }
  }

  @ReactMethod
  fun cancelPairing(promise: Promise) = run(promise) {
    pairing.cancel()
    null
  }

  // ---------- Haptics ----------

  private val haptics by lazy { Haptics(reactApplicationContext) }

  /** Short vibration for a button press. kind: "tap" | "long" | "tick". Fire-and-forget. */
  @ReactMethod
  fun haptic(kind: String) {
    haptics.play(
      when (kind) {
        "long" -> Haptics.Kind.LONG
        "tick" -> Haptics.Kind.TICK
        else -> Haptics.Kind.TAP
      }
    )
  }

  // ---------- Network changes (reconnect) ----------

  private var networkCallback: android.net.ConnectivityManager.NetworkCallback? = null

  /** Emits onNetworkChanged so JS can reconnect right away when Wi-Fi returns. */
  @Synchronized
  private fun watchNetwork() {
    if (networkCallback != null) return
    val cm = reactApplicationContext.getSystemService(android.net.ConnectivityManager::class.java) ?: return
    val cb =
      object : android.net.ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: android.net.Network) {
          emit("onNetworkChanged", Arguments.createMap().apply { putBoolean("available", true) })
        }

        override fun onLost(network: android.net.Network) {
          emit("onNetworkChanged", Arguments.createMap().apply { putBoolean("available", false) })
          // Don't wait 16 s for the idle timeout: the TV is unreachable without a network.
          session?.fail("CONNECTION_LOST", "Lost the Wi-Fi connection")
        }
      }
    try {
      cm.registerDefaultNetworkCallback(cb)
      networkCallback = cb
    } catch (e: Exception) {
      if (BuildConfig.DEBUG) Log.w(TAG, "Couldn't watch network changes", e)
    }
  }

  @Synchronized
  private fun unwatchNetwork() {
    val cb = networkCallback ?: return
    networkCallback = null
    try {
      reactApplicationContext.getSystemService(android.net.ConnectivityManager::class.java)
        ?.unregisterNetworkCallback(cb)
    } catch (_: Exception) {}
  }

  // ---------- Remote session (step 4) ----------

  /** Lives in RemoteHub so the notification controls can reach it. */
  private var session: RemoteSession?
    get() = RemoteHub.session
    set(value) {
      RemoteHub.session = value
    }
  private val connectMutex = Mutex()

  private fun connectionState(state: String, host: String?, error: RemoteSession.RemoteException? = null) {
    RemoteHub.state = state
    updateNotification(state)
    emit(
      "onConnectionState",
      Arguments.createMap().apply {
        putString("state", state)
        if (host != null) putString("host", host)
        if (error != null) {
          putString("code", error.code)
          putString("message", error.message)
        }
      },
    )
  }

  private val sessionListener =
    object : RemoteSession.Listener {
      override fun onReady(session: RemoteSession) {
        if (session === this@TvRemoteModule.session) connectionState("connected", session.host)
      }

      override fun onClosed(session: RemoteSession, error: RemoteSession.RemoteException?) {
        // Ignore old sessions replaced by a newer connect().
        if (session !== this@TvRemoteModule.session) return
        this@TvRemoteModule.session = null
        val state = if (error?.code == "PAIRING_REQUIRED" || error?.code == "TV_CHANGED") "pairing_required" else if (error != null) "error" else "disconnected"
        connectionState(state, session.host, error)
      }

      override fun onPowerState(isOn: Boolean) {
        emit("onPowerState", Arguments.createMap().apply { putBoolean("isOn", isOn) })
      }

      override fun onVolume(level: Int, max: Int, muted: Boolean) {
        emit(
          "onVolume",
          Arguments.createMap().apply {
            putInt("level", level)
            putInt("max", max)
            putBoolean("muted", muted)
          },
        )
      }

      override fun onCurrentApp(packageName: String) {
        emit("onCurrentApp", Arguments.createMap().apply { putString("packageName", packageName) })
      }

      override fun onImeShow(currentText: String) {
        emit("onImeShow", Arguments.createMap().apply { putString("text", currentText) })
      }

      override fun onDeviceInfo(vendor: String, model: String, appVersion: String) {
        emit(
          "onDeviceInfo",
          Arguments.createMap().apply {
            putString("vendor", vendor)
            putString("model", model)
            putString("appVersion", appVersion)
          },
        )
      }
    }

  /**
   * Opens the remote session with a paired TV. `expectedFingerprint` is the TV certificate
   * fingerprint saved at pairing (null to skip the check). Resolves when keys can be sent.
   * Rejects with CONNECT_FAILED, PAIRING_REQUIRED, TV_CHANGED or HANDSHAKE_FAILED.
   */
  @ReactMethod
  fun connect(host: String, expectedFingerprint: String?, promise: Promise) {
    watchNetwork()
    scope.launch {
      connectMutex.withLock {
        val current = session
        if (current != null && current.host == host && current.isReady) {
          promise.resolve(null)
          return@withLock
        }
        current?.close()
        val s = RemoteSession(host, expectedFingerprint, sessionListener)
        session = s
        connectionState("connecting", host)
        try {
          s.connect(scope)
          promise.resolve(null)
        } catch (e: RemoteSession.RemoteException) {
          if (session === s) {
            session = null
            val state = if (e.code == "PAIRING_REQUIRED" || e.code == "TV_CHANGED") "pairing_required" else "error"
            connectionState(state, host, e)
          }
          promise.reject(e.code, e.message, e)
        }
      }
    }
  }

  @ReactMethod
  fun disconnect(promise: Promise) = run(promise) {
    disconnectNow()
    null
  }

  private fun disconnectNow() {
    val s = session
    session = null
    s?.close()
    connectionState("disconnected", s?.host)
  }

  // ---------- Notification / lock-screen controls (step 7) ----------

  init {
    RemoteHub.onDisconnectRequested = { disconnectNow() }
  }

  /** JS tells us whether to show the controls and which TV name to display. */
  @ReactMethod
  fun setNotificationControls(enabled: Boolean, tvName: String) {
    RemoteHub.notificationsEnabled = enabled
    RemoteHub.tvName = tvName
    updateNotification(RemoteHub.state)
  }

  private fun updateNotification(state: String) {
    val ctx = reactApplicationContext
    if (!RemoteHub.notificationsEnabled || state == "disconnected" || state == "pairing_required") {
      RemoteControlService.stop(ctx)
      return
    }
    if (state == "connected" && !RemoteControlService.isRunning) {
      // Started while the app is in front (the user just opened the remote), as Android requires.
      RemoteControlService.start(ctx)
    } else {
      RemoteControlService.refresh(ctx)
    }
  }

  /** Sends one key. direction: SHORT (tap), START_LONG / END_LONG (hold and release). */
  @ReactMethod
  fun sendKey(keyCode: Double, direction: String, promise: Promise) = run(promise) {
    val s = readySession()
    val dir =
      RemoteSession.Direction.entries.firstOrNull { it.name == direction }
        ?: throw IllegalArgumentException("Unknown key direction: $direction")
    s.sendKey(keyCode.toInt(), dir)
    null
  }

  private fun readySession(): RemoteSession =
    session?.takeIf { it.isReady }
      ?: throw RemoteSession.RemoteException("NOT_CONNECTED", "Not connected to the TV")

  // ---------- App links and text (step 5) ----------

  /** Opens a deep link on the TV (launches the app that handles it). */
  @ReactMethod
  fun launchApp(url: String, promise: Promise) = run(promise) {
    readySession().launchApp(url)
    null
  }

  /** Inserts `text` at the cursor of the focused TV text field. */
  @ReactMethod
  fun sendText(text: String, promise: Promise) = run(promise) {
    readySession().sendText(text)
    null
  }

  // Required by NativeEventEmitter on the JS side.
  @ReactMethod fun addListener(eventName: String) {}

  @ReactMethod fun removeListeners(count: Double) {}

  override fun invalidate() {
    discovery.stop()
    pairing.cancel()
    unwatchNetwork()
    session?.close()
    session = null
    RemoteHub.onDisconnectRequested = null
    RemoteControlService.stop(reactApplicationContext)
    scope.cancel()
    super.invalidate()
  }

  companion object {
    const val NAME = "TvRemote"
    private const val TAG = "AltRemote"
    const val REMOTE_PORT = 6466
    const val PAIRING_PORT = 6467
    private const val REACHABLE_TIMEOUT_MS = 1500
  }
}
