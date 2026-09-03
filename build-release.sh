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

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}[INFO] node_modules not found, installing dependencies...${NC}"
    pnpm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}[ERROR] pnpm install failed${NC}"
        exit 1
    fi
fi

# Check if Rust is installed
if ! command -v cargo &>/dev/null; then
    echo -e "${RED}[ERROR] Rust is not installed${NC}"
    echo -e "${YELLOW}[INFO] Please install Rust from https://rustup.rs/${NC}"
    exit 1
fi

echo -e "${YELLOW}[INFO] Building release version...${NC}"
echo -e "${YELLOW}[INFO] This may take several minutes...${NC}"
echo ""

pnpm tauri build

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}[ERROR] Build failed${NC}"
    exit 1
fi

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Build completed successfully!${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Show output location
if [ -d "src-tauri/target/release/bundle" ]; then
    echo -e "${GREEN}[INFO] Output location: src-tauri/target/release/bundle/${NC}"
    echo ""

    # List the bundle contents
    echo -e "${YELLOW}Generated files:${NC}"
    if [ -d "src-tauri/target/release/bundle/dmg" ]; then
        DMG_FILE=$(ls src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | head -1)
        if [ -n "$DMG_FILE" ]; then
            echo -e "  ${GREEN}DMG: $DMG_FILE${NC}"
        fi
    fi
    if [ -d "src-tauri/target/release/bundle/macos" ]; then
        APP_FILE=$(ls src-tauri/target/release/bundle/macos/*.app 2>/dev/null | head -1)
        if [ -n "$APP_FILE" ]; then
            echo -e "  ${GREEN}App: $APP_FILE${NC}"
        fi
    fi
fi

echo ""