#!/bin/bash
# Termux Orchestrator Delivery Script
# Polls CI APIs, downloads artifacts, and delivers to Android device

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$HOME/.orchestrator/logs"
LOG_FILE="$LOG_DIR/delivery.log"
TIMEOUT_SECONDS=1800  # 30 minutes
POLL_INTERVAL=30      # 30 seconds
DOWNLOAD_DIR="$HOME/Downloads/orchestrator"

# Create directories
mkdir -p "$LOG_DIR" "$DOWNLOAD_DIR"

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
Termux Orchestrator Delivery Script

Usage: $0 --ci <provider> [options]

Options:
  --ci <provider>       CI provider: github, codemagic, eas
  --repo <repo>         Repository (format: owner/repo) [GitHub]
  --run-id <id>         GitHub Actions run ID
  --build-id <id>       Codemagic/EAS build ID
  --out <dir>           Download directory (default: $DOWNLOAD_DIR)
  --auto-install        Automatically install APK after download
  --no-notify           Skip termux-notification
  --timeout <seconds>   Max polling time (default: $TIMEOUT_SECONDS)
  --help               Show this help

Examples:
  $0 --ci github --repo user/app --run-id 123456 --auto-install
  $0 --ci codemagic --build-id abc123 --out ./downloads
  $0 --ci eas --build-id def456 --auto-install

Environment Variables:
  CODEMAGIC_ACCESS_TOKEN - Required for Codemagic
  EXPO_TOKEN            - Required for EAS
EOF
}

# Check if termux-api is available
check_termux_api() {
    if ! command -v termux-notification >/dev/null 2>&1; then
        log "Warning: termux-notification not available. Install termux-api package."
        return 1
    fi
    return 0
}

# Send notification
notify() {
    local title="$1"
    local message="$2"
    local action="${3:-}"
    
    if [ "$NO_NOTIFY" = true ]; then
        log "Notification disabled: $title - $message"
        return 0
    fi
    
    if check_termux_api; then
        if [ -n "$action" ]; then
            termux-notification --title "$title" --content "$message" --action "$action"
        else
            termux-notification --title "$title" --content "$message"
        fi
        log "Notification sent: $title - $message"
    else
        log "Notification failed: $title - $message"
    fi
}

# Poll GitHub Actions
poll_github() {
    local repo="$1"
    local run_id="$2"
    
    log "Polling GitHub Actions: $repo run $run_id"
    
    if ! command -v gh >/dev/null 2>&1; then
        die "GitHub CLI (gh) not found. Install with: pkg install gh"
    fi
    
    local attempts=0
    local max_attempts=$((TIMEOUT_SECONDS / POLL_INTERVAL))
    
    while [ $attempts -lt $max_attempts ]; do
        attempts=$((attempts + 1))
        
        log "Poll attempt $attempts/$max_attempts"
        
        # Get run status
        local status_info
        if ! status_info=$(gh api repos/"$repo"/actions/runs/"$run_id" --jq '.status + ":" + (.conclusion // "null")' 2>/dev/null); then
            log "Failed to get run status, retrying..."
            sleep "$POLL_INTERVAL"
            continue
        fi
        
        local status="${status_info%%:*}"
        local conclusion="${status_info##*:}"
        
        log "Status: $status, Conclusion: $conclusion"
        
        case "$status" in
            "completed")
                if [ "$conclusion" = "success" ]; then
                    log "Build completed successfully!"
                    return 0
                else
                    die "Build failed with conclusion: $conclusion"
                fi
                ;;
            "in_progress"|"queued")
                log "Build in progress, waiting..."
                ;;
            *)
                log "Unknown status: $status, continuing to poll..."
                ;;
        esac
        
        sleep "$POLL_INTERVAL"
    done
    
    die "Build did not complete within $TIMEOUT_SECONDS seconds"
}

