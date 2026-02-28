# nifly.cmake
# Fetches and configures the nifly NIF library for standalone NIF parsing

include(FetchContent)

# Fetch nifly from GitHub
FetchContent_Declare(
    nifly
    GIT_REPOSITORY https://github.com/ousnius/nifly.git
    GIT_TAG main
    GIT_SHALLOW TRUE
)

# Configure nifly options before fetching
set(NIFLY_BUILD_TESTS OFF CACHE BOOL "" FORCE)

# Make nifly available
FetchContent_MakeAvailable(nifly)

# nifly sets /EHsc as a PUBLIC compile option, which conflicts with our /EHa requirement
# for structured exception handling (_set_se_translator). Remove /EHsc from nifly's
# interface and replace with /EHa to maintain exception handling compatibility.
if(MSVC AND TARGET nifly)
    get_target_property(nifly_compile_options nifly INTERFACE_COMPILE_OPTIONS)
    if(nifly_compile_options)
        list(REMOVE_ITEM nifly_compile_options "/EHsc")
        set_target_properties(nifly PROPERTIES INTERFACE_COMPILE_OPTIONS "${nifly_compile_options}")
    endif()
endif()

# Create an interface target for easy linking
if(NOT TARGET nifly::nifly)
    add_library(nifly::nifly ALIAS nifly)
endif()

# Helper function to link nifly to a target
function(link_nifly_dependencies target_name)
    target_link_libraries(${target_name} PRIVATE nifly)
    target_include_directories(${target_name} PRIVATE 
        ${nifly_SOURCE_DIR}/include
    )
endfunction()

message(STATUS "nifly configured for standalone NIF parsing")

