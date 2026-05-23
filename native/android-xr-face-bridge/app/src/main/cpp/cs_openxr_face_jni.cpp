#include "openxr_face_engine.h"

#include <jni.h>

extern "C" {

JNIEXPORT void JNICALL
Java_com_characterstudio_xrfacebridge_OpenXrFaceEngine_nativeSetActivity(JNIEnv* env, jclass,
                                                                       jobject activity) {
    cs::openxr::SetActivity(env, activity);
}

JNIEXPORT void JNICALL
Java_com_characterstudio_xrfacebridge_OpenXrFaceEngine_nativeSetSurface(JNIEnv* env, jclass,
                                                                      jobject surface) {
    cs::openxr::SetSurface(env, surface);
}

JNIEXPORT jboolean JNICALL
Java_com_characterstudio_xrfacebridge_OpenXrFaceEngine_nativeStart(JNIEnv* env, jclass,
                                                                   jobject callback) {
    return cs::openxr::Start(env, callback) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_characterstudio_xrfacebridge_OpenXrFaceEngine_nativeStop(JNIEnv*, jclass) {
    cs::openxr::Stop();
}

JNIEXPORT jboolean JNICALL
Java_com_characterstudio_xrfacebridge_OpenXrFaceEngine_nativeIsRunning(JNIEnv*, jclass) {
    return cs::openxr::IsRunning() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jlong JNICALL
Java_com_characterstudio_xrfacebridge_OpenXrFaceEngine_nativeLastPostAgeMs(JNIEnv*, jclass) {
    return static_cast<jlong>(cs::openxr::LastPostAgeMs());
}

}  // extern "C"
