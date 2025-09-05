# 🤖 Termux Orchestrator

**Natural Language to Mobile App Generator for Android**

Transform your app ideas into working APKs using AI-powered orchestration on Termux. Simply describe your app in natural language, and the orchestrator handles the complete pipeline from idea to installation.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: Android/Termux](https://img.shields.io/badge/Platform-Android%2FTermux-green.svg)](https://termux.com/)
[![Framework: React Native](https://img.shields.io/badge/Framework-React%20Native-blue.svg)](https://reactnative.dev/)

---

## 🎯 Quick Start

```bash
# 1. Run bootstrap setup
cd termux-orchestrator-bootstrap/bootstrap
bash setup_env.sh

# 2. Configure your API keys
orchestrator-env-edit

# 3. Generate your first app
orchestrator generate "A todo app with dark mode and SQLite storage"
```

**That's it!** The orchestrator will generate, build, and install your app automatically.

---

## 📱 What It Does

**Input:** `"Build me a recipe app with offline storage and dark mode"`

**Output:** Working Android APK installed on your device

### Complete Pipeline
```
Natural Language → AI Agents → AppSpec JSON → Project Scaffold → CI Build → APK → Installation
```

### Supported Frameworks
- ✅ **React Native + Expo** (Primary)
- 🚧 **Flutter** (Coming soon)
- 🚧 **Jetpack Compose** (Coming soon)

---

## 🏗️ Architecture

Termux Orchestrator uses a microservice architecture with specialized components:

```
termux-orchestrator/
├── termux-orchestrator-bootstrap/     # Environment setup
├── termux-orchestrator-agents/       # AI coordination
├── termux-orchestrator-scaffolders/  # Project generation
├── termux-orchestrator-ci/           # Build automation
└── termux-orchestrator-delivery/     # APK delivery
```

### Component Overview

| Component | Purpose | Status |
|-----------|---------|--------|
| **Bootstrap** | Termux environment setup | ✅ Complete |
| **Agents** | Multi-AI orchestration (Gemini, Claude, Continue, SWE-Agent) | ✅ Complete |
| **Scaffolders** | Generate React Native/Flutter/Compose projects from AppSpec | ✅ Complete |
| **CI** | GitHub Actions, Codemagic, EAS build integration | ✅ Complete |
| **Delivery** | APK download, installation via termux-open/ADB | ✅ Complete |

---

## 📦 Installation

### Prerequisites

**Required:**
- Android device with Termux installed
- Node.js >= 16.0.0
- Git, curl, unzip
- At least 2GB free storage

**Termux Setup:**
```bash
pkg update && pkg upgrade
pkg install nodejs git python openjdk-17 
pkg install termux-api curl unzip
```

### Full Installation

```bash
# 1. Clone repository
git clone https://github.com/asshat1981ar/termuxorchestrator.git
cd termuxorchestrator

# 2. Run bootstrap setup
cd termux-orchestrator-bootstrap/bootstrap
bash install_prereqs.sh
bash setup_env.sh

# 3. Install dependencies
cd ../../termux-orchestrator-agents
npm install

# 4. Configure environment
orchestrator-env-edit
# Add your API keys (see Configuration section)

# 5. Validate setup
orchestrator-env-validate
```

---

## ⚙️ Configuration

### Required API Keys

Edit your environment file: `orchestrator-env-edit`

```bash
# Essential (choose at least one AI provider)
OPENAI_API_KEY=sk-proj-your_openai_key_here          # For GPT models
GOOGLE_API_KEY=your_google_api_key_here              # For Gemini
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here     # For Claude

# GitHub (for repository creation)
GITHUB_TOKEN=github_pat_your_token_here              # Personal access token
GITHUB_USERNAME=your_github_username

# Expo (for mobile builds)
EXPO_TOKEN=your_expo_token_here                      # From expo.dev

# Optional: Advanced builds
CODEMAGIC_ACCESS_TOKEN=your_codemagic_token_here     # For Codemagic CI
DEEPSEEK_API_KEY=sk-your_deepseek_key_here          # Alternative AI provider
```

### Getting API Keys

| Service | Where to Get | Required For |
|---------|--------------|--------------|
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | GPT-powered generation |
| **Google AI** | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | Gemini models |
| **GitHub** | [github.com/settings/tokens](https://github.com/settings/tokens) | Repository operations |
| **Expo** | [expo.dev/accounts/[username]/settings/access-tokens](https://expo.dev/accounts) | Mobile app builds |
| **Codemagic** | [codemagic.io/teams](https://codemagic.io/teams) | Advanced CI/CD |

---

## 🚀 Usage

### Command Line Interface

```bash
# Generate app from natural language
orchestrator generate "A fitness tracker with step counting"

# Generate from detailed description
orchestrator generate "Build a chat app with:
- Real-time messaging
- User authentication
- Dark mode toggle
- Push notifications
- SQLite offline storage"

# Generate project from AppSpec JSON
orchestrator scaffold ./my-app-spec.json ./output-directory

# Trigger build manually
orchestrator build --ci codemagic --repo user/repo

# Download and install APK
orchestrator deliver --ci eas --build-id build_12345

# Environment management
orchestrator env validate    # Check configuration
orchestrator env edit        # Edit API keys
orchestrator env source      # Reload environment
```

### Programmatic Usage

```javascript
const { createAppSpec, scaffoldFromAppSpec } = require('./termux-orchestrator-agents');

// Generate AppSpec from natural language
const appSpec = await createAppSpec(
  "Build a weather app with location services and 7-day forecast"
);

// Scaffold project
const result = await scaffoldFromAppSpec(appSpec, './my-weather-app');

console.log(`Generated ${result.files.length} files in ${result.projectPath}`);
```

### AppSpec JSON Format

The orchestrator uses AppSpec JSON as an intermediate format:

```json
{
  "name": "MyWeatherApp",
  "platform": "android",
  "framework": "react-native",
  "version": "1.0.0",
  "description": "A weather app with location and forecasts",
  "pages": [
    {
      "name": "Home",
      "type": "screen",
      "components": ["weather-card", "location-picker", "forecast-list"]
    }
  ],
  "features": [
    {
      "name": "weather-data",
      "category": "integration",
      "description": "Fetch weather data from OpenWeather API",
      "priority": 1
    },
    {
      "name": "location-services",
      "category": "utility",
      "description": "Get user's current location for weather data",
      "priority": 1
    }
  ],
  "data": [
    {
      "name": "weather_cache",
      "type": "sqlite",
      "schema": {
        "id": "integer primary key",
        "location": "text",
        "temperature": "real",
        "conditions": "text",
        "cached_at": "datetime"
      }
    }
  ],
  "apis": [
    {
      "name": "openweather",
      "url": "https://api.openweathermap.org/data/2.5",
      "auth": "api-key"
    }
  ]
}
```

---

## 🔄 Workflow Examples

### Example 1: Simple Todo App

```bash
orchestrator generate "A simple todo app with:
- Add, edit, delete todos
- Mark as complete
- SQLite storage
- Dark mode toggle"

# Result: Complete React Native app with:
# - TodoList component with CRUD operations
# - SQLite database setup
# - Dark theme switching
# - Ready to build APK
```

### Example 2: Advanced Social App

```bash
orchestrator generate "Social media app featuring:
- User registration and login
- Photo sharing with camera integration  
- Real-time chat between users
- Push notifications
- Profile customization
- Offline mode with sync"

# Result: Full-featured app with:
# - Firebase authentication
# - Image upload and camera access
# - WebSocket chat implementation
# - Expo notifications setup
# - Redux state management
# - Background sync service
```

### Example 3: Business App

```bash
orchestrator generate "Expense tracker for small business:
- Receipt photo capture with OCR
- Expense categories and tags
- Monthly/quarterly reports
- Export to CSV/PDF
- Multi-currency support
- Cloud backup to Google Drive"

# Result: Professional app with:
# - OCR integration for receipts
# - Chart.js for reports visualization
# - File system access for exports
# - Currency conversion API
# - Google Drive API integration
# - Comprehensive data models
```

---

## 🧪 Testing

### Run Integration Tests

```bash
# Full end-to-end test suite
cd tests/integration
node end-to-end.test.js

# Individual component tests
cd termux-orchestrator-agents
npm test

# Environment validation
orchestrator-env-validate
```

### Manual Testing

```bash
# Test scaffolding
cd termux-orchestrator-scaffolders
node scaffolders/index.js examples/todo-app.json ./test-output

# Test CI trigger
cd termux-orchestrator-ci
node ci/trigger_ci.js --help

# Test artifact download
node ci/download_artifact.js --help
```

---

## 🛠️ Development

### Project Structure

```
termux-orchestrator/
├── termux-orchestrator-bootstrap/
│   ├── bootstrap/               # Setup scripts
│   │   ├── install_prereqs.sh   # Package installer
│   │   ├── setup_env.sh         # Environment configuration
│   │   └── install_code_server.sh # Code-server setup
│   └── dotfiles/               # Shell configuration
├── termux-orchestrator-agents/
│   ├── src/agents/             # AI agent wrappers
│   │   ├── index.js            # Main orchestrator
│   │   ├── gemini.js           # Google Gemini integration
│   │   ├── claude.js           # Anthropic Claude integration
│   │   ├── continue.js         # Continue.dev integration
│   │   └── sweAgent.js         # SWE-Agent integration
│   ├── src/schema/             # JSON schemas
│   └── tests/                  # Unit tests
├── termux-orchestrator-scaffolders/
│   ├── scaffolders/            # Project generators
│   ├── templates/              # Framework templates
│   │   ├── rn/                 # React Native templates
│   │   ├── flutter/            # Flutter templates
│   │   └── compose/            # Jetpack Compose templates
│   └── examples/               # Example AppSpecs
├── termux-orchestrator-ci/
│   ├── ci/                     # CI/CD scripts
│   │   ├── trigger_ci.js       # Build trigger
│   │   └── download_artifact.js # Artifact downloader
│   └── templates/              # CI/CD templates
│       ├── github-actions/     # GitHub Actions workflows
│       └── codemagic/          # Codemagic configurations
├── termux-orchestrator-delivery/
│   └── delivery/               # APK delivery system
│       ├── poll_and_deliver.sh # Main delivery script
│       └── auto_install.sh     # APK installer
└── tests/
    └── integration/            # End-to-end tests
```

### Adding New Features

1. **New AI Agent:**
   - Add agent wrapper in `termux-orchestrator-agents/src/agents/`
   - Update orchestrator index to include new agent
   - Add fallback logic and error handling

2. **New Framework Template:**
   - Create template directory in `termux-orchestrator-scaffolders/templates/`
   - Add framework support to scaffolder
   - Update AppSpec schema if needed

3. **New CI Provider:**
   - Add CI template in `termux-orchestrator-ci/templates/`
   - Update trigger and download scripts
   - Test integration with delivery system

### Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make changes and test thoroughly
4. Commit: `git commit -m 'Add amazing feature'`
5. Push: `git push origin feature/amazing-feature`
6. Open Pull Request

---

## 🐛 Troubleshooting

### Common Issues

#### "Command not found: orchestrator"
```bash
# Reload environment
source ~/.termux_orchestrator_env
# Or restart Termux
```

#### "Missing API keys"
```bash
# Edit environment file
orchestrator-env-edit
# Add your API keys, then validate
orchestrator-env-validate
```

#### "Build failed: No signing key"
```bash
# Generate new keystore
cd ~/.orchestrator
keytool -genkey -v -keystore keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias key0
# Update environment with keystore details
```

#### "APK installation failed"
```bash
# Enable "Install from Unknown Sources" in Android settings
# Or try manual installation:
termux-open ~/Downloads/orchestrator/your-app.apk
```

### Getting Help

- **Check logs:** `tail -f ~/.orchestrator/logs/orchestrator.log`
- **Validate environment:** `orchestrator-env-validate`
- **Run tests:** `node tests/integration/end-to-end.test.js`
- **Debug mode:** Set `LOG_LEVEL=debug` in environment

### Performance Tips

- **Use caching:** AI responses are cached automatically
- **Parallel builds:** Use multiple CI providers for faster builds
- **Local development:** Use Expo Go for faster iteration
- **Cleanup:** Run `orchestrator --cleanup` to free disk space

---

## 📊 Roadmap

### ✅ Completed (v1.0)
- [x] Natural language to AppSpec generation
- [x] React Native scaffolding with Expo
- [x] Multi-AI agent coordination (Gemini, Claude, Continue, SWE-Agent)
- [x] GitHub Actions, Codemagic, EAS integration
- [x] APK delivery and installation
- [x] Comprehensive error handling and logging

### 🚧 In Progress (v1.1)
- [ ] Flutter framework support
- [ ] Advanced UI component library
- [ ] Real-time collaboration features
- [ ] Enhanced security scanning

### 📅 Planned (v1.2+)
- [ ] Jetpack Compose support
- [ ] iOS app generation
- [ ] Web app deployment
- [ ] Custom AI model integration
- [ ] Visual app designer
- [ ] App store deployment automation

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Termux** for providing Android Linux environment
- **Expo** for React Native tooling and EAS Build
- **Anthropic** for Claude AI integration
- **Google** for Gemini AI models
- **OpenAI** for GPT models and development inspiration
- **Continue.dev** for code generation capabilities
- **Princeton NLP** for SWE-Agent automated fixing

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/asshat1981ar/termuxorchestrator/issues)
- **Discussions:** [GitHub Discussions](https://github.com/asshat1981ar/termuxorchestrator/discussions)
- **Termux Community:** [Reddit r/termux](https://reddit.com/r/termux)

---

**Built with ❤️ for the Android development community**

*Termux Orchestrator - Democratizing mobile app development through AI*