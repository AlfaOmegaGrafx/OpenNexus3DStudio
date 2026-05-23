package com.characterstudio.xrfacebridge

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URI
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * POSTs face payloads to the Character Studio dev server ([/__native_face_ingest])
 * so Chrome WebXR on the headset can subscribe via same-origin SSE ([/__native_face_sse]).
 */
object FaceHttpRelay {

    private const val TAG = "CS-FaceHttpRelay"
    private const val INGEST_PATH = "/__native_face_ingest"

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var client: OkHttpClient? = null
    private var ingestUrl: String? = null
    private var enabled = false
    private var loggedFirstPost = false
    private var successCount = 0
    private var lastFailureLogMs = 0L

    /**
     * @param characterStudioUrl e.g. https://YOUR_PC_LAN_IP:3000/ from [R.string.character_studio_url]
     * @param trustDevCerts when true (debug), accept self-signed mkcert for LAN dev HTTPS
     */
    @Synchronized
    fun configure(characterStudioUrl: String, trustDevCerts: Boolean) {
        val base = characterStudioUrl.trim().trimEnd('/')
        if (base.isEmpty()) {
            Log.w(TAG, "Empty character studio URL — relay disabled")
            stop()
            return
        }
        ingestUrl = try {
            val uri = URI(base)
            val portPart = if (uri.port > 0) ":${uri.port}" else ""
            "${uri.scheme}://${uri.host}$portPart$INGEST_PATH"
        } catch (e: Exception) {
            Log.e(TAG, "Invalid character studio URL: $characterStudioUrl", e)
            null
        }
        client = buildClient(trustDevCerts)
        enabled = ingestUrl != null
        loggedFirstPost = false
        if (enabled) {
            Log.i(TAG, "Face HTTP relay → $ingestUrl (trustDevCerts=$trustDevCerts)")
        }
    }

    @Synchronized
    fun stop() {
        enabled = false
        ingestUrl = null
        client = null
        loggedFirstPost = false
    }

    fun post(payload: JSONObject) {
        if (!enabled) return
        val url = ingestUrl ?: return
        val http = client ?: return
        val body = payload.toString()
        scope.launch {
            try {
                val req = Request.Builder()
                    .url(url)
                    .post(body.toRequestBody("application/json".toMediaType()))
                    .build()
                http.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        if (!loggedFirstPost) {
                            Log.w(
                                TAG,
                                "Ingest HTTP ${resp.code} $url — restart npm run dev on PC (relay plugin)"
                            )
                        }
                    } else {
                        successCount++
                        FaceHandoffState.recordRelayPostSuccess()
                        if (!loggedFirstPost || successCount == 30) {
                            loggedFirstPost = true
                            Log.i(TAG, "Face ingest OK #$successCount → $url (dev relay for Chrome WebXR)")
                        }
                    }
                }
            } catch (e: Exception) {
                val now = System.currentTimeMillis()
                if (!loggedFirstPost || now - lastFailureLogMs > 10_000L) {
                    lastFailureLogMs = now
                    Log.w(
                        TAG,
                        "Ingest failed (dev server / firewall?): ${e.message} handoff=${FaceHandoffState.isChromeHandoff()}",
                    )
                }
            }
        }
    }

    /** Stops relay posts; coroutine scope stays alive until process exit. */
    fun shutdown() {
        stop()
    }

    private fun buildClient(trustDevCerts: Boolean): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .connectTimeout(4, TimeUnit.SECONDS)
            .writeTimeout(4, TimeUnit.SECONDS)
            .readTimeout(4, TimeUnit.SECONDS)
        if (trustDevCerts) {
            val trustAll = object : X509TrustManager {
                override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
            }
            val ssl = SSLContext.getInstance("TLS").apply {
                init(null, arrayOf<TrustManager>(trustAll), java.security.SecureRandom())
            }
            builder.sslSocketFactory(ssl.socketFactory, trustAll)
            builder.hostnameVerifier { _, _ -> true }
        }
        return builder.build()
    }
}
