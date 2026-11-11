package com.altremote.tvremote

import android.util.Log
import com.altremote.BuildConfig
import com.altremote.tvremote.proto.polo.Configuration
import com.altremote.tvremote.proto.polo.Options
import com.altremote.tvremote.proto.polo.OuterMessage
import com.altremote.tvremote.proto.polo.PairingRequest
import com.altremote.tvremote.proto.polo.Secret
import java.io.EOFException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.security.interfaces.RSAPublicKey
import javax.net.ssl.SSLException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Pairs the app with a TV over the polo protocol on port 6467.
 *
 * start(): TLS connect → PairingRequest → Options → Configuration. After the TV's
 *          ConfigurationAck it shows a 6-character code on screen.
 * finish(code): checks the code locally, sends the Secret, waits for SecretAck.
 *
 * The connection stays open between the two calls. A mistyped code (caught locally) keeps
 * the session, so the user can retry without the TV showing a new code.
 */
class PairingManager {
  class PairingException(val code: String, message: String, cause: Throwable? = null) :
    Exception(message, cause)

  data class Started(val serverName: String?)

  data class Paired(val serverName: String?, val serverCertFingerprint: String)

  private class Session(val host: String, val conn: TlsClient.Connection) {
    var serverName: String? = null
  }

  private val mutex = Mutex()
  @Volatile private var session: Session? = null

  suspend fun start(host: String, clientName: String): Started =
    mutex.withLock {
      closeSession()
      CertManager.generateIfNeeded()
      val conn =
        try {
          TlsClient.connect(host, PAIRING_PORT, CONNECT_TIMEOUT_MS, READ_TIMEOUT_MS)
        } catch (e: Exception) {
          throw connectError(host, e)
        }
      val s = Session(host, conn)
      session = s
      try {
        send(
          s,
          message().setPairingRequest(
            PairingRequest.newBuilder().setServiceName(SERVICE_NAME).setClientName(clientName)
          ),
        )
        val ack = expect(s, "pairing request ack") { it.hasPairingRequestAck() }
        s.serverName = ack.pairingRequestAck.serverName.takeIf { it.isNotBlank() }

        send(
          s,
          message().setOptions(
            Options.newBuilder()
              .addInputEncodings(hexEncoding())
              .setPreferredRole(Options.RoleType.ROLE_TYPE_INPUT)
          ),
        )
        expect(s, "options") { it.hasOptions() }

        send(
          s,
          message().setConfiguration(
            Configuration.newBuilder()
              .setEncoding(hexEncoding())
              .setClientRole(Options.RoleType.ROLE_TYPE_INPUT)
          ),
        )
        expect(s, "configuration ack") { it.hasConfigurationAck() }
        log("Pairing started with ${s.serverName ?: host}; TV is showing the code")
        Started(s.serverName)
      } catch (e: Exception) {
        closeSession()
        throw asPairingError(e)
      }
    }

  suspend fun finish(code: String): Paired =
    mutex.withLock {
      val s =
        session
          ?: throw PairingException(
            "NO_SESSION",
            "Pairing isn't in progress. Start pairing again so the TV shows a new code.",
          )

      val secret =
        try {
          PairingSecret.compute(
            CertManager.publicKey(),
            s.conn.serverCertificate.publicKey as RSAPublicKey,
            code,
          )
        } catch (e: PairingSecret.BadCodeException) {
          // Nothing was sent; the TV still shows the same code, so keep the session.
          throw PairingException("BAD_CODE", e.message ?: "Wrong code", e)
        }

      try {
        send(s, message().setSecret(Secret.newBuilder().setSecret(com.google.protobuf.ByteString.copyFrom(secret))))
        expect(s, "secret ack") { it.hasSecretAck() }
        val fingerprint = CertManager.fingerprint(s.conn.serverCertificate)
        log("Paired with ${s.serverName ?: s.host}, TV cert $fingerprint")
        Paired(s.serverName, fingerprint)
      } catch (e: Exception) {
        throw asPairingError(e)
      } finally {
        closeSession()
      }
    }

  fun cancel() {
    // Closing the socket also unblocks a read in progress in start()/finish().
    closeSession()
  }

