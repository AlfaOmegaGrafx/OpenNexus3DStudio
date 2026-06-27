package com.opennexus3dstudio.xrfacebridge

import android.util.Log
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.xr.arcore.Face
import androidx.xr.arcore.FaceBlendShapeType
import androidx.xr.arcore.TrackingState
import androidx.xr.runtime.FaceTrackingMode
import androidx.xr.runtime.Session
import androidx.xr.runtime.SessionConfigureSuccess
import androidx.xr.runtime.SessionCreateSuccess
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.abs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Jetpack XR face → HTTP relay (+ optional WebView [evaluateJavascript]).
 * Runs on a process-wide scope so collection continues while Chrome WebXR is foreground.
 */
object XrFaceTrackingEngine {

    private const val TAG = "ON-JetpackFace"
    private const val MIN_INTERVAL_MS = 33L
    /** If no payload posted for this long, consider restarting (normal mode). */
    const val STALE_MS = 5000L
    /** Chrome handoff: no face.state tick for this long while job is "active" → allow recycle. */
    private const val COLLECTOR_STUCK_MS = 8_000L
    private const val COLLECTOR_STUCK_CHROME_MS = 20_000L
    /** Minimum gap between session tear-downs (avoids cancel / JobCancellationException loops). */
    private const val SESSION_RECYCLE_MIN_INTERVAL_MS = 15_000L
    private const val TRACKING_STATE_LOG_INTERVAL_MS = 10_000L

    private val processScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lastPostMs = AtomicLong(0L)
    /** Updated on every face.state emission (even when not TRACKING / no weights). */
    private val lastCollectTickMs = AtomicLong(0L)

    @Volatile
    private var sessionHost: WeakReference<LifecycleOwner>? = null

    @Volatile
    private var webViewRef: WeakReference<WebView>? = null

    private var session: Session? = null
    private var faceCollectJob: Job? = null
    private var sessionStartJob: Job? = null
    private var lastPushMs = 0L
    private var loggedFirstNativePush = false
    private var running = false
    private var lastSessionRecycleMs = 0L
    private var lastSessionReconfigureMs = 0L
    private const val SESSION_RECONFIGURE_MIN_INTERVAL_MS = 5_000L
    private var lastTrackingStateLogMs = 0L
    @Volatile
    private var lastTrackingStateName: String? = null

    fun setWebView(webView: WebView?) {
        webViewRef = webView?.let { WeakReference(it) }
    }

    /**
     * Prefer [AppCompatActivity] for [Session.create]; fall back to [LifecycleService] host.
     */
    fun setSessionHost(owner: LifecycleOwner?) {
        sessionHost = owner?.let { WeakReference(it) }
    }

    fun lastPostAgeMs(): Long {
        val t = lastPostMs.get()
        if (t <= 0L) return Long.MAX_VALUE
        return (System.currentTimeMillis() - t).coerceAtLeast(0L)
    }

    private fun isStale(): Boolean = lastPostAgeMs() > FaceHandoffState.effectiveStaleMs()

    private fun collectorStuckThresholdMs(): Long =
        if (FaceHandoffState.isChromeHandoff()) COLLECTOR_STUCK_CHROME_MS else COLLECTOR_STUCK_MS

    /** True when the collect job is running but face.state has not emitted recently. */
    private fun isCollectorStuck(): Boolean {
        val tick = lastCollectTickMs.get()
        if (tick <= 0L) return isStale()
        return (System.currentTimeMillis() - tick) > collectorStuckThresholdMs()
    }

    /**
     * Relay may pause while face.state still ticks (e.g. not TRACKING, or Chrome immersive). Do not
     * cancel the collect job only because [lastPostMs] is old when the collector is still alive.
     */
    private fun shouldForceSessionRecycle(jobActive: Boolean): Boolean {
        if (!jobActive) return isStale()
        if (!isStale()) return false

        // If the collector is truly stuck (no ticks from face.state), force recycle.
        if (isCollectorStuck()) return true

        // If we are getting ticks (so not stuck) but they've been NOT_TRACKING or zeroed 
        // for a long time (2x the stale threshold), force a recycle to try to recover sensors.
        if (lastPostAgeMs() > FaceHandoffState.effectiveStaleMs() * 2) {
            return true
        }

        return false
    }

