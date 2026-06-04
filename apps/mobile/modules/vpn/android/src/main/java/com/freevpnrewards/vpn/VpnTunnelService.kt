package com.freevpnrewards.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import io.nekohasekai.libbox.BoxService
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.PlatformInterface
import io.nekohasekai.libbox.SetupOptions
import io.nekohasekai.libbox.TunOptions

/**
 * Android VpnService that runs the sing-box core in-process via libbox.
 *
 * MODEL (verified — SFA / experimental/libbox): libbox DRIVES the tun. The
 * backend-generated config contains a `tun` inbound; the core converts it into
 * a TunOptions and calls back into [openTun] here, where WE build the
 * VpnService.Builder, establish() the fd, and hand it back. We do NOT pre-create
 * the fd, and the config must NOT carry a numeric fd. Outbound sockets are kept
 * off the tun via [autoDetectInterfaceControl] → protect(fd).
 *
 * Money/privacy invariants (CLAUDE.md §7):
 *  - the raw sing-box `config` is fed straight to the core, never logged/surfaced (§7.2);
 *  - runs as a foreground service so the OS keeps countdown / auto-disconnect alive (§7.6);
 *  - the backend issues a short-lived session with a server deadline; the app
 *    stop()s at the deadline, and onRevoke() handles the user pulling consent.
 *
 * BUILD PREREQUISITE: vendor `libbox.aar` (gomobile build of sing-box at a
 * PINNED tag, built with the `with_gvisor` tag) into android/libs, and keep the
 * AAR version == the backend config-generator version. See docs/VPN.md.
 * The expo-module config is disabled until the AAR is present.
 */
