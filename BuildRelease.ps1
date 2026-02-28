param(
    [string]$preset = "release",
    [int]$threads = 32,
    [switch]$noDeploy,
    [switch]$skipTests,
    [switch]$fresh
)
$vsDevShellPath = "C:/Program Files/Microsoft Visual Studio/2022/Community/Common7/Tools/Launch-VsDevShell.ps1"
if (Test-Path .\Build_Config_Local.ps1) {
    . .\Build_Config_Local.ps1
}


Write-Host "Running preset $preset"

# Set up Visual Studio 2022 x64 environment
# Override with env var if set
if ($env:VS_DEV_SHELL_PATH) {
    if (Test-Path $env:VS_DEV_SHELL_PATH) {
        $vsDevShellPath = $env:VS_DEV_SHELL_PATH
        Write-Host "Using VS Dev Shell path from environment: $vsDevShellPath"
    }
}
# Verify the path exists
if (-not (Test-Path $vsDevShellPath)) {
    Write-Error "Visual Studio Dev Shell script not found at '$vsDevShellPath'. Please check the path."
    exit 1
}
# Save current directory, launch VS dev shell, and return to original directory
$currentDirectory = $PWD.Path
& $vsDevShellPath -Arch amd64; Set-Location -Path "${currentDirectory}"


# Build cmake configure arguments
$cmakeArgs = @("-S", ".", "--preset=$preset", "-DCMAKE_COMPILE_JOBS=$threads", "-Wno-dev")
if ($skipTests) {
    $cmakeArgs += "-DSKIP_TESTS=ON"
    Write-Host "Tests disabled (-skipTests flag)"
} else {
    $cmakeArgs += "-DSKIP_TESTS=OFF"
}
if ($fresh) {
    $cmakeArgs += "--fresh"
}

& cmake $cmakeArgs
if ($LASTEXITCODE -ne 0) { exit 1 }

& cmake --build --preset=$preset --parallel $threads
if ($LASTEXITCODE -ne 0) { exit 1 }