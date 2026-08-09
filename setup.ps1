# Voconly Setup Script
# One-click setup: check dependencies, install missing tools, configure environment
#
# Usage: powershell -File setup.ps1
#        or run directly: ./setup.ps1

param(
    [switch]$SkipVulkan  # Force skip Vulkan (for systems without GPU)
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Faster downloads

$ScriptDir = $PSScriptRoot
$ProjectRoot = $ScriptDir

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Voconly Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# Section 1: Check System Dependencies
# ============================================

Write-Host "[1/4] Checking system dependencies..." -ForegroundColor Yellow
Write-Host ""

$MissingDeps = @()

# Check Rust
Write-Host "  Checking Rust..." -ForegroundColor Gray
$RustInstalled = $false
try {
    $RustVersion = rustc --version 2>$null
    if ($RustVersion) {
        Write-Host "  [OK] Rust installed: $RustVersion" -ForegroundColor Green
        $RustInstalled = $true
    }
} catch {}

if (-not $RustInstalled) {
    Write-Host "  [MISSING] Rust not installed" -ForegroundColor Red
    $MissingDeps += "Rust"
}

# Check Node.js
Write-Host "  Checking Node.js..." -ForegroundColor Gray
$NodeInstalled = $false
try {
    $NodeVersion = node --version 2>$null
    if ($NodeVersion) {
        Write-Host "  [OK] Node.js installed: $NodeVersion" -ForegroundColor Green
        $NodeInstalled = $true
    }
} catch {}

if (-not $NodeInstalled) {
    Write-Host "  [MISSING] Node.js not installed" -ForegroundColor Red
    $MissingDeps += "Node.js"
}

# Check pnpm
Write-Host "  Checking pnpm..." -ForegroundColor Gray
$PnpmInstalled = $false
try {
    $PnpmVersion = pnpm --version 2>$null
    if ($PnpmVersion) {
        Write-Host "  [OK] pnpm installed: $PnpmVersion" -ForegroundColor Green
        $PnpmInstalled = $true
    }
} catch {}

if (-not $PnpmInstalled) {
    Write-Host "  [MISSING] pnpm not installed" -ForegroundColor Red
    $MissingDeps += "pnpm"
}

# Install missing dependencies
if ($MissingDeps.Count -gt 0) {
    Write-Host ""
    Write-Host "  Missing dependencies: $($MissingDeps -join ', ')" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Installing missing dependencies..." -ForegroundColor Yellow

    foreach ($Dep in $MissingDeps) {
        switch ($Dep) {
            "Rust" {
                Write-Host ""
                Write-Host "  [INFO] Installing Rust via rustup-init..." -ForegroundColor Yellow
                Write-Host "  This may take a few minutes..." -ForegroundColor Gray

                # Download rustup-init
                $RustupUrl = "https://win.rustup.rs/x86_64"
                $RustupPath = "$env:TEMP\rustup-init.exe"

                try {
                    Invoke-WebRequest -Uri $RustupUrl -OutFile $RustupPath -UseBasicParsing
                    Write-Host "  [OK] Downloaded rustup-init.exe" -ForegroundColor Green

                    # Run rustup-init with default options (non-interactive)
                    $RustupProcess = Start-Process -FilePath $RustupPath -ArgumentList "-y", "--default-toolchain", "stable" -Wait -PassThru

                    if ($RustupProcess.ExitCode -eq 0) {
                        Write-Host "  [OK] Rust installed successfully" -ForegroundColor Green

                        # Refresh environment variables
                        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "Machine")

                        # Source cargo env
                        $CargoHome = $env:CARGO_HOME
                        if (-not $CargoHome) { $CargoHome = "$env:USERPROFILE\.cargo" }
                        $env:Path = "$CargoHome\bin;$env:Path"
                    } else {
                        Write-Host "  [ERROR] Rust installation failed" -ForegroundColor Red
                        Write-Host "  Please install manually: https://rustup.rs/" -ForegroundColor Yellow
                        exit 1
                    }

                    # Cleanup
                    Remove-Item $RustupPath -Force -ErrorAction SilentlyContinue
                } catch {
                    Write-Host "  [ERROR] Failed to download rustup-init: $_" -ForegroundColor Red
                    Write-Host "  Please install manually: https://rustup.rs/" -ForegroundColor Yellow
                    exit 1
                }
            }

            "Node.js" {
                Write-Host ""
                Write-Host "  [INFO] Installing Node.js via winget..." -ForegroundColor Yellow
                Write-Host "  This may take a few minutes..." -ForegroundColor Gray

                try {
                    $WingetResult = winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements 2>&1

                    if ($WingetResult -match "Successfully installed") {
                        Write-Host "  [OK] Node.js installed successfully" -ForegroundColor Green

                        # Refresh environment
                        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "Machine")
                    } else {
                        Write-Host "  [WARN] winget install may have issues, checking fallback..." -ForegroundColor Yellow

                        # Fallback: download from nodejs.org
                        $NodeUrl = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
                        $NodePath = "$env:TEMP\node-installer.msi"

                        Invoke-WebRequest -Uri $NodeUrl -OutFile $NodePath -UseBasicParsing
                        Write-Host "  [OK] Downloaded Node.js installer" -ForegroundColor Green

                        $NodeProcess = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i", $NodePath, "/quiet", "/norestart" -Wait -PassThru

                        if ($NodeProcess.ExitCode -eq 0) {
                            Write-Host "  [OK] Node.js installed successfully" -ForegroundColor Green
                        } else {
                            Write-Host "  [ERROR] Node.js installation failed" -ForegroundColor Red
                            Write-Host "  Please install manually: https://nodejs.org/" -ForegroundColor Yellow
                            exit 1
                        }

                        Remove-Item $NodePath -Force -ErrorAction SilentlyContinue
                    }
                } catch {
                    Write-Host "  [ERROR] Failed to install Node.js: $_" -ForegroundColor Red
                    Write-Host "  Please install manually: https://nodejs.org/" -ForegroundColor Yellow
                    exit 1
                }
            }

            "pnpm" {
                Write-Host ""
                Write-Host "  [INFO] Installing pnpm via npm..." -ForegroundColor Yellow

                try {
                    # Use corepack to enable pnpm (Node.js 18+ includes corepack)
                    $CorepackResult = corepack enable 2>&1

                    if ($CorepackResult -match "error" -or $LASTEXITCODE -ne 0) {
                        # Fallback: npm install -g pnpm
                        npm install -g pnpm 2>&1
                    }

                    # Verify installation
                    $PnpmVersion = pnpm --version 2>$null
                    if ($PnpmVersion) {
                        Write-Host "  [OK] pnpm installed: $PnpmVersion" -ForegroundColor Green
                    } else {
                        Write-Host "  [ERROR] pnpm installation failed" -ForegroundColor Red
                        Write-Host "  Please install manually: npm install -g pnpm" -ForegroundColor Yellow
                        exit 1
                    }
                } catch {
                    Write-Host "  [ERROR] Failed to install pnpm: $_" -ForegroundColor Red
                    Write-Host "  Please install manually: npm install -g pnpm" -ForegroundColor Yellow
                    exit 1
                }
            }
        }
    }

    # Final verification
    Write-Host ""
    Write-Host "  Verifying installations..." -ForegroundColor Yellow

    $RustVersion = rustc --version 2>$null
    $NodeVersion = node --version 2>$null
    $PnpmVersion = pnpm --version 2>$null

    if (-not $RustVersion -or -not $NodeVersion -or -not $PnpmVersion) {
        Write-Host "  [ERROR] Some dependencies still missing after installation" -ForegroundColor Red
        Write-Host "  Please restart your terminal and run this script again" -ForegroundColor Yellow
        Write-Host "  Or install manually:" -ForegroundColor Yellow
        Write-Host "    - Rust: https://rustup.rs/" -ForegroundColor Gray
        Write-Host "    - Node.js: https://nodejs.org/" -ForegroundColor Gray
        Write-Host "    - pnpm: npm install -g pnpm" -ForegroundColor Gray
        exit 1
    }

    Write-Host "  [OK] All dependencies installed" -ForegroundColor Green
}

