#pragma once

#include <EGL/egl.h>
#include <android/native_window.h>

namespace on::openxr {

/** EGL for XrGraphicsBindingOpenGLESAndroidKHR (PBuffer; window optional). */
bool InitEgl(ANativeWindow* window, int glesMajorVersion = 3);
bool InitEglPbuffer(int glesMajorVersion = 3);
void ShutdownEgl();

bool HasEgl();
EGLDisplay GetEglDisplay();
EGLConfig GetEglConfig();
EGLContext GetEglContext();

}  // namespace on::openxr
