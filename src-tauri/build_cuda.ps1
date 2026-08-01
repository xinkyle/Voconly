# Voconly CUDA Build Script
# VS2022 + CUDA 13.0 for llama.cpp GPU support

param([string]$Mode = "release")

# Use vswhere to find VS installation and call VsDevCmd
$VSWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $VSWhere)) {
    $VSWhere = "D:\ProgramFiles\visualstudio2022\Common7\Tools\vswhere.exe"
}

# Find VS installation path
$VSPath = & $VSWhere -latest -property installationPath 2>$null
if (-not $VSPath) {
    $VSPath = "D:\ProgramFiles\visualstudio2022"
}

# Setup VS dev environment using VsDevCmd
$VsDevCmd = "$VSPath\Common7\Tools\VsDevCmd.bat"
cmd /c "`"$VsDevCmd`" -arch=x64 -host_arch=x64 && set" | ForEach-Object {
    if ($_ -match "^([^=]+)=(.*)$") {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
}

# Additional CUDA settings
$CUDAPath = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0"
$env:PATH = "$CUDAPath\bin;$env:PATH"
$env:CUDA_PATH = $CUDAPath
$env:CUDACXX = "$CUDAPath\bin\nvcc.exe"
$env:CUDAARCHS = "120"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Voconly CUDA Build" -ForegroundColor Cyan
Write-Host "RTX 5080 (CUDA ARCH: $env:CUDAARCHS)" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "LIB: $env:LIB" -ForegroundColor DarkGray

Set-Location "F:\projects\Voconly\src-tauri"
cargo clean -p llama_cpp_sys 2>&1 | Out-Null

Write-Host "Building..." -ForegroundColor Yellow
if ($Mode -eq "release") {
    cargo build --features local_llm --release
} else {
    cargo build --features local_llm
}

Write-Host ""
Read-Host "Done. Press Enter to exit"