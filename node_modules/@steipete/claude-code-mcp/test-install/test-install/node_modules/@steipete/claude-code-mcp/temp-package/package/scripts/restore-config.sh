#!/bin/bash

# Restore Original Claude Configuration

set -e

CONFIG_DIR="$HOME/Library/Application Support/Claude"
ORIGINAL_CONFIG="$CONFIG_DIR/claude_desktop_config.json"
BACKUP_CONFIG="$CONFIG_DIR/claude_desktop_config.backup.json"

if [ -f "$BACKUP_CONFIG" ]; then
    echo "🔄 Restoring original Claude configuration..."
    cp "$BACKUP_CONFIG" "$ORIGINAL_CONFIG"
    echo "✅ Original configuration restored!"
    echo "♻️  Removing backup file..."
    rm "$BACKUP_CONFIG"
else
    echo "⚠️  No backup configuration found!"
fi

echo ""
echo "🔄 Restarting Claude to apply changes..."
osascript -e 'tell application "Claude" to quit'
sleep 2
osascript -e 'tell application "Claude" to activate'

echo ""
echo "✅ Claude has been restarted with original configuration!"