#!/bin/bash

# Voconly - Build Release for macOS
# Build and sign the release version of Voconly for macOS
#
# Usage:
#   ./build-release-mac.sh --version <version> [OPTIONS]
#
# Options:
#   --version <version>     Version number (required, e.g., 1.0.0)
#   --key <key>             Tauri signing private key (for updater artifacts)
#   -h, --help              Show this help message
#
# Environment variables (fallback):
#   TAURI_SIGNING_PRIVATE_KEY  Tauri signing private key

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
VERSION=""
TAURI_SIGNING_KEY_ARG=""

# ============================================
# Parse command line arguments
# ============================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            VERSION="$2"
            shift 2
            ;;
        --key)
            TAURI_SIGNING_KEY_ARG="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: ./build-release-mac.sh --version <version> [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --version <version>   Version number (required, e.g., 1.0.0)"
            echo "  --key <key>           Tauri signing private key (for updater artifacts)"
            echo "  -h, --help            Show this help message"
            echo ""
            echo "Environment variables (fallback):"
            echo "  TAURI_SIGNING_PRIVATE_KEY  Tauri signing private key"
            echo ""
            echo "Example:"
            echo "  ./build-release-mac.sh --version 1.0.0 --key \"your-private-key\""
            exit 0
            ;;
        *)
            echo -e "${RED}[ERROR] Unknown option: $1${NC}"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# ============================================
# Validate required parameters
# ============================================

if [[ -z "$VERSION" ]]; then
    echo -e "${RED}[ERROR] Version is required${NC}"
    echo "Use: ./build-release-mac.sh --version <version>"
    exit 1
fi

# ============================================
# Check if running on macOS
# ============================================

if [[ "$OSTYPE" != "darwin"* ]]; then
    echo ""
    echo -e "${RED}[ERROR] This script is designed for macOS only${NC}"
    echo -e "${YELLOW}Current OS: $OSTYPE${NC}"
    echo -e "${YELLOW}For Windows builds, use scripts/build-release-local.ps1${NC}"
    echo ""
    exit 1
fi

# ============================================
# Set signing key
# ============================================

if [ -n "$TAURI_SIGNING_KEY_ARG" ]; then
    export TAURI_SIGNING_PRIVATE_KEY="$TAURI_SIGNING_KEY_ARG"
    echo -e "${GREEN}[INFO] Using signing key from command line argument${NC}"
elif [ -n "$TAURI_SIGNING_PRIVATE_KEY" ]; then
    echo -e "${GREEN}[INFO] Using signing key from environment variable${NC}"
else
    echo -e "${YELLOW}[WARN] No signing key provided (updater artifacts will not be signed)${NC}"
    echo -e "${YELLOW}       Use --key or set TAURI_SIGNING_PRIVATE_KEY${NC}"
fi

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Voconly - Build Release (macOS)${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ============================================
# [1/5] Update version in Cargo.toml
# ============================================

echo -e "${YELLOW}[1/5] Updating version to $VERSION...${NC}"
echo ""

CARGO_PATH="src-tauri/Cargo.toml"

# Replace version in [package] section (only the first occurrence after [package])
# Match: [package] followed by any content, then version = "..."
sed -i.bak 's/^\(version = "\)[^"]*\(".*\)$/\1'"$VERSION"'\2/' "$CARGO_PATH"
rm -f "${CARGO_PATH}.bak"

echo -e "  ${GREEN}[OK] Updated Cargo.toml version to $VERSION${NC}"
echo ""

# ============================================
# [2/5] Pre-flight checks
# ============================================

echo -e "${YELLOW}[2/5] Checking prerequisites...${NC}"
echo ""

# Check Xcode Command Line Tools
if ! xcode-select -p &>/dev/null; then
    echo -e "  ${RED}[ERROR] Xcode Command Line Tools not installed${NC}"
    echo -e "  ${YELLOW}Installing Xcode Command Line Tools...${NC}"
    xcode-select --install 2>/dev/null || true
    echo -e "  ${YELLOW}Please complete the installation and run this script again${NC}"
    exit 1
else
    echo -e "  ${GREEN}[OK] Xcode Command Line Tools installed${NC}"
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

# Check patches directory
if [ ! -d "patches" ]; then
    echo -e "  ${RED}[ERROR] patches directory not found${NC}"
    echo -e "  ${YELLOW}This directory is required for macOS build${NC}"
    exit 1
else
    echo -e "  ${GREEN}[OK] patches directory exists${NC}"
fi

echo ""

# ============================================
# [3/5] Install dependencies
# ============================================

echo -e "${YELLOW}[3/5] Checking dependencies...${NC}"
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
# [4/5] Build
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
# [5/5] Locate output files
# ============================================

echo -e "${YELLOW}[5/5] Locating output files...${NC}"
echo ""

OUTPUT_DIR="src-tauri/target/release/bundle"

if [ -d "$OUTPUT_DIR" ]; then
    echo -e "${GREEN}[INFO] Output location: $OUTPUT_DIR/${NC}"
    echo ""

    # List the bundle contents
    echo -e "${YELLOW}Generated files:${NC}"

    # DMG file
    if [ -d "$OUTPUT_DIR/dmg" ]; then
        DMG_FILE=$(ls $OUTPUT_DIR/dmg/*.dmg 2>/dev/null | head -1)
        if [ -n "$DMG_FILE" ]; then
            DMG_SIZE=$(du -h "$DMG_FILE" | cut -f1)
            echo -e "  ${GREEN}DMG: $DMG_FILE ($DMG_SIZE)${NC}"
        fi
    fi

    # App bundle
    if [ -d "$OUTPUT_DIR/macos" ]; then
        APP_FILE=$(ls $OUTPUT_DIR/macos/*.app 2>/dev/null | head -1)
        if [ -n "$APP_FILE" ]; then
            APP_SIZE=$(du -sh "$APP_FILE" | cut -f1)
            echo -e "  ${GREEN}App: $APP_FILE ($APP_SIZE)${NC}"
        fi
    fi

    # Updater artifacts (if signed)
    if [ -f "$OUTPUT_DIR/Voconly.app.tar.gz" ]; then
        TAR_SIZE=$(du -h "$OUTPUT_DIR/Voconly.app.tar.gz" | cut -f1)
        echo -e "  ${GREEN}Updater: $OUTPUT_DIR/Voconly.app.tar.gz ($TAR_SIZE)${NC}"
    fi
    if [ -f "$OUTPUT_DIR/Voconly.app.tar.gz.sig" ]; then
        echo -e "  ${GREEN}Signature: $OUTPUT_DIR/Voconly.app.tar.gz.sig${NC}"
    fi

    # Check if latest.json was generated
    if [ -f "$OUTPUT_DIR/../../latest.json" ]; then
        echo -e "  ${GREEN}Update manifest: src-tauri/target/release/latest.json${NC}"
    fi
else
    echo -e "${RED}[ERROR] Bundle directory not found${NC}"
    echo -e "${YELLOW}Build may have failed silently. Check logs above.${NC}"
fi

echo ""
echo -e "${CYAN}Next steps:${NC}"
echo -e "  ${YELLOW}1. Test the .dmg file by installing${NC}"
echo -e "  ${YELLOW}2. Upload files to GitHub Releases${NC}"
echo -e "  ${YELLOW}   - DMG: src-tauri/target/release/bundle/dmg/Voconly_${VERSION}_aarch64.dmg${NC}"
if [ -f "$OUTPUT_DIR/../../latest.json" ]; then
    echo -e "  ${YELLOW}   - Update manifest: src-tauri/target/release/latest.json${NC}"
fi
echo ""