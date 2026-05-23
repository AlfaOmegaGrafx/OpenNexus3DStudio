package com.characterstudio.xrfacebridge

import android.app.Activity
import android.util.Log
import android.view.Surface
import androidx.appcompat.app.AppCompatActivity
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/**
 * OpenXR `XR_ANDROID_face_tracking` (headless session) → HTTP relay + optional WebView.
 * Runs parallel to [XrFaceTrackingEngine] (Jetpack); [FaceTrackingCoordinator] merges freshness.
 */
object OpenXrFaceEngine {

    private const val TAG = "CS-OpenXrFace"
    private const val PARAM_COUNT = 68

    private val processScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lastPostMs = AtomicLong(0L)

    @Volatile
    private var nativeLoaded = false

    @Volatile
    private var running = false

    @Volatile
    private var nativeRunning = false

    @Volatile
    private var loggedFirstPush = false

    @Volatile
    private var activityRef: WeakReference<AppCompatActivity>? = null

    @Volatile
    private var surfaceReady = false

    private val lastNativeFailMs = AtomicLong(0L)

    private val jniCallback = JniFaceCallback()

    init {
        try {
            // Prefab AAR ships loader via CMake link; explicit load helps dlopen find it on Galaxy XR.
            System.loadLibrary("openxr_loader")
            System.loadLibrary("cs_openxr_face")
            nativeLoaded = true
            Log.i(TAG, "Native libraries openxr_loader + cs_openxr_face loaded")
        } catch (e: UnsatisfiedLinkError) {
            Log.w(TAG, "OpenXR native lib unavailable (emulator / non-XR build): ${e.message}")
        }
    }

    fun setActivity(activity: AppCompatActivity?) {
        activityRef = activity?.let { WeakReference(it) }
        if (!nativeLoaded) return
        try {
            nativeSetActivity(activity)
        } catch (e: Exception) {
            Log.w(TAG, "nativeSetActivity failed", e)
        }
    }

    fun setSurface(surface: Surface?) {
        surfaceReady = surface != null && surface.isValid
        if (!nativeLoaded) return
        try {
            nativeSetSurface(surface)
            if (surfaceReady && running) {
                ensureFacePipeline("surface-ready")
            }
        } catch (e: Exception) {
            Log.w(TAG, "nativeSetSurface failed", e)
        }
    }

    fun isSurfaceReady(): Boolean = surfaceReady

    fun lastPostAgeMs(): Long {
        if (!nativeLoaded) return Long.MAX_VALUE
        return try {
            val nativeAge = nativeLastPostAgeMs()
            val kotlinAge = run {
                val t = lastPostMs.get()
                if (t <= 0L) Long.MAX_VALUE
                else (System.currentTimeMillis() - t).coerceAtLeast(0L)
            }
            minOf(nativeAge, kotlinAge)
        } catch (_: Exception) {
            Long.MAX_VALUE
        }
    }

    fun isCollecting(): Boolean = nativeRunning

    @Synchronized
    fun start() {
        running = true
    }

    @Synchronized
    fun stop() {
        running = false
        nativeRunning = false
        loggedFirstPush = false
        lastPostMs.set(0L)
        if (nativeLoaded) {
            try {
                nativeStop()
            } catch (e: Exception) {
                Log.w(TAG, "nativeStop", e)
            }
        }
    }

    fun shutdown() {
        stop()
    }

    fun ensureFacePipeline(reason: String) {
        if (!running || !nativeLoaded) return
        val activity = activityRef?.get()
        if (activity == null) {
            Log.d(TAG, "ensureFacePipeline($reason): no activity for OpenXR — deferring")
            return
        }
        if (nativeRunning && lastPostAgeMs() <= FaceHandoffState.effectiveStaleMs()) return
        processScope.launch(Dispatchers.Main.immediate) {
            tryStartNative(activity, reason)
        }
    }

    /** Run on the caller thread (main) so OpenXR can claim GLES before Jetpack XR session. */
    fun ensureFacePipelineSync(reason: String): Boolean {
        if (!running || !nativeLoaded) return false
        val activity = activityRef?.get() ?: return false
        if (nativeRunning && lastPostAgeMs() <= FaceHandoffState.effectiveStaleMs()) return true
        tryStartNative(activity, reason)
        return nativeRunning
    }

    private fun tryStartNative(activity: AppCompatActivity, reason: String) {
        if (!running) return
        val failAge = System.currentTimeMillis() - lastNativeFailMs.get()
        if (!nativeRunning && failAge in 0 until 15_000L) {
            Log.d(TAG, "OpenXR backoff (${failAge}ms since last fail, reason=$reason)")
            return
        }
        try {
            nativeSetActivity(activity)
            if (nativeRunning) {
                nativeStop()
                nativeRunning = false
            }
            val ok = nativeStart(jniCallback)
            nativeRunning = ok
            if (ok) {
                lastNativeFailMs.set(0L)
                Log.i(TAG, "OpenXR GLES face started ($reason)")
            } else {
                lastNativeFailMs.set(System.currentTimeMillis())
                Log.w(TAG, "OpenXR GLES face unavailable ($reason) — Jetpack path remains active")
            }
        } catch (e: Exception) {
            Log.e(TAG, "OpenXR start failed ($reason)", e)
            nativeRunning = false
            lastNativeFailMs.set(System.currentTimeMillis())
        }
    }

    internal fun deliverFaceParameters(params: FloatArray, timestampMs: Long) {
        if (!running || params.size < PARAM_COUNT) return
        val now = if (timestampMs > 0) timestampMs else System.currentTimeMillis()
        if (!loggedFirstPush) {
            loggedFirstPush = true
            Log.i(TAG, "First OpenXR face push (${params.size} parameters → relay)")
        }
        val payload = JSONObject()
        payload.put("source", "openxr")
        payload.put("openxrParameters", JSONArray(params.copyOf(PARAM_COUNT)))
        payload.put("t", now)
        FaceHttpRelay.post(payload)
        lastPostMs.set(now)
        XrFaceTrackingEngine.pushRelayPayloadFromOpenXr(payload)
    }

    private class JniFaceCallback {
        @Suppress("unused")
        fun onOpenXrFaceParameters(params: FloatArray, timestampMs: Long) {
            deliverFaceParameters(params, timestampMs)
        }
    }

    private external fun nativeSetActivity(activity: Activity?)
    private external fun nativeSetSurface(surface: Surface?)
    private external fun nativeStart(callback: JniFaceCallback): Boolean
    private external fun nativeStop()
    private external fun nativeIsRunning(): Boolean
    private external fun nativeLastPostAgeMs(): Long
}
