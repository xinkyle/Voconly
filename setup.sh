#!/bin/bash

# Voconly Setup Script for macOS
# One-click setup: check dependencies, install missing tools, configure environment
#
# Usage: ./setup.sh
#        Or with options: ./setup.sh --skip-gpu

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Voconly Setup (macOS)${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Parse arguments
SKIP_GPU=false
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --skip-gpu) SKIP_GPU=true ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# ============================================
# Section 1: Check Xcode Command Line Tools
# ============================================

echo -e "${YELLOW}[1/4] Checking Xcode Command Line Tools...${NC}"
echo ""

if ! xcode-select -p &>/dev/null; then
    echo -e "  ${RED}[MISSING] Xcode Command Line Tools not installed${NC}"
    echo -e "  ${YELLOW}Installing Xcode Command Line Tools...${NC}"
    echo -e "  ${GRAY}This may take several minutes...${NC}"

    xcode-select --install 2>/dev/null || true

    echo ""
    echo -e "  ${YELLOW}A dialog will appear. Please click 'Install' to proceed.${NC}"
    echo -e "  ${YELLOW}After installation completes, run this script again.${NC}"
    echo ""
    exit 0
else
    XCODE_PATH=$(xcode-select -p)
    echo -e "  ${GREEN}[OK] Xcode Command Line Tools: $XCODE_PATH${NC}"
fi

echo ""

# ============================================
# Section 2: Check System Dependencies
# ============================================

echo -e "${YELLOW}[2/4] Checking system dependencies...${NC}"
echo ""

MISSING_DEPS=()

# Check Rust
echo -e "  ${GRAY}Checking Rust...${NC}"
if command -v rustc &>/dev/null; then
    RUST_VERSION=$(rustc --version)
    echo -e "  ${GREEN}[OK] Rust installed: $RUST_VERSION${NC}"
else
    echo -e "  ${RED}[MISSING] Rust not installed${NC}"
    MISSING_DEPS+=("Rust")
fi

# Check Node.js
echo -e "  ${GRAY}Checking Node.js...${NC}"
if command -v node &>/dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "  ${GREEN}[OK] Node.js installed: $NODE_VERSION${NC}"
else
    echo -e "  ${RED}[MISSING] Node.js not installed${NC}"
    MISSING_DEPS+=("Node.js")
fi

# Check pnpm
echo -e "  ${GRAY}Checking pnpm...${NC}"
if command -v pnpm &>/dev/null; then
    PNPM_VERSION=$(pnpm --version)
    echo -e "  ${GREEN}[OK] pnpm installed: $PNPM_VERSION${NC}"
else
    echo -e "  ${RED}[MISSING] pnpm not installed${NC}"
    MISSING_DEPS+=("pnpm")
fi

# Install missing dependencies
if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo ""
    echo -e "  ${YELLOW}Missing dependencies: ${MISSING_DEPS[*]}${NC}"
    echo ""
    echo -e "  ${YELLOW}Installing missing dependencies...${NC}"

    for DEP in "${MISSING_DEPS[@]}"; do
        case $DEP in
            "Rust")
                echo ""
                echo -e "  ${YELLOW}[INFO] Installing Rust via rustup...${NC}"
                echo -e "  ${GRAY}This may take a few minutes...${NC}"

                curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

                # Source cargo environment
                source "$HOME/.cargo/env"

                if command -v rustc &>/dev/null; then
                    echo -e "  ${GREEN}[OK] Rust installed successfully${NC}"
                else
                    echo -e "  ${RED}[ERROR] Rust installation failed${NC}"
                    echo -e "  ${YELLOW}Please install manually: https://rustup.rs/${NC}"
                    exit 1
                fi
                ;;

            "Node.js")
                echo ""
                echo -e "  ${YELLOW}[INFO] Installing Node.js via Homebrew...${NC}"
                echo -e "  ${GRAY}This may take a few minutes...${NC}"

                if command -v brew &>/dev/null; then
                    brew install node@22
                    brew link node@22

                    if command -v node &>/dev/null; then
                        echo -e "  ${GREEN}[OK] Node.js installed successfully${NC}"
                    else
                        echo -e "  ${RED}[ERROR] Node.js installation failed${NC}"
                        echo -e "  ${YELLOW}Please install manually: https://nodejs.org/${NC}"
                        exit 1
                    fi
                else
                    echo -e "  ${RED}[ERROR] Homebrew not installed${NC}"
                    echo -e "  ${YELLOW}Please install Homebrew first: https://brew.sh/${NC}"
                    echo -e "  ${YELLOW}Or install Node.js manually: https://nodejs.org/${NC}"
                    exit 1
                fi
                ;;

            "pnpm")
                echo ""
                echo -e "  ${YELLOW}[INFO] Installing pnpm...${NC}"

                if command -v corepack &>/dev/null; then
                    corepack enable
                    corepack prepare pnpm@latest --activate
                else
                    npm install -g pnpm
                fi

                if command -v pnpm &>/dev/null; then
                    PNPM_VER=$(pnpm --version)
                    echo -e "  ${GREEN}[OK] pnpm installed: $PNPM_VER${NC}"
                else
                    echo -e "  ${RED}[ERROR] pnpm installation failed${NC}"
                    echo -e "  ${YELLOW}Please install manually: npm install -g pnpm${NC}"
                    exit 1
                fi
                ;;
        esac
    done

    # Final verification
    echo ""
    echo -e "  ${YELLOW}Verifying installations...${NC}"

    if ! command -v rustc &>/dev/null || ! command -v node &>/dev/null || ! command -v pnpm &>/dev/null; then
        echo -e "  ${RED}[ERROR] Some dependencies still missing after installation${NC}"
        echo -e "  ${YELLOW}Please restart your terminal and run this script again${NC}"
        exit 1
    fi

    echo -e "  ${GREEN}[OK] All dependencies installed${NC}"
