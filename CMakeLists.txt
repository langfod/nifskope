# It's recommended to set a minimum CMake version.
# If you use CMake features from higher versions, update this to match.
cmake_minimum_required(VERSION 3.21)
add_definitions(-D_WIN32_WINNT=0x0A00)

if(POLICY CMP0135)
    cmake_policy(SET CMP0135 NEW)
endif()

# Configure ccache environment variables BEFORE project() command
# This ensures they're available when the compiler launcher is set up
set(ENV{CCACHE_SLOPPINESS} "pch_defines,time_macros,include_file_mtime,include_file_ctime,file_stat_matches")
set(ENV{CCACHE_COMPRESS} "true")
set(ENV{CCACHE_BASEDIR} "${CMAKE_CURRENT_SOURCE_DIR}")

# Limit build parallelism (configurable via -DCMAKE_COMPILE_JOBS and -DCMAKE_LINK_JOBS)
if(NOT DEFINED CMAKE_COMPILE_JOBS)
    set(CMAKE_COMPILE_JOBS 8)
endif()

if(NOT DEFINED CMAKE_LINK_JOBS)
    set(CMAKE_LINK_JOBS 2)
endif()

set_property(GLOBAL PROPERTY JOB_POOLS "compile=${CMAKE_COMPILE_JOBS}" "link=${CMAKE_LINK_JOBS}")
set(CMAKE_JOB_POOL_COMPILE compile)
set(CMAKE_JOB_POOL_LINK link)
set(CMAKE_INSTALL_MESSAGE LAZY)

# Set your project name. This will be the name of your SKSE .dll file.
project(nifskope VERSION 0.9.1 LANGUAGES C CXX)


# Enable better dependency tracking for incremental builds
set(CMAKE_DEPENDS_USE_COMPILER FALSE)


list(APPEND CMAKE_MODULE_PATH "${PROJECT_SOURCE_DIR}/cmake")

# Define BUILD_ROOT for external dependency builds shared across all presets
# Use the top-level build directory to ensure external deps are built once and reused
# NOTE: Must be defined BEFORE including commonlibsse.cmake
set(BUILD_ROOT "${CMAKE_SOURCE_DIR}/build")

# Configure compiler flags (must come before ccache to set flags correctly)
include(CompilerFlags)

# Configure ccache (after CMAKE_MODULE_PATH is set)
include(ccache)

###############################################################################
# Qt6 auto-processing
###############################################################################
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTOUIC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC_SEARCH_PATHS
    "${CMAKE_SOURCE_DIR}/src/ui"
    "${CMAKE_SOURCE_DIR}/src/ui/widgets"
)

###############################################################################
# Find packages
###############################################################################
find_package(Qt6 REQUIRED COMPONENTS
    Core Gui Xml OpenGL Network Widgets OpenGLWidgets Core5Compat
)

find_package(nlohmann_json CONFIG REQUIRED)
find_package(Qhull CONFIG REQUIRED)
find_package(meshoptimizer CONFIG REQUIRED)
find_package(glm CONFIG REQUIRED)
find_package(gli CONFIG REQUIRED)
find_package(xxHash CONFIG REQUIRED)
find_package(directxtex CONFIG REQUIRED)
find_package(directxmesh CONFIG REQUIRED)

# Setup external dependencies
include(ExternalDependencies)

###############################################################################
# Version from git (best-effort)
###############################################################################
set(NIFSKOPE_VERSION "${PROJECT_VERSION}")
set(NIFSKOPE_REVISION "")
find_package(Git QUIET)
if(GIT_FOUND)
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" rev-parse --short=7 HEAD
        WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}"
        OUTPUT_VARIABLE NIFSKOPE_REVISION
        OUTPUT_STRIP_TRAILING_WHITESPACE
        ERROR_QUIET
    )
endif()

###############################################################################
# Vendored: libfo76utils (static library)
###############################################################################
add_library(libfo76utils STATIC
    lib/libfo76utils/src/bits.c
    lib/libfo76utils/src/bptc-tables.c
    lib/libfo76utils/src/decompress-bptc.c
    lib/libfo76utils/src/decompress-bptc-float.c
    lib/libfo76utils/src/mman.c
    lib/libfo76utils/src/ba2file.cpp
    lib/libfo76utils/src/bsmatcdb.cpp
    lib/libfo76utils/src/bsrefl.cpp
    lib/libfo76utils/src/common.cpp
    lib/libfo76utils/src/ddstxt16.cpp
    lib/libfo76utils/src/filebuf.cpp
    lib/libfo76utils/src/jsonread.cpp
    lib/libfo76utils/src/matcomps.cpp
    lib/libfo76utils/src/material.cpp
    lib/libfo76utils/src/mat_dump.cpp
    lib/libfo76utils/src/mat_json.cpp
    lib/libfo76utils/src/mat_list.cpp
    lib/libfo76utils/src/pbr_lut.cpp
    lib/libfo76utils/src/sfcube2.cpp
    lib/libfo76utils/src/zlib.cpp
)

