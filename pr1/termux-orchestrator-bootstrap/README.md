# Termux Orchestrator Bootstrap

Bootstrap environment for the NL→App Orchestrator on Android Termux. This toolkit installs prerequisites, sets up environment variables, and configures code-server for mobile development.

## Quick Start

```bash
# Clone and run bootstrap
git clone <this-repo-url> termux-orchestrator-bootstrap
cd termux-orchestrator-bootstrap/bootstrap

# Step 1: Install prerequisites
bash install_prereqs.sh

# Step 2: Setup environment
bash setup_env.sh

# Step 3: Install code-server
bash install_code_server.sh

# Step 4: Source environment
source ~/.termux_orchestrator_env
```

## What Gets Installed

### Prerequisites (`install_prereqs.sh`)
- **Development tools**: git, nodejs, python, openjdk-17, clang, gradle
- **System utilities**: openssh, termux-api, unzip, wget, curl
- **Storage check**: Ensures ≥1GB free space
- **Logging**: All actions logged to `~/.orchestrator/logs/bootstrap.log`

### Environment Setup (`setup_env.sh`)
- **Environment file**: `~/.termux_orchestrator_env` (mode 600)
- **API key placeholders**: OpenAI, Anthropic, DeepSeek, Google, GitHub
- **Auto-sourcing**: Adds sourcing to `~/.bashrc`
- **Helper command**: `orchestrator-env-source`

### Code-Server (`install_code_server.sh`)
- **Latest stable**: Downloads from GitHub releases
- **Secure config**: Binds to 0.0.0.0:8080 with password auth
- **Startup script**: `start-code-server` command
- **Architecture support**: ARM64, ARMHF, AMD64

### Aliases (`.termux_aliases`)
- `o` → orchestrator shortcut
- `cs` → start code-server
- Standard development aliases (git, ls, etc.)

## Post-Installation Steps

### 1. Configure API Keys
```bash
nano ~/.termux_orchestrator_env
# Replace placeholder values with your actual API keys
```

### 2. Enable Termux:API (Optional)
```bash
# Install Termux:API app from F-Droid or Google Play
# Enable permissions in Android settings
termux-setup-storage
```

### 3. Load Environment
```bash
source ~/.termux_orchestrator_env
# Or restart shell
```

### 4. Test Installation
```bash
# Verify prerequisites
which git node python java
node -v
termux-info

# Test code-server
start-code-server
# Access at http://localhost:8080 (password: termux123)
```

## Verification Commands

```bash
# Check installations
git --version
node --version  
python --version
java -version

# Check environment
echo $ORCHESTRATOR_HOME
echo $GITHUB_TOKEN

# Check code-server
code-server --version
ls ~/.config/code-server/
```

## Troubleshooting

### Storage Issues
```bash
# Check available space
df -h $HOME
# Clean package cache
pkg clean
```

### Permission Issues
```bash
# Setup storage access
termux-setup-storage
# Check home directory permissions
ls -la $HOME
```

### Code-Server Issues
```bash
# Check configuration
cat ~/.config/code-server/config.yaml
# Check logs
tail ~/.orchestrator/logs/code_server.log
# Manual start
~/.local/bin/code-server --version
```

### Network Access
```bash
# Find local IP for code-server access
ifconfig | grep inet
# Test connectivity
curl -I http://localhost:8080
```

## Security Notes

⚠️ **Code-server runs with default password `termux123`**
- Change password in `~/.config/code-server/config.yaml`
- Only use on trusted networks
- Consider SSH tunneling for remote access

⚠️ **API keys are stored in plaintext**
- Environment file has 600 permissions
- Never commit `.termux_orchestrator_env` to git
- Rotate keys regularly

## File Structure

```
termux-orchestrator-bootstrap/
├── bootstrap/
│   ├── install_prereqs.sh      # Package installer
│   ├── setup_env.sh            # Environment setup
│   └── install_code_server.sh  # Code-server installer
├── dotfiles/
│   └── .termux_aliases         # Shell aliases
└── README.md                   # This file

# Created files:
~/.termux_orchestrator_env      # Environment variables
~/.orchestrator/logs/           # Installation logs
~/.local/bin/code-server        # Code-server binary
~/.config/code-server/          # Code-server config
```

## Next Steps

After bootstrap completion:
1. **Install orchestrator CLI**: Follow termux-orchestrator project setup
2. **Configure GitHub**: Set up SSH keys and repository access  
3. **Test workflow**: Run `orchestrator "build me a simple app" --dry-run`
4. **Setup CI/CD**: Configure EAS, Codemagic, or GitHub Actions

## Support

For issues:
- Check logs in `~/.orchestrator/logs/`
- Verify Termux package versions with `pkg list-installed`
- Ensure sufficient storage and permissions
- Test individual components before reporting bugs