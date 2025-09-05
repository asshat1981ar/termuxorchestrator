/**
 * Termux Orchestrator Agents - Main Index
 * High-level functions that coordinate between different AI agents
 */

const { GeminiAgent } = require('./gemini');
const { ClaudeAgent } = require('./claude');
const { ContinueAgent } = require('./continue');
const { SWEAgent } = require('./sweAgent');
const fs = require('fs').promises;
const path = require('path');

class OrchestatorAgents {
  constructor(options = {}) {
    this.logLevel = options.logLevel || 'info';
    this.logFile = path.join(process.cwd(), 'logs', 'orchestrator.log');
    
    // Initialize agents
    this.gemini = new GeminiAgent({ logLevel: this.logLevel });
    this.claude = new ClaudeAgent({ logLevel: this.logLevel });
    this.continue = new ContinueAgent({ logLevel: this.logLevel });
    this.sweAgent = new SWEAgent({ logLevel: this.logLevel });
    
    // Load AppSpec schema
    this.appSpecSchema = null;
    this.loadSchema();
  }

  /**
   * Load AppSpec schema for validation
   */
  async loadSchema() {
    try {
      const schemaPath = path.join(__dirname, '../schema/appspec.schema.json');
      const schemaContent = await fs.readFile(schemaPath, 'utf8');
      this.appSpecSchema = JSON.parse(schemaContent);
    } catch (error) {
      console.error('Failed to load AppSpec schema:', error);
    }
  }

