package com.characterstudio.xrfacebridge

import android.Manifest
import android.annotation.SuppressLint
import android.app.PictureInPictureParams
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.util.Rational
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.DocumentsContract
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.Menu
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.characterstudio.xrfacebridge.databinding.ActivityMainBinding

/**
 * WebView shell for Character Studio.
 * - Native: Jetpack XR → [window.onNativeFaceData] / [__characterStudioNativeFace] (APK WebView).
 * - Chrome WebXR: HTTP relay to dev server ([FaceHttpRelay]) + optional PiP.
 */
class MainActivity : AppCompatActivity() {

    private val faceTrackingPermission = "android.permission.FACE_TRACKING"

    private lateinit var binding: ActivityMainBinding

    private var openXrGlesSurface: Surface? = null

    private var webXrHintShown = false
    private var characterStudioPageReady = false
    /** Skip WebView pause when switching to Chrome so XR face collection is less likely to stall. */
    private var pausingForChrome = false

    private val facePermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { results ->
        val faceOk = results[faceTrackingPermission] == true
        val cameraOk = !results.containsKey(Manifest.permission.CAMERA) ||
            results[Manifest.permission.CAMERA] == true
        Log.d(TAG, "Face permissions face=$faceOk camera=$cameraOk results=$results")
        if (characterStudioPageReady && faceOk && cameraOk) {
            tryStartFaceTracking()
        }
    }

