#!/bin/bash
# Termux Prerequisites Installer for NL→App Orchestrator
# Installs required packages and checks system requirements

set -euo pipefail

# Configuration
LOG_DIR="$HOME/.orchestrator/logs"
LOG_FILE="$LOG_DIR/bootstrap.log"
MIN_FREE_SPACE_MB=1000

# Package list
REQUIRED_PACKAGES=(
    "git"
    "nodejs"
    "python"
    "openjdk-17"
    "clang"
    "gradle"
    "openssh"
    "termux-api"
    "unzip"
    "wget"
    "curl"
)

# Create log directory
mkdir -p "$LOG_DIR"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check storage space
check_storage() {
    log "Checking available storage..."
    local free_space_kb
    free_space_kb=$(df "$HOME" | awk 'NR==2 {print $4}')
    local free_space_mb=$((free_space_kb / 1024))
    
    if [ "$free_space_mb" -lt "$MIN_FREE_SPACE_MB" ]; then
        log "ERROR: Insufficient storage. Need at least ${MIN_FREE_SPACE_MB}MB, found ${free_space_mb}MB"
        exit 1
    fi
    
    log "Storage check passed: ${free_space_mb}MB available"
}

# Check if package is installed
is_package_installed() {
    dpkg -l | grep -q "^ii.*$1"
}

# Install package if missing
install_package() {
    local package="$1"
    
    if is_package_installed "$package"; then
        log "Package $package is already installed"
    else
        log "Installing package: $package"
        if ! pkg install -y "$package"; then
            log "ERROR: Failed to install $package"
            return 1
        fi
        log "Successfully installed $package"
    fi
}

# Check Termux permissions
check_permissions() {
    log "Checking Termux permissions..."
    
    if ! command -v termux-setup-storage >/dev/null 2>&1; then
        log "WARNING: termux-setup-storage not available. Some features may not work."
    fi
    
    # Test basic file operations
    if ! touch "$HOME/.orchestrator_test" 2>/dev/null; then
        log "ERROR: Cannot write to home directory"
        exit 1
    fi
    rm -f "$HOME/.orchestrator_test"
    
    log "Permission check passed"
}

# Main installation function
main() {
    log "Starting Termux prerequisites installation"
    
    # System checks
    check_storage
    check_permissions
    
    # Update package list
    log "Updating package repositories..."
    pkg update -y
    
    # Install packages
    local failed_packages=()
    for package in "${REQUIRED_PACKAGES[@]}"; do
        if ! install_package "$package"; then
            failed_packages+=("$package")
        fi
    done
    
    # Report results
    if [ ${#failed_packages[@]} -eq 0 ]; then
        log "All packages installed successfully"
        log "Installation completed successfully"
        
        # Verify key installations
        log "Verifying installations..."
        command -v git >/dev/null && log "✓ Git: $(git --version)"
        command -v node >/dev/null && log "✓ Node.js: $(node --version)"
        command -v python >/dev/null && log "✓ Python: $(python --version)"
        command -v java >/dev/null && log "✓ Java: $(java -version 2>&1 | head -1)"
        
        exit 0
    else
        log "ERROR: Failed to install packages: ${failed_packages[*]}"
        log "Please check the log file at: $LOG_FILE"
        exit 1
    fi
}

# Show usage if --help
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    cat << EOF
Termux Prerequisites Installer

Installs required packages for the NL→App Orchestrator:
- Development tools: git, nodejs, python, openjdk-17, clang, gradle
- System tools: openssh, termux-api, unzip, wget, curl

Usage: $0

Logs are written to: $LOG_FILE
EOF
    exit 0
fi

main "$@"