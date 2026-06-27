#include "openxr_face_engine.h"

#include <jni.h>

extern "C" {

JNIEXPORT void JNICALL
Java_com_opennexus3dstudio_xrfacebridge_OpenXrFaceEngine_nativeSetActivity(JNIEnv* env, jclass,
                                                                       jobject activity) {
    on::openxr::SetActivity(env, activity);
}

JNIEXPORT void JNICALL
Java_com_opennexus3dstudio_xrfacebridge_OpenXrFaceEngine_nativeSetSurface(JNIEnv* env, jclass,
                                                                      jobject surface) {
    on::openxr::SetSurface(env, surface);
}

JNIEXPORT jboolean JNICALL
Java_com_opennexus3dstudio_xrfacebridge_OpenXrFaceEngine_nativeStart(JNIEnv* env, jclass,
                                                                   jobject callback) {
    return on::openxr::Start(env, callback) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_opennexus3dstudio_xrfacebridge_OpenXrFaceEngine_nativeStop(JNIEnv*, jclass) {
    on::openxr::Stop();
}

JNIEXPORT jboolean JNICALL
Java_com_opennexus3dstudio_xrfacebridge_OpenXrFaceEngine_nativeIsRunning(JNIEnv*, jclass) {
    return on::openxr::IsRunning() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jlong JNICALL
Java_com_opennexus3dstudio_xrfacebridge_OpenXrFaceEngine_nativeLastPostAgeMs(JNIEnv*, jclass) {
    return static_cast<jlong>(on::openxr::LastPostAgeMs());
}

}  // extern "C"