Write-Host ""

# ============================================
# Section 2: Check GPU Support
# ============================================

Write-Host "[2/4] Checking GPU support..." -ForegroundColor Yellow
Write-Host ""

$HasGPU = $false
$GPUInfo = ""
$NeedsVulkan = $false

# Detect GPU using WMI
try {
    $GPUs = Get-WmiObject Win32_VideoController -ErrorAction SilentlyContinue

    foreach ($GPU in $GPUs) {
        $GPUName = $GPU.Name
        Write-Host "  Detected GPU: $GPUName" -ForegroundColor Gray

        # Check if it's a dedicated GPU (NVIDIA, AMD, Intel Arc)
        if ($GPUName -match "NVIDIA|AMD|Radeon|Arc|GeForce|RTX|GTX") {
            $HasGPU = $true
            $GPUInfo = $GPUName
            $NeedsVulkan = $true
            break
        }

        # Intel integrated graphics may support Vulkan on newer chips
        if ($GPUName -match "Intel.*UHD|Intel.*Iris|Intel.*Xe") {
            $HasGPU = $true
            $GPUInfo = $GPUName
            $NeedsVulkan = $true
        }
    }
} catch {
    Write-Host "  [WARN] Could not detect GPU via WMI" -ForegroundColor Yellow
}

# User override
if ($SkipVulkan) {
    Write-Host "  [INFO] SkipVulkan flag set, using CPU mode" -ForegroundColor Yellow
    $NeedsVulkan = $false
}

