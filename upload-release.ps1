# Voconly Release Uploader
# Upload signed build artifacts to GitHub Release
# Automatically generates latest.json from Cargo.toml version

param(
    [string]$Version = ""  # Optional: if empty, read from Cargo.toml
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Voconly Release Uploader" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get version number
Write-Host "[1/6] Getting version number..." -ForegroundColor Yellow

if ($Version -eq "") {
    # Read from Cargo.toml
    $CargoPath = "src-tauri/Cargo.toml"
    if (-not (Test-Path $CargoPath)) {
        Write-Host "[ERROR] Cargo.toml not found: $CargoPath" -ForegroundColor Red
        exit 1
    }

    $CargoContent = Get-Content $CargoPath -Raw
    $VersionMatch = [regex]::Match($CargoContent, 'version = "([^"]+)"')
    if (-not $VersionMatch.Success) {
        Write-Host "[ERROR] Failed to parse version from Cargo.toml" -ForegroundColor Red
        exit 1
    }

    $Version = $VersionMatch.Groups[1].Value
    Write-Host "[OK] Version from Cargo.toml: $Version" -ForegroundColor Green
} else {
    Write-Host "[OK] Version from parameter: $Version" -ForegroundColor Green
}

# Refresh environment variables (include GitHub CLI path)
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";C:\Program Files\GitHub CLI"

# Step 2: Check GitHub CLI
Write-Host ""
Write-Host "[2/6] Checking GitHub CLI..." -ForegroundColor Yellow

gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] GitHub CLI not authenticated" -ForegroundColor Red
    Write-Host "Run: gh auth login" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] GitHub CLI authenticated" -ForegroundColor Green

# Step 3: Check build artifacts
Write-Host ""
Write-Host "[3/6] Checking build artifacts..." -ForegroundColor Yellow

$NsisPath = "src-tauri/target/release/bundle/nsis/Voconly_" + $Version + "_x64-setup.exe"
$MsiPath = "src-tauri/target/release/bundle/msi/Voconly_" + $Version + "_x64_en-US.msi"
$NsisSigPath = $NsisPath + ".sig"

# Check installer files
if (-not (Test-Path $NsisPath)) {
    Write-Host "[ERROR] NSIS not found: $NsisPath" -ForegroundColor Red
    Write-Host "[HINT] Run build-release.bat first" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] NSIS: $NsisPath" -ForegroundColor Green

if (-not (Test-Path $MsiPath)) {
    Write-Host "[ERROR] MSI not found: $MsiPath" -ForegroundColor Red
    Write-Host "[HINT] Run build-release.bat first" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] MSI: $MsiPath" -ForegroundColor Green

# Check signature file
if (-not (Test-Path $NsisSigPath)) {
    Write-Host "[ERROR] Signature not found: $NsisSigPath" -ForegroundColor Red
    Write-Host "[HINT] Set TAURI_SIGNING_PRIVATE_KEY and rebuild" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Signature: $NsisSigPath" -ForegroundColor Green

# Step 4: Generate latest.json
Write-Host ""
Write-Host "[4/6] Generating latest.json..." -ForegroundColor Yellow

$NsisSig = Get-Content $NsisSigPath -Raw
$Today = Get-Date -Format "yyyy-MM-dd"

$LatestContent = @"
{
  "version": "$Version",
  "date": "$Today",
  "platforms": {
    "windows-x86_64": {
      "url": "https://github.com/xinkyle/Voconly/releases/download/v${Version}/Voconly_${Version}_x64-setup.exe",
      "signature": "$($NsisSig.Trim())"
    }
  }
}
"@

# Write without BOM
[System.IO.File]::WriteAllText("latest.json", $LatestContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "[OK] latest.json generated (version: $Version)" -ForegroundColor Green

$FilesToUpload = @("latest.json", $NsisPath, $MsiPath)

# Step 5: Delete old release if exists
Write-Host ""
Write-Host "[5/6] Handling existing release..." -ForegroundColor Yellow

# Check if release exists (suppress error output)
$ErrorActionPreference = 'Continue'
try {
    $ExistingRelease = gh release view "v$Version" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Found existing release v$Version, deleting..." -ForegroundColor Gray
        gh release delete "v$Version" --yes 2>$null | Out-Null
        Write-Host "[OK] Old release deleted" -ForegroundColor Green
    } else {
        Write-Host "[OK] No existing release" -ForegroundColor Green
    }
} catch {
    Write-Host "[OK] No existing release" -ForegroundColor Green
}
$ErrorActionPreference = "Stop"

# Step 6: Create and upload
Write-Host ""
Write-Host "[6/6] Creating release and uploading..." -ForegroundColor Yellow

# Create release
Write-Host "Creating release v$Version..." -ForegroundColor Gray
gh release create "v$Version" --title "v$Version" --latest 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to create release" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Release created" -ForegroundColor Green

# Upload files
Write-Host "Uploading files..." -ForegroundColor Gray
gh release upload "v$Version" $FilesToUpload 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Upload failed" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Files uploaded" -ForegroundColor Green

# Show result
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Release Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Release URL: https://github.com/xinkyle/Voconly/releases/tag/v$Version" -ForegroundColor Green
Write-Host ""
Write-Host "Uploaded files:" -ForegroundColor Yellow
foreach ($File in $FilesToUpload) {
    $Size = (Get-Item $File).Length / 1MB
    $SizeRounded = [math]::Round($Size, 2)
    Write-Host "  - $File ($SizeRounded MB)" -ForegroundColor Gray
}
Write-Host ""