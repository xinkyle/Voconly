# Build script for release
# If you encounter path too long errors, either:
# 1. Move project to a shorter path (e.g., C:\dev\Voconly)
# 2. Enable Windows long path support: https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation

$env:TRANSCRIBE_CMAKE_ARGS = "-DCMAKE_CXX_FLAGS=/utf-8"
Set-Location "$PSScriptRoot\src-tauri"
cargo build --release