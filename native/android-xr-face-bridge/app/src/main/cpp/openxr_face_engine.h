#pragma once

#include <jni.h>
#include <atomic>
#include <cstdint>

namespace cs::openxr {

/** Initialize loader with Android VM + activity jobject (global ref held internally). */
bool SetActivity(JNIEnv* env, jobject activity);

/** Optional 1x1 Surface for GLES session binding (Phase 1b). */
bool SetSurface(JNIEnv* env, jobject surface);

/** Start headless OpenXR face loop on a worker thread. Returns false if unsupported. */
bool Start(JNIEnv* env, jobject callback);

void Stop();

bool IsRunning();

/** Milliseconds since last successful face sample, or LONG_MAX if never. */
int64_t LastPostAgeMs();

}  // namespace cs::openxr
