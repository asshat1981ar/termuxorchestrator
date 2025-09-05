# Snapshot file
# Unset all aliases to avoid conflicts with functions
unalias -a 2>/dev/null || true
shopt -s expand_aliases
# Check for rg availability
if ! command -v rg >/dev/null 2>&1; then
  alias rg='/data/data/com.termux/files/usr/lib/node_modules/\@anthropic-ai/claude-code/vendor/ripgrep/arm64-android/rg'
fi
export PATH=/data/data/com.termux/files/usr/bin\:/product/bin\:/apex/com.android.runtime/bin\:/apex/com.android.art/bin\:/system_ext/bin\:/system/bin\:/system/xbin\:/odm/bin\:/vendor/bin\:/vendor/xbin
