# Termux Orchestrator Agents

Node.js CLI wrappers for AI agents used by the Termux Orchestrator. Provides unified interfaces to Gemini, Claude Code, Continue, and SWE-agent for mobile app generation.

## Features

- **Unified Agent API**: Consistent interfaces across different AI services
- **Robust Error Handling**: Retries, timeouts, and graceful degradation
- **Schema Validation**: Strict AppSpec validation using JSON Schema
- **Comprehensive Logging**: Detailed logs for debugging and monitoring
- **Mock Testing**: Unit tests with no external network dependencies

## Installation

```bash
cd termux-orchestrator-agents
npm install
```

## Prerequisites

Install the required CLI tools in Termux:

```bash
# Required
pkg install nodejs git python

# AI Agent CLIs (install as needed)
npm install -g gemini-cli          # For structured AppSpec generation
# Install claude-code from https://claude.ai/code
npm install -g continue            # For feature implementation
# Install swe-agent from https://github.com/princeton-nlp/SWE-agent
```

## Environment Variables

Configure API keys in your `~/.termux_orchestrator_env`:

```bash
export OPENAI_API_KEY="your_openai_key"
export ANTHROPIC_API_KEY="your_anthropic_key"
export GOOGLE_API_KEY="your_google_key"
export DEEPSEEK_API_KEY="your_deepseek_key"
```

## Quick Start

```javascript
const { createAppSpec, scaffoldFromAppSpec, implementFeature, autoFix } = require('./src/agents/index');

// 1. Generate AppSpec from natural language
const appSpec = await createAppSpec(
  "Build me a recipe app with offline SQLite storage and dark mode"
);

// 2. Scaffold the project
const scaffoldResult = await scaffoldFromAppSpec(appSpec, './my-recipe-app');

// 3. Implement features
for (const feature of appSpec.features) {
  await implementFeature(feature, './my-recipe-app');
}

// 4. Auto-fix issues
const fixes = await autoFix('./my-recipe-app', {
  fixLint: true,
  fixTests: true,
  improveQuality: true
});

console.log('Project generated successfully!');
```

## API Reference

### High-Level Functions

#### `createAppSpec(nlDescription, options)`

Convert natural language to structured AppSpec JSON.

**Parameters:**
- `nlDescription` (string): Natural language app description
- `options` (object): Optional configuration

**Returns:** Promise<AppSpec>

**Example:**
```javascript
const appSpec = await createAppSpec(
  "Build a todo app with offline sync and push notifications"
);
```

#### `scaffoldFromAppSpec(appSpec, outputDir, options)`

Scaffold project structure from AppSpec.

**Parameters:**
- `appSpec` (object): Valid AppSpec object
- `outputDir` (string): Output directory path
- `options` (object): Optional configuration

**Returns:** Promise<{projectPath, files, commands}>

#### `implementFeature(featureSpec, projectPath, options)`

Implement a single feature with tests.

**Parameters:**
- `featureSpec` (object): Feature specification from AppSpec
- `projectPath` (string): Path to project directory
- `options` (object): Optional configuration

**Returns:** Promise<{branch, feature, success}>

#### `autoFix(projectPath, options)`

Automatically fix lint errors, failing tests, and quality issues.

**Parameters:**
- `projectPath` (string): Path to project directory
- `options` (object): Fix configuration

**Options:**
- `fixLint` (boolean): Fix linting errors (default: true)
- `fixTests` (boolean): Fix failing tests (default: true) 
- `improveQuality` (boolean): General quality improvements (default: false)
- `lintCommand` (string): Custom lint command (default: 'npm run lint')
- `testCommand` (string): Custom test command (default: 'npm test')

**Returns:** Promise<{lint, tests, quality, totalChanges}>

### Agent Classes

#### `GeminiAgent`

Wrapper for Google Gemini CLI.

```javascript
const { GeminiAgent } = require('./src/agents/gemini');

const gemini = new GeminiAgent({
  timeout: 60000,
  retries: 3,
  logLevel: 'info'
});

// Generate structured AppSpec
const appSpec = await gemini.generateAppSpec(description, schema);
```

#### `ClaudeAgent`

Wrapper for Claude Code CLI.

```javascript
const { ClaudeAgent } = require('./src/agents/claude');

const claude = new ClaudeAgent({
  timeout: 120000,
  retries: 3
});

// Generate code
const code = await claude.generateCode(prompt, workdir);

// Scaffold project
const result = await claude.scaffoldProject(appSpec, framework, outputDir);

// Generate feature
const feature = await claude.generateFeature(featureSpec, framework, projectPath);
```

#### `ContinueAgent`

