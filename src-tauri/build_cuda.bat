@echo off
REM ============================================================
REM Voconly CUDA Build Script
REM VS2022 + CUDA 13.0 for llama.cpp GPU support
REM ============================================================

REM Add cmake to PATH (winget installs to C:\Program Files\CMake\bin)
set PATH=C:\Program Files\CMake\bin;%PATH%

REM Add LLVM tools (for llvm-nm required by llama_cpp_sys build)
set PATH=C:\Program Files\LLVM\bin;%PATH%

REM Setup VS2022 development environment (correct path)
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64

REM Windows SDK is on D drive (not default C drive location)
set WindowsSDKDir=D:\Windows Kits\10\
set WindowsSDKVersion=10.0.26100.0
set WindowsSDKLib=%WindowsSDKDir%Lib\%WindowsSDKVersion%\um\x64
set WindowsSDKLibUCRT=%WindowsSDKDir%Lib\%WindowsSDKVersion%\ucrt\x64
set WindowsSDKInclude=%WindowsSDKDir%Include\%WindowsSDKVersion%

REM Add Windows SDK to LIB and INCLUDE
set LIB=%WindowsSDKLib%;%WindowsSDKLibUCRT%;%LIB%
set INCLUDE=%WindowsSDKInclude%\um;%WindowsSDKInclude%\ucrt;%WindowsSDKInclude%\shared;%INCLUDE%

REM Find MSVC version dynamically
for /f "delims=" %%i in ('dir /b "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC" 2^>nul') do set MSVC_VERSION=%%i
set MSVC_INCLUDE=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\%MSVC_VERSION%\include

REM Setup bindgen to find MSVC headers (libclang doesn't use INCLUDE env var)
set BINDGEN_EXTRA_CLANG_ARGS=-I"%MSVC_INCLUDE%" -I"%WindowsSDKInclude%\ucrt" -I"%WindowsSDKInclude%\um" -I"%WindowsSDKInclude%\shared"

REM Setup CUDA
set CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0
set PATH=%CUDA_PATH%\bin;%PATH%
set CUDAARCHS=120

echo ========================================
echo Voconly CUDA Build
echo RTX 5080 (CUDA ARCH: %CUDAARCHS%)
echo Windows SDK: %WindowsSDKDir%%WindowsSDKVersion%
echo MSVC Include: %MSVC_INCLUDE%
echo ========================================

cd /d F:\projects\Voconly\src-tauri
cargo clean -p llama_cpp_sys
cargo build --features local_llm --release

echo.
pause