    private val recordAudioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        Log.d(TAG, "RECORD_AUDIO granted=$granted")
        if (!granted) {
            Toast.makeText(
                this,
                R.string.toast_microphone_denied,
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        Log.d(TAG, "POST_NOTIFICATIONS granted=$granted")
        requestFaceTrackingIfNeeded()
    }

    private var pendingWebViewPermissionRequest: PermissionRequest? = null

    private val webMediaPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val req = pendingWebViewPermissionRequest
        pendingWebViewPermissionRequest = null
        Log.d(TAG, "Web media permissions result=$results")
        if (req == null) return@registerForActivityResult
        val toGrant = mutableListOf<String>()
        if (req.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) &&
            results[Manifest.permission.RECORD_AUDIO] == true
        ) {
            toGrant.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
        }
        if (req.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE) &&
            results[Manifest.permission.CAMERA] == true
        ) {
            toGrant.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
        }
        if (toGrant.isEmpty()) {
            req.deny()
        } else {
            req.grant(toGrant.toTypedArray())
        }
    }

    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = filePathCallback
        filePathCallback = null
        if (result.resultCode != RESULT_OK) {
            callback?.onReceiveValue(null)
            return@registerForActivityResult
        }
        val data = result.data ?: run {
            callback?.onReceiveValue(null)
            return@registerForActivityResult
        }
        val uris = mutableListOf<Uri>()
        data.clipData?.let { clip ->
            for (i in 0 until clip.itemCount) {
                clip.getItemAt(i).uri?.let { uris.add(it) }
            }
        }
        if (uris.isEmpty()) {
            data.data?.let { uris.add(it) }
        }
        if (uris.isEmpty()) {
            callback?.onReceiveValue(null)
        } else {
            callback?.onReceiveValue(uris.toTypedArray())
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        FaceHandoffState.init(this)
        val freshLauncherStart =
            savedInstanceState == null &&
                intent?.action == Intent.ACTION_MAIN &&
                intent.hasCategory(Intent.CATEGORY_LAUNCHER)
        if (freshLauncherStart) {
            clearChromeHandoff()
        } else if (FaceHandoffState.canRestoreHandoffSession(isInPictureInPictureMode, pausingForChrome)) {
            FaceKeeper.acquire(this, "activity-restore-handoff")
        } else if (!isInPictureInPictureMode && !pausingForChrome) {
            clearChromeHandoff()
        }

        FaceHttpRelay.configure(getString(R.string.character_studio_url), BuildConfig.DEBUG)
        requestRuntimePermissionsInOrder()
        requestMicrophoneIfNeeded()

        setupOpenXrGraphicsSurface()

        binding.toolbar.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                R.id.action_web_back -> {
                    if (binding.webView.canGoBack()) {
                        binding.webView.goBack()
                        binding.toolbar.post { updateWebHistoryMenuState() }
                    }
                    true
                }
                R.id.action_web_forward -> {
                    if (binding.webView.canGoForward()) {
                        binding.webView.goForward()
                        binding.toolbar.post { updateWebHistoryMenuState() }
                    }
                    true
                }
                R.id.action_reload_page -> {
                    characterStudioPageReady = false
                    FaceTrackingCoordinator.stop()
                    binding.webView.reload()
                    true
                }
                R.id.action_open_browser -> {
                    openCharacterStudioInExternalBrowser()
                    true
                }
                else -> false
            }
        }

        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        binding.webView.apply {
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                    val msg = consoleMessage?.message() ?: ""
                    val src = consoleMessage?.sourceId() ?: ""
                    val line = consoleMessage?.lineNumber() ?: 0
                    Log.d(TAG, "console: $msg @ $src:$line")
                    return true
                }

                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    if (newProgress == 100) {
                        Log.d(TAG, "page load 100%")
                    }
                }

                override fun onPermissionRequest(request: PermissionRequest?) {
                    if (request == null) return
                    val resources = request.resources
                    val wantsAudio = resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    val wantsVideo = resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    if (!wantsAudio && !wantsVideo) {
                        Log.d(TAG, "onPermissionRequest: unsupported ${resources.contentToString()} — deny")
                        request.deny()
                        return
                    }
                    val missing = mutableListOf<String>()
                    if (wantsAudio &&
                        ContextCompat.checkSelfPermission(
                                this@MainActivity,
                                Manifest.permission.RECORD_AUDIO
                            ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        missing.add(Manifest.permission.RECORD_AUDIO)
                    }
                    if (wantsVideo &&
                        ContextCompat.checkSelfPermission(
                                this@MainActivity,
                                Manifest.permission.CAMERA
                            ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        missing.add(Manifest.permission.CAMERA)
                    }
                    if (missing.isEmpty()) {
                        val grant = resources.filter { r ->
                            r == PermissionRequest.RESOURCE_AUDIO_CAPTURE ||
                                r == PermissionRequest.RESOURCE_VIDEO_CAPTURE
                        }.toTypedArray()
                        request.grant(grant)
                        return
                    }
                    if (pendingWebViewPermissionRequest != null) {
                        request.deny()
                        return
                    }
                    pendingWebViewPermissionRequest = request
                    webMediaPermissionLauncher.launch(missing.toTypedArray())
                }

                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    this@MainActivity.filePathCallback?.onReceiveValue(null)
                    if (filePathCallback == null) return false
                    this@MainActivity.filePathCallback = filePathCallback

                    val allowMultiple =
                        fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE

                    val openDoc = buildOpenDocumentIntent(allowMultiple)
                    prepareFileChooserIntent(openDoc)

                    val chooser = Intent.createChooser(
                        openDoc,
                        getString(R.string.file_picker_title)
                    )

                    try {
                        fileChooserLauncher.launch(chooser)
                    } catch (e: Exception) {
                        Log.e(TAG, "Cannot launch file chooser", e)
                        this@MainActivity.filePathCallback?.onReceiveValue(null)
                        this@MainActivity.filePathCallback = null
                        Toast.makeText(
                            this@MainActivity,
                            "No app available to pick files",
                            Toast.LENGTH_SHORT
                        ).show()
                        return false
                    }
                    return true
                }
            }

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean = false

                override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                    Log.d(TAG, "onPageStarted $url")
                    updateWebHistoryMenuState()
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    Log.d(TAG, "onPageFinished $url")
                    characterStudioPageReady = true
                    updateWebHistoryMenuState()
                    tryStartFaceTracking()
                    val act = this@MainActivity
                    act.runOnUiThread {
                        if (!act.webXrHintShown) {
                            act.webXrHintShown = true
                            Toast.makeText(
                                act,
                                R.string.toast_webxr_webview,
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                }

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    val desc = error?.description?.toString() ?: "unknown"
                    val code = error?.errorCode ?: -1
                    val isMain = request?.isForMainFrame == true
                    Log.e(TAG, "onReceivedError main=$isMain code=$code $desc url=${request?.url}")
                    if (isMain && BuildConfig.DEBUG) {
                        runOnUiThread {
                            Toast.makeText(
                                this@MainActivity,
                                "WebView error: $desc",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                }

                @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
                override fun onReceivedSslError(
                    view: WebView?,
                    handler: SslErrorHandler?,
                    error: android.net.http.SslError?
                ) {
                    if (BuildConfig.DEBUG) {
                        Log.w(TAG, "SSL error (debug only — proceeding): ${error?.toString()}")
                        handler?.proceed()
                    } else {
                        Log.e(TAG, "SSL error (release — cancel): ${error?.toString()}")
                        handler?.cancel()
                    }
                }
            }

            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.javaScriptCanOpenWindowsAutomatically = true

            addJavascriptInterface(
                AndroidXrBridgeInterface {
                    runOnUiThread {
                        if (isFinishing) return@runOnUiThread
                        Log.i(TAG, "AndroidXRBridge.onBridgeReady — web native face hook active")
                        FaceTrackingCoordinator.setWebView(binding.webView)
                        if (characterStudioPageReady) {
                            tryStartFaceTracking()
                        }
                        FaceTrackingCoordinator.ensureFacePipeline("bridge-ready")
                    }
                },
                "AndroidXRBridge"
            )

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                settings.mixedContentMode =
                    android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                CookieManager.getInstance().setAcceptCookie(true)
                CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            }
        }

        val url = getString(R.string.character_studio_url)
        Log.i(TAG, "loadUrl $url (debug=${BuildConfig.DEBUG})")
        binding.webView.loadUrl(url)
        binding.toolbar.post { updateWebHistoryMenuState() }
    }

    /** Keeps a tiny GLES buffer alive for OpenXR session binding (TextureView works behind WebView). */
    private fun setupOpenXrGraphicsSurface() {
        val textureView = binding.openXrTexture
        textureView.isOpaque = false
        textureView.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
            override fun onSurfaceTextureAvailable(texture: SurfaceTexture, width: Int, height: Int) {
                texture.setDefaultBufferSize(1, 1)
                releaseOpenXrGlesSurface()
                openXrGlesSurface = Surface(texture)
                publishOpenXrGlesSurface("texture-available")
            }

            override fun onSurfaceTextureSizeChanged(texture: SurfaceTexture, width: Int, height: Int) {
                texture.setDefaultBufferSize(1, 1)
                publishOpenXrGlesSurface("texture-resized")
            }

            override fun onSurfaceTextureDestroyed(texture: SurfaceTexture): Boolean {
                FaceTrackingCoordinator.setOpenXrSurface(null)
                releaseOpenXrGlesSurface()
                return true
            }

            override fun onSurfaceTextureUpdated(texture: SurfaceTexture) {
                /* no-op */
            }
        }
        if (textureView.isAvailable) {
            textureView.surfaceTexture?.let { texture ->
                texture.setDefaultBufferSize(1, 1)
                releaseOpenXrGlesSurface()
                openXrGlesSurface = Surface(texture)
                publishOpenXrGlesSurface("texture-already-available")
            }
        } else {
            textureView.post { publishOpenXrGlesSurface("post-init") }
        }
    }

    private fun publishOpenXrGlesSurface(reason: String) {
        val surface = openXrGlesSurface
        if (surface != null && surface.isValid) {
            Log.d(TAG, "OpenXR GLES surface $reason (${surface.hashCode()})")
            FaceTrackingCoordinator.setOpenXrSurface(surface)
        } else {
            Log.w(TAG, "OpenXR GLES surface $reason — not valid yet")
        }
    }

    private fun releaseOpenXrGlesSurface() {
        try {
            openXrGlesSurface?.release()
        } catch (e: Exception) {
            Log.w(TAG, "release OpenXR GLES surface", e)
        }
        openXrGlesSurface = null
    }

    private fun updateWebHistoryMenuState() {
        val menu: Menu = binding.toolbar.menu ?: return
        menu.findItem(R.id.action_web_back)?.isEnabled = binding.webView.canGoBack()
        menu.findItem(R.id.action_web_forward)?.isEnabled = binding.webView.canGoForward()
    }

    private fun openCharacterStudioInExternalBrowser() {
        pausingForChrome = true
        FaceTrackingCoordinator.setChromeHandoff(true)
        FaceKeeper.acquire(this, "pre-chrome")
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val url = buildCharacterStudioUrlForChromeWebXr()
        Toast.makeText(this, R.string.toast_face_bridge_chrome, Toast.LENGTH_LONG).show()
        tryStartFaceTracking()
        FaceTrackingCoordinator.ensureFacePipeline("pre-chrome")

        val launchChrome = { launchChromeForWebXr(url) }
        val enteredPiP = enterFaceBridgePictureInPicture()
        if (enteredPiP) {
            binding.root.postDelayed(launchChrome, 450)
        } else {
            Toast.makeText(this, R.string.toast_pip_unavailable, Toast.LENGTH_LONG).show()
            launchChrome()
        }
    }

    private fun launchChromeForWebXr(url: String) {
        val uri = Uri.parse(url)
        val packages = listOf(
            "com.android.chrome",
            "com.chrome.beta",
            "com.google.android.apps.chrome",
            "com.sec.android.app.sbrowser",
            "com.microsoft.emmx",
        )
        for (pkg in packages) {
            try {
                startActivity(
                    Intent(Intent.ACTION_VIEW, uri).apply {
                        setPackage(pkg)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    },
                )
                Log.i(TAG, "Opened Chrome WebXR package=$pkg pip=${isInPictureInPictureMode}")
                FaceTrackingCoordinator.ensureFacePipeline("post-chrome-launch")
                return
            } catch (_: ActivityNotFoundException) {
                /* try next */
            }
        }
        try {
            startActivity(
                Intent.createChooser(
                    Intent(Intent.ACTION_VIEW, uri).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    },
                    getString(R.string.choose_browser),
                ),
            )
            FaceTrackingCoordinator.ensureFacePipeline("post-chrome-launch")
        } catch (e: Exception) {
            clearChromeHandoff()
            Log.e(TAG, "No browser for WebXR", e)
            Toast.makeText(this, R.string.choose_browser, Toast.LENGTH_LONG).show()
        }
    }

    private fun clearChromeHandoff() {
        pausingForChrome = false
        FaceTrackingCoordinator.setChromeHandoff(false)
        FaceKeeper.release(this)
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    /**
     * Jetpack XR face needs this activity visible. PiP keeps the process "active" while Chrome is
     * foreground so HTTP relay ingest continues for Chrome WebXR.
     */
    private fun enterFaceBridgePictureInPicture(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        
        // Some XR devices might not report the FEATURE_PICTURE_IN_PICTURE flag 
        // but still support a version of it or multi-tasking. 
        // We'll try to enter it and catch failures.
        if (isInPictureInPictureMode) return true

        Log.d(TAG, "Attempting to enter PiP...")
        return try {
            val builder = PictureInPictureParams.Builder()
                .setAspectRatio(Rational(1, 1))

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                builder.setAutoEnterEnabled(true)
                builder.setSeamlessResizeEnabled(true)
            }

            val params = builder.build()
            setPictureInPictureParams(params)

            val ok = enterPictureInPictureMode(params)
            if (ok) {
                Log.i(TAG, "enterPictureInPictureMode returned true")
                FaceTrackingCoordinator.ensureFacePipeline("pip-enter")
            } else {
                Log.w(TAG, "enterPictureInPictureMode returned false")
            }
            ok
        } catch (e: Exception) {
            Log.w(TAG, "enterPictureInPictureMode threw exception: ${e.message}")
            false
        }
    }

    private fun buildOpenDocumentIntent(allowMultiple: Boolean): Intent {
        return Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple)
        }
    }

    private fun prepareFileChooserIntent(intent: Intent) {
        intent.type = "*/*"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try {
                intent.putExtra("android.content.extra.SHOW_ADVANCED", true)
            } catch (e: Exception) {
                Log.d(TAG, "SHOW_ADVANCED not applied", e)
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                intent.putExtra(
                    DocumentsContract.EXTRA_INITIAL_URI,
                    DocumentsContract.buildDocumentUri(
                        EXTERNAL_STORAGE_AUTHORITY,
                        PRIMARY_ROOT_DOCUMENT_ID
                    )
                )
            } catch (e: Exception) {
                Log.w(TAG, "EXTRA_INITIAL_URI not set", e)
            }
        }
    }

    private fun requestRuntimePermissionsInOrder() {
        if (needsNotificationPermission()) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        requestFaceTrackingIfNeeded()
    }

    private fun needsNotificationPermission(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
    }

    private fun requestFaceTrackingIfNeeded() {
        val missing = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, faceTrackingPermission) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            missing.add(faceTrackingPermission)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            missing.add(Manifest.permission.CAMERA)
        }
        if (missing.isEmpty()) return
        facePermissionsLauncher.launch(missing.toTypedArray())
    }

    private fun requestMicrophoneIfNeeded() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        recordAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }


    private fun buildCharacterStudioUrlForChromeWebXr(): String {
        val base = getString(R.string.character_studio_url).trim()
        val uri = Uri.parse(base)
        var builder = uri.buildUpon()
        if (uri.getQueryParameter("nativeFaceRelay") == null) {
            builder = builder.appendQueryParameter("nativeFaceRelay", "1")
        }
        if (uri.getQueryParameter("remoteLog") == null) {
            builder = builder.appendQueryParameter("remoteLog", "1")
        }
        return builder.build().toString()
    }

    private fun tryStartFaceTracking() {
        if (!characterStudioPageReady) return
        if (ContextCompat.checkSelfPermission(this, faceTrackingPermission) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        safeStartForegroundService()
        try {
            FaceTrackingCoordinator.setActivity(this)
            FaceTrackingCoordinator.setSessionHost(this)
            FaceTrackingCoordinator.setWebView(binding.webView)
            FaceTrackingCoordinator.start()
            FaceTrackingCoordinator.ensureFacePipeline("activity-start")
            Log.i(TAG, "FaceTrackingCoordinator started (FG service + HTTP relay)")
        } catch (e: Exception) {
            Log.e(TAG, "FaceTrackingCoordinator start failed", e)
        }
    }

    private fun safeStartForegroundService() {
        if (needsNotificationPermission()) {
            Log.w(TAG, "Deferring foreground service until POST_NOTIFICATIONS is granted")
            return
        }
        try {
            FaceBridgeForegroundService.start(this)
        } catch (e: Exception) {
            Log.e(TAG, "FaceBridgeForegroundService.start failed", e)
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (pausingForChrome) {
            enterFaceBridgePictureInPicture()
        }
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        Log.d(TAG, "PiP mode=$isInPictureInPictureMode")
        if (isInPictureInPictureMode) {
            FaceTrackingCoordinator.setChromeHandoff(true)
            FaceKeeper.acquire(this, "pip-mode")
            FaceTrackingCoordinator.ensureFacePipeline("pip-mode-changed")
        } else if (!pausingForChrome) {
            clearChromeHandoff()
        }
    }

    override fun onResume() {
        super.onResume()
        if (FaceHandoffState.canRestoreHandoffSession(isInPictureInPictureMode, pausingForChrome)) {
            if (!FaceKeeper.isActive()) {
                FaceKeeper.acquire(this, "activity-resume-handoff")
            }
        } else if (!isInPictureInPictureMode && !pausingForChrome) {
            clearChromeHandoff()
        }
        binding.webView.onResume()
        binding.webView.post {
            binding.webView.evaluateJavascript(
                "(function(){try{if(typeof window.__characterStudioWebViewResume==='function'){" +
                    "window.__characterStudioWebViewResume();}}catch(e){console.warn('CS WebView resume',e);}})()",
                null
            )
        }
        FaceTrackingCoordinator.setActivity(this)
        if (!FaceHandoffState.isChromeHandoff() || !FaceKeeper.isActive()) {
            FaceTrackingCoordinator.setSessionHost(this)
        }
        FaceTrackingCoordinator.setWebView(binding.webView)
        binding.openXrTexture.post { publishOpenXrGlesSurface("resume") }
        tryStartFaceTracking()
        binding.webView.postDelayed({
            if (!isFinishing) FaceTrackingCoordinator.ensureFacePipeline("activity-resume-delay")
        }, 800)
    }

    override fun onPause() {
        val chromeHandoff = pausingForChrome || isInPictureInPictureMode
        if (!chromeHandoff) {
            binding.webView.onPause()
        } else {
            Log.d(TAG, "onPause: keeping WebView active (chrome handoff / PiP)")
        }
        if (pausingForChrome || isInPictureInPictureMode) {
            FaceTrackingCoordinator.setChromeHandoff(true)
        }
        FaceTrackingCoordinator.ensureFacePipeline("activity-onPause")
        super.onPause()
    }

    override fun onStop() {
        FaceTrackingCoordinator.ensureFacePipeline("activity-onStop")
        super.onStop()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (binding.webView.canGoBack()) {
            binding.webView.goBack()
            binding.toolbar.post { updateWebHistoryMenuState() }
            return
        }
        @Suppress("DEPRECATION")
        super.onBackPressed()
    }

    override fun onDestroy() {
        pendingWebViewPermissionRequest?.deny()
        pendingWebViewPermissionRequest = null
        FaceTrackingCoordinator.setWebView(null)
        releaseOpenXrGlesSurface()
        if (isFinishing) {
            FaceTrackingCoordinator.setActivity(null)
            FaceTrackingCoordinator.setSessionHost(null)
            FaceTrackingCoordinator.shutdown()
            FaceBridgeForegroundService.stop(this)
            FaceHttpRelay.shutdown()
        }
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        super.onDestroy()
    }

    companion object {
        private const val TAG = "CS-XR-WebView"
        private const val EXTERNAL_STORAGE_AUTHORITY = "com.android.externalstorage.documents"
        private const val PRIMARY_ROOT_DOCUMENT_ID = "primary:"
    }
}
