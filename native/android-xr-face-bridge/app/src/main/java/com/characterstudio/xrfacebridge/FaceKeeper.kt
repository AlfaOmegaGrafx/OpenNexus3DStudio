package com.characterstudio.xrfacebridge

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Starts a minimal transparent [FaceKeeperActivity] during Chrome WebXR handoff so
 * [Session.create] has a resumed [AppCompatActivity] host while [MainActivity] is PiP/backgrounded.
 */
object FaceKeeper {

    private const val TAG = "CS-FaceKeeper"

    private val resumed = AtomicBoolean(false)

    fun isActive(): Boolean = resumed.get()

    internal fun markResumed() {
        resumed.set(true)
    }

    internal fun markStopped() {
        resumed.set(false)
    }

    fun acquire(context: Context, reason: String) {
        Log.i(TAG, "acquire reason=$reason active=$resumed")
        val intent =
            Intent(context, FaceKeeperActivity::class.java).apply {
                if (context !is Activity) {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                putExtra(FaceKeeperActivity.EXTRA_REASON, reason)
            }
        context.startActivity(intent)
    }

    fun release(context: Context) {
        if (!resumed.get() && !FaceHandoffState.isChromeHandoff()) return
        Log.i(TAG, "release")
        val intent =
            Intent(context, FaceKeeperActivity::class.java).apply {
                action = FaceKeeperActivity.ACTION_FINISH
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        context.startActivity(intent)
    }
}
