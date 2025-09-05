#!/bin/bash
# Auto Install Script for Termux Orchestrator
# Attempts to install APK via multiple methods

set -euo pipefail

# Configuration
LOG_DIR="$HOME/.orchestrator/logs"
LOG_FILE="$LOG_DIR/auto_install.log"

# Create log directory
mkdir -p "$LOG_DIR"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Error handling
die() {
    log "FATAL: $*"
    exit 1
}

# Show usage
usage() {
    cat << EOF
Termux Orchestrator Auto Install Script

Attempts to install APK using available methods:
1. termux-open (preferred - uses Android's package installer)
2. ADB install (requires USB debugging and authorized device)
3. Manual fallback (opens file manager)

Usage: $0 <apk_file> [options]

Options:
  --force-adb      Force ADB installation even if termux-open is available
  --no-permissions Don't attempt to set file permissions
  --help          Show this help

Examples:
  $0 /path/to/app.apk
  $0 /path/to/app.apk --force-adb
  
Requirements:
  - termux-api package for termux-open
  - adb for USB installation (optional)
  - Proper file permissions on APK
EOF
}

# Check if file exists and is readable
check_apk_file() {
    local apk_file="$1"
    
    if [ ! -f "$apk_file" ]; then
        die "APK file not found: $apk_file"
    fi
    
    if [ ! -r "$apk_file" ]; then
        die "APK file not readable: $apk_file"
    fi
    
    # Check if it's actually an APK file
    if ! file "$apk_file" | grep -q "Android"; then
        log "Warning: File may not be a valid APK: $apk_file"
    fi
    
    local file_size
    file_size=$(du -h "$apk_file" | cut -f1)
    log "APK file: $apk_file ($file_size)"
}

# Set proper file permissions
set_permissions() {
    local apk_file="$1"
    
    if [ "$NO_PERMISSIONS" = true ]; then
        log "Skipping permission setup"
        return 0
    fi
    
    log "Setting file permissions..."
    
    # Make sure file is readable by all
    if chmod 644 "$apk_file" 2>/dev/null; then
        log "Set permissions 644 on $apk_file"
    else
        log "Warning: Failed to set permissions on $apk_file"
    fi
}

# Install via termux-open
install_via_termux_open() {
    local apk_file="$1"
    
    if ! command -v termux-open >/dev/null 2>&1; then
        log "termux-open not available"
        return 1
    fi
    
    log "Installing via termux-open..."
    
    if termux-open "$apk_file"; then
        log "APK opened with system installer"
        return 0
    else
        log "termux-open failed"
        return 1
    fi
}

# Check ADB status
check_adb_status() {
    if ! command -v adb >/dev/null 2>&1; then
        log "ADB not available"
        return 1
    fi
    
    local adb_version
    if adb_version=$(adb version 2>/dev/null); then
        log "ADB available: $adb_version"
    else
        log "ADB command failed"
        return 1
    fi
    
    # Check for connected devices
    local devices_output
    if devices_output=$(adb devices 2>/dev/null); then
        log "ADB devices output:"
        echo "$devices_output" | while IFS= read -r line; do
            log "  $line"
        done
        
        # Check if any devices are connected and authorized
        if echo "$devices_output" | grep -q "device$"; then
            log "Found authorized ADB device"
            return 0
        elif echo "$devices_output" | grep -q "unauthorized"; then
            log "Device found but unauthorized - check phone for ADB authorization dialog"
            return 1
        else
            log "No ADB devices connected"
            return 1
        fi
    else
        log "Failed to get ADB device list"
        return 1
    fi
}

# Install via ADB
install_via_adb() {
    local apk_file="$1"
    
    if ! check_adb_status; then
        return 1
    fi
    
    log "Installing via ADB..."
    
    # Try to install with replace flag
    if adb install -r "$apk_file" 2>&1 | tee -a "$LOG_FILE"; then
        log "APK installed successfully via ADB"
        return 0
    else
        log "ADB install failed"
        return 1
    fi
}

# Fallback: open file manager or provide instructions
manual_fallback() {
    local apk_file="$1"
    
    log "Attempting manual fallback..."
    
    # Try to open file manager to the APK location
    local apk_dir
    apk_dir=$(dirname "$apk_file")
    
    if command -v termux-open >/dev/null 2>&1; then
        log "Opening file manager..."
        if termux-open "$apk_dir"; then
            log "Opened file manager to: $apk_dir"
        else
            log "Failed to open file manager"
        fi
    fi
    
    # Send notification with instructions
    if command -v termux-notification >/dev/null 2>&1; then
        termux-notification \
            --title "Manual Installation Required" \
            --content "APK: $(basename "$apk_file")"
    fi
    
    # Show manual instructions
    cat << EOF

Manual Installation Instructions:
=================================

Your APK is ready for installation: $apk_file

Method 1 - File Manager:
1. Open your file manager app
2. Navigate to: $apk_dir
3. Tap on: $(basename "$apk_file")
4. Follow the installation prompts

Method 2 - From Termux:
1. Run: termux-open "$apk_file"
2. If that fails, copy to Downloads:
   cp "$apk_file" ~/storage/downloads/
3. Use your file manager to install from Downloads

Method 3 - ADB (requires USB debugging):
1. Enable Developer Options on your phone
2. Enable USB Debugging
3. Connect to computer with ADB
4. Run: adb install -r "$apk_file"

Troubleshooting:
- Make sure "Install from Unknown Sources" is enabled
- Check that the APK file isn't corrupted
- Try restarting your device if installation fails

EOF
    
    return 1  # Still return failure since automatic installation didn't work
}

# Main installation logic
main() {
    local APK_FILE=""
    local FORCE_ADB=false
    local NO_PERMISSIONS=false
    
    # Parse arguments
    while [ $# -gt 0 ]; do
        case "$1" in
            --force-adb)
                FORCE_ADB=true
                shift
                ;;
            --no-permissions)
                NO_PERMISSIONS=true
                shift
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            -*)
                die "Unknown option: $1"
                ;;
            *)
                if [ -z "$APK_FILE" ]; then
                    APK_FILE="$1"
                else
                    die "Multiple APK files specified"
                fi
                shift
                ;;
        esac
    done
    
    # Validate arguments
    if [ -z "$APK_FILE" ]; then
        die "APK file required. Use: $0 <apk_file>"
    fi
    
    log "Starting APK installation process..."
    log "APK: $APK_FILE"
    log "Force ADB: $FORCE_ADB"
    
    # Check APK file
    check_apk_file "$APK_FILE"
    
    # Set permissions
    set_permissions "$APK_FILE"
    
    # Try installation methods in order of preference
    if [ "$FORCE_ADB" = true ]; then
        log "Forcing ADB installation..."
        if install_via_adb "$APK_FILE"; then
            log "Installation completed successfully via ADB"
            exit 0
        else
            log "Forced ADB installation failed, trying other methods..."
        fi
    fi
    
    # Try termux-open first (most user-friendly)
    if install_via_termux_open "$APK_FILE"; then
        log "Installation initiated successfully via termux-open"
        
        # Send success notification
        if command -v termux-notification >/dev/null 2>&1; then
            termux-notification \
                --title "APK Installation Started" \
                --content "$(basename "$APK_FILE") - Follow system prompts to complete"
        fi
        
        exit 0
    fi
    
    # Try ADB as secondary option
    if install_via_adb "$APK_FILE"; then
        log "Installation completed successfully via ADB"
        
        # Send success notification
        if command -v termux-notification >/dev/null 2>&1; then
            termux-notification \
                --title "APK Installed" \
                --content "$(basename "$APK_FILE") - Installed via ADB"
        fi
        
        exit 0
    fi
    
    # All automatic methods failed, provide manual fallback
    log "All automatic installation methods failed"
    manual_fallback "$APK_FILE"
    
    exit 1
}

# Run main function with all arguments
main "$@"