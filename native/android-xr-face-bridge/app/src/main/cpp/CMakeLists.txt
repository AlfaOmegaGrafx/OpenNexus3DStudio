cmake_minimum_required(VERSION 3.22.1)
project(cs_openxr_face)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Vendor OpenXR headers (Android XR extensions) without cloning all of jetpack-xr-natives
# (full repo clone fails on Windows due to path length limits).
set(OPENXR_VENDOR_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party/openxr")
set(OPENXR_HDR_DIR "${OPENXR_VENDOR_DIR}/openxr")
file(MAKE_DIRECTORY "${OPENXR_HDR_DIR}")

set(OPENXR_HEADERS
    openxr.h
    openxr_platform.h
    openxr_platform_defines.h
)
set(OPENXR_BASE_URL
    "https://raw.githubusercontent.com/google-ar/jetpack-xr-natives/release/third_party/OpenXR_KHR/generated/include/openxr"
)
foreach(hdr IN LISTS OPENXR_HEADERS)
    set(dest "${OPENXR_HDR_DIR}/${hdr}")
    if(NOT EXISTS "${dest}")
        message(STATUS "Downloading OpenXR header ${hdr}")
        file(DOWNLOAD
            "${OPENXR_BASE_URL}/${hdr}"
            "${dest}"
            SHOW_PROGRESS
            TLS_VERIFY ON
        )
    endif()
endforeach()

add_library(cs_openxr_face SHARED
    cs_openxr_face_jni.cpp
    openxr_face_engine.cpp
    openxr_gfx_egl.cpp
)

target_include_directories(cs_openxr_face PRIVATE
    "${OPENXR_VENDOR_DIR}"
)

find_library(log-lib log)
find_library(android-lib android)
find_library(egl-lib EGL)
find_library(gles-lib GLESv3)

# Khronos loader (Prefab from openxr_loader_for_android) — packages libopenxr_loader.so into APK.
find_package(OpenXR REQUIRED CONFIG)
target_link_libraries(cs_openxr_face
    ${log-lib}
    ${android-lib}
    ${egl-lib}
    ${gles-lib}
    dl
    OpenXR::openxr_loader
)
