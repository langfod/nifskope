# miniball.cmake
# Fetches the miniball (Smallest Enclosing Ball) header-only library

include(FetchContent)

# Fetch miniball from GitHub
FetchContent_Declare(
    miniball
    GIT_REPOSITORY https://github.com/hbf/miniball.git
    GIT_TAG master
    GIT_SHALLOW TRUE
)

# Header-only library: populate without building
FetchContent_GetProperties(miniball)
if(NOT miniball_POPULATED)
    FetchContent_Populate(miniball)

    # Patch out #include "Seb_debug.h" which pulls in a file that
    # only exists when SEB_DEBUG_MODE / SEB_TIMER_MODE are enabled.
    set(_seb_cfg "${miniball_SOURCE_DIR}/cpp/main/Seb_configure.h")
    file(READ "${_seb_cfg}" _seb_cfg_contents)
    string(REPLACE "#include \"Seb_debug.h\"" "// #include \"Seb_debug.h\"  // patched out by miniball.cmake" _seb_cfg_contents "${_seb_cfg_contents}")
    file(WRITE "${_seb_cfg}" "${_seb_cfg_contents}")
endif()

# Create an interface (header-only) target
add_library(miniball INTERFACE)
target_include_directories(miniball INTERFACE "${miniball_SOURCE_DIR}/cpp/main")

message(STATUS "miniball configured (header-only, from ${miniball_SOURCE_DIR}/cpp/main)")

