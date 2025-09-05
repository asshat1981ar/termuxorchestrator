/**
 * Gemini CLI Wrapper for Termux Orchestrator
 * Provides structured interface to Google's Gemini CLI
 */

const { execa } = require('execa');
const fs = require('fs').promises;
const path = require('path');

class GeminiAgent {
  constructor(options = {}) {
    this.timeout = options.timeout || 60000; // 60 seconds
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
      const logEntry = `[${timestamp}] [${level.toUpperCase()}] [Gemini] ${message}\n`;
      
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
   * Check if gemini-cli is available
   */
  async checkAvailable() {
    try {
      await execa('gemini', ['--version'], { timeout: 5000 });
      return true;
    } catch (error) {
      await this.log('error', 'Gemini CLI not found. Install with: npm install -g gemini-cli');
      return false;
    }
  }

  /**
   * Run Gemini CLI with retry logic
   */
  async runGemini(prompt, options = {}) {
    const config = {
      timeout: options.timeout || this.timeout,
      retries: options.retries !== undefined ? options.retries : this.retries,
      schema: options.schema,
      format: options.format || 'text',
      model: options.model || 'gemini-pro',
      temperature: options.temperature || 0.7
    };

    await this.log('info', `Running Gemini with prompt length: ${prompt.length}`);

    if (!await this.checkAvailable()) {
      throw new Error('Gemini CLI not available');
    }

    for (let attempt = 1; attempt <= config.retries; attempt++) {
      try {
        const args = this.buildArgs(prompt, config);
        
        await this.log('debug', `Attempt ${attempt}: gemini ${args.join(' ')}`);
        
        const result = await execa('gemini', args, {
          timeout: config.timeout,
          input: prompt,
          encoding: 'utf8'
        });

        await this.log('info', `Gemini completed successfully (attempt ${attempt})`);
        
        return this.processOutput(result.stdout, config);

      } catch (error) {
        await this.log('error', `Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === config.retries) {
          throw new Error(`Gemini failed after ${config.retries} attempts: ${error.message}`);
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
    
    if (config.model) {
      args.push('--model', config.model);
    }
    
    if (config.temperature !== undefined) {
      args.push('--temperature', config.temperature.toString());
    }
    
    if (config.format === 'json') {
      args.push('--json');
    }
    
    // Use stdin for prompt to avoid shell escaping issues
    args.push('-');
    
    return args;
  }

  /**
   * Process output and validate against schema if provided
   */
  processOutput(stdout, config) {
    let output = stdout.trim();
    
    if (config.format === 'json') {
      try {
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
   * Generate system prompt for structured output
   */
  createSystemPrompt(userPrompt, schema) {
    let systemPrompt = 'You are a helpful assistant that generates structured responses.\n\n';
    
    if (schema) {
      systemPrompt += `Your response must be valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}\n\n`;
    }
    
    systemPrompt += `User request: ${userPrompt}\n\n`;
    systemPrompt += 'Respond with valid JSON only, no additional text or explanations.';
    
    return systemPrompt;
  }

  /**
   * High-level helper: Generate AppSpec from natural language
   */
  async generateAppSpec(description, appSpecSchema) {
    const systemPrompt = this.createSystemPrompt(description, appSpecSchema);
    
    try {
      const result = await this.runGemini(systemPrompt, {
        format: 'json',
        schema: appSpecSchema,
        timeout: 90000 // Longer timeout for complex generation
      });
      
      await this.log('info', `Generated AppSpec for: "${description}"`);
      return result;
      
    } catch (error) {
      await this.log('error', `Failed to generate AppSpec: ${error.message}`);
      throw error;
    }
  }
}

module.exports = { GeminiAgent };