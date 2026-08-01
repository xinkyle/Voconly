# Voconly Signer Script
# Sign build artifacts using TAURI_SIGNING_PRIVATE_KEY

param(
    [string]$Version = "0.3.4"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Voconly Signer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Load private key
Write-Host "[1/4] Loading signing key..." -ForegroundColor Yellow

$PrivateKey = [System.Environment]::GetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY", "User")
if (-not $PrivateKey) {
    Write-Host "[ERROR] TAURI_SIGNING_PRIVATE_KEY not set" -ForegroundColor Red
    Write-Host "Set user environment variable first:" -ForegroundColor Yellow
    Write-Host "  [System.Environment]::SetEnvironmentVariable('TAURI_SIGNING_PRIVATE_KEY', 'your-key', 'User')" -ForegroundColor Gray
    exit 1
}

$env:TAURI_SIGNING_PRIVATE_KEY = $PrivateKey
$KeyLen = $PrivateKey.Length
Write-Host "[OK] Key loaded (length: $KeyLen)" -ForegroundColor Green

# Step 2: Check build artifacts
Write-Host ""
Write-Host "[2/4] Checking build artifacts..." -ForegroundColor Yellow

$NsisPath = "src-tauri/target/release/bundle/nsis/Voconly_" + $Version + "_x64-setup.exe"
$MsiPath = "src-tauri/target/release/bundle/msi/Voconly_" + $Version + "_x64_en-US.msi"

if (-not (Test-Path $NsisPath)) {
    Write-Host "[ERROR] NSIS not found: $NsisPath" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] NSIS: $NsisPath" -ForegroundColor Green

if (-not (Test-Path $MsiPath)) {
    Write-Host "[ERROR] MSI not found: $MsiPath" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] MSI: $MsiPath" -ForegroundColor Green

# Step 3: Sign files
Write-Host ""
Write-Host "[3/4] Signing build artifacts..." -ForegroundColor Yellow
Write-Host "Note: Enter password if key has one, or press Enter if empty" -ForegroundColor Gray
Write-Host ""

# Sign NSIS
Write-Host "Signing NSIS installer..." -ForegroundColor Gray
pnpm tauri signer sign $NsisPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] NSIS signing failed" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] NSIS signed" -ForegroundColor Green

# Sign MSI
Write-Host "Signing MSI installer..." -ForegroundColor Gray
pnpm tauri signer sign $MsiPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] MSI signing failed" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] MSI signed" -ForegroundColor Green

# Step 4: Update latest.json
Write-Host ""
Write-Host "[4/4] Updating latest.json..." -ForegroundColor Yellow

# Read signature file
$NsisSigPath = $NsisPath + ".sig"
$MsiSigPath = $MsiPath + ".sig"

if (-not (Test-Path $NsisSigPath)) {
    Write-Host "[ERROR] NSIS signature file not found: $NsisSigPath" -ForegroundColor Red
    exit 1
}

$NsisSig = Get-Content $NsisSigPath -Raw
$Today = Get-Date -Format "yyyy-MM-dd"

# Build latest.json content
$LatestContent = @"
{
  "version": "$Version",
  "date": "$Today",
  "platforms": {
    "windows-x86_64": {
      "url": "https://github.com/xinkyle/Voconly/releases/download/v$Version/Voconly_$Version_x64-setup.exe",
      "signature": "$($NsisSig.Trim())"
    }
  }
}
"@

# Write without BOM (PowerShell 5.1 UTF8 always adds BOM, use .NET method)
[System.IO.File]::WriteAllText("latest.json", $LatestContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "[OK] latest.json updated (UTF-8 without BOM)" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Signing Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Generated files:" -ForegroundColor Yellow
Write-Host "  - $NsisPath.sig" -ForegroundColor Gray
Write-Host "  - $MsiPath.sig" -ForegroundColor Gray
Write-Host "  - latest.json (with signature)" -ForegroundColor Gray
Write-Host ""
Write-Host "Next step: run upload-release.ps1 to upload to GitHub" -ForegroundColor Yellow
Write-Host ""