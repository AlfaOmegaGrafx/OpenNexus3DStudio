package com.opennexus3dstudio.xrfacebridge

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
 * OpenXR `XR_ANDROID_face_tracking` + optional `XR_ANDROIDSYS_body_tracking`
 * (headless session) → HTTP relay + optional WebView.
 * Runs parallel to [XrFaceTrackingEngine] (Jetpack); [FaceTrackingCoordinator] merges freshness.
 */
object OpenXrFaceEngine {

    private const val TAG = "ON-OpenXrFace"
    private const val PARAM_COUNT = 68
    private const val BODY_JOINT_COUNT = 14
    private const val FLOATS_PER_BODY_JOINT = 7  // pos.xyz + ori.xyzw

    /** ANDROIDSYS upper-body → VRM-style humanoid names (ribs→chest, chest→upperChest). */
    private val BODY_JOINT_NAMES = arrayOf(
        "hips",
        "spine",
        "chest",
        "upperChest",
        "neck",
        "head",
        "leftShoulder",
        "rightShoulder",
        "leftUpperArm",
        "rightUpperArm",
        "leftLowerArm",
        "rightLowerArm",
        "leftHand",
        "rightHand",
    )

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
            System.loadLibrary("on_openxr_face")
            nativeLoaded = true
            Log.i(TAG, "Native libraries openxr_loader + on_openxr_face loaded")
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

    internal fun deliverFaceParameters(
        params: FloatArray,
        timestampMs: Long,
        bodyJoints: FloatArray?,
        jointCount: Int,
    ) {
        if (!running || params.size < PARAM_COUNT) return
        val now = if (timestampMs > 0) timestampMs else System.currentTimeMillis()
        if (!loggedFirstPush) {
            loggedFirstPush = true
            Log.i(
                TAG,
                "First OpenXR face push (${params.size} parameters" +
                    ", bodyJoints=${jointCount.coerceAtLeast(0)} → relay)",
            )
        }
        val payload = JSONObject()
        payload.put("source", "openxr")
        payload.put("openxrParameters", JSONArray(params.copyOf(PARAM_COUNT)))
        payload.put("t", now)
        payload.put("body", buildBodyJson(bodyJoints, jointCount))
        FaceHttpRelay.post(payload)
        lastPostMs.set(now)
        XrFaceTrackingEngine.pushRelayPayloadFromOpenXr(payload)
    }

    private fun buildBodyJson(bodyJoints: FloatArray?, jointCount: Int): JSONObject {
        val body = JSONObject()
        val floats = bodyJoints
        val n = when {
            floats == null || jointCount <= 0 -> 0
            else -> minOf(jointCount, BODY_JOINT_COUNT, floats.size / FLOATS_PER_BODY_JOINT)
        }
        if (n <= 0 || floats == null) {
            body.put("valid", false)
            body.put("jointCount", 0)
            body.put("joints", JSONArray())
            return body
        }
        val joints = JSONArray()
        var anyValid = false
        for (i in 0 until n) {
            val base = i * FLOATS_PER_BODY_JOINT
            val posX = floats[base]
            val posY = floats[base + 1]
            val posZ = floats[base + 2]
            val oriX = floats[base + 3]
            val oriY = floats[base + 4]
            val oriZ = floats[base + 5]
            val oriW = floats[base + 6]
            // Native packs invalid joints as all zeros (including ori.w == 0).
            val valid = oriW != 0f || posX != 0f || posY != 0f || posZ != 0f ||
                oriX != 0f || oriY != 0f || oriZ != 0f
            if (valid) anyValid = true
            val joint = JSONObject()
            joint.put("name", BODY_JOINT_NAMES.getOrElse(i) { "joint$i" })
            joint.put("pos", JSONArray().put(posX.toDouble()).put(posY.toDouble()).put(posZ.toDouble()))
            joint.put(
                "ori",
                JSONArray()
                    .put(oriX.toDouble())
                    .put(oriY.toDouble())
                    .put(oriZ.toDouble())
                    .put(oriW.toDouble()),
            )
            joint.put("valid", valid)
            joints.put(joint)
        }
        body.put("valid", anyValid)
        body.put("jointCount", n)
        body.put("joints", joints)
        return body
    }

    private class JniFaceCallback {
        @Suppress("unused")
        fun onOpenXrFaceParameters(
            params: FloatArray,
            timestampMs: Long,
            bodyJoints: FloatArray?,
            jointCount: Int,
        ) {
            deliverFaceParameters(params, timestampMs, bodyJoints, jointCount)
        }
    }

    private external fun nativeSetActivity(activity: Activity?)
    private external fun nativeSetSurface(surface: Surface?)
    private external fun nativeStart(callback: JniFaceCallback): Boolean
    private external fun nativeStop()
    private external fun nativeIsRunning(): Boolean
    private external fun nativeLastPostAgeMs(): Long
}
