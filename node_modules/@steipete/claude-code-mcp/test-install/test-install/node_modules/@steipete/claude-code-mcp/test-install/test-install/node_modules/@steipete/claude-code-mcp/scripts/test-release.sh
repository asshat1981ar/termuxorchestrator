#!/bin/bash

# Test Release Script
# This script helps test the MCP server locally before publishing

set -e

echo "🧪 Testing MCP Server Release Process"
echo "====================================="

# Build the project
echo "📦 Building project..."
npm run build

# Run basic tests
echo "🧪 Running tests..."
npm test

# Create a backup of the current Claude config
CONFIG_DIR="$HOME/Library/Application Support/Claude"
ORIGINAL_CONFIG="$CONFIG_DIR/claude_desktop_config.json"
BACKUP_CONFIG="$CONFIG_DIR/claude_desktop_config.backup.json"
TEST_CONFIG="$CONFIG_DIR/claude_desktop_config_local_test.json"

echo "💾 Backing up current Claude configuration..."
cp "$ORIGINAL_CONFIG" "$BACKUP_CONFIG"

echo "🔄 Switching to local test configuration..."
cp "$TEST_CONFIG" "$ORIGINAL_CONFIG"

echo "✅ Local test configuration activated!"
echo ""

# Restart Claude using AppleScript
echo "🔄 Restarting Claude Desktop app..."
osascript -e 'tell application "Claude" to quit'
sleep 2
osascript -e 'tell application "Claude" to activate'
sleep 5

# Monitor the logs
LOG_FILE="$HOME/Library/Logs/Claude/mcp-server-claude-code.log"
echo "📊 Monitoring MCP server logs..."
echo "   Waiting for server initialization..."
echo ""

# Clear previous log entries (optional - comment out if you want to keep history)
# > "$LOG_FILE"

# Start monitoring logs in background
tail -f "$LOG_FILE" | grep -E "(Initializing server|Server started|version|error|Error)" &
TAIL_PID=$!

echo "📋 Next steps:"
echo "1. Claude has been restarted automatically"
echo "2. Watch the log output above for any errors"
echo "3. Test the claude-code-local MCP server in Claude"
echo "4. Verify the version print feature works"
echo "5. Press Ctrl+C to stop monitoring logs"
echo ""
echo "⚠️  To restore original configuration, run:"
echo "   ./scripts/restore-config.sh"
echo ""
echo "📝 Once testing is complete, run:"
echo "   ./scripts/publish-release.sh"

# Wait for user to press Ctrl+C
trap "kill $TAIL_PID 2>/dev/null; exit" INT
wait