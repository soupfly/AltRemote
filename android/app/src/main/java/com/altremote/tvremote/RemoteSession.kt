package com.altremote.tvremote

import android.util.Log
import com.altremote.BuildConfig
import com.altremote.tvremote.proto.remote.RemoteAppLinkLaunchRequest
import com.altremote.tvremote.proto.remote.RemoteConfigure
import com.altremote.tvremote.proto.remote.RemoteDeviceInfo
import com.altremote.tvremote.proto.remote.RemoteDirection
import com.altremote.tvremote.proto.remote.RemoteEditInfo
import com.altremote.tvremote.proto.remote.RemoteImeBatchEdit
import com.altremote.tvremote.proto.remote.RemoteImeObject
import com.altremote.tvremote.proto.remote.RemoteKeyInject
import com.altremote.tvremote.proto.remote.RemoteMessage
import com.altremote.tvremote.proto.remote.RemotePingResponse
import com.altremote.tvremote.proto.remote.RemoteSetActive
import java.io.EOFException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketException
import java.net.SocketTimeoutException
import javax.net.ssl.SSLException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

/**
 * One remote-control connection to a paired TV on port 6466.
 *
 * Handshake: the TV sends RemoteConfigure → we reply with ours (feature bitmask) → the TV
 * sends RemoteSetActive → we reply with our active features → the TV sends RemoteStart
 * (power state), volume and current app. After that, keys can be sent.
 *
 * The TV pings about every 5 s and drops clients that don't answer. If nothing arrives for
 * IDLE_TIMEOUT_MS the connection is considered dead.
 */
