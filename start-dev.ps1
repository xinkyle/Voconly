# Development start script
# If you encounter path too long errors, either:
# 1. Move project to a shorter path (e.g., C:\dev\Voconly)
# 2. Enable Windows long path support: https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation

# Fix MSVC UTF-8 source file encoding issue for transcribe-cpp-sys
$env:TRANSCRIBE_CMAKE_ARGS = "-DCMAKE_CXX_FLAGS=/utf-8"

Set-Location $PSScriptRoot
npm run tauri dev