package com.altremote.tvremote

import android.annotation.SuppressLint
import java.net.InetSocketAddress
import java.net.Socket
import java.security.Principal
import java.security.PrivateKey
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509ExtendedKeyManager
import javax.net.ssl.X509TrustManager

/**
 * TLS connections to the TV, for both pairing (6467) and the remote session (6466).
 *
 * - The app presents its Keystore client certificate (CertManager); that's how the TV
 *   knows which paired device is connecting.
 * - The TV's certificate is self-signed, so it can't be checked against a CA. Instead the
 *   TV's certificate fingerprint is saved at pairing and compared on later connections.
 */
object TlsClient {
  class Connection(val socket: SSLSocket, val serverCertificate: X509Certificate) {
    val input = socket.inputStream.buffered()
    val output = socket.outputStream

    fun close() {
      try {
        socket.close()
      } catch (_: Exception) {}
    }
  }

  fun connect(host: String, port: Int, connectTimeoutMs: Int, readTimeoutMs: Int): Connection {
    val context =
      SSLContext.getInstance("TLS").apply {
        init(arrayOf(ClientKeyManager), arrayOf(AcceptTvCertificate), null)
      }
    val raw = Socket()
    try {
      raw.connect(InetSocketAddress(host, port), connectTimeoutMs)
      raw.soTimeout = readTimeoutMs
      raw.tcpNoDelay = true
      val ssl = context.socketFactory.createSocket(raw, host, port, true) as SSLSocket
      ssl.startHandshake()
      val serverCert =
        ssl.session.peerCertificates.firstOrNull() as? X509Certificate
          ?: throw IllegalStateException("TV sent no certificate")
      return Connection(ssl, serverCert)
    } catch (e: Exception) {
      try {
        raw.close()
      } catch (_: Exception) {}
      throw e
    }
  }

  /** Always offers the app's Keystore identity as the client certificate. */
  private object ClientKeyManager : X509ExtendedKeyManager() {
    override fun chooseClientAlias(
      keyType: Array<out String>?,
      issuers: Array<out Principal>?,
      socket: Socket?,
    ) = CertManager.ALIAS

    override fun chooseEngineClientAlias(
      keyType: Array<out String>?,
      issuers: Array<out Principal>?,
      engine: SSLEngine?,
    ) = CertManager.ALIAS

    override fun getClientAliases(keyType: String?, issuers: Array<out Principal>?) =
      arrayOf(CertManager.ALIAS)

    override fun getCertificateChain(alias: String?): Array<X509Certificate> =
      arrayOf(CertManager.certificate())

    override fun getPrivateKey(alias: String?): PrivateKey = CertManager.privateKey()

    override fun getServerAliases(keyType: String?, issuers: Array<out Principal>?) = null

    override fun chooseServerAlias(
      keyType: String?,
      issuers: Array<out Principal>?,
      socket: Socket?,
    ) = null
  }

  /**
   * TVs use self-signed certificates. Accept them here; identity is established by
   * pairing (the code on the TV screen) and the fingerprint saved afterwards.
   */
  @SuppressLint("CustomX509TrustManager", "TrustAllX509TrustManager")
  private object AcceptTvCertificate : X509TrustManager {
    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}

    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}

    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
  }
}
