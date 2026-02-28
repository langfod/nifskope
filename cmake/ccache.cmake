# ccache.cmake
# Configures ccache for faster compilation

set(CCACHE_PROGRAM "${CMAKE_SOURCE_DIR}/external/ccache-4.12.3-windows-x86_64/ccache.exe")

if(EXISTS "${CCACHE_PROGRAM}")
    set(WHISPER_CCACHE "${CCACHE_PROGRAM}")
    # Set ccache as the compiler launcher
    set(CMAKE_C_COMPILER_LAUNCHER "${CCACHE_PROGRAM}")
    set(CMAKE_CXX_COMPILER_LAUNCHER "${CCACHE_PROGRAM}")
else()
    message(STATUS "ccache not found at ${CCACHE_PROGRAM}, compilation will proceed without ccache")
endif()