Wrapper for Continue coding assistant.

```javascript
const { ContinueAgent } = require('./src/agents/continue');

const continue = new ContinueAgent({
  timeout: 180000,
  retries: 2
});

// Implement feature with branch creation
const branch = await continue.createFeatureBranch('dark-mode', projectPath);
await continue.implementFeature(featureSpec, projectPath);
await continue.commitFeature('dark-mode', projectPath);

// Generate tests
const tests = await continue.generateTests('src/utils.js', projectPath);
```

#### `SWEAgent`

Wrapper for SWE-Agent automated fixes.

```javascript
const { SWEAgent } = require('./src/agents/sweAgent');

const swe = new SWEAgent({
  timeout: 300000,
  retries: 2
});

// Fix failing tests
const testFixes = await swe.autoFixTests(projectPath, 'npm test');

// Fix lint errors  
const lintFixes = await swe.autoFixLint(projectPath, 'npm run lint');

// Fix specific bug
const bugFixes = await swe.fixBug(
  projectPath, 
  'Login form validation is broken',
  ['Open login page', 'Enter invalid email', 'Form should show error']
);
```

## AppSpec Schema

The AppSpec JSON schema defines the structure for generated applications:

```json
{
  "name": "MyApp",
  "platform": "android",
  "framework": "react-native",
  "pages": [
    {
      "name": "Home",
      "type": "screen",
      "components": ["header", "list"]
    }
  ],
  "features": [
    {
      "name": "dark-mode",
      "category": "ui",
      "description": "Toggle between light and dark themes",
      "priority": 2
    }
  ],
  "data": [
    {
      "name": "recipes",
      "type": "sqlite",
      "schema": {"id": "integer", "name": "text"}
    }
  ],
  "apis": [
    {
      "name": "recipe-api",
      "url": "https://api.example.com",
      "auth": "api-key"
    }
  ]
}
```

### Required Fields

- `name`: Project name (alphanumeric, dashes, underscores)
- `platform`: Target platform ("android", "ios", "web")
- `framework`: Development framework ("react-native", "flutter", "compose", "ionic")
- `pages`: Array of screen/page definitions
- `features`: Array of feature specifications
- `data`: Array of data source definitions

### Feature Categories

- `ui`: User interface components
- `data`: Data handling and storage
- `auth`: Authentication and authorization
- `media`: Image, video, audio handling
- `integration`: External service integration
- `utility`: Helper functions and utilities

## Testing

Run the test suite with mocked CLI responses:

```bash
npm test
```

The tests cover:
- AppSpec generation and validation
- Project scaffolding
- Feature implementation
- Auto-fixing functionality
- High-level API functions
- Schema validation

## Logging

All agents log to `logs/agents.log` with timestamps:

```
[2024-01-15T10:30:00.000Z] [INFO] [Gemini] Running Gemini with prompt length: 245
[2024-01-15T10:30:05.000Z] [INFO] [Claude] Generated code for: "camera feature implementation"
[2024-01-15T10:30:10.000Z] [ERROR] [SWE-Agent] Attempt 1 failed: Command timeout
```

Set log level with:
```javascript
const orchestrator = new OrchestatorAgents({ logLevel: 'debug' });
```

## Error Handling

The agents implement robust error handling:

- **Retries**: Automatic retries with exponential backoff
- **Timeouts**: Configurable timeouts for long-running operations
- **Graceful Degradation**: Falls back between agents (Gemini → Claude)
- **Clear Messages**: Helpful error messages with installation hints

## Troubleshooting

### CLI Not Found Errors

```bash
# Gemini CLI
npm install -g gemini-cli

# Claude Code CLI  
# Install from https://claude.ai/code

# Continue CLI
npm install -g continue

# SWE-Agent
# Install from https://github.com/princeton-nlp/SWE-agent
```

### Permission Errors

```bash
# Ensure log directory is writable
mkdir -p logs
chmod 755 logs

# Check API key permissions
ls -la ~/.termux_orchestrator_env
# Should show: -rw------- (600 permissions)
```

### Network Timeouts

Increase timeout for slow connections:

```javascript
const orchestrator = new OrchestatorAgents();
await orchestrator.createAppSpec(description, { timeout: 180000 }); // 3 minutes
```

## Integration

This module is designed to work with:

- **termux-orchestrator-scaffolders**: Project scaffolding scripts
- **termux-orchestrator-features**: Feature generation system
- **termux-orchestrator-quality**: Quality assurance pipeline
- **termux-orchestrator-ci**: CI/CD integration
- **termux-orchestrator**: Main orchestrator CLI

## License

MIT - see LICENSE file for details.