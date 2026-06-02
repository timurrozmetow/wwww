package com.freevpnrewards.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat

/**
 * Android VpnService that owns the TUN interface and drives the sing-box core.
 *
 * Money/privacy invariants (CLAUDE.md §7):
 *  - the raw sing-box `config` is fed straight to the core and never logged or
 *    surfaced to the UI (§7.2);
 *  - the service runs as a foreground service so the OS keeps the countdown /
 *    auto-disconnect alive even when the app is backgrounded (§7.6);
 *  - the backend issues a short-lived session with a server deadline; the app
 *    calls stop() at the deadline, and onRevoke() handles the user pulling consent.
 *
 * The sing-box integration (libbox) is marked below — drop `libbox.aar` into
 * android/libs and wire the two TODO lines (see docs/VPN.md).
 */
class VpnTunnelService : VpnService() {
  private var tunInterface: ParcelFileDescriptor? = null
  private var state: String = STATE_DISCONNECTED
  private var connectedAtMs: Long? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START ->
        startTunnel(
          config = intent.getStringExtra(EXTRA_CONFIG).orEmpty(),
          sessionToken = intent.getStringExtra(EXTRA_SESSION_TOKEN).orEmpty(),
          serverName = intent.getStringExtra(EXTRA_SERVER_NAME) ?: "VPN",
        )
      ACTION_STOP -> stopTunnel()
    }
    return START_STICKY
  }

  private fun startTunnel(config: String, sessionToken: String, serverName: String) {
    if (config.isEmpty()) {
      emit(STATE_ERROR)
      stopSelf()
      return
    }
    emit(STATE_CONNECTING)
    startForeground(NOTIFICATION_ID, buildNotification(serverName))

    // Build the TUN device; sing-box owns packet I/O on this fd.
    val builder =
      Builder()
        .setSession(serverName)
        .setMtu(1500)
        .addAddress("172.19.0.1", 30)
        .addDnsServer("1.1.1.1")
        .addRoute("0.0.0.0", 0)
    // TODO(split-tunneling): apply addDisallowedApplication(...) from remote config.

    val tun = builder.establish()
    if (tun == null) {
      emit(STATE_ERROR)
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return
    }
    tunInterface = tun

    // === sing-box / libbox integration point ================================
    // ASSUMPTION: libbox.aar (gomobile build of sing-box) is on the classpath.
    //   SingBoxBridge.start(config, tun.fd, sessionToken)
    // The `config` is opaque here — never inspect or log it (§7.2). On a start
    // failure, emit(STATE_ERROR) and stopSelf().
    // ========================================================================

    connectedAtMs = System.currentTimeMillis()
    emit(STATE_CONNECTED)
  }

  private fun stopTunnel() {
    if (state == STATE_DISCONNECTED) return
    emit(STATE_DISCONNECTING)
    // TODO(libbox): SingBoxBridge.stop()
    runCatching { tunInterface?.close() }
    tunInterface = null
    connectedAtMs = null
    emit(STATE_DISCONNECTED)
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

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
      // TODO(libbox): real counters from SingBoxBridge.stats().
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