target_include_directories(libfo76utils PUBLIC
    "${CMAKE_SOURCE_DIR}/lib/libfo76utils/src"
        "${CMAKE_SOURCE_DIR}/src"
    "${CMAKE_SOURCE_DIR}/src/gl"
    "${CMAKE_SOURCE_DIR}/lib"
)

target_compile_features(libfo76utils PRIVATE cxx_std_20)

target_compile_definitions(libfo76utils PRIVATE _USE_MATH_DEFINES)

# libfo76utils sources (e.g. sfcube2.cpp) include glcontext.hpp which uses Qt headers
target_link_libraries(libfo76utils PRIVATE Qt6::Core Qt6::Gui Qt6::OpenGL Qt6::Widgets)

# Force .c files to compile as C++ on MSVC (detex.h uses GCC attributes incompatible with MSVC C)
if(MSVC)
    set_source_files_properties(
        lib/libfo76utils/src/bits.c
        lib/libfo76utils/src/bptc-tables.c
        lib/libfo76utils/src/decompress-bptc.c
        lib/libfo76utils/src/decompress-bptc-float.c
        lib/libfo76utils/src/mman.c
        PROPERTIES COMPILE_FLAGS "/FI\"${CMAKE_SOURCE_DIR}/cmake/msvc_compat.h\""
    )
endif()

# Suppress warnings for vendored code
if(MSVC)
    target_compile_options(libfo76utils PRIVATE /W0)
endif()


###############################################################################
# NifSkope executable
###############################################################################
add_executable(NifSkope WIN32
    # --- Data ---
    src/data/nifitem.cpp
    src/data/niftypes.cpp
    src/data/nifvalue.cpp
    # --- GL ---
    src/gl/icontrollable.h
    src/gl/BSMesh.cpp
    src/gl/bsshape.cpp
    src/gl/controllers.cpp
    src/gl/glcontext.cpp
    src/gl/glcontroller.cpp
    src/gl/glmarker.cpp
    src/gl/glmesh.cpp
    src/gl/glnode.cpp
    src/gl/glparticles.cpp
    src/gl/glproperty.cpp
    src/gl/glscene.cpp
    src/gl/glshape.cpp
    src/gl/gltex.cpp
    src/gl/gltexloaders.cpp
    src/gl/gltools.cpp
    src/gl/renderer.cpp
    # --- IO ---
    src/io/material.h
    src/io/materialfile.cpp
    src/io/MeshFile.cpp
    src/io/nifstream.cpp
    # --- Lib ---
    src/lib/importex/3ds.cpp
    src/lib/importex/importex.cpp
    src/lib/importex/obj.cpp
    src/lib/importex/col.cpp
    src/lib/importex/gltf.cpp
    src/lib/nvtristripwrapper.cpp
    src/lib/qhull.cpp
    # --- Model ---
    src/model/basemodel.cpp
    src/model/kfmmodel.cpp
    src/model/nifdelegate.cpp
    src/model/nifmodel.cpp
    src/model/nifextfiles.cpp
    src/model/nifproxymodel.cpp
    src/model/undocommands.cpp
    # --- Spells ---
    src/spells/animation.cpp
    src/spells/blocks.cpp
    src/spells/bounds.cpp
    src/spells/color.cpp
    src/spells/fileextract.cpp
    src/spells/filerename.cpp
    src/spells/flags.cpp
    src/spells/fo3only.cpp
    src/spells/havok.cpp
    src/spells/headerstring.cpp
    src/spells/light.cpp
    src/spells/materialedit.cpp
    src/spells/mesh.cpp
    src/spells/meshfilecopy.cpp
    src/spells/misc.cpp
    src/spells/moppcode.cpp
    src/spells/morphctrl.cpp
    src/spells/normals.cpp
    src/spells/optimize.cpp
    src/spells/sanitize.cpp
    src/spells/sfmatexport.cpp
    src/spells/simplify.cpp
    src/spells/skeleton.cpp
    src/spells/stringpalette.cpp
    src/spells/strippify.cpp
    src/spells/tangentspace.cpp
    src/spells/texture.cpp
    src/spells/transform.cpp
    # --- UI Widgets ---
    src/ui/widgets/colorwheel.cpp
    src/ui/widgets/ddspreview.cpp
    src/ui/widgets/filebrowser.cpp
    src/ui/widgets/fileselect.cpp
    src/ui/widgets/floatedit.cpp
    src/ui/widgets/floatslider.cpp
    src/ui/widgets/groupbox.cpp
    src/ui/widgets/inspect.cpp
    src/ui/widgets/lightingwidget.cpp
    src/ui/widgets/nifcheckboxlist.cpp
    src/ui/widgets/nifeditors.cpp
    src/ui/widgets/nifview.cpp
    src/ui/widgets/refrbrowser.cpp
    src/ui/widgets/uvedit.cpp
    src/ui/widgets/valueedit.cpp
    src/ui/widgets/xmlcheck.cpp
    # --- UI ---
    src/ui/about_dialog.cpp
    src/ui/checkablemessagebox.cpp
    src/ui/settingsdialog.cpp
    src/ui/settingspane.cpp
    # --- XML ---
    src/xml/kfmxml.cpp
    src/xml/nifexpr.cpp
    src/xml/nifxml.cpp
    # --- Core ---
    src/bsamodel.cpp
    src/gamemanager.cpp
    src/glview.cpp
    src/main.cpp
    src/message.cpp
    src/nifskope.cpp
    src/nifskope_ui.cpp
    src/spellbook.cpp
    src/version.cpp
    # --- Vendored (compiled into main target) ---
    lib/coacd.cpp
    lib/meshlet.cpp
    # --- Qt Resources ---
    res/nifskope.qrc
    # --- Windows icon ---
    res/icon.rc
)

