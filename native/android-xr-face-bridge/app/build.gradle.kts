import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/** WebView entry URL. Physical headset must reach your PC — not 10.0.2.2 (emulator-only). */
fun readOpenNexus3dStudioUrl(): String {
    val f = rootProject.file("local.properties")
    if (f.exists()) {
        val p = Properties()
        f.inputStream().use { p.load(it) }
        val fromFile = p.getProperty("openNexus3dStudio.url")?.trim() ?: p.getProperty("characterStudio.url")?.trim()
        if (!fromFile.isNullOrEmpty()) return fromFile
    }
    // Set openNexus3dStudio.url in local.properties (see local.properties.example). Rebuild after changing.
    return "https://192.168.1.100:3000/"
}

android {
    namespace = "com.opennexus3dstudio.xrfacebridge"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.opennexus3dstudio.xrfacebridge"
        minSdk = 31
        targetSdk = 35
        versionCode = 9
        versionName = "0.1.8"
        resValue("string", "open_nexus_3d_studio_url", readOpenNexus3dStudioUrl())

        ndk {
            abiFilters += listOf("arm64-v8a")
        }
        externalNativeBuild {
            cmake {
                cppFlags += "-std=c++17"
                arguments += listOf("-DANDROID_STL=c++_shared")
            }
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
        prefab = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-service:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Jetpack XR — ARCore face blend shapes (Android XR / supported ARCore devices)
    implementation("androidx.xr.runtime:runtime:1.0.0-alpha13")
    implementation("androidx.xr.arcore:arcore:1.0.0-alpha13")
    compileOnly("com.android.extensions.xr:extensions-xr:1.1.0")

    // Dev relay: POST face payloads to Vite /__native_face_ingest (Chrome WebXR same-origin SSE)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Khronos loader (packages libopenxr_loader.so into APK). Galaxy XR has no system loader .so.
    implementation("org.khronos.openxr:openxr_loader_for_android:1.0.34")
}
