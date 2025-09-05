/**
 * Continue CLI Wrapper for Termux Orchestrator
 * Provides interface to Continue coding assistant
 */

const { execa } = require('execa');
const fs = require('fs').promises;
const path = require('path');

class ContinueAgent {
  constructor(options = {}) {
    this.timeout = options.timeout || 180000; // 3 minutes
    this.retries = options.retries || 2;
    this.logLevel = options.logLevel || 'info';
    this.logFile = path.join(process.cwd(), 'logs', 'agents.log');
  }

  /**
   * Log message with timestamp
   */
  async log(level, message) {
    if (this.logLevel === 'debug' || level !== 'debug') {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${level.toUpperCase()}] [Continue] ${message}\n`;
      
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
   * Check if Continue CLI is available
   */
  async checkAvailable() {
    try {
      await execa('continue', ['--version'], { timeout: 5000 });
      return true;
    } catch (error) {
      await this.log('error', 'Continue CLI not found. Install from: https://continue.dev');
      return false;
    }
  }

  /**
   * Run Continue CLI with retry logic
   */
  async runContinue(prompt, options = {}) {
    const config = {
      timeout: options.timeout || this.timeout,
      retries: options.retries !== undefined ? options.retries : this.retries,
      workdir: options.workdir || process.cwd(),
      model: options.model || 'gpt-4',
      temperature: options.temperature || 0.3
    };

    await this.log('info', `Running Continue in ${config.workdir}`);

    if (!await this.checkAvailable()) {
      throw new Error('Continue CLI not available');
    }

    for (let attempt = 1; attempt <= config.retries; attempt++) {
      try {
        const args = this.buildArgs(prompt, config);
        
        await this.log('debug', `Attempt ${attempt}: continue ${args.join(' ')}`);
        
        const result = await execa('continue', args, {
          timeout: config.timeout,
          cwd: config.workdir,
          encoding: 'utf8'
        });

        await this.log('info', `Continue completed successfully (attempt ${attempt})`);
        
        return result.stdout.trim();

      } catch (error) {
        await this.log('error', `Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === config.retries) {
          throw new Error(`Continue failed after ${config.retries} attempts: ${error.message}`);
        }
        
        // Wait before retry
        const delay = 2000 * attempt;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Build CLI arguments array
   */
  buildArgs(prompt, config) {
    const args = [];
    
    // Use stdin for prompt
    args.push('--stdin');
    
    if (config.model) {
      args.push('--model', config.model);
    }
    
    if (config.temperature !== undefined) {
      args.push('--temperature', config.temperature.toString());
    }
    
    return args;
  }

  /**
   * Run Continue in interactive mode for feature implementation
   */
  async implementFeature(featureSpec, projectPath) {
    const prompt = `Implement feature: ${featureSpec.name}

Description: ${featureSpec.description || 'No description provided'}
Category: ${featureSpec.category}
Priority: ${featureSpec.priority || 3}

Please:
1. Analyze the existing codebase structure
2. Create necessary components and services
3. Add unit tests
4. Follow project conventions
5. Handle errors appropriately

Focus on clean, maintainable code that integrates well with the existing project.`;

    try {
      const result = await this.runContinue(prompt, {
        workdir: projectPath,
        timeout: 300000 // 5 minutes for feature implementation
      });
      
      await this.log('info', `Implemented feature: ${featureSpec.name}`);
      return result;
      
    } catch (error) {
      await this.log('error', `Failed to implement feature ${featureSpec.name}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Auto-complete code based on context
   */
  async autoComplete(partialCode, filePath, projectPath) {
    const prompt = `Complete this code:

File: ${filePath}
Code:
${partialCode}

Please provide the completed code that follows the project's patterns and best practices.`;

    try {
      const result = await this.runContinue(prompt, {
        workdir: projectPath,
        timeout: 60000 // 1 minute for completion
      });
      
      await this.log('info', `Auto-completed code for ${filePath}`);
      return result;
      
    } catch (error) {
      await this.log('error', `Failed to auto-complete ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Refactor code for better quality
   */
  async refactorCode(filePath, projectPath, refactorGoals = []) {
    const fileContent = await fs.readFile(path.join(projectPath, filePath), 'utf8');
    
    const goalsText = refactorGoals.length > 0 
      ? `\nRefactoring goals:\n${refactorGoals.map(g => `- ${g}`).join('\n')}`
      : '';
      
    const prompt = `Refactor this code for better quality:

File: ${filePath}
${goalsText}

Current code:
${fileContent}

Please provide the refactored version that:
- Improves readability and maintainability
- Follows best practices
- Maintains the same functionality
- Adds proper error handling if missing`;

    try {
      const result = await this.runContinue(prompt, {
        workdir: projectPath,
        timeout: 180000 // 3 minutes for refactoring
      });
      
      await this.log('info', `Refactored ${filePath}`);
      return result;
      
    } catch (error) {
      await this.log('error', `Failed to refactor ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate unit tests for existing code
   */
  async generateTests(filePath, projectPath) {
    const fileContent = await fs.readFile(path.join(projectPath, filePath), 'utf8');
    
    const prompt = `Generate comprehensive unit tests for this code:

File: ${filePath}
Code:
${fileContent}

Please provide:
- Complete test file with proper setup/teardown
- Tests for all public methods/functions
- Edge case testing
- Mock external dependencies
- Follow the project's testing conventions`;

    try {
      const result = await this.runContinue(prompt, {
        workdir: projectPath,
        timeout: 120000 // 2 minutes for test generation
      });
      
      await this.log('info', `Generated tests for ${filePath}`);
      return result;
      
    } catch (error) {
      await this.log('error', `Failed to generate tests for ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create feature branch and implement feature
   */
  async createFeatureBranch(featureName, projectPath) {
    try {
      // Create feature branch
      await execa('git', ['checkout', '-b', `feat/${featureName}`], {
        cwd: projectPath
      });
      
      await this.log('info', `Created feature branch: feat/${featureName}`);
      return `feat/${featureName}`;
      
    } catch (error) {
      await this.log('error', `Failed to create feature branch: ${error.message}`);
      throw error;
    }
  }

  /**
   * Commit feature changes
   */
  async commitFeature(featureName, projectPath) {
    try {
      // Add all changes
      await execa('git', ['add', '.'], { cwd: projectPath });
      
      // Commit with conventional message
      await execa('git', ['commit', '-m', `feat: implement ${featureName}\n\nGenerated by Continue agent`], {
        cwd: projectPath
      });
      
      await this.log('info', `Committed feature: ${featureName}`);
      return true;
      
    } catch (error) {
      await this.log('error', `Failed to commit feature: ${error.message}`);
      throw error;
    }
  }
}

module.exports = { ContinueAgent };