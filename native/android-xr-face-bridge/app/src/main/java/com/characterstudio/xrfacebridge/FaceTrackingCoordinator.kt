package com.characterstudio.xrfacebridge

import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.LifecycleOwner

/**
 * Jetpack XR (activity-bound) + OpenXR headless (FG-friendly) face → shared HTTP relay.
 * Does not change the web contract (`nativeFaceBridge.js` / `nativeFaceRelay.js`).
 */
object FaceTrackingCoordinator {

    fun setChromeHandoff(active: Boolean) {
        FaceHandoffState.setChromeHandoff(active)
    }

    fun isChromeHandoff(): Boolean = FaceHandoffState.isChromeHandoff()

    fun setWebView(webView: WebView?) {
        XrFaceTrackingEngine.setWebView(webView)
    }

    fun setSessionHost(owner: LifecycleOwner?) {
        XrFaceTrackingEngine.setSessionHost(owner)
    }

    fun setActivity(activity: AppCompatActivity?) {
        OpenXrFaceEngine.setActivity(activity)
    }

    fun setOpenXrSurface(surface: android.view.Surface?) {
        OpenXrFaceEngine.setSurface(surface)
    }

    fun lastPostAgeMs(): Long {
        return minOf(XrFaceTrackingEngine.lastPostAgeMs(), OpenXrFaceEngine.lastPostAgeMs())
    }

    fun start() {
        // OpenXR needs GLES + exclusive session on Galaxy XR; Jetpack only if OpenXR cannot start.
        OpenXrFaceEngine.start()
        val openXrActive = OpenXrFaceEngine.ensureFacePipelineSync("before-jetpack")
        if (!openXrActive) {
            XrFaceTrackingEngine.start()
        }
    }

    fun stop() {
        XrFaceTrackingEngine.stop()
        OpenXrFaceEngine.stop()
    }

    fun shutdown() {
        XrFaceTrackingEngine.shutdown()
        OpenXrFaceEngine.shutdown()
    }

    fun ensureFacePipeline(reason: String) {
        // Always try to keep the OpenXR headless engine alive as it handles background/Full Space best.
        OpenXrFaceEngine.ensureFacePipeline(reason)

        // Jetpack XR remains the primary path for WebView and Home Space, 
        // and as a fallback/parallel path during Chrome handoff.
        if (!OpenXrFaceEngine.isCollecting() || FaceHandoffState.isChromeHandoff()) {
            XrFaceTrackingEngine.ensureFacePipeline(reason)
        }
    }
}
