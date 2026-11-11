package com.altremote.tvremote

import java.math.BigInteger
import java.security.MessageDigest
import java.security.interfaces.RSAPublicKey

/**
 * The pairing secret for the Android TV Remote v2 ("polo") protocol.
 *
 * The TV shows a 6-character hex code. The secret is
 *   SHA-256( clientModulus || clientExponent || serverModulus || serverExponent || code[2..6] )
 * with each number as minimal-length unsigned big-endian bytes, and the last 4 hex
 * characters of the code as 2 bytes. The first byte of the hash must equal the first
 * 2 hex characters of the code: that's how a typo is caught before anything is sent.
 */
object PairingSecret {
  class BadCodeException(message: String) : Exception(message)

  /** Uppercases and strips spaces; returns null unless it's exactly 6 hex characters. */
  fun normalizeCode(code: String): String? {
    val c = code.replace(" ", "").uppercase()
    return if (c.length == 6 && c.all { it in '0'..'9' || it in 'A'..'F' }) c else null
  }

  fun compute(client: RSAPublicKey, server: RSAPublicKey, code: String): ByteArray =
    compute(client.modulus, client.publicExponent, server.modulus, server.publicExponent, code)

  fun compute(
    clientModulus: BigInteger,
    clientExponent: BigInteger,
    serverModulus: BigInteger,
    serverExponent: BigInteger,
    code: String,
  ): ByteArray {
    val c = normalizeCode(code) ?: throw BadCodeException("The code must be 6 characters, 0-9 and A-F")
    val digest = MessageDigest.getInstance("SHA-256")
    digest.update(unsignedBytes(clientModulus))
    digest.update(unsignedBytes(clientExponent))
    digest.update(unsignedBytes(serverModulus))
    digest.update(unsignedBytes(serverExponent))
    digest.update(hexToBytes(c.substring(2)))
    val hash = digest.digest()

    val check = c.substring(0, 2).toInt(16)
    if ((hash[0].toInt() and 0xFF) != check) {
      throw BadCodeException("That code doesn't match the one on the TV")
    }
    return hash
  }

  /** Minimal-length big-endian bytes without BigInteger's sign byte (Python's int.to_bytes). */
  fun unsignedBytes(value: BigInteger): ByteArray {
    require(value.signum() >= 0) { "negative value" }
    if (value.signum() == 0) return ByteArray(0)
    val bytes = value.toByteArray()
    return if (bytes[0].toInt() == 0) bytes.copyOfRange(1, bytes.size) else bytes
  }

  private fun hexToBytes(hex: String): ByteArray =
    ByteArray(hex.length / 2) { i -> hex.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
}
