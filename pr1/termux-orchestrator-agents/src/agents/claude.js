/**
 * Claude CLI Wrapper for Termux Orchestrator
 * Provides structured interface to Claude Code CLI
 */

const { execa } = require('execa');
const fs = require('fs').promises;
const path = require('path');

class ClaudeAgent {
  constructor(options = {}) {
    this.timeout = options.timeout || 120000; // 2 minutes
    this.retries = options.retries || 3;
    this.logLevel = options.logLevel || 'info';
    this.logFile = path.join(process.cwd(), 'logs', 'agents.log');
  }

  /**
   * Log message with timestamp
   */
  async log(level, message) {
    if (this.logLevel === 'debug' || level !== 'debug') {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${level.toUpperCase()}] [Claude] ${message}\n`;
      
      try {
        await fs.mkdir(path.dirname(this.logFile), { recursive: true });
        await fs.appendFile(this.logFile, logEntry);
      } catch (err) {
        console.error('Failed to write log:', err);
      }
      
      if (level === 'error' || this.logLevel === 'debug') {
        console.error(logEntry.trim());
      }
    }
  }

  /**
   * Check if Claude CLI is available
   */
  async checkAvailable() {
    try {
      await execa('claude', ['--version'], { timeout: 5000 });
      return true;
    } catch (error) {
      await this.log('error', 'Claude CLI not found. Install from: https://claude.ai/code');
      return false;
    }
  }

  /**
   * Run Claude CLI with retry logic
   */
  async runClaude(prompt, options = {}) {
    const config = {
      timeout: options.timeout || this.timeout,
      retries: options.retries !== undefined ? options.retries : this.retries,
      schema: options.schema,
      format: options.format || 'text',
      model: options.model || 'claude-3-sonnet-20240229',
      temperature: options.temperature || 0.7,
      workdir: options.workdir || process.cwd()
    };

    await this.log('info', `Running Claude with prompt length: ${prompt.length}`);

    if (!await this.checkAvailable()) {
      throw new Error('Claude CLI not available');
    }

    for (let attempt = 1; attempt <= config.retries; attempt++) {
      try {
        const args = this.buildArgs(prompt, config);
        
        await this.log('debug', `Attempt ${attempt}: claude ${args.join(' ')}`);
        
        const result = await execa('claude', args, {
          timeout: config.timeout,
          cwd: config.workdir,
          encoding: 'utf8'
        });

        await this.log('info', `Claude completed successfully (attempt ${attempt})`);
        
        return this.processOutput(result.stdout, config);

      } catch (error) {
        await this.log('error', `Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === config.retries) {
          throw new Error(`Claude failed after ${config.retries} attempts: ${error.message}`);
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Build CLI arguments array
   */
  buildArgs(prompt, config) {
    const args = [];
    
    // Use file-based prompt to avoid shell escaping
    const promptFile = path.join('/tmp', `claude-prompt-${Date.now()}.txt`);
    require('fs').writeFileSync(promptFile, prompt);
    
    if (config.format === 'json') {
      args.push('--format', 'json');
    }
    
    if (config.model && config.model !== 'default') {
      args.push('--model', config.model);
    }
    
    // Use file input
    args.push('--input-file', promptFile);
    
    return args;
  }

  /**
   * Process output and validate against schema if provided
   */
  processOutput(stdout, config) {
    let output = stdout.trim();
    
    if (config.format === 'json') {
      try {
        // Claude may wrap JSON in markdown code blocks
        const jsonMatch = output.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) {
          output = jsonMatch[1];
        }
        
        const parsed = JSON.parse(output);
        
        if (config.schema) {
          this.validateSchema(parsed, config.schema);
        }
        
        return parsed;
      } catch (error) {
        throw new Error(`Invalid JSON response: ${error.message}`);
      }
    }
    
    return output;
  }

  /**
   * Validate output against JSON schema
   */
  validateSchema(data, schema) {
    const Ajv = require('ajv');
    const addFormats = require('ajv-formats');
    
    const ajv = new Ajv();
    addFormats(ajv);
    
    const validate = ajv.compile(schema);
    const valid = validate(data);
    
    if (!valid) {
      const errors = validate.errors.map(err => `${err.instancePath}: ${err.message}`).join(', ');
      throw new Error(`Schema validation failed: ${errors}`);
    }
  }