    fun isCollecting(): Boolean = faceCollectJob?.isActive == true

    /** WebView inject when OpenXR posts (`openxrParameters` or `weights`). */
    fun pushRelayPayloadFromOpenXr(payload: JSONObject) {
        processScope.launch {
            pushPayloadToWebView(payload)
        }
    }

    private suspend fun pushPayloadToWebView(payload: JSONObject) {
        val wv = webViewRef?.get() ?: return
        val payloadJs = payload.toString()
        withContext(Dispatchers.Main) {
            wv.evaluateJavascript(
                "(function(){try{" +
                    "var p=$payloadJs;" +
                    "if(typeof window.onNativeFaceData==='function'&&p.weights){" +
                    "window.onNativeFaceData(p.weights);}" +
                    "if(window.__openNexus3dStudioNativeFace&&" +
                    "window.__openNexus3dStudioNativeFace.push){" +
                    "window.__openNexus3dStudioNativeFace.push(p);" +
                    "}else{var q=(window.__ON_NATIVE_FACE_Q=window.__ON_NATIVE_FACE_Q||[]);" +
                    "if(q.length<120)q.push(p);}" +
                    "}catch(e){console.warn('ON-nativeFace',e&&e.message);}})();",
                null
            )
        }
    }

    @Synchronized
    fun start() {
        running = true
        ensureFacePipeline("start")
    }

    @Synchronized
    fun stop() {
        running = false
        sessionStartJob?.cancel()
        sessionStartJob = null
        stopFaceCollection()
        session = null
        loggedFirstNativePush = false
        lastPostMs.set(0L)
        lastCollectTickMs.set(0L)
        lastSessionRecycleMs = 0L
    }

    fun shutdown() {
        stop()
        processScope.cancel()
    }

    /** Called from activity pause, FG service watchdog, and manual retry. */
    fun ensureFacePipeline(reason: String) {
        if (!running) return
        val jobActive = faceCollectJob?.isActive == true
        if (jobActive && !shouldForceSessionRecycle(jobActive)) {
            return
        }
        Log.d(
            TAG,
            "ensureFacePipeline($reason) stale=${isStale()} collectorStuck=${isCollectorStuck()} " +
                "chromeHandoff=${FaceHandoffState.isChromeHandoff()} collecting=$jobActive " +
                "postAge=${lastPostAgeMs()}ms collectAge=${collectTickAgeMs()}ms",
        )
        ensureFacePipelineInternal()
    }

    private fun collectTickAgeMs(): Long {
        val t = lastCollectTickMs.get()
        if (t <= 0L) return Long.MAX_VALUE
        return (System.currentTimeMillis() - t).coerceAtLeast(0L)
    }

    private fun ensureFacePipelineInternal() {
        sessionStartJob?.cancel()
        val host = resolveSessionHost() ?: run {
            Log.w(
                TAG,
                "No session host — deferring face pipeline (handoff=${FaceHandoffState.isChromeHandoff()})",
            )
            return
        }
        sessionStartJob = host.lifecycleScope.launch(Dispatchers.Main.immediate) {
            val isJobActive = faceCollectJob?.isActive == true
            val recycle = shouldForceSessionRecycle(isJobActive)

            if (isJobActive && !recycle) return@launch

            Log.d(
                TAG,
                "ensureFacePipelineInternal: jobActive=$isJobActive recycle=$recycle " +
                    "postAge=${lastPostAgeMs()}ms collectAge=${collectTickAgeMs()}ms",
            )

            if (recycle && FaceHandoffState.isChromeHandoff() && isCollectorStuck()) {
                tryReconfigureFaceSession("pre-recycle-handoff")
            }

            if (recycle) {
                val now = System.currentTimeMillis()
                if (now - lastSessionRecycleMs < SESSION_RECYCLE_MIN_INTERVAL_MS) {
                    Log.d(
                        TAG,
                        "Session recycle debounced (${now - lastSessionRecycleMs}ms since last)",
                    )
                    return@launch
                }
                lastSessionRecycleMs = now
                Log.i(
                    TAG,
                    "Recycling face session (postAge=${lastPostAgeMs()}ms collectAge=${collectTickAgeMs()}ms " +
                        "handoff=${FaceHandoffState.isChromeHandoff()})",
                )
                stopFaceCollection()
                session = null
            }

            val s = session
            if (s != null) {
                Log.d(TAG, "Re-using existing session for face collection")
                startCollectingFace(s)
            } else {
                Log.i(TAG, "Starting new XR session for face tracking")
                startSessionAndFace(host)
            }
        }
    }

