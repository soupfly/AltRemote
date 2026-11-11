package com.altremote.tvremote

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import java.math.BigInteger
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.security.interfaces.RSAPublicKey
import java.security.spec.RSAKeyGenParameterSpec
import java.util.Date
import java.util.concurrent.TimeUnit
import javax.security.auth.x500.X500Principal

/**
 * The app's client identity for the Android TV Remote v2 protocol.
 *
 * An RSA 2048 key pair and a self-signed X.509 certificate are generated once and
 * kept in Android Keystore. The private key never leaves the Keystore (on most phones
 * it lives in secure hardware). The same certificate is presented on every TLS
 * connection to the TV, so the TV recognises the app as already paired.
 */
object CertManager {
  private const val KEYSTORE = "AndroidKeyStore"
  const val ALIAS = "altremote_client_identity"
  private const val SUBJECT = "CN=AltRemote, O=AltRemote, OU=Android TV Remote"
  private const val VALIDITY_YEARS = 20L

  data class IdentityInfo(
    val subject: String,
    val serialNumber: String,
    val notBefore: Date,
    val notAfter: Date,
    val keySizeBits: Int,
    val sha256Fingerprint: String,
    val securityLevel: String,
  )

  private fun keyStore(): KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

  fun hasIdentity(): Boolean = keyStore().containsAlias(ALIAS)

  /** Creates the identity if it doesn't exist yet. Returns true if one was created. */
  @Synchronized
  fun generateIfNeeded(): Boolean {
    if (hasIdentity()) return false
    generate()
    return true
  }

  private fun generate() {
    val now = System.currentTimeMillis()
    val spec =
      KeyGenParameterSpec.Builder(
          ALIAS,
          KeyProperties.PURPOSE_SIGN or
            KeyProperties.PURPOSE_VERIFY or
            KeyProperties.PURPOSE_ENCRYPT or
            KeyProperties.PURPOSE_DECRYPT,
        )
        .setAlgorithmParameterSpec(RSAKeyGenParameterSpec(2048, RSAKeyGenParameterSpec.F4))
        // TLS client auth signs with whatever the server negotiates, so allow the common set.
        .setDigests(
          KeyProperties.DIGEST_NONE,
          KeyProperties.DIGEST_SHA1,
          KeyProperties.DIGEST_SHA256,
          KeyProperties.DIGEST_SHA384,
          KeyProperties.DIGEST_SHA512,
        )
        .setSignaturePaddings(
          KeyProperties.SIGNATURE_PADDING_RSA_PKCS1,
          KeyProperties.SIGNATURE_PADDING_RSA_PSS,
        )
        .setEncryptionPaddings(
          KeyProperties.ENCRYPTION_PADDING_NONE,
          KeyProperties.ENCRYPTION_PADDING_RSA_PKCS1,
        )
        .setRandomizedEncryptionRequired(false)
        .setCertificateSubject(X500Principal(SUBJECT))
        .setCertificateSerialNumber(BigInteger(63, SecureRandom()).add(BigInteger.ONE))
        .setCertificateNotBefore(Date(now - TimeUnit.DAYS.toMillis(1)))
        .setCertificateNotAfter(Date(now + TimeUnit.DAYS.toMillis(365 * VALIDITY_YEARS)))
        .build()

    KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, KEYSTORE).run {
      initialize(spec)
      generateKeyPair()
    }
  }

  /** Deletes the identity. Every TV will need to be paired again afterwards. */
  @Synchronized
  fun reset() {
    val ks = keyStore()
    if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS)
  }

  fun certificate(): X509Certificate =
    keyStore().getCertificate(ALIAS) as? X509Certificate
      ?: throw IllegalStateException("No client identity. Call generateIfNeeded() first.")

  fun privateKey(): PrivateKey =
    keyStore().getKey(ALIAS, null) as? PrivateKey
      ?: throw IllegalStateException("No client identity. Call generateIfNeeded() first.")

  /** The RSA public key; its modulus and exponent feed the pairing secret. */
  fun publicKey(): RSAPublicKey = certificate().publicKey as RSAPublicKey

  fun info(): IdentityInfo {
    val cert = certificate()
    return IdentityInfo(
      subject = cert.subjectX500Principal.name,
      serialNumber = cert.serialNumber.toString(16),
      notBefore = cert.notBefore,
      notAfter = cert.notAfter,
      keySizeBits = publicKey().modulus.bitLength(),
      sha256Fingerprint = fingerprint(cert),
      securityLevel = securityLevel(),
    )
  }

  fun fingerprint(cert: X509Certificate): String =
    MessageDigest.getInstance("SHA-256")
      .digest(cert.encoded)
      .joinToString(":") { "%02X".format(it) }

  /** Where the private key is stored: StrongBox, TEE (secure hardware) or software. */
  private fun securityLevel(): String =
    try {
      val key = privateKey()
      val info = KeyFactory.getInstance(key.algorithm, KEYSTORE).getKeySpec(key, KeyInfo::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        when (info.securityLevel) {
          KeyProperties.SECURITY_LEVEL_STRONGBOX -> "StrongBox"
          KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "TEE"
          KeyProperties.SECURITY_LEVEL_SOFTWARE -> "Software"
          else -> "Unknown"
        }
      } else {
        @Suppress("DEPRECATION")
        if (info.isInsideSecureHardware) "Secure hardware" else "Software"
      }
    } catch (e: Exception) {
      "Unknown"
    }
}
