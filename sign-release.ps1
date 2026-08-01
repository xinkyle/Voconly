# Voconly Signer Script
# Sign build artifacts using TAURI_SIGNING_PRIVATE_KEY

param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

# Auto-detect version from Cargo.toml if not provided
if (-not $Version) {
    $CargoToml = Join-Path $PSScriptRoot "src-tauri\Cargo.toml"
    if (Test-Path $CargoToml) {
        $VersionLine = Get-Content $CargoToml | Where-Object { $_ -match '^version\s*=' }
        if ($VersionLine -match '"([^"]+)"') {
            $Version = $Matches[1]
            Write-Host "[INFO] Auto-detected version from Cargo.toml: $Version" -ForegroundColor Gray
        }
    }
    if (-not $Version) {
        Write-Host "[ERROR] Could not detect version from Cargo.toml" -ForegroundColor Red
        Write-Host "Please specify version parameter: -Version '0.3.6'" -ForegroundColor Yellow
        exit 1
    }
}

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

if (-not (Test-Path $NsisPath)) {
    Write-Host "[ERROR] NSIS not found: $NsisPath" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] NSIS: $NsisPath" -ForegroundColor Green

# Step 3: Sign NSIS installer
Write-Host ""
Write-Host "[3/4] Signing build artifacts..." -ForegroundColor Yellow
Write-Host "Note: Enter password if key has one, or press Enter if empty" -ForegroundColor Gray
Write-Host ""

Write-Host "Signing NSIS installer..." -ForegroundColor Gray
pnpm tauri signer sign $NsisPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] NSIS signing failed" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] NSIS signed" -ForegroundColor Green

# Step 4: Update latest.json
Write-Host ""
Write-Host "[4/4] Updating latest.json..." -ForegroundColor Yellow

# Read signature file
$NsisSigPath = $NsisPath + ".sig"

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
Write-Host "  - latest.json (with signature)" -ForegroundColor Gray
Write-Host ""
Write-Host "Next step: run upload-release.ps1 to upload to GitHub" -ForegroundColor Yellow
Write-Host ""