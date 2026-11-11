package com.altremote.tvremote

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.io.IOException
import java.io.InputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class FramingTest {
  @Test
  fun encodesVarints() {
    assertArrayEquals(byteArrayOf(0x00), Framing.encodeVarint(0))
    assertArrayEquals(byteArrayOf(0x7F), Framing.encodeVarint(127))
    assertArrayEquals(byteArrayOf(0x80.toByte(), 0x01), Framing.encodeVarint(128))
    assertArrayEquals(byteArrayOf(0xAC.toByte(), 0x02), Framing.encodeVarint(300))
    assertArrayEquals(
      byteArrayOf(0xFF.toByte(), 0xFF.toByte(), 0x03),
      Framing.encodeVarint(65535),
    )
  }

  @Test
  fun roundTripsSeveralFramesInOneStream() {
    val small = byteArrayOf(1, 2, 3)
    val empty = ByteArray(0)
    val big = ByteArray(300) { it.toByte() } // needs a 2-byte length
    val out = ByteArrayOutputStream()
    listOf(small, empty, big).forEach { Framing.writeFrame(out, it) }

    val input = ByteArrayInputStream(out.toByteArray())
    assertArrayEquals(small, Framing.readFrame(input))
    assertArrayEquals(empty, Framing.readFrame(input))
    assertArrayEquals(big, Framing.readFrame(input))
    assertThrows(EOFException::class.java) { Framing.readFrame(input) }
  }

  @Test
  fun handlesPayloadArrivingInPieces() {
    val payload = ByteArray(200) { (it * 7).toByte() }
    val out = ByteArrayOutputStream()
    Framing.writeFrame(out, payload)
    // A stream that returns at most 3 bytes per read, like a slow TCP socket.
    val trickle =
      object : InputStream() {
        val src = ByteArrayInputStream(out.toByteArray())

        override fun read() = src.read()

        override fun read(b: ByteArray, off: Int, len: Int) = src.read(b, off, minOf(len, 3))
      }
    assertArrayEquals(payload, Framing.readFrame(trickle))
  }

  @Test
  fun rejectsTruncatedFrame() {
    val bytes = Framing.encodeVarint(10) + byteArrayOf(1, 2, 3)
    assertThrows(EOFException::class.java) { Framing.readFrame(ByteArrayInputStream(bytes)) }
  }

  @Test
  fun rejectsOversizedOrMalformedLength() {
    val tooBig = Framing.encodeVarint(Framing.MAX_FRAME_BYTES + 1)
    assertThrows(IOException::class.java) { Framing.readFrame(ByteArrayInputStream(tooBig)) }

    val endless = ByteArray(6) { 0xFF.toByte() }
    assertThrows(IOException::class.java) { Framing.readFrame(ByteArrayInputStream(endless)) }
  }
}
