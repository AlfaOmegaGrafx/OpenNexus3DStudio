package com.characterstudio.xrfacebridge

import android.content.Context
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Chrome WebXR handoff: Jetpack face + HTTP relay must stay alive while Chrome owns immersive XR.
 * PiP + [FaceKeeperActivity] keep the session host resumed; persisted flag survives process death.
 */
object FaceHandoffState {

    private const val PREFS = "cs_face_handoff"
    private const val KEY_CHROME_HANDOFF = "chrome_handoff"
    private const val KEY_LAST_RELAY_POST_MS = "last_relay_post_ms"

    /** Do not restore handoff after this long without a successful relay ingest. */
    private const val HANDOFF_RESTORE_MAX_AGE_MS = 60_000L

    private val chromeHandoff = AtomicBoolean(false)

    @Volatile
    private var appContext: Context? = null

    /** While true, face pipeline uses [CHROME_HANDOFF_STALE_MS] instead of [XrFaceTrackingEngine.STALE_MS]. */
    const val CHROME_HANDOFF_STALE_MS = 10_000L

    fun init(context: Context) {
        appContext = context.applicationContext
        restore()
    }

    fun restore() {
        val ctx = appContext ?: return
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val wasActive = prefs.getBoolean(KEY_CHROME_HANDOFF, false)
        val lastPost = prefs.getLong(KEY_LAST_RELAY_POST_MS, 0L)
        val relayRecent =
            lastPost > 0L &&
                (System.currentTimeMillis() - lastPost) <= HANDOFF_RESTORE_MAX_AGE_MS
        val active = wasActive && relayRecent
        chromeHandoff.set(active)
        if (wasActive && !active) {
            prefs.edit().putBoolean(KEY_CHROME_HANDOFF, false).apply()
        }
    }

    fun setChromeHandoff(active: Boolean) {
        chromeHandoff.set(active)
        appContext?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            ?.edit()
            ?.putBoolean(KEY_CHROME_HANDOFF, active)
            ?.apply()
    }

    /** Call only after a successful HTTP ingest (not when toggling handoff). */
    fun recordRelayPostSuccess() {
        val now = System.currentTimeMillis()
        appContext?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            ?.edit()
            ?.putLong(KEY_LAST_RELAY_POST_MS, now)
            ?.apply()
    }

    fun isChromeHandoff(): Boolean = chromeHandoff.get()

    fun effectiveStaleMs(): Long =
        if (chromeHandoff.get()) CHROME_HANDOFF_STALE_MS else XrFaceTrackingEngine.STALE_MS

    /** True when persisted handoff can be resumed (PiP return, not a cold launcher open). */
    fun canRestoreHandoffSession(inPictureInPicture: Boolean, pausingForChrome: Boolean): Boolean =
        isChromeHandoff() && (inPictureInPicture || pausingForChrome)
}
