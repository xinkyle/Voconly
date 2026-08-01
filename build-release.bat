@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   Voconly - Build Release
echo ========================================
echo\

:: Check if node_modules exists
if not exist "node_modules" (
    echo [INFO] node_modules not found, installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
)

:: Check if Rust is installed
where cargo >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Rust is not installed
    echo [INFO] Please install Rust from https://rustup.rs/
    pause
    exit /b 1
)

echo [INFO] Building release version...
echo [INFO] This may take several minutes...
echo\

call npm run tauri build

if errorlevel 1 (
    echo\
    echo [ERROR] Build failed
    pause
    exit /b 1
)

echo\
echo ========================================
echo   Build completed successfully!
echo ========================================
echo\
echo [INFO] Output location: src-tauri\target\release\bundle\
echo\

endlocal