    fun hasSessionHost(): Boolean = sessionHost?.get() != null

    /** Nudge blend-shape mode without tearing down the collect job (chrome handoff / NOT TRACKING). */
    fun tryReconfigureFaceSession(reason: String) {
        if (!running) return
        val host = resolveSessionHost() ?: return
        val s = session ?: return
        val now = System.currentTimeMillis()
        if (now - lastSessionReconfigureMs < SESSION_RECONFIGURE_MIN_INTERVAL_MS) return
        lastSessionReconfigureMs = now
        sessionStartJob?.cancel()
        sessionStartJob = host.lifecycleScope.launch(Dispatchers.Main.immediate) {
            @Suppress("RestrictedApi")
            val newConfig = s.config.copy(faceTracking = FaceTrackingMode.BLEND_SHAPES)
            when (val configured = s.configure(newConfig)) {
                is SessionConfigureSuccess ->
                    Log.i(TAG, "Session reconfigured ($reason) host=${host.javaClass.simpleName}")
                else -> Log.w(TAG, "Session reconfigure failed ($reason): $configured")
            }
        }
    }

    private fun resolveSessionHost(): LifecycleOwner? {
        sessionHost?.get()?.let { return it }
        return null
    }

    private fun startSessionAndFace(host: LifecycleOwner) {
        val activity = host as? AppCompatActivity
        if (activity == null) {
            Log.w(TAG, "Session.create needs AppCompatActivity; host=${host.javaClass.simpleName}")
            return
        }
        when (val created = Session.create(activity)) {
            is SessionCreateSuccess -> {
                val s = created.session
                session = s
                @Suppress("RestrictedApi")
                val newConfig = s.config.copy(faceTracking = FaceTrackingMode.BLEND_SHAPES)
                when (val configured = s.configure(newConfig)) {
                    is SessionConfigureSuccess -> {
                        Log.i(TAG, "XR session configured (host=${host.javaClass.simpleName})")
                        startCollectingFace(s)
                    }
                    else -> Log.e(TAG, "Session.configure failed: $configured")
                }
            }
            else -> Log.w(TAG, "Session.create failed: $created")
        }
    }

    private fun startCollectingFace(s: Session) {
        if (faceCollectJob?.isActive == true && session === s) {
            Log.d(TAG, "Face collection already running on current session — skip restart")
            return
        }
        stopFaceCollection()
        val face = Face.getUserFace(s)
        if (face == null) {
            Log.w(TAG, "Face.getUserFace returned null — will retry via watchdog")
            return
        }
        faceCollectJob = processScope.launch {
            try {
                face.state.collect { state ->
                    lastCollectTickMs.set(System.currentTimeMillis())
                    if (!running) return@collect
                    if (state.trackingState != TrackingState.TRACKING) {
                        logNonTrackingState(state.trackingState)
                        return@collect
                    }
                    val now = System.currentTimeMillis()
                    if (now - lastPushMs < MIN_INTERVAL_MS) return@collect
                    lastPushMs = now

                    val weights = JSONObject()
                    for ((type, v) in state.blendShapes) {
                        if (abs(v) < 1e-5f) continue
                        val apiName = blendShapeTypeApiName(type)
                        val key = FaceBlendShapeMaps.BLEND_TO_WEB[apiName] ?: continue
                        weights.put(key, v.toDouble())
                    }
                    if (weights.length() == 0) return@collect

                    if (!loggedFirstNativePush) {
                        loggedFirstNativePush = true
                        Log.i(
                            TAG,
                            "First native face push: ${weights.length()} weights (relay + optional WebView)"
                        )
                    }

                    val payload = JSONObject()
                    payload.put("source", "jetpack")
                    payload.put("weights", weights)
                    payload.put("t", now)
                    FaceHttpRelay.post(payload)
                    lastPostMs.set(now)
                    pushToWebView(weights, payload)
                }
            } catch (e: Exception) {
                Log.e(TAG, "face.state collection ended — watchdog will restart", e)
            } finally {
                if (running && !FaceHandoffState.isChromeHandoff()) {
                    session = null
                }
            }
        }
    }

