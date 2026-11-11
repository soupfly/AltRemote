package com.altremote.tvremote

import java.io.EOFException
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream

/**
 * Message framing for both TV protocols (pairing on 6467, remote on 6466):
 * each protobuf message is preceded by its byte length encoded as a varint.
 */
object Framing {
  /** Messages from the TV are small; anything bigger means the stream is out of sync. */
  const val MAX_FRAME_BYTES = 64 * 1024

  fun encodeVarint(value: Int): ByteArray {
    require(value >= 0) { "length must be non-negative" }
    val out = ArrayList<Byte>(5)
    var v = value
    while (v and 0x7F.inv() != 0) {
      out.add(((v and 0x7F) or 0x80).toByte())
      v = v ushr 7
    }
    out.add(v.toByte())
    return out.toByteArray()
  }

  /** Writes one frame (varint length + payload) and flushes. */
  fun writeFrame(out: OutputStream, payload: ByteArray) {
    out.write(encodeVarint(payload.size) + payload)
    out.flush()
  }

  /**
   * Reads one frame. Throws EOFException if the stream ends (TV closed the connection),
   * IOException if the length is malformed or too large.
   */
  fun readFrame(input: InputStream): ByteArray {
    val length = readVarint(input)
    if (length > MAX_FRAME_BYTES) throw IOException("Frame too large: $length bytes")
    val payload = ByteArray(length)
    var read = 0
    while (read < length) {
      val n = input.read(payload, read, length - read)
      if (n < 0) throw EOFException("Connection closed mid-message")
      read += n
    }
    return payload
  }

  private fun readVarint(input: InputStream): Int {
    var result = 0
    var shift = 0
    while (shift < 35) {
      val b = input.read()
      if (b < 0) throw EOFException("Connection closed")
      result = result or ((b and 0x7F) shl shift)
      if (b and 0x80 == 0) {
        if (result < 0) throw IOException("Malformed frame length")
        return result
      }
      shift += 7
    }
    throw IOException("Malformed frame length (varint too long)")
  }
}
