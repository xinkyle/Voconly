#!/bin/bash

# Voconly - Build Release for macOS
# Build the release version of Voconly

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Voconly - Build Release (macOS)${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ============================================
# Pre-flight checks
# ============================================

echo -e "${YELLOW}[1/5] Checking prerequisites...${NC}"
echo ""

# Check Xcode Command Line Tools
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! xcode-select -p &>/dev/null; then
        echo -e "  ${RED}[ERROR] Xcode Command Line Tools not installed${NC}"
        echo -e "  ${YELLOW}Installing Xcode Command Line Tools...${NC}"
        xcode-select --install 2>/dev/null || true
        echo -e "  ${YELLOW}Please complete the installation and run this script again${NC}"
        exit 1
    else
        echo -e "  ${GREEN}[OK] Xcode Command Line Tools installed${NC}"
    fi
fi

# Check Node.js
if ! command -v node &>/dev/null; then
    echo -e "  ${RED}[ERROR] Node.js is not installed${NC}"
    echo -e "  ${YELLOW}Please install Node.js from https://nodejs.org/${NC}"
    exit 1
else
    NODE_VERSION=$(node --version)
    echo -e "  ${GREEN}[OK] Node.js: $NODE_VERSION${NC}"
fi

# Check pnpm
if ! command -v pnpm &>/dev/null; then
    echo -e "  ${RED}[ERROR] pnpm is not installed${NC}"
    echo -e "  ${YELLOW}Installing pnpm...${NC}"
    npm install -g pnpm
    if [ $? -ne 0 ]; then
        echo -e "  ${RED}[ERROR] pnpm installation failed${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}[OK] pnpm installed${NC}"
else
    PNPM_VERSION=$(pnpm --version)
    echo -e "  ${GREEN}[OK] pnpm: $PNPM_VERSION${NC}"
fi

# Check Rust
if ! command -v cargo &>/dev/null; then
    echo -e "  ${RED}[ERROR] Rust is not installed${NC}"
    echo -e "  ${YELLOW}Please install Rust from https://rustup.rs/${NC}"
    exit 1
else
    RUST_VERSION=$(rustc --version)
    echo -e "  ${GREEN}[OK] Rust: $RUST_VERSION${NC}"
fi

echo ""

# ============================================
# Install npm dependencies
# ============================================

echo -e "${YELLOW}[2/5] Checking npm dependencies...${NC}"
echo ""

if [ ! -d "node_modules" ]; then
    echo -e "  ${YELLOW}[INFO] node_modules not found, installing dependencies...${NC}"
    pnpm install
    if [ $? -ne 0 ]; then
        echo -e "  ${RED}[ERROR] pnpm install failed${NC}"
        exit 1
    fi
else
    echo -e "  ${GREEN}[OK] node_modules exists${NC}"
    echo -e "  ${YELLOW}[INFO] Checking if dependencies need update...${NC}"
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
fi

echo ""

# ============================================
# Check Rust dependencies
# ============================================

echo -e "${YELLOW}[3/5] Checking Rust dependencies...${NC}"
echo ""

# Check if patches directory exists
if [ ! -d "patches" ]; then
    echo -e "  ${RED}[ERROR] patches directory not found${NC}"
    echo -e "  ${YELLOW}This directory is required for macOS build${NC}"
    exit 1
else
    echo -e "  ${GREEN}[OK] patches directory exists${NC}"
fi

echo ""

# ============================================
# Build
# ============================================

echo -e "${YELLOW}[4/5] Building release version...${NC}"
echo -e "${YELLOW}[INFO] This may take 10-20 minutes on first build...${NC}"
echo ""

START_TIME=$(date +%s)

# Build with verbose output for better debugging
pnpm tauri build --verbose

BUILD_EXIT_CODE=$?

END_TIME=$(date +%s)
BUILD_TIME=$((END_TIME - START_TIME))

echo ""

if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}  Build failed!${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Possible solutions:${NC}"
    echo -e "  1. Check if Xcode Command Line Tools are installed"
    echo -e "  2. Run: xcode-select --install"
    echo -e "  3. Check the error messages above"
    echo -e "  4. Try: cargo clean && pnpm tauri build"
    echo ""
    exit 1
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Build completed successfully!${NC}"
echo -e "${GREEN}  Build time: ${BUILD_TIME} seconds${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# ============================================
# Show output location
# ============================================

echo -e "${YELLOW}[5/5] Locating output files...${NC}"
echo ""

if [ -d "src-tauri/target/release/bundle" ]; then
    echo -e "${GREEN}[INFO] Output location: src-tauri/target/release/bundle/${NC}"
    echo ""

    # List the bundle contents
    echo -e "${YELLOW}Generated files:${NC}"
    if [ -d "src-tauri/target/release/bundle/dmg" ]; then
        DMG_FILE=$(ls src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | head -1)
        if [ -n "$DMG_FILE" ]; then
            DMG_SIZE=$(du -h "$DMG_FILE" | cut -f1)
            echo -e "  ${GREEN}DMG: $DMG_FILE ($DMG_SIZE)${NC}"
        fi
    fi
    if [ -d "src-tauri/target/release/bundle/macos" ]; then
        APP_FILE=$(ls src-tauri/target/release/bundle/macos/*.app 2>/dev/null | head -1)
        if [ -n "$APP_FILE" ]; then
            APP_SIZE=$(du -sh "$APP_FILE" | cut -f1)
            echo -e "  ${GREEN}App: $APP_FILE ($APP_SIZE)${NC}"
        fi
    fi
else
    echo -e "${RED}[ERROR] Bundle directory not found${NC}"
    echo -e "${YELLOW}Build may have failed silently. Check logs above.${NC}"
fi

echo ""
echo -e "${CYAN}Next steps:${NC}"
echo -e "  ${YELLOW}1. Double-click the .dmg file to install${NC}"
echo -e "  ${YELLOW}2. Or copy the .app file to Applications folder${NC}"
echo ""