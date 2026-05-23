#include "openxr_face_engine.h"
#include "openxr_gfx_egl.h"

#include <android/log.h>
#include <android/native_window_jni.h>
#include <dlfcn.h>

#define XR_USE_PLATFORM_ANDROID
#define XR_USE_GRAPHICS_API_OPENGL_ES
#define XR_USE_TIMESPEC
#include <openxr/openxr.h>
#include <openxr/openxr_platform.h>

#include <chrono>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#define LOG_TAG "CS-OpenXrNative"
#define ALOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define ALOGW(...) __android_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)
#define ALOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace cs::openxr {
namespace {

constexpr int kFaceParamCount = 68;
constexpr int kTargetHz = 30;
constexpr int64_t kStaleMs = 5000;

#define XR_CHECK(expr, msg)                                 \
    do {                                                    \
        const XrResult _xr = (expr);                        \
        if (XR_FAILED(_xr)) {                               \
            ALOGE("%s failed: %d", (msg), static_cast<int>(_xr)); \
            return false;                                   \
        }                                                   \
    } while (0)

std::mutex g_mutex;
JavaVM* g_vm = nullptr;
jobject g_activity_global = nullptr;
jobject g_callback_global = nullptr;
jmethodID g_on_face_method = nullptr;

std::atomic<bool> g_running{false};
std::atomic<bool> g_stop_requested{false};
std::thread g_worker;
std::atomic<int64_t> g_last_post_ms{0};

XrInstance g_instance = XR_NULL_HANDLE;
XrSession g_session = XR_NULL_HANDLE;
XrFaceTrackerANDROID g_face_tracker = XR_NULL_HANDLE;
ANativeWindow* g_native_window = nullptr;

void* g_loader_lib = nullptr;

PFN_xrGetInstanceProcAddr xrGetInstanceProcAddr = nullptr;
PFN_xrInitializeLoaderKHR xrInitializeLoaderKHR = nullptr;
PFN_xrCreateInstance xrCreateInstance = nullptr;
PFN_xrDestroyInstance xrDestroyInstance = nullptr;
PFN_xrGetSystem xrGetSystem = nullptr;
PFN_xrCreateSession xrCreateSession = nullptr;
PFN_xrDestroySession xrDestroySession = nullptr;
PFN_xrBeginSession xrBeginSession = nullptr;
PFN_xrEndSession xrEndSession = nullptr;
PFN_xrCreateFaceTrackerANDROID xrCreateFaceTrackerANDROID = nullptr;
PFN_xrDestroyFaceTrackerANDROID xrDestroyFaceTrackerANDROID = nullptr;
PFN_xrGetFaceStateANDROID xrGetFaceStateANDROID = nullptr;
PFN_xrGetOpenGLESGraphicsRequirementsKHR xrGetOpenGLESGraphicsRequirementsKHR = nullptr;

bool LoadCoreProc(const char* name, PFN_xrVoidFunction* pfn) {
    if (!xrGetInstanceProcAddr) return false;
    const XrResult r = xrGetInstanceProcAddr(XR_NULL_HANDLE, name, pfn);
    return XR_SUCCEEDED(r) && *pfn != nullptr;
}

bool TryDlopenLoader(const char* lib_name) {
    void* handle = dlopen(lib_name, RTLD_NOW);
    if (!handle) {
        ALOGW("dlopen %s failed: %s", lib_name, dlerror());
        return false;
    }
    auto* proc = reinterpret_cast<PFN_xrGetInstanceProcAddr>(dlsym(handle, "xrGetInstanceProcAddr"));
    if (!proc) {
        ALOGW("%s: xrGetInstanceProcAddr missing", lib_name);
        dlclose(handle);
        return false;
    }
    g_loader_lib = handle;
    xrGetInstanceProcAddr = proc;
    ALOGI("OpenXR loader loaded from %s", lib_name);
    return true;
}

bool ResolveLoader() {
    if (xrGetInstanceProcAddr == nullptr) {
        static const char* kLoaderLibs[] = {"libopenxr_loader.so"};
        for (const char* name : kLoaderLibs) {
            if (TryDlopenLoader(name)) break;
        }
        if (xrGetInstanceProcAddr == nullptr) {
            ALOGE("OpenXR loader resolution failed (no libopenxr_loader.so)");
            return false;
        }
    }
    // Only null-instance entry points here; instance procs need a valid XrInstance (see LoadInstanceCoreProcs).
    return LoadCoreProc("xrInitializeLoaderKHR",
                        reinterpret_cast<PFN_xrVoidFunction*>(&xrInitializeLoaderKHR)) &&
           LoadCoreProc("xrCreateInstance",
                        reinterpret_cast<PFN_xrVoidFunction*>(&xrCreateInstance));
}

bool LoadInstanceCoreProcs(XrInstance instance) {
    auto load = [&](const char* name, auto& pfn) -> bool {
        const XrResult r = xrGetInstanceProcAddr(instance, name,
                                               reinterpret_cast<PFN_xrVoidFunction*>(&pfn));
        if (XR_FAILED(r) || pfn == nullptr) {
            ALOGE("Missing OpenXR instance proc: %s", name);
            return false;
        }
        return true;
    };
    return load("xrDestroyInstance", xrDestroyInstance) && load("xrGetSystem", xrGetSystem) &&
           load("xrCreateSession", xrCreateSession) && load("xrDestroySession", xrDestroySession) &&
           load("xrBeginSession", xrBeginSession) && load("xrEndSession", xrEndSession) &&
           load("xrGetOpenGLESGraphicsRequirementsKHR", xrGetOpenGLESGraphicsRequirementsKHR);
}

int64_t NowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

bool LoadExtensionPointers(XrInstance instance) {
    auto load = [&](const char* name, auto& pfn) -> bool {
        const XrResult r = xrGetInstanceProcAddr(instance, name,
                                                 reinterpret_cast<PFN_xrVoidFunction*>(&pfn));
        if (XR_FAILED(r) || pfn == nullptr) {
            ALOGW("Missing OpenXR entry point: %s", name);
            return false;
        }
        return true;
    };
    return load("xrCreateFaceTrackerANDROID", xrCreateFaceTrackerANDROID) &&
           load("xrDestroyFaceTrackerANDROID", xrDestroyFaceTrackerANDROID) &&
           load("xrGetFaceStateANDROID", xrGetFaceStateANDROID);
}

bool InitLoader(JNIEnv* env) {
    if (g_vm == nullptr) {
        env->GetJavaVM(&g_vm);
    }
    if (g_activity_global == nullptr) {
        ALOGE("SetActivity must be called before Start");
        return false;
    }
    if (!ResolveLoader() || !xrInitializeLoaderKHR) {
        ALOGE("OpenXR loader resolution failed");
        return false;
    }
    XrLoaderInitInfoAndroidKHR loaderInfo{XR_TYPE_LOADER_INIT_INFO_ANDROID_KHR};
    loaderInfo.applicationVM = g_vm;
    loaderInfo.applicationContext = g_activity_global;
    const XrResult initRes =
        xrInitializeLoaderKHR(reinterpret_cast<XrLoaderInitInfoBaseHeaderKHR*>(&loaderInfo));
    if (XR_FAILED(initRes)) {
        ALOGE("xrInitializeLoaderKHR failed: %d", static_cast<int>(initRes));
        return false;
    }
    return true;
}

void LogApiVersion(XrVersion version) {
    ALOGI("Trying OpenXR apiVersion %u.%u.%u", XR_VERSION_MAJOR(version), XR_VERSION_MINOR(version),
          XR_VERSION_PATCH(version));
}

const char* ResultName(XrResult result) {
    switch (result) {
        case XR_ERROR_API_VERSION_UNSUPPORTED:
            return "XR_ERROR_API_VERSION_UNSUPPORTED";
        case XR_ERROR_EXTENSION_NOT_PRESENT:
            return "XR_ERROR_EXTENSION_NOT_PRESENT";
        case XR_ERROR_RUNTIME_UNAVAILABLE:
            return "XR_ERROR_RUNTIME_UNAVAILABLE";
        case XR_ERROR_INITIALIZATION_FAILED:
            return "XR_ERROR_INITIALIZATION_FAILED";
        default:
            return "XrResult";
    }
}

bool CreateInstanceWithApiVersion(XrVersion apiVersion, XrInstance* outInstance) {
    const char* extensions[] = {XR_KHR_ANDROID_CREATE_INSTANCE_EXTENSION_NAME,
                                XR_ANDROID_FACE_TRACKING_EXTENSION_NAME,
                                XR_KHR_OPENGL_ES_ENABLE_EXTENSION_NAME};

    XrInstanceCreateInfoAndroidKHR androidInfo{XR_TYPE_INSTANCE_CREATE_INFO_ANDROID_KHR};
    androidInfo.applicationVM = g_vm;
    androidInfo.applicationActivity = g_activity_global;

    XrInstanceCreateInfo ici{XR_TYPE_INSTANCE_CREATE_INFO};
    ici.next = reinterpret_cast<XrBaseInStructure*>(&androidInfo);
    ici.enabledExtensionCount = 3;
    ici.enabledExtensionNames = extensions;
    std::strncpy(ici.applicationInfo.applicationName, "CS XR Face Bridge",
                 XR_MAX_APPLICATION_NAME_SIZE - 1);
    ici.applicationInfo.applicationVersion = 1;
    std::strncpy(ici.applicationInfo.engineName, "CharacterStudio", XR_MAX_ENGINE_NAME_SIZE - 1);
    ici.applicationInfo.engineVersion = 1;
    ici.applicationInfo.apiVersion = apiVersion;

    LogApiVersion(apiVersion);
    const XrResult r = xrCreateInstance(&ici, outInstance);
    if (XR_FAILED(r)) {
        ALOGE("xrCreateInstance failed: %d (%s)", static_cast<int>(r), ResultName(r));
        return false;
    }
    return true;
}

bool CreateSessionForSystem(XrSystemId systemId) {
    XrResult r = XR_ERROR_RUNTIME_FAILURE;
    int glesMajor = 3;

    if (xrGetOpenGLESGraphicsRequirementsKHR) {
        XrGraphicsRequirementsOpenGLESKHR gfxReq{XR_TYPE_GRAPHICS_REQUIREMENTS_OPENGL_ES_KHR};
        const XrResult reqRes =
            xrGetOpenGLESGraphicsRequirementsKHR(g_instance, systemId, &gfxReq);
        if (XR_FAILED(reqRes)) {
            ALOGE("xrGetOpenGLESGraphicsRequirementsKHR failed: %d", static_cast<int>(reqRes));
            return false;
        }
        const int minMajor = static_cast<int>(XR_VERSION_MAJOR(gfxReq.minApiVersionSupported));
        const int maxMajor = static_cast<int>(XR_VERSION_MAJOR(gfxReq.maxApiVersionSupported));
        glesMajor = maxMajor >= 3 ? 3 : minMajor;
        if (glesMajor < 2) glesMajor = 2;
        ALOGI("OpenXR GLES requirements min=%u.%u max=%u.%u (using ES %d)", minMajor,
              XR_VERSION_MINOR(gfxReq.minApiVersionSupported), maxMajor,
              XR_VERSION_MINOR(gfxReq.maxApiVersionSupported), glesMajor);
    } else {
        ALOGW("xrGetOpenGLESGraphicsRequirementsKHR unavailable");
    }

    // GLES binding needs display/config/context only — PBuffer avoids window-surface quirks.
    if (InitEglPbuffer(glesMajor) && HasEgl()) {
            XrGraphicsBindingOpenGLESAndroidKHR glBinding{
                XR_TYPE_GRAPHICS_BINDING_OPENGL_ES_ANDROID_KHR};
            glBinding.display = GetEglDisplay();
            glBinding.config = GetEglConfig();
            glBinding.context = GetEglContext();
            XrSessionCreateInfo sciGl{XR_TYPE_SESSION_CREATE_INFO};
            sciGl.next = reinterpret_cast<XrBaseInStructure*>(&glBinding);
            sciGl.systemId = systemId;
            r = xrCreateSession(g_instance, &sciGl, &g_session);
            if (XR_SUCCEEDED(r)) {
                ALOGI("OpenXR session created with GLES binding");
                return true;
            }
            ALOGE("xrCreateSession (GLES) failed: %d", static_cast<int>(r));
    } else {
        ALOGE("GLES binding unavailable (EGL init failed)");
    }

    XrSessionCreateInfo sci{XR_TYPE_SESSION_CREATE_INFO};
    sci.systemId = systemId;
    r = xrCreateSession(g_instance, &sci, &g_session);
    if (XR_SUCCEEDED(r)) {
        ALOGI("OpenXR session created (no explicit graphics binding)");
        return true;
    }
    ALOGW("xrCreateSession (no binding) failed: %d", static_cast<int>(r));
    return false;
}

bool CreateInstanceAndSession() {
    // Runtime reports max OpenXR 1.0 (log: "Max supported version is 1.0"); try 1.0.x only.
    static const XrVersion kApiVersionCandidates[] = {
        XR_MAKE_VERSION(1, 0, 34),
        XR_MAKE_VERSION(1, 0, 0),
    };

    bool instanceCreated = false;
    for (XrVersion apiVersion : kApiVersionCandidates) {
        if (CreateInstanceWithApiVersion(apiVersion, &g_instance)) {
            ALOGI("OpenXR instance ok at apiVersion %u.%u.%u", XR_VERSION_MAJOR(apiVersion),
                  XR_VERSION_MINOR(apiVersion), XR_VERSION_PATCH(apiVersion));
            instanceCreated = true;
            break;
        }
        g_instance = XR_NULL_HANDLE;
    }
    if (!instanceCreated) {
        ALOGE("xrCreateInstance failed for all candidate API versions");
        return false;
    }

    if (!LoadInstanceCoreProcs(g_instance)) {
        return false;
    }

    if (!LoadExtensionPointers(g_instance)) {
        return false;
    }

    XrSystemGetInfo sgi{XR_TYPE_SYSTEM_GET_INFO};
    sgi.formFactor = XR_FORM_FACTOR_HEAD_MOUNTED_DISPLAY;
    XrSystemId systemId = XR_NULL_SYSTEM_ID;
    XR_CHECK(xrGetSystem(g_instance, &sgi, &systemId), "xrGetSystem");

    if (!CreateSessionForSystem(systemId)) {
        return false;
    }

    XrSessionBeginInfo beginInfo{XR_TYPE_SESSION_BEGIN_INFO};
    beginInfo.primaryViewConfigurationType = XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
    const XrResult r = xrBeginSession(g_session, &beginInfo);
    if (XR_FAILED(r)) {
        ALOGW("xrBeginSession failed: %d (continuing for face-only)", static_cast<int>(r));
    }

    XrFaceTrackerCreateInfoANDROID createInfo{XR_TYPE_FACE_TRACKER_CREATE_INFO_ANDROID};
    const XrResult ft = xrCreateFaceTrackerANDROID(g_session, &createInfo, &g_face_tracker);
    if (XR_FAILED(ft)) {
        ALOGE("xrCreateFaceTrackerANDROID failed: %d", static_cast<int>(ft));
        return false;
    }

    ALOGI("OpenXR face tracker ready");
    return true;
}

void DestroyAll() {
    ShutdownEgl();
    if (g_face_tracker != XR_NULL_HANDLE && xrDestroyFaceTrackerANDROID) {
        xrDestroyFaceTrackerANDROID(g_face_tracker);
        g_face_tracker = XR_NULL_HANDLE;
    }
    if (g_session != XR_NULL_HANDLE) {
        if (xrEndSession) xrEndSession(g_session);
        if (xrDestroySession) xrDestroySession(g_session);
        g_session = XR_NULL_HANDLE;
    }
    if (g_instance != XR_NULL_HANDLE && xrDestroyInstance) {
        xrDestroyInstance(g_instance);
        g_instance = XR_NULL_HANDLE;
    }
    xrCreateFaceTrackerANDROID = nullptr;
    xrDestroyFaceTrackerANDROID = nullptr;
    xrGetFaceStateANDROID = nullptr;
}

void PostToJava(const float* params, int count, int64_t timestampMs) {
    if (!g_vm || !g_callback_global || !g_on_face_method) return;
    JNIEnv* env = nullptr;
    bool attached = false;
    if (g_vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) {
        if (g_vm->AttachCurrentThread(&env, nullptr) != JNI_OK) return;
        attached = true;
    }
  jfloatArray arr = env->NewFloatArray(count);
    if (!arr) {
        if (attached) g_vm->DetachCurrentThread();
        return;
    }
    env->SetFloatArrayRegion(arr, 0, count, params);
    env->CallVoidMethod(g_callback_global, g_on_face_method, arr, timestampMs);
    env->DeleteLocalRef(arr);
    if (env->ExceptionCheck()) {
        env->ExceptionClear();
    }
    if (attached) g_vm->DetachCurrentThread();
}

void FaceLoop() {
    ALOGI("OpenXR face worker started");
    std::vector<float> params(static_cast<size_t>(kFaceParamCount));
    XrFaceStateANDROID faceState{XR_TYPE_FACE_STATE_ANDROID};
    faceState.parametersCapacityInput = kFaceParamCount;
    faceState.parametersCountOutput = 0;
    faceState.parameters = params.data();

    while (!g_stop_requested.load()) {
        if (g_face_tracker == XR_NULL_HANDLE || !xrGetFaceStateANDROID) {
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
            continue;
        }
        XrFaceStateGetInfoANDROID getInfo{XR_TYPE_FACE_STATE_GET_INFO_ANDROID};
        const XrResult gr = xrGetFaceStateANDROID(g_face_tracker, &getInfo, &faceState);
        const int64_t now = NowMs();
        if (XR_SUCCEEDED(gr) && faceState.isValid == XR_TRUE) {
            g_last_post_ms.store(now);
            PostToJava(params.data(), kFaceParamCount, now);
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(1000 / kTargetHz));
    }
    ALOGI("OpenXR face worker exiting");
}

}  // namespace