    private fun logNonTrackingState(trackingState: TrackingState) {
        val name = trackingState.toString()
        val now = System.currentTimeMillis()
        val stateChanged = name != lastTrackingStateName
        if (
            stateChanged ||
            now - lastTrackingStateLogMs >= TRACKING_STATE_LOG_INTERVAL_MS
        ) {
            lastTrackingStateName = name
            lastTrackingStateLogMs = now
            Log.i(
                TAG,
                "face.state not TRACKING: $name handoff=${FaceHandoffState.isChromeHandoff()} " +
                    "postAge=${lastPostAgeMs()}ms collectAge=${collectTickAgeMs()}ms",
            )
            if (FaceHandoffState.isChromeHandoff() && lastPostAgeMs() > 2_000L) {
                tryReconfigureFaceSession("not-tracking-handoff")
            }
        }
    }

    private fun stopFaceCollection() {
        faceCollectJob?.cancel()
        faceCollectJob = null
    }

    /**
     * Direct WebView injection (no HTTP relay). Feeds [window.onNativeFaceData] and
     * [window.__openNexus3dStudioNativeFace.push] used by OpenNexus3dStudio.
     */
    private suspend fun pushToWebView(weights: JSONObject, payload: JSONObject) {
        val wv = webViewRef?.get() ?: return
        val weightsJs = weights.toString()
        val payloadJs = payload.toString()
        withContext(Dispatchers.Main) {
            wv.evaluateJavascript(
                "(function(){try{" +
                    "var w=$weightsJs;" +
                    "if(typeof window.onNativeFaceData==='function'){window.onNativeFaceData(w);}" +
                    "var p=$payloadJs;" +
                    "if(window.__openNexus3dStudioNativeFace&&" +
                    "window.__openNexus3dStudioNativeFace.push){" +
                    "window.__openNexus3dStudioNativeFace.push(p);" +
                    "}else{var q=(window.__ON_NATIVE_FACE_Q=window.__ON_NATIVE_FACE_Q||[]);" +
                    "if(q.length<120)q.push(p);}" +
                    "}catch(e){console.warn('ON-nativeFace',e&&e.message);}})();",
                null
            )
        }
    }

    private fun blendShapeTypeApiName(type: FaceBlendShapeType): String {
        INSTANCE_SHORT_BY_TYPE[type]?.let { return it }
        val fq = type.javaClass.name
        val i = fq.lastIndexOf('$')
        if (i >= 0 && i < fq.length - 1) {
            val inner = fq.substring(i + 1)
            if (inner.isNotEmpty() && inner != "Companion") return inner
        }
        val ts = try {
            type.toString().trim()
        } catch (_: Exception) {
            ""
        }
        if (ts.isNotEmpty() && ts != fq) {
            if (ts.startsWith("FACE_BLEND_SHAPE_TYPE_")) return ts.removePrefix("FACE_BLEND_SHAPE_TYPE_")
            return ts
        }
        return type.javaClass.simpleName ?: ""
    }

    private val INSTANCE_SHORT_BY_TYPE: Map<FaceBlendShapeType, String> = run {
        val m = HashMap<FaceBlendShapeType, String>()
        try {
            for (f in FaceBlendShapeType::class.java.fields) {
                val mods = f.modifiers
                if (!java.lang.reflect.Modifier.isStatic(mods)) continue
                if (!FaceBlendShapeType::class.java.isAssignableFrom(f.type)) continue
                val inst = f.get(null) as? FaceBlendShapeType ?: continue
                val raw = f.name
                if (raw == "CREATOR") continue
                val short = raw.removePrefix("FACE_BLEND_SHAPE_TYPE_")
                if (short.isNotEmpty()) m[inst] = short
            }
        } catch (e: Exception) {
            Log.w(TAG, "FaceBlendShapeType static field scan failed: ${e.message}")
        }
        if (m.isNotEmpty()) {
            Log.i(TAG, "FaceBlendShapeType instance map size=${m.size}")
        }
        m
    }

}
