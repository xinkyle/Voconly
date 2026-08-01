@echo off
REM ============================================================
REM Voconly Vulkan Build Script
REM Compiles whisper.cpp with Vulkan GPU support
REM ============================================================

echo.
echo ========================================
echo   Voconly Vulkan Whisper Builder
echo ========================================
echo.

REM Check Vulkan SDK
set "VULKAN_SDK="
if exist "C:\VulkanSDK\*" (
    for /d %%d in (C:\VulkanSDK\*) do set "VULKAN_SDK=%%d"
)
if exist "D:\VulkanSDK\*" (
    for /d %%d in (D:\VulkanSDK\*) do set "VULKAN_SDK=%%d"
)

if "%VULKAN_SDK%"=="" (
    echo [ERROR] Vulkan SDK not found!
    echo.
    echo Please install Vulkan SDK from: https://vulkan.lunarg.com/sdk/home
    echo Download and install the latest Windows SDK (e.g. 1.4.304.1)
    echo.
    pause
    exit /b 1
)

echo [OK] Vulkan SDK found: %VULKAN_SDK%

REM Check glslc shader compiler
set "PATH=%VULKAN_SDK%\Bin;%PATH%"
where glslc >nul 2>&1
if errorlevel 1 (
    echo [ERROR] glslc not found in Vulkan SDK!
    pause
    exit /b 1
)
echo [OK] glslc shader compiler available

REM Check CMake
where cmake >nul 2>&1
if errorlevel 1 (
    echo [ERROR] CMake not found!
    echo Please install CMake: winget install Kitware.CMake
    pause
    exit /b 1
)
echo [OK] CMake available

REM Setup VS2022 environment
if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" (
    call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
) else if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat" (
    call "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
) else if exist "D:\ProgramFiles\visualstudio2022\Common7\Tools\VsDevCmd.bat" (
    call "D:\ProgramFiles\visualstudio2022\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
)

echo.
echo [INFO] Cloning whisper.cpp...
set "WHISPER_DIR=build\whisper.cpp-vulkan"
if exist "%WHISPER_DIR%" (
    echo [INFO] Using existing whisper.cpp source at %WHISPER_DIR%
) else (
    git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git "%WHISPER_DIR%"
    if errorlevel 1 (
        echo [ERROR] Failed to clone whisper.cpp!
        pause
        exit /b 1
    )
)

echo.
echo [INFO] Building whisper.cpp with Vulkan backend...
cd /d "%WHISPER_DIR%"

REM Clean previous build
if exist "build-vulkan" rd /s /q "build-vulkan"

REM Configure with Vulkan support
cmake -B build-vulkan -DGGML_VULKAN=1 -DCMAKE_BUILD_TYPE=Release
if errorlevel 1 (
    echo [ERROR] CMake configuration failed!
    pause
    exit /b 1
)

REM Build
cmake --build build-vulkan --config Release -j
if errorlevel 1 (
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

echo.
echo [INFO] Copying Vulkan DLLs to Voconly resources...

REM Copy ggml-vulkan.dll
copy /Y "build-vulkan\bin\Release\ggml-vulkan.dll" "..\..\src-tauri\resources\ggml-vulkan.dll"
echo [OK] Copied ggml-vulkan.dll

REM Copy whisper.dll (updated with Vulkan support)
copy /Y "build-vulkan\bin\Release\whisper.dll" "..\..\src-tauri\resources\whisper.dll"
echo [OK] Copied whisper.dll

REM Copy main executable
copy /Y "build-vulkan\bin\Release\whisper.exe" "..\..\src-tauri\resources\whisper.exe"
echo [OK] Copied whisper.exe

REM Copy server if exists
if exist "build-vulkan\bin\Release\whisper-server.exe" (
    copy /Y "build-vulkan\bin\Release\whisper-server.exe" "..\..\src-tauri\resources\whisper-server.exe"
    echo [OK] Copied whisper-server.exe
)

cd /d "..\.."

echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo Generated files in src-tauri\resources:
echo   - ggml-vulkan.dll (Vulkan GPU backend)
echo   - whisper.dll (updated)
echo   - whisper.exe (updated)
echo.
echo [INFO] Now update tauri.conf.json to use Vulkan DLLs
echo [INFO] Remove CUDA DLLs from resources folder
echo.

REM List resources
echo Current resources:
dir /B "src-tauri\resources\*.dll" 2>nul

echo.
pause