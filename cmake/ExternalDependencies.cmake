# ExternalDependencies.cmake
# Configures external library subdirectories
#
# This file includes modular configurations for:
#   - Inja template library
#   - Piper Phonemize (with espeak-ng and UCD libraries)
#   - nifly (NIF parsing)

# Include individual library configurations


include(nifly)
include(miniball)

# Helper function to link all external dependencies to a target
function(link_external_dependencies target_name)
    # Link dependency libraries
    link_nifly_dependencies(${target_name})
    
    # Add target-specific include directories (PRIVATE to avoid pollution)
    target_include_directories(${target_name} PRIVATE
        ${CMAKE_SOURCE_DIR}/external/miniball
    )
endfunction()
