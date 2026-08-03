# Voconly - Build Release
# Build the release version of Voconly

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Voconly - Build Release" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] node_modules not found, installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] npm install failed" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Check if Rust is installed
$CargoExists = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $CargoExists) {
    Write-Host "[ERROR] Rust is not installed" -ForegroundColor Red
    Write-Host "[INFO] Please install Rust from https://rustup.rs/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[INFO] Building release version..." -ForegroundColor Yellow
Write-Host "[INFO] This may take several minutes..." -ForegroundColor Yellow
Write-Host ""

npm run tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] Build failed" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Build completed successfully!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[INFO] Output location: src-tauri\target\release\bundle\" -ForegroundColor Green
Write-Host ""