  private fun closeSession() {
    session?.conn?.close()
    session = null
  }

  private fun message(): OuterMessage.Builder =
    OuterMessage.newBuilder().setProtocolVersion(PROTOCOL_VERSION).setStatus(OuterMessage.Status.STATUS_OK)

  private fun hexEncoding() =
    Options.Encoding.newBuilder()
      .setType(Options.Encoding.EncodingType.ENCODING_TYPE_HEXADECIMAL)
      .setSymbolLength(CODE_LENGTH)

  private fun send(s: Session, builder: OuterMessage.Builder) {
    val msg = builder.build()
    log("→ ${describe(msg)}")
    Framing.writeFrame(s.conn.output, msg.toByteArray())
  }

  private fun expect(s: Session, what: String, matches: (OuterMessage) -> Boolean): OuterMessage {
    val msg = OuterMessage.parseFrom(Framing.readFrame(s.conn.input))
    log("← ${describe(msg)}")
    // proto2 maps an unknown status value to "unset", so treat a missing status as an error.
    if (!msg.hasStatus() || msg.status != OuterMessage.Status.STATUS_OK) {
      throw statusError(msg)
    }
    if (!matches(msg)) {
      throw PairingException("PAIRING_FAILED", "TV sent an unexpected reply while waiting for $what")
    }
    return msg
  }

  private fun statusError(msg: OuterMessage): PairingException =
    when (if (msg.hasStatus()) msg.status else null) {
      OuterMessage.Status.STATUS_BAD_SECRET ->
        PairingException("CODE_REJECTED", "The TV rejected the code. Start pairing again.")
      OuterMessage.Status.STATUS_BAD_CONFIGURATION ->
        PairingException("PAIRING_FAILED", "The TV didn't accept the pairing settings.")
      else -> PairingException("PAIRING_FAILED", "The TV ended pairing (status ${if (msg.hasStatus()) msg.status.number else "unknown"}).")
    }

  private fun connectError(host: String, e: Exception): PairingException =
    when (e) {
      is SocketTimeoutException, is ConnectException, is NoRouteToHostException ->
        PairingException(
          "CONNECT_FAILED",
          "Couldn't reach the TV at $host. Check it's on and on the same Wi-Fi.",
          e,
        )
      is SSLException ->
        PairingException("TLS_FAILED", "Secure connection to the TV failed: ${e.message}", e)
      else -> PairingException("CONNECT_FAILED", e.message ?: "Couldn't connect to the TV", e)
    }

  private fun asPairingError(e: Exception): PairingException =
    when (e) {
      is PairingException -> e
      is SocketTimeoutException ->
        PairingException("TIMEOUT", "The TV stopped responding. Start pairing again.", e)
      is EOFException, is java.net.SocketException ->
        PairingException("CONNECTION_CLOSED", "The TV closed the connection. Start pairing again.", e)
      else -> PairingException("PAIRING_FAILED", e.message ?: e.javaClass.simpleName, e)
    }

  private fun describe(m: OuterMessage): String {
    val kind =
      when {
        m.hasPairingRequest() -> "PairingRequest(${m.pairingRequest.clientName})"
        m.hasPairingRequestAck() -> "PairingRequestAck(${m.pairingRequestAck.serverName})"
        m.hasOptions() -> "Options"
        m.hasConfiguration() -> "Configuration"
        m.hasConfigurationAck() -> "ConfigurationAck"
        m.hasSecret() -> "Secret"
        m.hasSecretAck() -> "SecretAck"
        else -> "(empty)"
      }
    return "$kind status=${if (m.hasStatus()) m.status.number else "?"}"
  }

  private fun log(msg: String) {
    if (BuildConfig.DEBUG) Log.d(TAG, msg)
  }

  companion object {
    const val PAIRING_PORT = 6467
    private const val PROTOCOL_VERSION = 2
    private const val SERVICE_NAME = "atvremote"
    private const val CODE_LENGTH = 6
    private const val CONNECT_TIMEOUT_MS = 5_000
    private const val READ_TIMEOUT_MS = 10_000
    private const val TAG = "AltRemote.Pairing"
  }
}
