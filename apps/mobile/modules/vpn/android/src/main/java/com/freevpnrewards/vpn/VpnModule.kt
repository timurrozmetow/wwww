package com.freevpnrewards.vpn

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS <-> native bridge for the VPN tunnel (CLAUDE.md §3 — custom Kotlin module).
 * Thin on purpose: it only relays intents to [VpnTunnelService] and forwards the
 * service's status callback to the `onStatusChange` JS event. No money logic and
 * no raw config ever lives here.
 */
class VpnModule : Module() {
  private var pendingPrepare: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("Vpn")

    Events("onStatusChange")

    OnCreate {
      VpnTunnelService.statusListener = { status -> sendEvent("onStatusChange", status) }
    }

    OnDestroy { VpnTunnelService.statusListener = null }

    // Requests system VPN consent if not yet granted. Resolves true immediately
    // when already granted; otherwise resolves after the consent dialog returns.
    AsyncFunction("prepare") { promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val consent = VpnService.prepare(context)
      if (consent == null) {
        promise.resolve(true)
      } else {
        val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
        pendingPrepare = promise
        activity.startActivityForResult(consent, VPN_PREPARE_REQUEST)
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode == VPN_PREPARE_REQUEST) {
        pendingPrepare?.resolve(payload.resultCode == Activity.RESULT_OK)
        pendingPrepare = null
      }
    }

    AsyncFunction("start") { config: Map<String, Any?>, promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent =
        Intent(context, VpnTunnelService::class.java).apply {
          action = VpnTunnelService.ACTION_START
          putExtra(VpnTunnelService.EXTRA_CONFIG, config["config"] as? String)
          putExtra(VpnTunnelService.EXTRA_SESSION_TOKEN, config["sessionToken"] as? String)
          putExtra(VpnTunnelService.EXTRA_SERVER_NAME, config["serverName"] as? String)
        }
      context.startForegroundService(intent)
      promise.resolve(null)
    }

    AsyncFunction("stop") { promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      context.startService(
        Intent(context, VpnTunnelService::class.java).apply {
          action = VpnTunnelService.ACTION_STOP
        },
      )
      promise.resolve(null)
    }

    AsyncFunction("getStatus") { VpnTunnelService.currentStatus() }
  }

  companion object {
    private const val VPN_PREPARE_REQUEST = 0x5650
  }
}
