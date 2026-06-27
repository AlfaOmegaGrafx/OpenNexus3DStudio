package com.opennexus3dstudio.xrfacebridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Keeps the process alive; Jetpack + OpenXR headless face → HTTP relay while Chrome WebXR runs.
 */
class FaceBridgeForegroundService : LifecycleService() {

    private var wakeLock: PowerManager.WakeLock? = null
    private var watchdogJob: Job? = null

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        return null
    }

    override fun onCreate() {
        super.onCreate()
        FaceHandoffState.init(this)
        ensureChannel()
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC or
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
                // FOREGROUND_SERVICE_TYPE_MICROPHONE requires API 34+ (Android 14).
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                }
                startForeground(NOTIFICATION_ID, buildNotification(), types)
            } else {
                startForeground(NOTIFICATION_ID, buildNotification())
            }
        } catch (e: Exception) {
            Log.e(TAG, "startForeground failed — check POST_NOTIFICATIONS / CAMERA", e)
            stopSelf()
            return START_NOT_STICKY
        }
        FaceHandoffState.restore()
        if (FaceHandoffState.isChromeHandoff()) {
            FaceKeeper.acquire(this, "fg-service-start")
        }
        FaceTrackingCoordinator.start()
        startWatchdog()
        Log.i(
            TAG,
            "Foreground face bridge running handoff=${FaceHandoffState.isChromeHandoff()} " +
                "keeper=${FaceKeeper.isActive()} host=${XrFaceTrackingEngine.hasSessionHost()}",
        )
        return START_STICKY
    }

    override fun onDestroy() {
        stopWatchdog()
        releaseWakeLock()
        FaceTrackingCoordinator.stop()
        FaceHttpRelay.shutdown()
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    private fun startWatchdog() {
        if (watchdogJob?.isActive == true) return
        watchdogJob = lifecycleScope.launch {
            while (isActive) {
                delay(
                    if (FaceHandoffState.isChromeHandoff()) WATCHDOG_INTERVAL_CHROME_MS
                    else WATCHDOG_INTERVAL_MS,
                )
                val age = FaceTrackingCoordinator.lastPostAgeMs()
                val staleMs = FaceHandoffState.effectiveStaleMs()
                val jetpackCollecting = XrFaceTrackingEngine.isCollecting()
                if (FaceHandoffState.isChromeHandoff()) {
                    if (!XrFaceTrackingEngine.hasSessionHost() || !FaceKeeper.isActive()) {
                        Log.w(
                            TAG,
                            "Watchdog: chrome handoff but host=${XrFaceTrackingEngine.hasSessionHost()} " +
                                "keeper=${FaceKeeper.isActive()} — starting FaceKeeper",
                        )
                        FaceKeeper.acquire(this@FaceBridgeForegroundService, "fg-watchdog-no-host")
                    }
                }
                if (age > staleMs) {
                    if (FaceHandoffState.isChromeHandoff() && jetpackCollecting) {
                        Log.d(
                            TAG,
                            "Watchdog: relay quiet ${age}ms but Jetpack collector active — keep session",
                        )
                    } else {
                        Log.d(
                            TAG,
                            "Watchdog: relay stale ${age}ms (threshold=${staleMs}ms " +
                                "handoff=${FaceHandoffState.isChromeHandoff()}) — nudge pipeline",
                        )
                    }
                }
                if (
                    FaceHandoffState.isChromeHandoff() &&
                    age > 3_000L &&
                    XrFaceTrackingEngine.hasSessionHost()
                ) {
                    XrFaceTrackingEngine.tryReconfigureFaceSession("fg-watchdog-stale-relay")
                }
                FaceTrackingCoordinator.ensureFacePipeline("fg-watchdog")
            }
        }
    }

    private fun stopWatchdog() {
        watchdogJob?.cancel()
        watchdogJob = null
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(POWER_SERVICE) as? PowerManager ?: return
        if (wakeLock?.isHeld == true) return
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "OpenNexus3dStudio:FaceBridge"
        ).apply {
            setReferenceCounted(false)
            acquire(WAKE_LOCK_TIMEOUT_MS)
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let { if (it.isHeld) it.release() }
        } catch (e: Exception) {
            Log.w(TAG, "Wake lock release", e)
        }
        wakeLock = null
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.face_bridge_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.face_bridge_channel_desc)
        }
        mgr.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val age = FaceTrackingCoordinator.lastPostAgeMs()
        val staleMs = FaceHandoffState.effectiveStaleMs()
        val status = when {
            age <= staleMs -> getString(R.string.face_bridge_notification_live)
            FaceHandoffState.isChromeHandoff() -> getString(R.string.face_bridge_notification_chrome)
            age < 60_000 -> getString(R.string.face_bridge_notification_stale)
            else -> getString(R.string.face_bridge_notification_text)
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_app_icon)
            .setContentTitle(getString(R.string.face_bridge_notification_title))
            .setContentText(status)
            .setContentIntent(openApp)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    companion object {
        private const val TAG = "ON-FaceBridgeSvc"
        private const val CHANNEL_ID = "on_face_bridge"
        private const val NOTIFICATION_ID = 4102
        private const val WATCHDOG_INTERVAL_MS = 1000L
        private const val WATCHDOG_INTERVAL_CHROME_MS = 2000L
        private const val WAKE_LOCK_TIMEOUT_MS = 4L * 60L * 60L * 1000L

        @Volatile
        private var running = false

        fun isRunning(): Boolean = running

        fun start(context: Context) {
            val intent = Intent(context, FaceBridgeForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            running = true
        }

        fun stop(context: Context) {
            running = false
            context.stopService(Intent(context, FaceBridgeForegroundService::class.java))
        }
    }
}
