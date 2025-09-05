#!/usr/bin/env node
/**
 * Termux Orchestrator Scaffolders - Main Entry Point
 * Generates project structures from AppSpec JSON
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class ProjectScaffolder {
  constructor(options = {}) {
    this.logLevel = options.logLevel || 'info';
    this.templatesDir = path.join(__dirname, '../templates');
    this.logFile = path.join(process.env.HOME || '/data/data/com.termux/files/home', '.orchestrator', 'logs', 'scaffolder.log');
    
    // Supported frameworks
    this.supportedFrameworks = {
      'react-native': 'rn',
      'flutter': 'flutter', 
      'compose': 'compose',
      'ionic': 'ionic'
    };

    this.ensureLogDir();
  }

  async ensureLogDir() {
    const dir = path.dirname(this.logFile);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory already exists or permission issue
    }
  }

  async log(level, message) {
    if (this.logLevel === 'debug' || level !== 'debug') {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${level.toUpperCase()}] [Scaffolder] ${message}\n`;
      
      try {
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
   * Main scaffolding function - generates project from AppSpec
   */
  async scaffoldProject(appSpec, outputDir) {
    await this.log('info', `Scaffolding ${appSpec.framework} project: ${appSpec.name}`);
    
    try {
      // Validate AppSpec
      this.validateAppSpec(appSpec);
      
      // Ensure output directory
      await fs.mkdir(outputDir, { recursive: true });
      
      // Get template directory
      const frameworkKey = this.supportedFrameworks[appSpec.framework];
      if (!frameworkKey) {
        throw new Error(`Unsupported framework: ${appSpec.framework}`);
      }
      
      const templateDir = path.join(this.templatesDir, frameworkKey);
      
      // Generate project structure
      const result = await this.generateFromTemplate(templateDir, outputDir, appSpec);
      
      await this.log('info', `Project scaffolded successfully in ${outputDir}`);
      return result;
      
    } catch (error) {
      await this.log('error', `Scaffolding failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate AppSpec structure
   */
  validateAppSpec(appSpec) {
    const required = ['name', 'framework', 'platform', 'pages', 'features'];
    
    for (const field of required) {
      if (!appSpec[field]) {
        throw new Error(`Missing required AppSpec field: ${field}`);
      }
    }
    
    if (!this.supportedFrameworks[appSpec.framework]) {
      throw new Error(`Unsupported framework: ${appSpec.framework}. Supported: ${Object.keys(this.supportedFrameworks).join(', ')}`);
    }
    
    if (!['android', 'ios', 'web'].includes(appSpec.platform)) {
      throw new Error(`Unsupported platform: ${appSpec.platform}`);
    }
  }

  /**
   * Generate project from template directory
   */
  async generateFromTemplate(templateDir, outputDir, appSpec) {
    const generatedFiles = [];
    const templateVariables = this.buildTemplateVariables(appSpec);
    
    // Copy and process template files
    const files = await this.walkDirectory(templateDir);
    
    for (const file of files) {
      const relativePath = path.relative(templateDir, file);
      const outputPath = path.join(outputDir, relativePath);
      
      // Process path templates (e.g., __APP_NAME__ -> MyApp)
      const processedPath = this.processTemplate(outputPath, templateVariables);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(processedPath), { recursive: true });
      
      // Read and process file content
      const content = await fs.readFile(file, 'utf8');
      const processedContent = this.processTemplate(content, templateVariables);
      
      // Write processed file
      await fs.writeFile(processedPath, processedContent);
      generatedFiles.push(processedPath);
      
      await this.log('debug', `Generated: ${processedPath}`);
    }
    
    // Run post-generation setup
    await this.runPostGeneration(outputDir, appSpec);
    
    return {
      projectPath: outputDir,
      generatedFiles,
      framework: appSpec.framework,
      name: appSpec.name
    };
  }

  /**
   * Build template variables from AppSpec
   */
  buildTemplateVariables(appSpec) {
    const packageName = appSpec.packageName || 
      `com.${appSpec.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.app`;
    
    return {
      '__APP_NAME__': appSpec.name,
      '__APP_NAME_LOWER__': appSpec.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      '__APP_NAME_CAMEL__': this.toCamelCase(appSpec.name),
      '__PACKAGE_NAME__': packageName,
      '__APP_VERSION__': appSpec.version || '1.0.0',
      '__APP_DESCRIPTION__': appSpec.description || `A ${appSpec.framework} application`,
      '__PLATFORM__': appSpec.platform,
      '__FRAMEWORK__': appSpec.framework,
      '__FEATURES_LIST__': JSON.stringify(appSpec.features, null, 2),
      '__PAGES_LIST__': JSON.stringify(appSpec.pages, null, 2),
      '__DATA_SOURCES__': JSON.stringify(appSpec.data || [], null, 2),
      '__APIS__': JSON.stringify(appSpec.apis || [], null, 2)
    };
  }

  /**
   * Process template strings
   */
  processTemplate(content, variables) {
    let processed = content;
    
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      processed = processed.replace(regex, value);
    }
    
    return processed;
  }

  /**
   * Walk directory recursively
   */
  async walkDirectory(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await this.walkDirectory(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * Run post-generation setup (npm install, etc.)
   */
  async runPostGeneration(outputDir, appSpec) {
    await this.log('info', 'Running post-generation setup...');
    
    const originalDir = process.cwd();
    
    try {
      process.chdir(outputDir);
      
      if (appSpec.framework === 'react-native') {
        // Install dependencies
        await this.log('info', 'Installing npm dependencies...');
        execSync('npm install', { stdio: 'inherit' });
        
        // Generate EAS configuration
        await this.generateEASConfig(appSpec);
      }
      
    } catch (error) {
      await this.log('error', `Post-generation setup failed: ${error.message}`);
      throw error;
    } finally {
      process.chdir(originalDir);
    }
  }

  /**
   * Generate EAS build configuration
   */
  async generateEASConfig(appSpec) {
    const easConfig = {
      cli: {
        version: ">= 5.4.0",
        appVersionSource: "remote"
      },
      build: {
        development: {
          developmentClient: true,
          distribution: "internal"
        },
        preview: {
          distribution: "internal"
        },
        production: {
          autoIncrement: true,
          android: {
            buildType: "apk"
          }
        }
      },
      submit: {
        production: {}
      }
    };
    
    await fs.writeFile('eas.json', JSON.stringify(easConfig, null, 2));
    await this.log('info', 'Generated eas.json configuration');
  }

  /**
   * Utility: Convert to camelCase
   */
  toCamelCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
  }
}

// Export for use as module
module.exports = { ProjectScaffolder };

// CLI interface
async function main() {
  if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
      console.log(`Usage: node scaffolders/index.js <appspec.json> <output-dir>
      
Examples:
  node scaffolders/index.js ./appspec.json ./my-app
  node scaffolders/index.js ./examples/todo-app.json ./todo-app`);
      process.exit(1);
    }
    
    const [appSpecFile, outputDir] = args;
    
    try {
      const appSpecContent = await fs.readFile(appSpecFile, 'utf8');
      const appSpec = JSON.parse(appSpecContent);
      
      const scaffolder = new ProjectScaffolder({ logLevel: 'info' });
      const result = await scaffolder.scaffoldProject(appSpec, outputDir);
      
      console.log(`\n✅ Project generated successfully!`);
      console.log(`📁 Location: ${result.projectPath}`);
      console.log(`📋 Files generated: ${result.generatedFiles.length}`);
      console.log(`🔧 Framework: ${result.framework}`);
      console.log(`\nNext steps:`);
      console.log(`  cd ${outputDir}`);
      console.log(`  npm start`);
      
    } catch (error) {
      console.error(`❌ Scaffolding failed: ${error.message}`);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}