  /**
   * Log message with timestamp
   */
  async log(level, message) {
    if (this.logLevel === 'debug' || level !== 'debug') {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${level.toUpperCase()}] [Orchestrator] ${message}\n`;
      
      try {
        await fs.mkdir(path.dirname(this.logFile), { recursive: true });
        await fs.appendFile(this.logFile, logEntry);
      } catch (err) {
        console.error('Failed to write log:', err);
      }
      
      if (level === 'info' || level === 'error' || this.logLevel === 'debug') {
        console.log(logEntry.trim());
      }
    }
  }

  /**
   * Create AppSpec from natural language description
   * Uses Gemini for structured generation, falls back to Claude
   */
  async createAppSpec(nlDescription) {
    await this.log('info', 'Creating AppSpec from natural language description');
    
    try {
      // Try Gemini first for structured JSON generation
      if (await this.gemini.checkAvailable()) {
        await this.log('debug', 'Using Gemini for AppSpec generation');
        return await this.gemini.generateAppSpec(nlDescription, this.appSpecSchema);
      }
    } catch (error) {
      await this.log('error', `Gemini AppSpec generation failed: ${error.message}`);
    }
    
    try {
      // Fallback to Claude
      await this.log('debug', 'Using Claude for AppSpec generation');
      const systemPrompt = this.claude.createSystemPrompt(nlDescription, 'appspec-generation');
      
      const result = await this.claude.runClaude(systemPrompt, {
        format: 'json',
        schema: this.appSpecSchema,
        timeout: 120000
      });
      
      await this.log('info', 'AppSpec created successfully with Claude');
      return result;
      
    } catch (error) {
      await this.log('error', `Claude AppSpec generation failed: ${error.message}`);
      throw new Error('Failed to create AppSpec with both Gemini and Claude');
    }
  }

  /**
   * Scaffold project from AppSpec
   * Uses Claude for project scaffolding
   */
  async scaffoldFromAppSpec(appSpec, outputDir) {
    await this.log('info', `Scaffolding ${appSpec.framework} project: ${appSpec.name}`);
    
    try {
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });
      
      // Use the scaffolder to generate project structure
      const scaffolderPath = path.join(__dirname, '../../../termux-orchestrator-scaffolders/scaffolders/index.js');
      const { ProjectScaffolder } = require(scaffolderPath);
      const scaffolder = new ProjectScaffolder({ logLevel: this.logLevel });
      const result = await scaffolder.scaffoldProject(appSpec, outputDir);
      
      await this.log('info', `Project scaffolded successfully in ${outputDir}`);
      return {
        projectPath: result.projectPath || outputDir,
        generatedFiles: result.generatedFiles || [],
        framework: result.framework,
        name: result.name
      };
      
    } catch (error) {
      await this.log('error', `Scaffolding failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Implement feature using Continue agent
   * Creates feature branch, implements code, tests, and commits
   */
  async implementFeature(featureSpec, projectPath) {
    await this.log('info', `Implementing feature: ${featureSpec.name}`);
    
    try {
      // Create feature branch
      const branchName = await this.continue.createFeatureBranch(
        featureSpec.name.toLowerCase().replace(/\s+/g, '-'),
        projectPath
      );
      
      // Implement the feature
      await this.continue.implementFeature(featureSpec, projectPath);
      
      // Generate additional files with Claude for complex features
      if (featureSpec.category === 'data' || featureSpec.category === 'integration') {
        const additionalFiles = await this.claude.generateFeature(
          featureSpec,
          await this.detectFramework(projectPath),
          projectPath
        );
        
        // Write additional files
        if (additionalFiles.files) {
          for (const file of additionalFiles.files) {
            const filePath = path.join(projectPath, file.path);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, file.content);
          }
        }
      }
      
      // Commit changes
      await this.continue.commitFeature(featureSpec.name, projectPath);
      
      await this.log('info', `Feature ${featureSpec.name} implemented successfully`);
      return {
        branch: branchName,
        feature: featureSpec.name,
        success: true
      };
      
    } catch (error) {
      await this.log('error', `Feature implementation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Auto-fix issues using SWE-Agent
   * Attempts to fix tests, lint errors, and other issues
   */
  async autoFix(projectPath, options = {}) {
    await this.log('info', 'Running auto-fix on project');
    
    const fixResults = {
      lint: null,
      tests: null,
      quality: null,
      totalChanges: 0
    };
    
    try {
      // Fix lint errors
      if (options.fixLint !== false) {
        try {
          const lintResult = await this.sweAgent.autoFixLint(
            projectPath,
            options.lintCommand || 'npm run lint'
          );
          fixResults.lint = lintResult;
          fixResults.totalChanges += lintResult.changes.length;
          
          await this.log('info', `Lint fixes applied: ${lintResult.changes.length} changes`);
        } catch (error) {
          await this.log('error', `Lint auto-fix failed: ${error.message}`);
        }
      }
      
      // Fix failing tests
      if (options.fixTests !== false) {
        try {
          const testResult = await this.sweAgent.autoFixTests(
            projectPath,
            options.testCommand || 'npm test'
          );
          fixResults.tests = testResult;
          fixResults.totalChanges += testResult.changes.length;
          
          await this.log('info', `Test fixes applied: ${testResult.changes.length} changes`);
        } catch (error) {
          await this.log('error', `Test auto-fix failed: ${error.message}`);
        }
      }
      
      // General quality improvements
      if (options.improveQuality) {
        try {
          const qualityResult = await this.sweAgent.improveCodeQuality(
            projectPath,
            options.qualityFocus || []
          );
          fixResults.quality = qualityResult;
          fixResults.totalChanges += qualityResult.changes.length;
          
          await this.log('info', `Quality improvements applied: ${qualityResult.changes.length} changes`);
        } catch (error) {
          await this.log('error', `Quality improvement failed: ${error.message}`);
        }
      }
      
      await this.log('info', `Auto-fix completed: ${fixResults.totalChanges} total changes`);
      return fixResults;
      
    } catch (error) {
      await this.log('error', `Auto-fix failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate comprehensive tests for project
   */
  async generateTests(projectPath, options = {}) {
    await this.log('info', 'Generating comprehensive tests');
    
    try {
      // Find all code files
      const codeFiles = await this.findCodeFiles(projectPath, options.exclude || []);
      const testResults = [];
      
      for (const filePath of codeFiles) {
        try {
          const tests = await this.continue.generateTests(filePath, projectPath);
          testResults.push({
            sourceFile: filePath,
            testFile: this.getTestFilePath(filePath),
            tests: tests,
            success: true
          });
        } catch (error) {
          testResults.push({
            sourceFile: filePath,
            testFile: null,
            tests: null,
            success: false,
            error: error.message
          });
        }
      }
      
      await this.log('info', `Test generation completed: ${testResults.length} files processed`);
      return testResults;
      
    } catch (error) {
      await this.log('error', `Test generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Detect framework from project structure
   */
  async detectFramework(projectPath) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const pubspecPath = path.join(projectPath, 'pubspec.yaml');
      const buildGradlePath = path.join(projectPath, 'build.gradle');
      
      if (await this.fileExists(packageJsonPath)) {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        if (packageJson.dependencies && (
          packageJson.dependencies['react-native'] || 
          packageJson.dependencies['@react-native/metro-config'] ||
          packageJson.dependencies['expo']
        )) {
          return 'react-native';
        }
      }
      
      if (await this.fileExists(pubspecPath)) {
        return 'flutter';
      }
      
      if (await this.fileExists(buildGradlePath)) {
        return 'compose';
      }
      
      return 'unknown';
      
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Helper: Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper: Find code files in project
   */
  async findCodeFiles(projectPath, excludePatterns = []) {
    const codeFiles = [];
    const extensions = ['.js', '.ts', '.jsx', '.tsx', '.dart', '.kt'];
    
    const walkDir = async (dir, relativePath = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        const relativeEntryPath = path.join(relativePath, entry.name);
        
        // Skip excluded patterns
        if (excludePatterns.some(pattern => relativeEntryPath.includes(pattern))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          // Skip common directories
          if (!['node_modules', '.git', '.expo', 'build', 'dist'].includes(entry.name)) {
            await walkDir(entryPath, relativeEntryPath);
          }
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          // Skip test files
          if (!entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
            codeFiles.push(relativeEntryPath);
          }
        }
      }
    };
    
    await walkDir(projectPath);
    return codeFiles;
  }

  /**
   * Helper: Get test file path for source file
   */
  getTestFilePath(sourceFile) {
    const ext = path.extname(sourceFile);
    const base = sourceFile.replace(ext, '');
    return `${base}.test${ext}`;
  }
}

// Export high-level functions for direct use
async function createAppSpec(nlDescription, options = {}) {
  const orchestrator = new OrchestatorAgents(options);
  return await orchestrator.createAppSpec(nlDescription);
}

async function scaffoldFromAppSpec(appSpec, outputDir, options = {}) {
  const orchestrator = new OrchestatorAgents(options);
  return await orchestrator.scaffoldFromAppSpec(appSpec, outputDir);
}

async function implementFeature(featureSpec, projectPath, options = {}) {
  const orchestrator = new OrchestatorAgents(options);
  return await orchestrator.implementFeature(featureSpec, projectPath);
}

async function autoFix(projectPath, options = {}) {
  const orchestrator = new OrchestatorAgents(options);
  return await orchestrator.autoFix(projectPath, options);
}

module.exports = {
  OrchestatorAgents,
  createAppSpec,
  scaffoldFromAppSpec,
  implementFeature,
  autoFix,
  GeminiAgent,
  ClaudeAgent,
  ContinueAgent,
  SWEAgent
};