package com.altremote.tvremote

import java.math.BigInteger
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * Known-answer test for the pairing secret. The expected hash was computed independently
 * in Python the way androidtvremote2 does it:
 *   sha256(to_bytes(cm) + to_bytes(e) + to_bytes(sm) + to_bytes(e) + bytes.fromhex(code[2:]))
 * with to_bytes(v) = v.to_bytes((v.bit_length() + 7) // 8, "big").
 */
class PairingSecretTest {
  // Fake 2048-bit moduli with the top bit set, so BigInteger.toByteArray() would add a
  // 0x00 sign byte. The secret must not include it.
  private val clientModulus = BigInteger("C" + "3A5F".repeat(127) + "D1B", 16)
  private val serverModulus = BigInteger("E" + "9B27".repeat(127) + "4C1", 16)
  private val exponent = BigInteger.valueOf(65537)

  private val expected = hex("3e4fc8abde0b1010ff79ad538cf5ee28f3082c5b5621bb889091ad321047c0cb")

  @Test
  fun moduliAre2048Bits() {
    assertEquals(2048, clientModulus.bitLength())
    assertEquals(2048, serverModulus.bitLength())
  }

  @Test
  fun matchesKnownAnswer() {
    val secret = PairingSecret.compute(clientModulus, exponent, serverModulus, exponent, "3E1A2B")
    assertArrayEquals(expected, secret)
  }

  @Test
  fun acceptsLowercaseAndSpaces() {
    val secret = PairingSecret.compute(clientModulus, exponent, serverModulus, exponent, "3e 1a2b")
    assertArrayEquals(expected, secret)
  }

  @Test
  fun rejectsCodeWhoseCheckByteDoesNotMatch() {
    assertThrows(PairingSecret.BadCodeException::class.java) {
      PairingSecret.compute(clientModulus, exponent, serverModulus, exponent, "3F1A2B")
    }
  }

  @Test
  fun rejectsMalformedCodes() {
    for (bad in listOf("", "3E1A2", "3E1A2B7", "3G1A2B", "ZZZZZZ")) {
      assertThrows(PairingSecret.BadCodeException::class.java) {
        PairingSecret.compute(clientModulus, exponent, serverModulus, exponent, bad)
      }
    }
  }

  @Test
  fun normalizeCode() {
    assertEquals("3E1A2B", PairingSecret.normalizeCode(" 3e1a2b "))
    assertNull(PairingSecret.normalizeCode("3E1A2"))
  }

  @Test
  fun unsignedBytesDropsSignByte() {
    assertArrayEquals(byteArrayOf(0x01, 0x00, 0x01), PairingSecret.unsignedBytes(exponent))
    assertEquals(256, PairingSecret.unsignedBytes(clientModulus).size)
    assertArrayEquals(byteArrayOf(0xFF.toByte()), PairingSecret.unsignedBytes(BigInteger.valueOf(255)))
  }

  private fun hex(s: String) = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
}
