package com.altremote.tvremote

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.util.Log
import com.altremote.BuildConfig
import java.net.Inet4Address
import java.net.InetAddress
import java.util.concurrent.Executors

/**
 * Finds Google TVs on the local network by browsing mDNS for `_androidtvremote2._tcp`,
 * the service every Android TV / Google TV advertises for the Remote v2 protocol.
 *
 * Uses Android's NsdManager, which goes through the system mDNS daemon, so no
 * multicast lock or extra permission is needed.
 */
class TvDiscovery(context: Context, private val listener: Listener) {

  data class FoundTv(
    val serviceName: String,
    val host: String,
    val port: Int,
    val attributes: Map<String, String>,
  )

  interface Listener {
    fun onFound(tv: FoundTv)

    fun onLost(serviceName: String)

    fun onStateChanged(running: Boolean, error: String?)
  }

  private val nsd = context.applicationContext.getSystemService(NsdManager::class.java)
  private val executor = Executors.newSingleThreadExecutor()
  private var discoveryListener: NsdManager.DiscoveryListener? = null

  // API 34+: one ServiceInfoCallback per service, kept until it's lost or discovery stops.
  private val infoCallbacks = mutableMapOf<String, NsdManager.ServiceInfoCallback>()

  // API < 34: resolveService only allows one resolve at a time, so queue them.
  private val resolveQueue = ArrayDeque<NsdServiceInfo>()
  private var resolving = false

  @Synchronized
  fun start() {
    if (discoveryListener != null) return
    val l =
      object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(serviceType: String) {
          log("Discovery started for $serviceType")
          listener.onStateChanged(true, null)
        }

        override fun onDiscoveryStopped(serviceType: String) {
          log("Discovery stopped")
          listener.onStateChanged(false, null)
        }

        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
          log("Start discovery failed: $errorCode")
          synchronized(this@TvDiscovery) { discoveryListener = null }
          listener.onStateChanged(false, "Discovery failed to start (code $errorCode)")
        }

        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
          log("Stop discovery failed: $errorCode")
        }

        override fun onServiceFound(info: NsdServiceInfo) {
          log("Found ${info.serviceName}")
          resolve(info)
        }

        override fun onServiceLost(info: NsdServiceInfo) {
          log("Lost ${info.serviceName}")
          unregisterInfoCallback(info.serviceName)
          listener.onLost(info.serviceName)
        }
      }
    discoveryListener = l
    nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, l)
  }

  @Synchronized
  fun stop() {
    val l = discoveryListener ?: return
    discoveryListener = null
    try {
      nsd.stopServiceDiscovery(l)
    } catch (e: IllegalArgumentException) {
      // Listener was never registered (start failed); nothing to stop.
    }
    infoCallbacks.keys.toList().forEach { unregisterInfoCallback(it) }
    resolveQueue.clear()
    resolving = false
  }

  private fun resolve(info: NsdServiceInfo) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      resolveWithCallback(info)
    } else {
      synchronized(this) {
        resolveQueue.addLast(info)
        if (!resolving) resolveNextLegacy()
      }
    }
  }

  private fun resolveWithCallback(info: NsdServiceInfo) {
    synchronized(this) { if (infoCallbacks.containsKey(info.serviceName)) return }
    val cb =
      object : NsdManager.ServiceInfoCallback {
        override fun onServiceInfoCallbackRegistrationFailed(errorCode: Int) {
          log("Resolve failed for ${info.serviceName}: $errorCode")
          synchronized(this@TvDiscovery) { infoCallbacks.remove(info.serviceName) }
        }

        override fun onServiceUpdated(updated: NsdServiceInfo) {
          report(updated, updated.hostAddresses)
        }

        override fun onServiceLost() {
          listener.onLost(info.serviceName)
        }

        override fun onServiceInfoCallbackUnregistered() {}
      }
    synchronized(this) { infoCallbacks[info.serviceName] = cb }
    try {
      nsd.registerServiceInfoCallback(info, executor, cb)
    } catch (e: IllegalArgumentException) {
      synchronized(this) { infoCallbacks.remove(info.serviceName) }
    }
  }

  @Synchronized
  private fun unregisterInfoCallback(serviceName: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
    val cb = infoCallbacks.remove(serviceName) ?: return
    try {
      nsd.unregisterServiceInfoCallback(cb)
    } catch (e: IllegalArgumentException) {
      // Already unregistered.
    }
  }

  @Suppress("DEPRECATION")
  @Synchronized
  private fun resolveNextLegacy() {
    val next = resolveQueue.removeFirstOrNull()
    if (next == null) {
      resolving = false
      return
    }
    resolving = true
    nsd.resolveService(
      next,
      object : NsdManager.ResolveListener {
        override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
          log("Resolve failed for ${info.serviceName}: $errorCode")
          resolveNextLegacy()
        }

        override fun onServiceResolved(info: NsdServiceInfo) {
          report(info, listOfNotNull(info.host))
          resolveNextLegacy()
        }
      },
    )
  }

  private fun report(info: NsdServiceInfo, addresses: List<InetAddress>) {
    // The TV usually advertises both IPv6 link-local and IPv4; IPv4 is what the user recognises.
    val address = addresses.firstOrNull { it is Inet4Address } ?: addresses.firstOrNull() ?: return
    val attrs =
      info.attributes.mapValues { (_, v) -> v?.let { String(it, Charsets.UTF_8) } ?: "" }
    val tv =
      FoundTv(
        serviceName = info.serviceName,
        host = address.hostAddress ?: return,
        port = info.port,
        attributes = attrs,
      )
    log("Resolved ${tv.serviceName} -> ${tv.host}:${tv.port} $attrs")
    listener.onFound(tv)
  }

  private fun log(msg: String) {
    if (BuildConfig.DEBUG) Log.d(TAG, msg)
  }

  companion object {
    const val SERVICE_TYPE = "_androidtvremote2._tcp"
    private const val TAG = "AltRemote.Discovery"
  }
}