# Poll Codemagic
poll_codemagic() {
    local build_id="$1"
    
    log "Polling Codemagic: build $build_id"
    
    if [ -z "${CODEMAGIC_ACCESS_TOKEN:-}" ]; then
        die "CODEMAGIC_ACCESS_TOKEN environment variable required"
    fi
    
    local attempts=0
    local max_attempts=$((TIMEOUT_SECONDS / POLL_INTERVAL))
    
    while [ $attempts -lt $max_attempts ]; do
        attempts=$((attempts + 1))
        
        log "Poll attempt $attempts/$max_attempts"
        
        # Get build status
        local response
        if ! response=$(curl -s -H "x-auth-token: $CODEMAGIC_ACCESS_TOKEN" \
                       "https://api.codemagic.io/builds/$build_id" 2>/dev/null); then
            log "Failed to get build status, retrying..."
            sleep "$POLL_INTERVAL"
            continue
        fi
        
        local status
        if ! status=$(echo "$response" | jq -r '.status' 2>/dev/null); then
            log "Failed to parse build status, retrying..."
            sleep "$POLL_INTERVAL"
            continue
        fi
        
        log "Status: $status"
        
        case "$status" in
            "finished")
                local success
                if success=$(echo "$response" | jq -r '.success' 2>/dev/null) && [ "$success" = "true" ]; then
                    log "Build completed successfully!"
                    return 0
                else
                    die "Build finished but failed"
                fi
                ;;
            "building"|"preparing"|"provisioning")
                log "Build in progress, waiting..."
                ;;
            "failed")
                die "Build failed"
                ;;
            *)
                log "Unknown status: $status, continuing to poll..."
                ;;
        esac
        
        sleep "$POLL_INTERVAL"
    done
    
    die "Build did not complete within $TIMEOUT_SECONDS seconds"
}

# Poll EAS
poll_eas() {
    local build_id="$1"
    
    log "Polling EAS: build $build_id"
    
    if ! command -v eas >/dev/null 2>&1; then
        die "EAS CLI not found. Install with: npm install -g eas-cli"
    fi
    
    local attempts=0
    local max_attempts=$((TIMEOUT_SECONDS / POLL_INTERVAL))
    
    while [ $attempts -lt $max_attempts ]; do
        attempts=$((attempts + 1))
        
        log "Poll attempt $attempts/$max_attempts"
        
        # Get build status
        local status
        if ! status=$(eas build:view "$build_id" --json 2>/dev/null | jq -r '.status' 2>/dev/null); then
            log "Failed to get build status, retrying..."
            sleep "$POLL_INTERVAL"
            continue
        fi
        
        log "Status: $status"
        
        case "$status" in
            "finished")
                log "Build completed successfully!"
                return 0
                ;;
            "in-queue"|"in-progress")
                log "Build in progress, waiting..."
                ;;
            "errored"|"canceled")
                die "Build $status"
                ;;
            *)
                log "Unknown status: $status, continuing to poll..."
                ;;
        esac
        
        sleep "$POLL_INTERVAL"
    done
    
    die "Build did not complete within $TIMEOUT_SECONDS seconds"
}

# Download artifact
download_artifact() {
    local ci_provider="$1"
    local identifier="$2"  # repo/run_id for github, build_id for others
    
    log "Downloading artifact from $ci_provider"
    
    # Use our Node.js download script
    local download_script="$SCRIPT_DIR/../ci/download_artifact.js"
    if [ ! -f "$download_script" ]; then
        # Try relative to current directory
        download_script="../termux-orchestrator-ci/ci/download_artifact.js"
    fi
    
    if [ ! -f "$download_script" ]; then
        die "Download script not found: $download_script"
    fi
    
    local download_cmd="node \"$download_script\" --provider \"$ci_provider\" --out \"$OUTPUT_DIR\""
    
    case "$ci_provider" in
        "github")
            local repo="${identifier%/*}"
            local run_id="${identifier#*/}"
            download_cmd="$download_cmd --repo \"$repo\" --run-id \"$run_id\""
            ;;
        "codemagic"|"eas")
            download_cmd="$download_cmd --build-id \"$identifier\""
            ;;
        *)
            die "Unknown CI provider: $ci_provider"
            ;;
    esac
    
    log "Running: $download_cmd"
    
    local result
    if ! result=$(eval "$download_cmd" 2>&1); then
        die "Download failed: $result"
    fi
    
    # Parse result JSON
    local downloaded_file
    if ! downloaded_file=$(echo "$result" | tail -n1 | jq -r '.file' 2>/dev/null); then
        log "Failed to parse download result, searching for APK files..."
        downloaded_file=$(find "$OUTPUT_DIR" -name "*.apk" -type f | head -n1)
        
        if [ -z "$downloaded_file" ]; then
            die "No APK files found after download"
        fi
    fi
    
    if [ ! -f "$downloaded_file" ]; then
        die "Downloaded file not found: $downloaded_file"
    fi
    
    log "Downloaded: $downloaded_file"
    echo "$downloaded_file"
}