class RemoteSession(
  val host: String,
  private val expectedServerFingerprint: String?,
  private val listener: Listener,
) {
  class RemoteException(val code: String, message: String, cause: Throwable? = null) :
    Exception(message, cause)

  interface Listener {
    fun onReady(session: RemoteSession)

    /** Called once when the connection ends; error is null for a deliberate close(). */
    fun onClosed(session: RemoteSession, error: RemoteException?)

    fun onPowerState(isOn: Boolean)

    fun onVolume(level: Int, max: Int, muted: Boolean)

    fun onCurrentApp(packageName: String)

    fun onDeviceInfo(vendor: String, model: String, appVersion: String)

    /** The TV opened its on-screen keyboard (a text field got focus). */
    fun onImeShow(currentText: String)
  }

  enum class Direction(val proto: RemoteDirection) {
    SHORT(RemoteDirection.SHORT),
    START_LONG(RemoteDirection.START_LONG),
    END_LONG(RemoteDirection.END_LONG),
  }

  private var conn: TlsClient.Connection? = null
  private var readerJob: Job? = null
  private val ready = CompletableDeferred<Unit>()
  private val writeLock = Any()
  @Volatile private var closedByUs = false
  @Volatile private var closedNotified = false
  @Volatile var activeFeatures = CLIENT_FEATURES
    private set

  // IME counters from the TV. Text edits must echo the current values or the TV ignores them.
  @Volatile var imeCounter = 0
    private set
  @Volatile var imeFieldCounter = 0
    private set
  @Volatile private var hasImeCounter = false
  @Volatile private var hasImeFieldCounter = false

  val isReady: Boolean
    get() = ready.isCompleted && !closedNotified

  /** Connects and waits for the handshake. Throws RemoteException on failure. */
  suspend fun connect(scope: CoroutineScope) {
    val c =
      try {
        TlsClient.connect(host, REMOTE_PORT, CONNECT_TIMEOUT_MS, IDLE_TIMEOUT_MS)
      } catch (e: Exception) {
        throw connectError(e)
      }
    conn = c

    val fingerprint = CertManager.fingerprint(c.serverCertificate)
    if (expectedServerFingerprint != null && fingerprint != expectedServerFingerprint) {
      c.close()
      throw RemoteException(
        "TV_CHANGED",
        "This TV's certificate changed since pairing (it may have been reset). Pair again.",
      )
    }

    readerJob = scope.launch(Dispatchers.IO) { readLoop(c) }
    try {
      withTimeout(HANDSHAKE_TIMEOUT_MS) { ready.await() }
    } catch (e: Exception) {
      val error =
        e as? RemoteException
          ?: RemoteException("HANDSHAKE_FAILED", "The TV didn't finish connecting. Try again.", e)
      shutdown(error)
      throw error
    }
  }

  fun sendKey(keyCode: Int, direction: Direction) {
    send(
      RemoteMessage.newBuilder()
        .setRemoteKeyInject(
          RemoteKeyInject.newBuilder().setKeyCode(keyCode).setDirection(direction.proto)
        )
        .build()
    )
  }

  /** Opens a deep link on the TV, e.g. "https://www.netflix.com/title" or "market://...". */
  fun launchApp(url: String) {
    require(url.isNotBlank()) { "App link is empty" }
    send(
      RemoteMessage.newBuilder()
        .setRemoteAppLinkLaunchRequest(RemoteAppLinkLaunchRequest.newBuilder().setAppLink(url))
        .build()
    )
  }

  /**
   * Inserts `text` at the cursor of the focused text field on the TV (tested on a Skyworth
   * Google TV: the TV inserts, it doesn't replace the field). The JS keyboard sends only
   * the new characters, and KEYCODE_DEL presses for deletions.
   */
  fun sendText(text: String) {
    if (activeFeatures and FEATURE_IME == 0) {
      throw RemoteException("NOT_SUPPORTED", "This TV doesn't accept text input from remotes")
    }
    val ime = RemoteImeObject.newBuilder().setStart(text.length).setEnd(text.length).setValue(text)
    send(
      RemoteMessage.newBuilder()
        .setRemoteImeBatchEdit(
          RemoteImeBatchEdit.newBuilder()
            .setImeCounter(imeCounter)
            .setFieldCounter(imeFieldCounter)
            .addEditInfo(RemoteEditInfo.newBuilder().setInsert(1).setTextFieldStatus(ime))
        )
        .build()
    )
  }

  /** Deliberate disconnect; listeners get onClosed with no error. */
  fun close() = shutdown(null)

  /**
   * Ends the session as failed right away (e.g. the phone lost its network), instead of
   * waiting for the 16 s idle timeout. Listeners get onClosed with the error.
   */
  fun fail(code: String, message: String) = shutdown(RemoteException(code, message))

  private fun shutdown(error: RemoteException?) {
    closedByUs = true
    // Report first: closing the socket wakes the reader thread, which would otherwise
    // report a plain close (no error) before us and the app wouldn't retry.
    notifyClosed(error)
    if (!ready.isCompleted) ready.completeExceptionally(error ?: RemoteException("CLOSED", "Connection closed"))
    conn?.close()
    readerJob?.cancel()
  }

  // ---------- internals ----------

  private fun send(msg: RemoteMessage) {
    val c = conn ?: throw RemoteException("NOT_CONNECTED", "Not connected to the TV")
    if (closedNotified) throw RemoteException("NOT_CONNECTED", "Not connected to the TV")
    if (!msg.hasRemotePingResponse() || LOG_PINGS) log("→ ${describe(msg)}")
    try {
      synchronized(writeLock) { Framing.writeFrame(c.output, msg.toByteArray()) }
    } catch (e: Exception) {
      c.close()
      throw RemoteException("CONNECTION_LOST", "Lost the connection to the TV", e)
    }
  }

  private fun readLoop(c: TlsClient.Connection) {
    try {
      while (true) {
        val msg = RemoteMessage.parseFrom(Framing.readFrame(c.input))
        if (!msg.hasRemotePingRequest() || LOG_PINGS) log("← ${describe(msg)}")
        handle(msg)
      }
    } catch (e: Exception) {
      val error =
        if (closedByUs) null
        else
          when (e) {
            is SocketTimeoutException ->
              RemoteException("CONNECTION_LOST", "The TV stopped responding", e)
            is SSLException ->
              // The TV ends TLS right away when it doesn't recognise our certificate.
              if (!ready.isCompleted) pairingRequired(e)
              else RemoteException("CONNECTION_LOST", "Lost the connection to the TV", e)
            is EOFException, is SocketException ->
              if (!ready.isCompleted) pairingRequired(e)
              else RemoteException("CONNECTION_LOST", "The TV closed the connection", e)
            is RemoteException -> e
            else -> RemoteException("PROTOCOL_ERROR", e.message ?: e.javaClass.simpleName, e)
          }
      if (!ready.isCompleted) {
        ready.completeExceptionally(error ?: RemoteException("CLOSED", "Connection closed"))
      }
      c.close()
      notifyClosed(error)
    }
  }

  private fun handle(msg: RemoteMessage) {
    when {
      msg.hasRemoteConfigure() -> {
        val tvFeatures = msg.remoteConfigure.code1
        activeFeatures = CLIENT_FEATURES and tvFeatures
        val info = msg.remoteConfigure.deviceInfo
        listener.onDeviceInfo(info.vendor, info.model, info.appVersion)
        send(
          RemoteMessage.newBuilder()
            .setRemoteConfigure(
              RemoteConfigure.newBuilder()
                .setCode1(activeFeatures)
                .setDeviceInfo(
                  RemoteDeviceInfo.newBuilder()
                    .setUnknown1(1)
                    .setUnknown2("1")
                    .setPackageName(PACKAGE_NAME)
                    .setAppVersion(APP_VERSION)
                )
            )
            .build()
        )
      }
      msg.hasRemoteSetActive() -> {
        send(
          RemoteMessage.newBuilder()
            .setRemoteSetActive(RemoteSetActive.newBuilder().setActive(activeFeatures))
            .build()
        )
        markReady()
      }
      msg.hasRemotePingRequest() -> {
        send(
          RemoteMessage.newBuilder()
            .setRemotePingResponse(
              RemotePingResponse.newBuilder().setVal1(msg.remotePingRequest.val1)
            )
            .build()
        )
      }
      msg.hasRemoteStart() -> {
        listener.onPowerState(msg.remoteStart.started)
        markReady()
      }
      msg.hasRemoteSetVolumeLevel() -> {
        val v = msg.remoteSetVolumeLevel
        listener.onVolume(v.volumeLevel, v.volumeMax, v.volumeMuted)
      }
      msg.hasRemoteImeKeyInject() -> {
        val ime = msg.remoteImeKeyInject
        if (ime.hasAppInfo()) {
          imeCounter = ime.appInfo.counter
          hasImeCounter = true
          val pkg = ime.appInfo.appPackage
          if (pkg.isNotEmpty()) listener.onCurrentApp(pkg)
        }
        if (ime.hasTextFieldStatus()) {
          imeFieldCounter = ime.textFieldStatus.counterField
          hasImeFieldCounter = true
        }
      }
      msg.hasRemoteImeShowRequest() -> {
        val field = msg.remoteImeShowRequest.remoteTextFieldStatus
        if (msg.remoteImeShowRequest.hasRemoteTextFieldStatus()) {
          imeFieldCounter = field.counterField
          hasImeFieldCounter = true
        }
        listener.onImeShow(field.value)
      }
      msg.hasRemoteImeBatchEdit() -> {
        val edit = msg.remoteImeBatchEdit
        if (!hasImeCounter) imeCounter = edit.imeCounter
        if (!hasImeFieldCounter) imeFieldCounter = edit.fieldCounter
      }
      msg.hasRemoteError() -> log("TV reported an error: ${msg.remoteError}")
      else -> {}
    }
  }

  private fun markReady() {
    if (ready.complete(Unit)) {
      log("Remote session ready with $host (features $activeFeatures)")
      listener.onReady(this)
    }
  }

  @Synchronized
  private fun notifyClosed(error: RemoteException?) {
    if (closedNotified) return
    closedNotified = true
    log("Remote session closed${error?.let { ": ${it.code} ${it.message}" } ?: ""}")
    listener.onClosed(this, error)
  }

  private fun pairingRequired(e: Exception) =
    RemoteException(
      "PAIRING_REQUIRED",
      "The TV didn't accept this phone. Pair with the TV again.",
      e,
    )

  private fun connectError(e: Exception): RemoteException =
    when (e) {
      is SocketTimeoutException, is ConnectException, is NoRouteToHostException ->
        RemoteException(
          "CONNECT_FAILED",
          "Couldn't reach the TV at $host. Check it's on and on the same Wi-Fi.",
          e,
        )
      is SSLException -> pairingRequired(e)
      else -> RemoteException("CONNECT_FAILED", e.message ?: "Couldn't connect to the TV", e)
    }

  private fun describe(m: RemoteMessage): String =
    when {
      m.hasRemoteConfigure() -> "Configure(code1=${m.remoteConfigure.code1}, ${m.remoteConfigure.deviceInfo.vendor} ${m.remoteConfigure.deviceInfo.model})"
      m.hasRemoteSetActive() -> "SetActive(${m.remoteSetActive.active})"
      m.hasRemotePingRequest() -> "PingRequest(${m.remotePingRequest.val1})"
      m.hasRemotePingResponse() -> "PingResponse(${m.remotePingResponse.val1})"
      m.hasRemoteKeyInject() -> "KeyInject(${m.remoteKeyInject.keyCode}, ${m.remoteKeyInject.direction})"
      m.hasRemoteStart() -> "Start(started=${m.remoteStart.started})"
      m.hasRemoteSetVolumeLevel() -> m.remoteSetVolumeLevel.let { "Volume(${it.volumeLevel}/${it.volumeMax}, muted=${it.volumeMuted})" }
      m.hasRemoteImeKeyInject() -> m.remoteImeKeyInject.let { "ImeKeyInject(app=${it.appInfo.appPackage}, counter=${it.appInfo.counter}, field=${it.textFieldStatus.counterField}, text='${it.textFieldStatus.value}')" }
      m.hasRemoteImeBatchEdit() -> m.remoteImeBatchEdit.let { b -> "ImeBatchEdit(counter=${b.imeCounter}, field=${b.fieldCounter}, ${b.editInfoList.joinToString { "'${it.textFieldStatus.value}'@${it.textFieldStatus.start}" }})" }
      m.hasRemoteImeShowRequest() -> "ImeShowRequest(field=${m.remoteImeShowRequest.remoteTextFieldStatus.counterField}, text='${m.remoteImeShowRequest.remoteTextFieldStatus.value}')"
      m.hasRemoteAppLinkLaunchRequest() -> "AppLink(${m.remoteAppLinkLaunchRequest.appLink})"
      m.hasRemoteError() -> "Error"
      else -> "Other"
    }

  private fun log(msg: String) {
    if (BuildConfig.DEBUG) Log.d(TAG, msg)
  }

  companion object {
    const val REMOTE_PORT = 6466

    // Feature bits (from androidtvremote2): PING 1, KEY 2, IME 4, VOICE 8, POWER 32,
    // VOLUME 64, APP_LINK 512. Voice isn't supported.
    const val FEATURE_PING = 1
    const val FEATURE_KEY = 2
    const val FEATURE_IME = 4
    const val FEATURE_POWER = 32
    const val FEATURE_VOLUME = 64
    const val FEATURE_APP_LINK = 512
    const val CLIENT_FEATURES =
      FEATURE_PING or FEATURE_KEY or FEATURE_IME or FEATURE_POWER or FEATURE_VOLUME or FEATURE_APP_LINK

    private const val PACKAGE_NAME = "atvremote"
    private const val APP_VERSION = "1.0.0"
    private const val CONNECT_TIMEOUT_MS = 5_000
    private const val HANDSHAKE_TIMEOUT_MS = 10_000L

    /** The TV pings every ~5 s; 16 s of silence means the connection is gone. */
    const val IDLE_TIMEOUT_MS = 16_000
    private const val LOG_PINGS = false
    private const val TAG = "AltRemote.Remote"
  }
}
