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

    private val chromeHandoff = AtomicBoolean(false)

    @Volatile
    private var appContext: Context? = null

    /** While true, face pipeline uses [CHROME_HANDOFF_STALE_MS] instead of [XrFaceTrackingEngine.STALE_MS]. */
    const val CHROME_HANDOFF_STALE_MS = 30_000L

    fun init(context: Context) {
        appContext = context.applicationContext
        restore()
    }

    fun restore() {
        val ctx = appContext ?: return
        chromeHandoff.set(
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_CHROME_HANDOFF, false),
        )
    }

    fun setChromeHandoff(active: Boolean) {
        chromeHandoff.set(active)
        appContext?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            ?.edit()
            ?.putBoolean(KEY_CHROME_HANDOFF, active)
            ?.apply()
    }

    fun isChromeHandoff(): Boolean = chromeHandoff.get()

    fun effectiveStaleMs(): Long =
        if (chromeHandoff.get()) CHROME_HANDOFF_STALE_MS else XrFaceTrackingEngine.STALE_MS
}