if ($HasGPU) {
    Write-Host "  [OK] GPU detected: $GPUInfo" -ForegroundColor Green
    Write-Host "  [INFO] Will use Vulkan GPU acceleration" -ForegroundColor Yellow
} else {
    Write-Host "  [INFO] No dedicated GPU detected, using CPU mode" -ForegroundColor Yellow
    $NeedsVulkan = $false
}

Write-Host ""

# ============================================
# Section 3: Check/Install Vulkan SDK (if needed)
# ============================================

Write-Host "[3/4] Checking Vulkan SDK..." -ForegroundColor Yellow
Write-Host ""

if ($NeedsVulkan) {
    $VulkanSDK = $env:VULKAN_SDK

    if ($VulkanSDK -and (Test-Path $VulkanSDK)) {
        Write-Host "  [OK] Vulkan SDK found: $VulkanSDK" -ForegroundColor Green
    } else {
        # Search common installation paths
        $VulkanPaths = @(
            "C:\VulkanSDK",
            "D:\VulkanSDK"
        )

        $VulkanFound = $false
        foreach ($BasePath in $VulkanPaths) {
            if (Test-Path $BasePath) {
                $Versions = Get-ChildItem $BasePath -Directory | Sort-Object Name -Descending
                if ($Versions.Count -gt 0) {
                    $LatestVulkan = $Versions[0].FullName
                    $env:VULKAN_SDK = $LatestVulkan
                    $env:Path = "$LatestVulkan\Bin;$env:Path"
                    Write-Host "  [OK] Vulkan SDK found: $LatestVulkan" -ForegroundColor Green
                    $VulkanFound = $true
                    break
                }
            }
        }

        if (-not $VulkanFound) {
            Write-Host "  [MISSING] Vulkan SDK not installed" -ForegroundColor Red
            Write-Host ""
            Write-Host "  Vulkan SDK is required for GPU acceleration." -ForegroundColor Yellow
            Write-Host ""
            Write-Host "  Install options:" -ForegroundColor Yellow
            Write-Host "    1. Download from: https://vulkan.lunarg.com/sdk/home" -ForegroundColor Gray
            Write-Host "    2. Or run: winget install KhronosGroup.VulkanSDK" -ForegroundColor Gray
            Write-Host ""
            Write-Host "  After installation, restart this terminal and run setup.ps1 again" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "  Alternatively, use CPU mode: ./setup.ps1 -SkipVulkan" -ForegroundColor Yellow
            Write-Host ""

            # Ask user what to do
            Write-Host "  Press Enter to exit and install Vulkan SDK manually" -ForegroundColor Yellow
            Write-Host "  Or type 'cpu' to continue with CPU mode: " -ForegroundColor Yellow -NoNewline
            $UserChoice = Read-Host

            if ($UserChoice -eq "cpu") {
                Write-Host "  [INFO] Switching to CPU mode" -ForegroundColor Yellow
                $NeedsVulkan = $false
            } else {
                exit 1
            }
        }
    }
} else {
    Write-Host "  [SKIP] Vulkan SDK not needed (CPU mode)" -ForegroundColor Gray
}

Write-Host ""

# ============================================
# Section 4: Install npm dependencies
# ============================================

Write-Host "[4/4] Installing npm dependencies..." -ForegroundColor Yellow
Write-Host ""

$NodeModulesPath = Join-Path $ProjectRoot "node_modules"

if (Test-Path $NodeModulesPath) {
    Write-Host "  node_modules exists, checking if update needed..." -ForegroundColor Gray
}

Write-Host "  Running: npm install" -ForegroundColor Gray
Write-Host "  (warnings about deprecated packages are normal)" -ForegroundColor DarkGray

# Use cmd to run npm install, avoiding PowerShell stderr handling issues
Push-Location $ProjectRoot
cmd /c "npm install 2>&1" | Out-Null
$ExitCode = $LASTEXITCODE
Pop-Location

if ($ExitCode -eq 0) {
    Write-Host "  [OK] npm dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] npm install failed with exit code: $ExitCode" -ForegroundColor Red
    Write-Host "  Try running manually: npm install" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# ============================================
# Summary
# ============================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  - Rust: $(rustc --version)" -ForegroundColor Green
Write-Host "  - Node.js: $(node --version)" -ForegroundColor Green
Write-Host "  - npm: $(npm --version)" -ForegroundColor Green
Write-Host "  - GPU: $(if ($HasGPU) { $GPUInfo } else { 'None (CPU mode)' })" -ForegroundColor Green
Write-Host "  - Vulkan SDK: $(if ($NeedsVulkan -and $env:VULKAN_SDK) { $env:VULKAN_SDK } else { 'Not needed' })" -ForegroundColor Green
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  Run the development server:" -ForegroundColor Gray
Write-Host "    ./start-dev.ps1" -ForegroundColor White
Write-Host ""
Write-Host "  Or build release version:" -ForegroundColor Gray
Write-Host "    npm run tauri build" -ForegroundColor White
Write-Host ""

Write-Host "Note: Whisper models will be downloaded automatically when you first use the app." -ForegroundColor Yellow
Write-Host ""