###############################################################################
# Include directories
###############################################################################
target_include_directories(NifSkope PRIVATE
    "${CMAKE_SOURCE_DIR}/src"
    "${CMAKE_SOURCE_DIR}/src/gl"
    "${CMAKE_SOURCE_DIR}/lib"
)

###############################################################################
# Compile definitions
###############################################################################
target_compile_definitions(NifSkope PRIVATE
    _USE_MATH_DEFINES
    QT_NO_CAST_FROM_BYTEARRAY
    QT_NO_URL_CAST_FROM_STRING
    EDIT_ON_ACTIVATE
    NIFSKOPE_VERSION="${NIFSKOPE_VERSION}"
    $<$<NOT:$<STREQUAL:${NIFSKOPE_REVISION},>>:NIFSKOPE_REVISION="${NIFSKOPE_REVISION}">
    $<$<CONFIG:Release>:QT_NO_DEBUG_OUTPUT>
)

###############################################################################
# Link libraries
###############################################################################
target_link_libraries(NifSkope PRIVATE
    # Vendored
    libfo76utils
    # Header-only (FetchContent)
    miniball
    # Qt6
    Qt6::Core
    Qt6::Gui
    Qt6::Xml
    Qt6::OpenGL
    Qt6::Network
    Qt6::Widgets
    Qt6::OpenGLWidgets
    Qt6::Core5Compat
    # vcpkg
    Qhull::qhullcpp
    Qhull::qhull_r
    meshoptimizer::meshoptimizer
    nlohmann_json::nlohmann_json
    glm::glm
    Microsoft::DirectXTex
    Microsoft::DirectXMesh
    # System
    opengl32
)

###############################################################################
# Post-build: copy runtime data files
###############################################################################
set(NIFSKOPE_DATA_FILES
    "${CMAKE_SOURCE_DIR}/res/style.qss"
    "${CMAKE_SOURCE_DIR}/res/qt.conf"
)

if(EXISTS "${CMAKE_SOURCE_DIR}/lib/nif.xml")
    list(APPEND NIFSKOPE_DATA_FILES "${CMAKE_SOURCE_DIR}/lib/nif.xml")
endif()

if(EXISTS "${CMAKE_SOURCE_DIR}/lib/docsys/kfmxml/kfm.xml")
    list(APPEND NIFSKOPE_DATA_FILES "${CMAKE_SOURCE_DIR}/lib/docsys/kfmxml/kfm.xml")
endif()

foreach(DATA_FILE ${NIFSKOPE_DATA_FILES})
    add_custom_command(TARGET NifSkope POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${DATA_FILE}"
            "$<TARGET_FILE_DIR:NifSkope>/"
    )
endforeach()

# Copy shaders directory
if(EXISTS "${CMAKE_SOURCE_DIR}/res/shaders")
    add_custom_command(TARGET NifSkope POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_directory
            "${CMAKE_SOURCE_DIR}/res/shaders"
            "$<TARGET_FILE_DIR:NifSkope>/shaders"
    )
endif()
