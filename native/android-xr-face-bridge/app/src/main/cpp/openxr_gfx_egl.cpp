#include "openxr_gfx_egl.h"

#include <EGL/eglext.h>
#include <android/log.h>

#ifndef EGL_PBUFFER_BIT
#define EGL_PBUFFER_BIT 0x0001
#endif
#ifndef EGL_OPENGL_ES2_BIT
#define EGL_OPENGL_ES2_BIT 0x00000004
#endif
#ifndef EGL_OPENGL_ES3_BIT
#define EGL_OPENGL_ES3_BIT 0x00000040
#endif

#define LOG_TAG "CS-OpenXrEgl"
#define ALOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define ALOGW(...) __android_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)
#define ALOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace cs::openxr {
namespace {

EGLDisplay g_display = EGL_NO_DISPLAY;
EGLConfig g_config = nullptr;
EGLContext g_context = EGL_NO_CONTEXT;
EGLSurface g_surface = EGL_NO_SURFACE;
ANativeWindow* g_window = nullptr;

}  // namespace

namespace {

bool InitEglCore(int glesMajorVersion, EGLint surfaceType) {
    if (g_context != EGL_NO_CONTEXT) return true;

    eglBindAPI(EGL_OPENGL_ES_API);

    g_display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (g_display == EGL_NO_DISPLAY) {
        ALOGE("eglGetDisplay failed");
        return false;
    }
    if (!eglInitialize(g_display, nullptr, nullptr)) {
        ALOGE("eglInitialize failed");
        return false;
    }

    const EGLint renderableType =
        glesMajorVersion >= 3 ? EGL_OPENGL_ES3_BIT : EGL_OPENGL_ES2_BIT;
    const EGLint configAttribs[] = {EGL_RENDERABLE_TYPE,
                                    renderableType,
                                    EGL_SURFACE_TYPE,
                                    surfaceType,
                                    EGL_RED_SIZE,
                                    8,
                                    EGL_GREEN_SIZE,
                                    8,
                                    EGL_BLUE_SIZE,
                                    8,
                                    EGL_ALPHA_SIZE,
                                    8,
                                    EGL_NONE};
    EGLint numConfigs = 0;
    if (!eglChooseConfig(g_display, configAttribs, &g_config, 1, &numConfigs) || numConfigs < 1) {
        ALOGE("eglChooseConfig failed");
        return false;
    }

    const int clientVersion = glesMajorVersion >= 3 ? 3 : 2;
    const EGLint contextAttribs[] = {EGL_CONTEXT_CLIENT_VERSION, clientVersion, EGL_NONE};
    g_context = eglCreateContext(g_display, g_config, EGL_NO_CONTEXT, contextAttribs);
    if (g_context == EGL_NO_CONTEXT) {
        ALOGE("eglCreateContext failed");
        return false;
    }
    return true;
}

}  // namespace

bool InitEglPbuffer(int glesMajorVersion) {
    ShutdownEgl();
    g_window = nullptr;
    if (!InitEglCore(glesMajorVersion, EGL_PBUFFER_BIT)) return false;

    const EGLint pbufferAttribs[] = {EGL_WIDTH, 1, EGL_HEIGHT, 1, EGL_NONE};
    g_surface = eglCreatePbufferSurface(g_display, g_config, pbufferAttribs);
    if (g_surface == EGL_NO_SURFACE) {
        ALOGE("eglCreatePbufferSurface failed");
        return false;
    }

    if (!eglMakeCurrent(g_display, g_surface, g_surface, g_context)) {
        ALOGE("eglMakeCurrent (pbuffer) failed");
        return false;
    }

    ALOGI("EGL PBuffer ready for OpenXR GLES binding");
    return true;
}

bool InitEgl(ANativeWindow* window, int glesMajorVersion) {
    if (!window) return InitEglPbuffer(glesMajorVersion);
    if (g_context != EGL_NO_CONTEXT && g_window == window) return true;

    ShutdownEgl();
    g_window = window;
    if (ANativeWindow_setBuffersGeometry(g_window, 1, 1, AHARDWAREBUFFER_FORMAT_R8G8B8A8_UNORM) != 0) {
        ALOGW("ANativeWindow_setBuffersGeometry returned non-zero");
    }

    if (!InitEglCore(glesMajorVersion, EGL_WINDOW_BIT)) return false;

    g_surface = eglCreateWindowSurface(g_display, g_config, g_window, nullptr);
    if (g_surface == EGL_NO_SURFACE) {
        ALOGE("eglCreateWindowSurface failed — trying PBuffer");
        ShutdownEgl();
        return InitEglPbuffer(glesMajorVersion);
    }

    if (!eglMakeCurrent(g_display, g_surface, g_surface, g_context)) {
        ALOGE("eglMakeCurrent (window) failed — trying PBuffer");
        ShutdownEgl();
        return InitEglPbuffer(glesMajorVersion);
    }

    ALOGI("EGL window surface ready for OpenXR GLES binding");
    return true;
}

void ShutdownEgl() {
    if (g_display != EGL_NO_DISPLAY) {
        eglMakeCurrent(g_display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
        if (g_surface != EGL_NO_SURFACE) {
            eglDestroySurface(g_display, g_surface);
            g_surface = EGL_NO_SURFACE;
        }
        if (g_context != EGL_NO_CONTEXT) {
            eglDestroyContext(g_display, g_context);
            g_context = EGL_NO_CONTEXT;
        }
        eglTerminate(g_display);
        g_display = EGL_NO_DISPLAY;
    }
    g_config = nullptr;
    g_window = nullptr;
}

bool HasEgl() { return g_context != EGL_NO_CONTEXT; }
EGLDisplay GetEglDisplay() { return g_display; }
EGLConfig GetEglConfig() { return g_config; }
EGLContext GetEglContext() { return g_context; }

}  // namespace cs::openxr
