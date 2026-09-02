# Voconly Release Uploader for Gitee
# Upload signed build artifacts to Gitee Release
# Automatically generates latest.json from version parameter

param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

# 切换到项目根目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($ScriptDir)) {
    $ScriptDir = $PSScriptRoot
}
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Voconly Gitee Release Uploader" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Gitee 配置
$GiteeOwner = "xingkyle"  # Gitee 用户名
$GiteeRepo = "Voconly"    # Gitee 仓库名

# Step 1: Show version
Write-Host "[1/7] Version: $Version" -ForegroundColor Green

# Step 2: Check Gitee access token
Write-Host ""
Write-Host "[2/7] Checking Gitee access token..." -ForegroundColor Yellow

$GiteeToken = $env:GITEE_ACCESS_TOKEN
if ([string]::IsNullOrEmpty($GiteeToken)) {
    Write-Host "[ERROR] GITEE_ACCESS_TOKEN environment variable not set" -ForegroundColor Red
    Write-Host ""
    Write-Host "To get your Gitee access token:" -ForegroundColor Yellow
    Write-Host "1. Visit: https://gitee.com/profile/personal_access_tokens" -ForegroundColor Yellow
    Write-Host "2. Generate a new token with 'projects' scope" -ForegroundColor Yellow
    Write-Host "3. Set environment variable:" -ForegroundColor Yellow
    Write-Host "   `$env:GITEE_ACCESS_TOKEN = 'your_token_here'" -ForegroundColor Yellow
    Write-Host "   Or add to your PowerShell profile for persistence" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
Write-Host "[OK] Gitee access token found" -ForegroundColor Green

# Step 3: Check build artifacts
Write-Host ""
Write-Host "[3/7] Checking build artifacts..." -ForegroundColor Yellow

$NsisPath = "src-tauri/target/release/bundle/nsis/Voconly_" + $Version + "_x64-setup.exe"
$MsiPath = "src-tauri/target/release/bundle/msi/Voconly_" + $Version + "_x64_en-US.msi"
$NsisSigPath = $NsisPath + ".sig"

# Check installer files
if (-not (Test-Path $NsisPath)) {
    Write-Host "[ERROR] NSIS not found: $NsisPath" -ForegroundColor Red
    Write-Host "[HINT] Run build-release-local.ps1 first" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] NSIS: $NsisPath" -ForegroundColor Green

# MSI is optional
if (Test-Path $MsiPath) {
    Write-Host "[OK] MSI: $MsiPath" -ForegroundColor Green
    $HasMsi = $true
} else {
    Write-Host "[INFO] MSI not found (optional): $MsiPath" -ForegroundColor Gray
    $HasMsi = $false
}

# Check signature file
if (-not (Test-Path $NsisSigPath)) {
    Write-Host "[ERROR] Signature not found: $NsisSigPath" -ForegroundColor Red
    Write-Host "[HINT] Set TAURI_SIGNING_PRIVATE_KEY and rebuild" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Signature: $NsisSigPath" -ForegroundColor Green

# Step 4: Read changelog for this version
Write-Host ""
Write-Host "[4/7] Reading changelog..." -ForegroundColor Yellow

$ChangelogFileName = "CHANGELOG-$Version.md"
$ChangelogPath = Join-Path -Path $ScriptDir -ChildPath $ChangelogFileName
$ReleaseNotes = ""

if (Test-Path $ChangelogPath) {
    $ReleaseNotes = Get-Content $ChangelogPath -Raw -Encoding UTF8
    $ReleaseNotes = $ReleaseNotes.Trim()
    Write-Host "[OK] Found changelog: $ChangelogPath" -ForegroundColor Green
} else {
    Write-Host "[INFO] CHANGELOG-$Version.md not found" -ForegroundColor Gray
    $ReleaseNotes = "发布版本 $Version"
}

# Step 5: Generate latest.json for Gitee
Write-Host ""
Write-Host "[5/7] Generating latest.json..." -ForegroundColor Yellow

$NsisSig = Get-Content $NsisSigPath -Raw
$Today = Get-Date -Format "yyyy-MM-dd"

# Gitee 的下载 URL
$GiteeDownloadUrl = "https://gitee.com/$GiteeOwner/$GiteeRepo/releases/download/v${Version}/Voconly_${Version}_x64-setup.exe"

# Escape for JSON
$ReleaseNotesJson = $ReleaseNotes -replace '\\', '\\' -replace '"', '\"' -replace "`n", '\n' -replace "`r", ''

$LatestContent = @"
{
  "version": "$Version",
  "date": "$Today",
  "notes": "$ReleaseNotesJson",
  "platforms": {
    "windows-x86_64": {
      "url": "$GiteeDownloadUrl",
      "signature": "$($NsisSig.Trim())"
    }
  }
}
"@

# Write without BOM
[System.IO.File]::WriteAllText("latest.json", $LatestContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "[OK] latest.json generated (version: $Version)" -ForegroundColor Green

# Build upload list
$FilesToUpload = @("latest.json", $NsisPath)
if ($HasMsi) {
    $FilesToUpload += $MsiPath
}

# Step 6: Delete old release if exists
Write-Host ""
Write-Host "[6/7] Handling existing release..." -ForegroundColor Yellow

$CheckReleaseUrl = "https://gitee.com/api/v5/repos/$GiteeOwner/$GiteeRepo/releases/tags/v$Version"
try {
    $CheckResponse = Invoke-RestMethod -Uri "$CheckReleaseUrl?access_token=$GiteeToken" -Method Get -ErrorAction SilentlyContinue
    if ($CheckResponse -and $CheckResponse.id) {
        Write-Host "Found existing release v$Version (ID: $($CheckResponse.id)), deleting..." -ForegroundColor Gray

        $DeleteUrl = "https://gitee.com/api/v5/repos/$GiteeOwner/$GiteeRepo/releases/$($CheckResponse.id)"
        $DeleteBody = @{
            access_token = $GiteeToken
        }
        Invoke-RestMethod -Uri $DeleteUrl -Method Delete -Body $DeleteBody | Out-Null
        Write-Host "[OK] Old release deleted" -ForegroundColor Green
        Start-Sleep -Seconds 2  # 等待删除完成
    } else {
        Write-Host "[OK] No existing release" -ForegroundColor Green
    }
} catch {
    Write-Host "[OK] No existing release" -ForegroundColor Green
}

# Step 7: Create release
Write-Host ""
Write-Host "[7/7] Creating release and uploading..." -ForegroundColor Yellow

$CreateReleaseUrl = "https://gitee.com/api/v5/repos/$GiteeOwner/$GiteeRepo/releases"
$CreateBody = @{
    access_token = $GiteeToken
    tag_name = "v$Version"
    name = "v$Version"
    body = $ReleaseNotes
    prerelease = $false
}

Write-Host "Creating release v$Version..." -ForegroundColor Gray
try {
    $ReleaseResponse = Invoke-RestMethod -Uri $CreateReleaseUrl -Method Post -Body $CreateBody
    $ReleaseId = $ReleaseResponse.id
    Write-Host "[OK] Release created (ID: $ReleaseId)" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Failed to create release: $_" -ForegroundColor Red
    exit 1
}

# Upload files
Write-Host "Uploading files..." -ForegroundColor Gray

foreach ($File in $FilesToUpload) {
    $FileName = Split-Path $File -Leaf
    Write-Host "  Uploading $FileName..." -ForegroundColor Gray

    # 使用 curl 上传文件（更可靠）
    $UploadUrl = "https://gitee.com/api/v5/repos/$GiteeOwner/$GiteeRepo/releases/$ReleaseId/attach_files"

    try {
        # 检查 curl 是否可用
        $null = Get-Command curl -ErrorAction Stop

        # 使用 curl 上传
        $CurlResult = curl -s -X POST `
            -H "Content-Type: multipart/form-data" `
            -F "access_token=$GiteeToken" `
            -F "file=@$File" `
            $UploadUrl 2>&1

        if ($LASTEXITCODE -eq 0) {
            Write-Host "  [OK] $FileName uploaded" -ForegroundColor Green
        } else {
            Write-Host "  [ERROR] Failed to upload $FileName" -ForegroundColor Red
            Write-Host "  curl output: $CurlResult" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  [ERROR] curl not found. Please install curl or use alternative method" -ForegroundColor Red
        Write-Host "  You can manually upload files at: https://gitee.com/$GiteeOwner/$GiteeRepo/releases/edit/$ReleaseId" -ForegroundColor Yellow
        break
    }

    Start-Sleep -Milliseconds 500  # 避免请求过快
}

# Show result
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Gitee Release Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Release URL: https://gitee.com/$GiteeOwner/$GiteeRepo/releases/tag/v$Version" -ForegroundColor Green
Write-Host ""
Write-Host "Uploaded files:" -ForegroundColor Yellow
foreach ($File in $FilesToUpload) {
    $Size = (Get-Item $File).Length / 1MB
    $SizeRounded = [math]::Round($Size, 2)
    Write-Host "  - $File ($SizeRounded MB)" -ForegroundColor Gray
}
Write-Host ""

# 返回 scripts 目录
Set-Location $ScriptDir