  /**
   * Generate code files with Claude
   */
  async generateCode(prompt, workdir, options = {}) {
    const systemPrompt = this.createSystemPrompt(prompt, 'code-generation');
    
    try {
      const result = await this.runClaude(systemPrompt, {
        ...options,
        workdir: workdir,
        timeout: options.timeout || 180000 // Longer timeout for code generation
      });
      
      await this.log('info', `Generated code for: "${prompt.substring(0, 100)}..."`);
      return result;
      
    } catch (error) {
      await this.log('error', `Failed to generate code: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scaffold project structure
   */
  async scaffoldProject(appSpec, framework, outputDir) {
    const prompt = this.createScaffoldPrompt(appSpec, framework);
    
    try {
      const result = await this.runClaude(prompt, {
        format: 'json',
        workdir: outputDir,
        timeout: 300000 // 5 minutes for scaffolding
      });
      
      await this.log('info', `Scaffolded ${framework} project: ${appSpec.name}`);
      return result;
      
    } catch (error) {
      await this.log('error', `Failed to scaffold project: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate system prompt for specific tasks
   */
  createSystemPrompt(userPrompt, taskType) {
    let systemPrompt = '';
    
    switch (taskType) {
      case 'code-generation':
        systemPrompt = `You are an expert mobile app developer. Generate production-ready code following best practices.
        
Your response should include:
- Complete, working code files
- Proper error handling
- Unit tests where appropriate
- Clear comments and documentation

User request: ${userPrompt}

Respond with actual code implementations.`;
        break;
        
      case 'appspec-generation':
        systemPrompt = `You are an expert app specification generator. Convert natural language descriptions into structured AppSpec JSON.

Your response must be valid JSON matching the AppSpec schema with these required fields:
- name: project name (alphanumeric, dashes, underscores)
- platform: "android" 
- framework: "react-native", "flutter", or "compose"
- pages: array of screen objects with name and type
- features: array of feature objects with name and category
- data: array of data source objects

User request: ${userPrompt}

Respond with valid JSON only.`;
        break;
        
      default:
        systemPrompt = `You are a helpful assistant. ${userPrompt}`;
    }
    
    return systemPrompt;
  }

  /**
   * Create scaffolding prompt
   */
  createScaffoldPrompt(appSpec, framework) {
    return `Create a ${framework} project scaffold for this AppSpec:

${JSON.stringify(appSpec, null, 2)}

Generate the complete project structure with:
1. Framework-appropriate boilerplate
2. Folder structure for components, screens, services
3. Basic configuration files
4. Package.json/pubspec.yaml with required dependencies
5. README with setup instructions
6. Initial test files

Return a JSON object with this structure:
{
  "files": [
    {"path": "relative/path/to/file", "content": "file contents"},
    ...
  ],
  "commands": ["npm install", "flutter pub get", ...]
}`;
  }

  /**
   * Generate feature implementation
   */
  async generateFeature(featureSpec, framework, projectPath) {
    const prompt = `Implement the ${featureSpec.name} feature for a ${framework} project.

Feature details:
- Name: ${featureSpec.name}
- Category: ${featureSpec.category}
- Description: ${featureSpec.description || 'No description provided'}
- Priority: ${featureSpec.priority || 3}

Requirements:
1. Create UI components following ${framework} best practices
2. Add any necessary service/utility classes
3. Include unit tests for components and services
4. Update navigation if needed
5. Handle edge cases and errors properly

Project structure exists at: ${projectPath}

Return JSON with files to create/modify:
{
  "files": [
    {"path": "src/components/FeatureName.js", "content": "..."},
    {"path": "src/services/featureService.js", "content": "..."},
    {"path": "tests/FeatureName.test.js", "content": "..."}
  ]
}`;

    return await this.runClaude(prompt, {
      format: 'json',
      workdir: projectPath,
      timeout: 240000 // 4 minutes for feature implementation
    });
  }
}

module.exports = { ClaudeAgent };