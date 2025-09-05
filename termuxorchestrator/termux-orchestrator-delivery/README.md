# Termux Orchestrator Delivery

APK delivery system for Termux Orchestrator. Polls CI endpoints, downloads build artifacts, and delivers them to Android devices using termux-api.

## Features

- **Multi-Platform Support**: GitHub Actions, Codemagic, EAS Build
- **Smart Polling**: Efficient polling with configurable timeouts
- **Multiple Installation Methods**: termux-open, ADB, manual fallback
- **Rich Notifications**: Progress updates via termux-notification
- **Robust Error Handling**: Detailed logging and graceful degradation

## Installation

```bash
cd termux-orchestrator-delivery

# Make scripts executable
chmod +x delivery/*.sh

# Install dependencies
pkg install termux-api jq curl unzip
```

## Prerequisites

### Required Packages

```bash
# Core packages
pkg install termux-api jq curl unzip nodejs

# Optional for advanced features
pkg install adb gh file
```

### Termux:API Setup

1. Install **Termux:API** app from F-Droid or Google Play
2. Grant necessary permissions in Android settings:
   - Notifications
   - Storage access
   - Install unknown apps (for auto-install)

## Usage

### Basic Usage

```bash
# Poll GitHub Actions and auto-install
./delivery/poll_and_deliver.sh --ci github --repo user/app --run-id 123456 --auto-install

# Poll Codemagic build
./delivery/poll_and_deliver.sh --ci codemagic --build-id abc123 --out ./downloads

# Poll EAS build
./delivery/poll_and_deliver.sh --ci eas --build-id def456 --auto-install
```

### Manual APK Installation

```bash
# Install downloaded APK
./delivery/auto_install.sh /path/to/app.apk

# Force ADB installation
./delivery/auto_install.sh /path/to/app.apk --force-adb
```

## API Reference

### poll_and_deliver.sh

Main delivery script that polls CI APIs and downloads artifacts.

**Usage:**
```bash
./poll_and_deliver.sh --ci <provider> [options]
```

**Options:**
- `--ci <provider>`: CI provider (github, codemagic, eas)
- `--repo <repo>`: Repository in format owner/repo (GitHub only)
- `--run-id <id>`: GitHub Actions run ID
- `--build-id <id>`: Codemagic or EAS build ID
- `--out <dir>`: Download directory (default: ~/Downloads/orchestrator)
- `--auto-install`: Automatically install APK after download
- `--no-notify`: Skip termux-notification
- `--timeout <seconds>`: Max polling time (default: 1800)

**Examples:**
```bash
# GitHub Actions with auto-install
./poll_and_deliver.sh --ci github --repo myuser/myapp --run-id 123456 --auto-install

# Codemagic with custom output directory
./poll_and_deliver.sh --ci codemagic --build-id abc123 --out ./my-builds

# EAS with extended timeout
./poll_and_deliver.sh --ci eas --build-id def456 --timeout 3600
```

### auto_install.sh

APK installation script with multiple fallback methods.

**Usage:**
```bash
./auto_install.sh <apk_file> [options]
```

**Options:**
- `--force-adb`: Force ADB installation even if termux-open is available
- `--no-permissions`: Don't attempt to set file permissions

**Installation Methods:**
1. **termux-open** (preferred): Uses Android's system package installer
2. **ADB install**: Direct installation via ADB (requires USB debugging)
3. **Manual fallback**: Opens file manager with instructions

## CI Provider Setup

### GitHub Actions

**Required:**
- GitHub CLI (`gh`) installed and authenticated
- Repository access permissions

**Authentication:**
```bash
# Install GitHub CLI
pkg install gh

# Authenticate
gh auth login
```

### Codemagic

**Required:**
- Codemagic access token
- Project ID

**Environment Variables:**
```bash
export CODEMAGIC_ACCESS_TOKEN="your_token_here"
export CODEMAGIC_PROJECT_ID="your_project_id"
```

**Getting Credentials:**
1. Go to Codemagic dashboard
2. Navigate to Settings > Personal access tokens
3. Create new token with build access
4. Copy project ID from project settings

### EAS Build

**Required:**
- EAS CLI installed
- Expo account authentication

**Setup:**
```bash
# Install EAS CLI
npm install -g eas-cli

# Authenticate
eas login
```

## Configuration

### Environment Variables

Set in your `~/.termux_orchestrator_env`:

```bash
# Codemagic
export CODEMAGIC_ACCESS_TOKEN="your_codemagic_token"
export CODEMAGIC_PROJECT_ID="your_project_id"

# EAS/Expo
export EXPO_TOKEN="your_expo_token"

# GitHub (usually set by gh auth)
export GITHUB_TOKEN="your_github_token"
```