class VpnTunnelService : VpnService(), PlatformInterface {
  private var box: BoxService? = null
  private var tunPfd: ParcelFileDescriptor? = null
  private var state: String = STATE_DISCONNECTED
  private var connectedAtMs: Long? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START ->
        startTunnel(
          config = intent.getStringExtra(EXTRA_CONFIG).orEmpty(),
          serverName = intent.getStringExtra(EXTRA_SERVER_NAME) ?: "VPN",
        )
      ACTION_STOP -> stopTunnel()
    }
    return START_STICKY
  }

  private fun startTunnel(config: String, serverName: String) {
    if (config.isEmpty()) {
      emit(STATE_ERROR)
      stopSelf()
      return
    }
    emit(STATE_CONNECTING)
    startForeground(NOTIFICATION_ID, buildNotification(serverName))

    try {
      // 1) one-time libbox setup (cache/work dirs).
      Libbox.setup(
        SetupOptions().apply {
          basePath = filesDir.absolutePath
          workingPath = filesDir.absolutePath
          tempPath = cacheDir.absolutePath
        },
      )
      // 2) build the service from the opaque JSON config (never inspect/log it, §7.2).
      //    3) start() → the core calls openTun() below to obtain the tun fd.
      val service = Libbox.newService(config, this)
      service.start()
      box = service
    } catch (t: Throwable) {
      // Never include `config` in the message (§7.2).
      emit(STATE_ERROR)
      teardown()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return
    }

    connectedAtMs = System.currentTimeMillis()
    emit(STATE_CONNECTED)
  }

  private fun stopTunnel() {
    if (state == STATE_DISCONNECTED) return
    emit(STATE_DISCONNECTING)
    teardown()
    connectedAtMs = null
    emit(STATE_DISCONNECTED)
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  /** Close the core FIRST, then the tun fd (order matters — see pitfalls in docs/VPN.md). */
  private fun teardown() {
    runCatching { box?.close() }
    box = null
    runCatching { tunPfd?.close() }
    tunPfd = null
  }

  // === PlatformInterface — the critical methods ==============================

  /**
   * The core asks us to materialize the tun. Translate TunOptions →
   * VpnService.Builder, establish(), and return the fd to libbox.
   */
  override fun openTun(options: TunOptions): Int {
    val builder = Builder().setSession("FreeVPN").setMtu(options.mtu)

    val v4 = options.inet4Address
    while (v4.hasNext()) {
      val a = v4.next()
      builder.addAddress(a.address(), a.prefix())
    }
    val v6 = options.inet6Address
    while (v6.hasNext()) {
      val a = v6.next()
      builder.addAddress(a.address(), a.prefix())
    }

    if (options.autoRoute) {
      // Catch-all default route (avoids route-explosion DeadSystemException).
      builder.addRoute("0.0.0.0", 0)
      builder.addRoute("::", 0)
      runCatching { options.dnsServerAddress }.getOrNull()?.let { builder.addDnsServer(it) }

      // Per-app split tunneling from include/exclude_package in the config.
      // NEVER add our own package to allowed (→ self-proxy loop).
      val include = options.includePackage
      while (include.hasNext()) runCatching { builder.addAllowedApplication(include.next()) }
      val exclude = options.excludePackage
      while (exclude.hasNext()) runCatching { builder.addDisallowedApplication(exclude.next()) }
    }

    builder.setBlocking(false)
    val pfd = builder.establish() ?: throw IllegalStateException("VPN not prepared / revoked")
    tunPfd = pfd
    return pfd.fd
  }

  /** We do socket protection ourselves on Android. */
  override fun usePlatformAutoDetectInterfaceControl(): Boolean = true

  /** Keep the core's own outbound sockets OFF the tun (else routing loop / no traffic). */
  override fun autoDetectInterfaceControl(fd: Int) {
    if (!protect(fd)) throw IllegalStateException("protect($fd) failed")
  }

  override fun useProcFS(): Boolean = false

  override fun underNetworkExtension(): Boolean = false

  override fun includeAllNetworks(): Boolean = false

  override fun writeLog(message: String?) {
    // Forward to Logcat only; the config/credentials must never be logged (§7.2).
  }

  // NOTE: gomobile generates the full PlatformInterface from experimental/libbox.
  // The remaining methods (findConnectionOwner, packageNameByUid, getInterfaces,
  // start/closeDefaultInterfaceMonitor, readWIFIState, systemCertificates,
  // localDNSTransport, clearDNSCache, sendNotification, …) MUST be implemented to
  // satisfy the interface for the EXACT vendored AAR version — copy SFA's
  // PlatformInterfaceWrapper defaults. The set drifts with the sing-box version
  // (the #1 integration pitfall); reconcile against the AAR you build. See docs/VPN.md.

  /** The user revoked VPN consent (or another VPN started) — tear down cleanly. */
  override fun onRevoke() {
    stopTunnel()
    super.onRevoke()
  }

  override fun onDestroy() {
    stopTunnel()
    statusListener = null
    super.onDestroy()
  }

  private fun emit(next: String) {
    state = next
    lastStatus = statusMap()
    statusListener?.invoke(lastStatus)
  }

  private fun statusMap(): Map<String, Any?> =
    mapOf(
      "state" to state,
      // TODO(libbox): real counters via the Clash-API / box stats once wired.
      "bytesIn" to 0L,
      "bytesOut" to 0L,
      "connectedAtMs" to connectedAtMs,
    )

  private fun buildNotification(serverName: String): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "VPN", NotificationManager.IMPORTANCE_LOW),
      )
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(serverName)
      .setContentText("VPN active")
      .setSmallIcon(android.R.drawable.stat_sys_vpn_ic)
      .setOngoing(true)
      .build()
  }

  companion object {
    const val ACTION_START = "com.freevpnrewards.vpn.START"
    const val ACTION_STOP = "com.freevpnrewards.vpn.STOP"
    const val EXTRA_CONFIG = "config"
    const val EXTRA_SESSION_TOKEN = "sessionToken"
    const val EXTRA_SERVER_NAME = "serverName"

    private const val CHANNEL_ID = "vpn_tunnel"
    private const val NOTIFICATION_ID = 0x5650 // "VP"

    const val STATE_DISCONNECTED = "disconnected"
    const val STATE_CONNECTING = "connecting"
    const val STATE_CONNECTED = "connected"
    const val STATE_DISCONNECTING = "disconnecting"
    const val STATE_ERROR = "error"

    /** Bridged to the JS `onStatusChange` event by VpnModule while it is alive. */
    var statusListener: ((Map<String, Any?>) -> Unit)? = null

    private var lastStatus: Map<String, Any?> =
      mapOf("state" to STATE_DISCONNECTED, "bytesIn" to 0L, "bytesOut" to 0L, "connectedAtMs" to null)

    fun currentStatus(): Map<String, Any?> = lastStatus
  }
}