fi

echo ""

# ============================================
# Section 3: Check GPU Support (Metal)
# ============================================

echo -e "${YELLOW}[3/4] Checking GPU support...${NC}"
echo ""

if [ "$SKIP_GPU" = true ]; then
    echo -e "  ${YELLOW}[INFO] Skip GPU flag set, using CPU mode${NC}"
else
    # macOS uses Metal for GPU acceleration
    # Check if Metal is available (all modern Macs have Metal support)
    METAL_SUPPORT=$(system_profiler SPDisplaysDataType 2>/dev/null | grep -i "Metal" || true)

    if [ -n "$METAL_SUPPORT" ]; then
        GPU_INFO=$(system_profiler SPDisplaysDataType 2>/dev/null | grep "Chipset Model" | head -1 | sed 's/.*: //' || echo "Unknown GPU")
        echo -e "  ${GREEN}[OK] GPU detected: $GPU_INFO${NC}"
        echo -e "  ${GREEN}[OK] Metal support available${NC}"
    else
        echo -e "  ${YELLOW}[INFO] No Metal support detected, using CPU mode${NC}"
    fi
fi

echo ""

# ============================================
# Section 4: Install npm dependencies
# ============================================

echo -e "${YELLOW}[4/4] Installing npm dependencies...${NC}"
echo ""

cd "$PROJECT_ROOT"

if [ -d "node_modules" ]; then
    echo -e "  ${GRAY}node_modules exists, checking if update needed...${NC}"
fi

echo -e "  ${GRAY}Running: pnpm install${NC}"
echo -e "  ${GRAY}(warnings about deprecated packages are normal)${NC}"

if pnpm install; then
    echo -e "  ${GREEN}[OK] npm dependencies installed${NC}"
else
    echo -e "  ${RED}[ERROR] pnpm install failed${NC}"
    echo -e "  ${YELLOW}Try running manually: pnpm install${NC}"
    exit 1
fi

echo ""

# ============================================
# Summary
# ============================================

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Setup Complete!${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo -e "${YELLOW}Summary:${NC}"
echo -e "  - Rust: $(rustc --version)${GREEN}${NC}"
echo -e "  - Node.js: $(node --version)${GREEN}${NC}"
echo -e "  - pnpm: $(pnpm --version)${GREEN}${NC}"
echo -e "  - Xcode: $(xcode-select -p)${GREEN}${NC}"
echo ""

echo -e "${YELLOW}Next steps:${NC}"
echo -e "  ${GRAY}Run the development server:${NC}"
echo -e "    pnpm tauri dev"
echo ""
echo -e "  ${GRAY}Or build release version:${NC}"
echo -e "    ./build-release.sh"
echo ""

echo -e "${YELLOW}Note: Whisper models will be downloaded automatically when you first use the app.${NC}"
echo ""