### Polling Configuration

Default settings in `poll_and_deliver.sh`:
- **Timeout**: 1800 seconds (30 minutes)
- **Poll Interval**: 30 seconds
- **Download Directory**: `~/Downloads/orchestrator`

Override with command-line options:
```bash
./poll_and_deliver.sh --timeout 3600 --out ./my-downloads ...
```

## Installation Methods

### 1. termux-open (Recommended)

Uses Android's built-in package installer.

**Advantages:**
- Most user-friendly
- Works with Android's security model
- Handles permissions properly

**Requirements:**
- termux-api package installed
- "Install from Unknown Sources" enabled

### 2. ADB Install

Direct installation via Android Debug Bridge.

**Advantages:**
- Fully automated
- No user interaction required
- Works for system apps

**Requirements:**
- ADB installed in Termux
- USB debugging enabled on device
- Device authorized for ADB

**Setup:**
```bash
# Install ADB
pkg install android-tools

# Enable USB debugging on your device
# Settings > Developer Options > USB Debugging

# Connect via USB and authorize
adb devices
```

### 3. Manual Fallback

Opens file manager with installation instructions.

**When Used:**
- termux-open fails
- ADB unavailable or fails
- User needs manual control

## Notifications

The delivery system uses termux-notification to provide progress updates:

- **Build Polling**: "Waiting for build to complete..."
- **Build Complete**: "Downloading APK..."
- **Installing**: "Installing APK (file size)..."
- **Success**: "App installed successfully!"
- **Manual Required**: "Manual installation required: /path/to/file.apk"

### Notification Actions

Some notifications include actions:
- **View**: Opens file manager to APK location
- **Install**: Launches installation process

## Logging

All operations are logged to `~/.orchestrator/logs/delivery.log`:

```
[2024-01-15T10:30:00] Starting delivery process...
[2024-01-15T10:30:00] CI Provider: github
[2024-01-15T10:30:05] Poll attempt 1/60: in_progress
[2024-01-15T10:32:30] Build completed successfully!
[2024-01-15T10:32:35] Downloaded: /home/Downloads/app.apk (5.2M)
[2024-01-15T10:32:40] APK opened with system installer
```

## Error Handling

The delivery system handles common failure scenarios:

### Build Failures
- Polls until build completes or times out
- Reports specific failure reasons
- Preserves logs for debugging

### Download Issues
- Retries on network failures
- Validates downloaded files
- Falls back to manual instructions

### Installation Problems
- Tries multiple installation methods
- Provides detailed error messages
- Offers manual installation guidance

## Troubleshooting

### Common Issues

#### "termux-notification not available"
```bash
# Install termux-api
pkg install termux-api

# Install Termux:API app from F-Droid/Play Store
# Grant notification permissions in Android settings
```

#### "GitHub CLI not found"
```bash
# Install GitHub CLI
pkg install gh

# Authenticate
gh auth login
```

#### "ADB devices not found"
```bash
# Enable USB debugging on your device
# Connect via USB
# Check connection
adb devices

# If showing "unauthorized", check phone for authorization dialog
```

#### "APK installation failed"
```bash
# Check if "Install from Unknown Sources" is enabled
# Try manual installation via file manager
# Check APK file permissions
ls -la /path/to/app.apk
```

### Debug Mode

Enable detailed logging:
```bash
# Set LOG_LEVEL environment variable
export LOG_LEVEL=debug

# Check logs
tail -f ~/.orchestrator/logs/delivery.log
```

### Permission Issues

Fix file permissions:
```bash
# Make scripts executable
chmod +x delivery/*.sh

# Fix APK permissions
chmod 644 /path/to/app.apk
```

## Integration

This module integrates with:

- **termux-orchestrator-ci**: CI trigger and polling
- **termux-orchestrator**: Main orchestrator pipeline
- **termux-api**: Android system integration

### Example Integration

```bash
#!/bin/bash
# Complete build and delivery pipeline

# 1. Trigger build
node ../ci/trigger_ci.js --ci github --repo user/app --poll > build_result.json

# 2. Extract build info
RUN_ID=$(cat build_result.json | jq -r '.runId')
REPO=$(cat build_result.json | jq -r '.repo')

# 3. Poll and deliver
./delivery/poll_and_deliver.sh --ci github --repo "$REPO" --run-id "$RUN_ID" --auto-install
```

## Security Considerations

- APK files are downloaded to user-accessible directories
- File permissions are set to 644 (readable by all)
- ADB installation requires USB debugging (security risk)
- Always verify APK sources before installation

## License

MIT - see LICENSE file for details.