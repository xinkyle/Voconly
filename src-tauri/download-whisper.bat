@echo off
echo Downloading whisper.exe for Windows x64...

set URL=https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.5/whisper-bin-x64.zip
set ZIP_FILE=whisper-bin-x64.zip
set EXTRACT_DIR=whisper-temp
set RESOURCES_DIR=resources

:: Create resources directory if not exists
if not exist %RESOURCES_DIR% mkdir %RESOURCES_DIR%

:: Download using PowerShell
echo Downloading from %URL%...
powershell -Command "Invoke-WebRequest -Uri '%URL%' -OutFile '%ZIP_FILE%'"

if not exist %ZIP_FILE% (
    echo Failed to download whisper.zip
    exit /b 1
)

:: Extract the zip file
echo Extracting...
powershell -Command "Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%EXTRACT_DIR%' -Force"

:: Find and copy the main.exe as whisper.exe
if exist "%EXTRACT_DIR%\main.exe" (
    copy "%EXTRACT_DIR%\main.exe" "%RESOURCES_DIR%\whisper.exe"
    echo Found main.exe, copied to %RESOURCES_DIR%\whisper.exe
) else if exist "%EXTRACT_DIR%\whisper.exe" (
    copy "%EXTRACT_DIR%\whisper.exe" "%RESOURCES_DIR%\whisper.exe"
    echo Found whisper.exe, copied to %RESOURCES_DIR%\whisper.exe
) else (
    echo Looking for executable in extracted files...
    dir /s /b %EXTRACT_DIR%\*.exe
    for /r "%EXTRACT_DIR%" %%f in (*.exe) do (
        echo Found: %%f
        if "%%~nxf"=="main.exe" (
            copy "%%f" "%RESOURCES_DIR%\whisper.exe"
            echo Copied %%f to %RESOURCES_DIR%\whisper.exe
        )
    )
)

:: Cleanup
del %ZIP_FILE%
rmdir /s /q %EXTRACT_DIR%

if exist "%RESOURCES_DIR%\whisper.exe" (
    echo.
    echo Success! whisper.exe is ready at %RESOURCES_DIR%\whisper.exe
    echo File size:
    dir "%RESOURCES_DIR%\whisper.exe" | find "whisper.exe"
) else (
    echo.
    echo Failed to find whisper executable. Please download manually from:
    echo https://github.com/ggerganov/whisper.cpp/releases
    echo Extract main.exe and rename it to whisper.exe, then put in resources folder.
)

pause