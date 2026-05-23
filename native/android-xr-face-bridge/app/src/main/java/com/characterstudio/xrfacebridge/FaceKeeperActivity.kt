package com.characterstudio.xrfacebridge

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity

/**
 * Transparent 1×1 activity that stays the Jetpack XR [Session] host while Chrome runs WebXR.
 * Complements PiP on [MainActivity] — some Galaxy XR builds pause the PiP task during immersive AR.
 */
class FaceKeeperActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "CS-FaceKeeper"
        const val EXTRA_REASON = "reason"
        const val ACTION_FINISH = "com.characterstudio.xrfacebridge.FACE_KEEPER_FINISH"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (intent?.action == ACTION_FINISH) {
            Log.d(TAG, "finish requested")
            finish()
            return
        }
        if (!FaceHandoffState.isChromeHandoff()) {
            Log.w(TAG, "onCreate without chrome handoff — finishing keeper")
            finish()
            return
        }
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
        )
        window.setLayout(1, 1)
        val reason = intent?.getStringExtra(EXTRA_REASON) ?: "unknown"
        Log.i(TAG, "onCreate reason=$reason")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == ACTION_FINISH) {
            Log.d(TAG, "onNewIntent finish")
            finish()
        }
    }

    override fun onResume() {
        super.onResume()
        if (!FaceHandoffState.isChromeHandoff()) {
            Log.w(TAG, "onResume without chrome handoff — finishing keeper")
            finish()
            return
        }
        FaceKeeper.markResumed()
        FaceTrackingCoordinator.setActivity(this)
        FaceTrackingCoordinator.setSessionHost(this)
        FaceTrackingCoordinator.ensureFacePipeline("keeper-onResume")
        XrFaceTrackingEngine.tryReconfigureFaceSession("keeper-onResume")
        Log.i(TAG, "onResume — session host set (chrome handoff active)")
    }

    override fun onPause() {
        Log.d(TAG, "onPause")
        super.onPause()
    }

    override fun onDestroy() {
        FaceKeeper.markStopped()
        Log.d(TAG, "onDestroy finishing=$isFinishing")
        super.onDestroy()
    }
}
