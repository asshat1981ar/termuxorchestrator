/**
 * SWE-Agent Wrapper for Termux Orchestrator
 * Provides interface to SWE-Agent for automated fixes
 */

const { execa } = require('execa');
const fs = require('fs').promises;
const path = require('path');

class SWEAgent {
  constructor(options = {}) {
    this.timeout = options.timeout || 300000; // 5 minutes
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
      const logEntry = `[${timestamp}] [${level.toUpperCase()}] [SWE-Agent] ${message}\n`;
      
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
   * Check if SWE-Agent is available
   */
  async checkAvailable() {
    try {
      await execa('swe-agent', ['--version'], { timeout: 5000 });
      return true;
    } catch (error) {
      await this.log('error', 'SWE-Agent not found. Install from: https://github.com/princeton-nlp/SWE-agent');
      return false;
    }
  }

  /**
   * Run SWE-Agent with retry logic
   */
  async runSWEAgent(task, projectPath, options = {}) {
    const config = {
      timeout: options.timeout || this.timeout,
      retries: options.retries !== undefined ? options.retries : this.retries,
      model: options.model || 'gpt-4',
      maxIterations: options.maxIterations || 10,
      environment: options.environment || 'local'
    };

    await this.log('info', `Running SWE-Agent in ${projectPath}: ${task}`);

    if (!await this.checkAvailable()) {
      throw new Error('SWE-Agent not available');
    }

    for (let attempt = 1; attempt <= config.retries; attempt++) {
      try {
        const args = this.buildArgs(task, projectPath, config);
        
        await this.log('debug', `Attempt ${attempt}: swe-agent ${args.join(' ')}`);
        
        const result = await execa('swe-agent', args, {
          timeout: config.timeout,
          cwd: projectPath,
          encoding: 'utf8'
        });

        await this.log('info', `SWE-Agent completed successfully (attempt ${attempt})`);
        
        return this.parseOutput(result.stdout);

      } catch (error) {
        await this.log('error', `Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === config.retries) {
          throw new Error(`SWE-Agent failed after ${config.retries} attempts: ${error.message}`);
        }
        
        // Wait before retry
        const delay = 5000 * attempt;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Build CLI arguments array
   */
  buildArgs(task, projectPath, config) {
    const args = [];
    
    args.push('--task', task);
    args.push('--repo_path', projectPath);
    
    if (config.model) {
      args.push('--model', config.model);
    }
    
    if (config.maxIterations) {
      args.push('--max_iterations', config.maxIterations.toString());
    }
    
    if (config.environment) {
      args.push('--environment', config.environment);
    }
    
    // Output in JSON format for easier parsing
    args.push('--output_format', 'json');
    
    return args;
  }

  /**
   * Parse SWE-Agent output
   */
  parseOutput(stdout) {
    try {
      const lines = stdout.split('\n');
      let jsonOutput = null;
      
      // Find JSON output in the logs
      for (const line of lines) {
        if (line.trim().startsWith('{')) {
          try {
            jsonOutput = JSON.parse(line.trim());
            break;
          } catch (e) {
            // Continue looking for valid JSON
          }
        }
      }
      
      if (jsonOutput) {
        return {
          success: jsonOutput.success || false,
          changes: jsonOutput.changes || [],
          patches: jsonOutput.patches || [],
          summary: jsonOutput.summary || 'No summary provided',
          iterations: jsonOutput.iterations || 0
        };
      }
      
      // Fallback to text parsing
      return {
        success: stdout.includes('Task completed successfully'),
        changes: this.extractChangesFromText(stdout),
        patches: [],
        summary: stdout.split('\n').slice(-5).join('\n'),
        iterations: 1
      };
      
    } catch (error) {
      return {
        success: false,
        changes: [],
        patches: [],
        summary: `Failed to parse output: ${error.message}`,
        iterations: 0
      };
    }
  }

  /**
   * Extract file changes from text output
   */
  extractChangesFromText(stdout) {
    const changes = [];
    const lines = stdout.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('Modified:') || line.includes('Created:') || line.includes('Deleted:')) {
        const match = line.match(/(Modified|Created|Deleted):\s*(.+)/);
        if (match) {
          changes.push({
            type: match[1].toLowerCase(),
            file: match[2].trim()
          });
        }
      }
    }
    
    return changes;
  }

  /**
   * Fix failing tests automatically
   */
  async autoFixTests(projectPath, testCommand = 'npm test') {
    const task = `Fix all failing tests. The test command is: ${testCommand}. 
    
    Please:
    1. Run the tests to identify failures
    2. Analyze the failing test cases
    3. Fix the underlying code issues
    4. Ensure all tests pass
    5. Maintain existing functionality`;

    try {
      const result = await this.runSWEAgent(task, projectPath, {
        timeout: 600000, // 10 minutes for test fixes
        maxIterations: 15
      });
      
      await this.log('info', `Auto-fix tests completed: ${result.summary}`);
      return result;
      
    } catch (error) {
      await this.log('error', `Failed to auto-fix tests: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fix lint errors automatically
   */
  async autoFixLint(projectPath, lintCommand = 'npm run lint') {
    const task = `Fix all linting errors. The lint command is: ${lintCommand}.
    
    Please:
    1. Run the linter to identify errors
    2. Fix all linting issues following the project's style guide
    3. Ensure the linter passes completely
    4. Do not change the functionality of the code`;

    try {
      const result = await this.runSWEAgent(task, projectPath, {
        timeout: 300000, // 5 minutes for lint fixes
        maxIterations: 10
      });
      
      await this.log('info', `Auto-fix lint completed: ${result.summary}`);
      return result;
      
    } catch (error) {
      await this.log('error', `Failed to auto-fix lint: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fix specific bug or issue
   */
  async fixBug(projectPath, bugDescription, reproductionSteps = []) {
    const stepsText = reproductionSteps.length > 0 
      ? `\nSteps to reproduce:\n${reproductionSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`
      : '';
      
    const task = `Fix this bug: ${bugDescription}${stepsText}
    
    Please:
    1. Understand the bug by analyzing the code and reproduction steps
    2. Identify the root cause
    3. Implement a proper fix
    4. Ensure the fix doesn't break existing functionality
    5. Add tests to prevent regression if appropriate`;

    try {
      const result = await this.runSWEAgent(task, projectPath, {
        timeout: 600000, // 10 minutes for bug fixes
        maxIterations: 20
      });
      
      await this.log('info', `Bug fix completed: ${result.summary}`);
      return result;
      
    } catch (error) {
      await this.log('error', `Failed to fix bug: ${error.message}`);
      throw error;
    }
  }

  /**
   * General quality improvement
   */
  async improveCodeQuality(projectPath, focusAreas = []) {
    const areasText = focusAreas.length > 0 
      ? `\nFocus on: ${focusAreas.join(', ')}`
      : '';
      
    const task = `Improve the overall code quality of this project.${areasText}
    
    Please:
    1. Identify code quality issues (complexity, duplication, etc.)
    2. Refactor problematic code
    3. Add missing error handling
    4. Improve documentation and comments
    5. Ensure all existing functionality is preserved`;

    try {
      const result = await this.runSWEAgent(task, projectPath, {
        timeout: 900000, // 15 minutes for quality improvements
        maxIterations: 25
      });
      
      await this.log('info', `Code quality improvement completed: ${result.summary}`);
      return result;
      
    } catch (error) {
      await this.log('error', `Failed to improve code quality: ${error.message}`);
      throw error;
    }
  }

  /**
   * Apply patches from SWE-Agent output
   */
  async applyPatches(patches, projectPath) {
    const appliedPatches = [];
    
    for (const patch of patches) {
      try {
        const patchFile = path.join('/tmp', `swe-patch-${Date.now()}.patch`);
        await fs.writeFile(patchFile, patch.content);
        
        await execa('git', ['apply', patchFile], { cwd: projectPath });
        
        appliedPatches.push({
          file: patch.file,
          status: 'applied',
          patchFile
        });
        
        await this.log('info', `Applied patch for ${patch.file}`);
        
      } catch (error) {
        appliedPatches.push({
          file: patch.file,
          status: 'failed',
          error: error.message
        });
        
        await this.log('error', `Failed to apply patch for ${patch.file}: ${error.message}`);
      }
    }
    
    return appliedPatches;
  }
}

module.exports = { SWEAgent };