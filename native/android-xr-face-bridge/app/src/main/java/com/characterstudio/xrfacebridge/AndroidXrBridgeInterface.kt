package com.characterstudio.xrfacebridge

import android.webkit.JavascriptInterface

/**
 * WebView → native handshake. The web app calls [onBridgeReady] after
 * [initNativeFaceBridge] so Jetpack face can target a live JS receiver.
 */
class AndroidXrBridgeInterface(
    private val onReady: () -> Unit
) {
    @JavascriptInterface
    fun onBridgeReady() {
        onReady()
    }
}
