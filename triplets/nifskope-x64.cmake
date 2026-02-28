###
# vcpkg triplet for NifSkope x64 Windows build
###

set(VCPKG_TARGET_ARCHITECTURE x64)

# Dynamic CRT linkage (/MD)
set(VCPKG_CRT_LINKAGE static)

# Dynamic library linkage (DLLs)
set(VCPKG_LIBRARY_LINKAGE static)

# Build only release libraries (saves vcpkg build time)
set(VCPKG_BUILD_TYPE release)

# if ports are qt set dynamic library linkage (DLLs)
if(VCPKG_TARGET_TRIPLET MATCHES "qt*")
    set(VCPKG_LIBRARY_LINKAGE dynamic)
endif()