# Install APK
install_apk() {
    local apk_file="$1"
    
    log "Installing APK: $apk_file"
    
    # Set proper permissions
    chmod 644 "$apk_file"
    
    # Try different installation methods
    if command -v termux-open >/dev/null 2>&1; then
        log "Installing via termux-open..."
        if termux-open "$apk_file"; then
            log "APK opened for installation"
            return 0
        else
            log "termux-open failed, trying adb..."
        fi
    fi
    
    # Try ADB if available and device is connected
    if command -v adb >/dev/null 2>&1; then
        if adb devices | grep -q "device$"; then
            log "Installing via ADB..."
            if adb install -r "$apk_file"; then
                log "APK installed via ADB"
                return 0
            else
                log "ADB install failed"
            fi
        else
            log "No ADB devices connected"
        fi
    fi
    
    log "Automatic installation failed. APK saved to: $apk_file"
    notify "APK Ready" "Manual installation required: $apk_file" "view"
    return 1
}

# Main function
main() {
    local CI_PROVIDER=""
    local REPO=""
    local RUN_ID=""
    local BUILD_ID=""
    local OUTPUT_DIR="$DOWNLOAD_DIR"
    local AUTO_INSTALL=false
    local NO_NOTIFY=false
    
    # Parse arguments
    while [ $# -gt 0 ]; do
        case "$1" in
            --ci)
                CI_PROVIDER="$2"
                shift 2
                ;;
            --repo)
                REPO="$2"
                shift 2
                ;;
            --run-id)
                RUN_ID="$2"
                shift 2
                ;;
            --build-id)
                BUILD_ID="$2"
                shift 2
                ;;
            --out)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --auto-install)
                AUTO_INSTALL=true
                shift
                ;;
            --no-notify)
                NO_NOTIFY=true
                shift
                ;;
            --timeout)
                TIMEOUT_SECONDS="$2"
                shift 2
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            *)
                die "Unknown option: $1"
                ;;
        esac
    done
    
    # Validate arguments
    if [ -z "$CI_PROVIDER" ]; then
        die "CI provider required. Use --ci github|codemagic|eas"
    fi
    
    mkdir -p "$OUTPUT_DIR"
    
    log "Starting delivery process..."
    log "CI Provider: $CI_PROVIDER"
    log "Output Directory: $OUTPUT_DIR"
    log "Auto Install: $AUTO_INSTALL"
    
    notify "Build Polling" "Waiting for $CI_PROVIDER build to complete..."
    
    # Poll for completion
    case "$CI_PROVIDER" in
        "github")
            if [ -z "$REPO" ] || [ -z "$RUN_ID" ]; then
                die "GitHub requires --repo and --run-id"
            fi
            poll_github "$REPO" "$RUN_ID"
            IDENTIFIER="$REPO/$RUN_ID"
            ;;
        "codemagic")
            if [ -z "$BUILD_ID" ]; then
                die "Codemagic requires --build-id"
            fi
            poll_codemagic "$BUILD_ID"
            IDENTIFIER="$BUILD_ID"
            ;;
        "eas")
            if [ -z "$BUILD_ID" ]; then
                die "EAS requires --build-id"
            fi
            poll_eas "$BUILD_ID"
            IDENTIFIER="$BUILD_ID"
            ;;
        *)
            die "Unknown CI provider: $CI_PROVIDER"
            ;;
    esac
    
    # Download artifact
    notify "Build Complete" "Downloading APK..."
    local apk_file
    apk_file=$(download_artifact "$CI_PROVIDER" "$IDENTIFIER")
    
    # Get file info
    local file_size
    file_size=$(du -h "$apk_file" | cut -f1)
    
    log "APK downloaded: $apk_file ($file_size)"
    
    # Install if requested
    if [ "$AUTO_INSTALL" = true ]; then
        notify "Installing" "Installing APK ($file_size)..."
        
        if install_apk "$apk_file"; then
            notify "Installation Complete" "App installed successfully!"
            log "Delivery completed successfully"
        else
            notify "Installation Failed" "Manual installation required: $apk_file"
            log "Automatic installation failed, but APK is available"
        fi
    else
        notify "Download Complete" "APK ready: $apk_file ($file_size)" "view"
        log "Download completed, auto-install disabled"
    fi
    
    log "Delivery process finished"
}

# Run main function with all arguments
main "$@"