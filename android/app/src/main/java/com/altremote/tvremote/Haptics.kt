package com.altremote.tvremote

import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings

/**
 * Short button vibrations for the remote.
 *
 * Uses the TOUCH vibration usage, like Android's own key feedback, so it works while
 * Do Not Disturb is on (DND only silences rings, notifications and alarms). It respects
 * the phone's "Touch feedback" (haptic feedback) setting.
 *
 * (react-native-haptic-feedback was dropped: it skips vibrating whenever the ringer
 * reports silent, which includes Do Not Disturb on Samsung phones.)
 */
class Haptics(context: Context) {
  enum class Kind { TAP, LONG, TICK }

  private val appContext = context.applicationContext

  private val vibrator: Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      appContext.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION") appContext.getSystemService(Vibrator::class.java)
    }

  private fun touchFeedbackEnabled(): Boolean =
    try {
      Settings.System.getInt(appContext.contentResolver, Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) != 0
    } catch (_: Exception) {
      true
    }

  fun play(kind: Kind) {
    val v = vibrator ?: return
    if (!v.hasVibrator() || !touchFeedbackEnabled()) return

    val effect =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        // Predefined effects fall back to a simple pulse on motors that can't play them.
        VibrationEffect.createPredefined(
          when (kind) {
            Kind.TAP -> VibrationEffect.EFFECT_CLICK
            Kind.LONG -> VibrationEffect.EFFECT_HEAVY_CLICK
            Kind.TICK -> VibrationEffect.EFFECT_TICK
          }
        )
      } else {
        VibrationEffect.createOneShot(
          when (kind) {
            Kind.TAP -> 20L
            Kind.LONG -> 40L
            Kind.TICK -> 10L
          },
          VibrationEffect.DEFAULT_AMPLITUDE,
        )
      }

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        v.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH))
      } else {
        @Suppress("DEPRECATION")
        v.vibrate(
          effect,
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
      }
    } catch (_: Exception) {
      // Haptics are a nicety; never let them break a key press.
    }
  }
}