bool SetSurface(JNIEnv* env, jobject surface) {
    std::lock_guard<std::mutex> lock(g_mutex);
    ShutdownEgl();
    if (g_native_window) {
        ANativeWindow_release(g_native_window);
        g_native_window = nullptr;
    }
    if (surface == nullptr) return true;
    g_native_window = ANativeWindow_fromSurface(env, surface);
    if (!g_native_window) {
        ALOGE("ANativeWindow_fromSurface failed");
        return false;
    }
    ALOGI("OpenXR native window set for GLES (%dx%d)", ANativeWindow_getWidth(g_native_window),
          ANativeWindow_getHeight(g_native_window));
    return true;
}

bool SetActivity(JNIEnv* env, jobject activity) {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (activity == nullptr) {
        if (g_activity_global) {
            env->DeleteGlobalRef(g_activity_global);
            g_activity_global = nullptr;
        }
        return true;
    }
    if (g_activity_global) {
        env->DeleteGlobalRef(g_activity_global);
    }
    g_activity_global = env->NewGlobalRef(activity);
    env->GetJavaVM(&g_vm);
    return g_activity_global != nullptr;
}

bool Start(JNIEnv* env, jobject callback) {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_running.load()) return true;
    if (g_callback_global) {
        env->DeleteGlobalRef(g_callback_global);
        g_callback_global = nullptr;
    }
    g_callback_global = env->NewGlobalRef(callback);
    jclass cbClass = env->GetObjectClass(callback);
    g_on_face_method = env->GetMethodID(cbClass, "onOpenXrFaceParameters", "([FJ)V");
    env->DeleteLocalRef(cbClass);
    if (!g_on_face_method) {
        ALOGE("onOpenXrFaceParameters method missing");
        return false;
    }

    g_stop_requested.store(false);
    if (!InitLoader(env) || !CreateInstanceAndSession()) {
        DestroyAll();
        return false;
    }

    g_running.store(true);
    g_worker = std::thread(FaceLoop);
    return true;
}

void Stop() {
    {
        std::lock_guard<std::mutex> lock(g_mutex);
        if (!g_running.load()) return;
        g_stop_requested.store(true);
    }
    if (g_worker.joinable()) {
        g_worker.join();
    }
    std::lock_guard<std::mutex> lock(g_mutex);
    DestroyAll();
    g_running.store(false);
    g_stop_requested.store(false);
}

bool IsRunning() { return g_running.load(); }

int64_t LastPostAgeMs() {
    const int64_t last = g_last_post_ms.load();
    if (last <= 0) return INT64_MAX;
    const int64_t age = NowMs() - last;
    return age < 0 ? 0 : age;
}

}  // namespace cs::openxr
