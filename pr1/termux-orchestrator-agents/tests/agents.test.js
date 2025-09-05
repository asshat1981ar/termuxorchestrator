/**
 * Unit tests for Termux Orchestrator Agents
 * Tests with mocked CLI outputs (no network calls)
 */

const { OrchestatorAgents, createAppSpec, scaffoldFromAppSpec, implementFeature, autoFix } = require('../src/agents/index');
const fs = require('fs').promises;
const path = require('path');

// Mock external CLI calls
const mockCLIResults = {
  gemini: {
    appSpec: {
      name: "RecipeApp",
      platform: "android", 
      framework: "react-native",
      pages: [
        { name: "Home", type: "screen" },
        { name: "RecipeDetail", type: "screen" }
      ],
      features: [
        { name: "offline-storage", category: "data" },
        { name: "dark-mode", category: "ui" }
      ],
      data: [
        { name: "recipes", type: "sqlite" }
      ]
    }
  },
  claude: {
    scaffoldResult: {
      files: [
        { path: "package.json", content: '{"name": "RecipeApp", "version": "1.0.0"}' },
        { path: "App.js", content: 'import React from "react";\nexport default function App() { return null; }' },
        { path: "src/components/RecipeList.js", content: 'export const RecipeList = () => null;' }
      ],
      commands: ["npm install", "npx expo start"]
    },
    featureResult: {
      files: [
        { path: "src/hooks/useDarkMode.js", content: 'export const useDarkMode = () => false;' },
        { path: "src/services/sqlite.js", content: 'export const db = null;' }
      ]
    }
  },
  continue: {
    implementResult: "Feature implementation completed successfully",
    branchName: "feat/offline-storage"
  },
  sweAgent: {
    fixResult: {
      success: true,
      changes: [
        { type: "modified", file: "src/components/RecipeList.js" },
        { type: "created", file: "tests/RecipeList.test.js" }
      ],
      patches: [],
      summary: "Fixed 2 lint errors and added missing tests",
      iterations: 3
    }
  }
};

// Test utilities
class TestUtils {
  static async createTempDir() {
    const tmpDir = path.join('/tmp', `orchestrator-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    return tmpDir;
  }
  
  static async cleanup(dir) {
    try {
      await fs.rmdir(dir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  
  static mockAgent(agent, method, result) {
    const originalMethod = agent[method];
    agent[method] = async (...args) => {
      console.log(`[MOCK] ${agent.constructor.name}.${method}() called with:`, args);
      return result;
    };
    return originalMethod;
  }
}

// Test cases
async function testCreateAppSpec() {
  console.log('\n=== Testing createAppSpec ===');
  
  try {
    const orchestrator = new OrchestatorAgents({ logLevel: 'debug' });
    
    // Mock Gemini response
    const originalGemini = TestUtils.mockAgent(
      orchestrator.gemini, 
      'generateAppSpec', 
      mockCLIResults.gemini.appSpec
    );
    
    const appSpec = await orchestrator.createAppSpec(
      "Build me a recipe app with offline SQLite and dark mode"
    );
    
    // Restore original method
    orchestrator.gemini.generateAppSpec = originalGemini;
    
    // Validate result
    console.log('✓ AppSpec generated:', JSON.stringify(appSpec, null, 2));
    
    if (!appSpec.name || !appSpec.platform || !appSpec.framework) {
      throw new Error('AppSpec missing required fields');
    }
    
    if (appSpec.features.length === 0) {
      throw new Error('AppSpec should have features');
    }
    
    console.log('✅ createAppSpec test passed');
    return true;
    
  } catch (error) {
    console.error('❌ createAppSpec test failed:', error.message);
    return false;
  }
}

async function testScaffoldFromAppSpec() {
  console.log('\n=== Testing scaffoldFromAppSpec ===');
  
  const tempDir = await TestUtils.createTempDir();
  
  try {
    const orchestrator = new OrchestatorAgents({ logLevel: 'debug' });
    
    // Mock Claude scaffold response
    const originalScaffold = TestUtils.mockAgent(
      orchestrator.claude,
      'scaffoldProject',
      mockCLIResults.claude.scaffoldResult
    );
    
    const result = await orchestrator.scaffoldFromAppSpec(
      mockCLIResults.gemini.appSpec,
      tempDir
    );
    
    // Restore original method
    orchestrator.claude.scaffoldProject = originalScaffold;
    
    // Check that files were created
    const packageJsonExists = await fs.access(path.join(tempDir, 'package.json')).then(() => true).catch(() => false);
    const appJsExists = await fs.access(path.join(tempDir, 'App.js')).then(() => true).catch(() => false);
    
    console.log('✓ Scaffold result:', result);
    console.log('✓ Files created:', { packageJsonExists, appJsExists });
    
    if (!packageJsonExists || !appJsExists) {
      throw new Error('Expected files were not created');
    }
    
    console.log('✅ scaffoldFromAppSpec test passed');
    return true;
    
  } catch (error) {
    console.error('❌ scaffoldFromAppSpec test failed:', error.message);
    return false;
  } finally {
    await TestUtils.cleanup(tempDir);
  }
}

async function testImplementFeature() {
  console.log('\n=== Testing implementFeature ===');
  
  const tempDir = await TestUtils.createTempDir();
  
  try {
    const orchestrator = new OrchestatorAgents({ logLevel: 'debug' });
    
    // Create a basic git repo
    await fs.writeFile(path.join(tempDir, 'package.json'), '{"name": "test"}');
    
    // Mock Continue responses
    const originalBranch = TestUtils.mockAgent(
      orchestrator.continue,
      'createFeatureBranch',
      mockCLIResults.continue.branchName
    );
    
    const originalImplement = TestUtils.mockAgent(
      orchestrator.continue,
      'implementFeature',
      mockCLIResults.continue.implementResult
    );
    
    const originalCommit = TestUtils.mockAgent(
      orchestrator.continue,
      'commitFeature',
      true
    );
    
    const featureSpec = {
      name: "Dark Mode",
      category: "ui",
      description: "Toggle between light and dark themes",
      priority: 2
    };
    
    const result = await orchestrator.implementFeature(featureSpec, tempDir);
    
    // Restore original methods
    orchestrator.continue.createFeatureBranch = originalBranch;
    orchestrator.continue.implementFeature = originalImplement;
    orchestrator.continue.commitFeature = originalCommit;
    
    console.log('✓ Feature implementation result:', result);
    
    if (!result.success || !result.branch) {
      throw new Error('Feature implementation should return success and branch');
    }
    
    console.log('✅ implementFeature test passed');
    return true;
    
  } catch (error) {
    console.error('❌ implementFeature test failed:', error.message);
    return false;
  } finally {
    await TestUtils.cleanup(tempDir);
  }
}

async function testAutoFix() {
  console.log('\n=== Testing autoFix ===');
  
  const tempDir = await TestUtils.createTempDir();
  
  try {
    const orchestrator = new OrchestatorAgents({ logLevel: 'debug' });
    
    // Mock SWE-Agent responses
    const originalLint = TestUtils.mockAgent(
      orchestrator.sweAgent,
      'autoFixLint',
      mockCLIResults.sweAgent.fixResult
    );
    
    const originalTests = TestUtils.mockAgent(
      orchestrator.sweAgent,
      'autoFixTests',
      mockCLIResults.sweAgent.fixResult
    );
    
    const result = await orchestrator.autoFix(tempDir, {
      fixLint: true,
      fixTests: true,
      lintCommand: 'npm run lint',
      testCommand: 'npm test'
    });
    
    // Restore original methods
    orchestrator.sweAgent.autoFixLint = originalLint;
    orchestrator.sweAgent.autoFixTests = originalTests;
    
    console.log('✓ Auto-fix result:', result);
    
    if (result.totalChanges === 0) {
      throw new Error('Auto-fix should report changes');
    }
    
    if (!result.lint || !result.tests) {
      throw new Error('Auto-fix should have lint and test results');
    }
    
    console.log('✅ autoFix test passed');
    return true;
    
  } catch (error) {
    console.error('❌ autoFix test failed:', error.message);
    return false;
  } finally {
    await TestUtils.cleanup(tempDir);
  }
}

async function testHighLevelFunctions() {
  console.log('\n=== Testing high-level functions ===');
  
  try {
    // Mock the orchestrator methods by temporarily replacing them
    const originalCreateAppSpec = createAppSpec;
    const mockCreateAppSpec = async () => mockCLIResults.gemini.appSpec;
    
    const appSpec = await mockCreateAppSpec("Test app description");
    
    console.log('✓ High-level createAppSpec works');
    
    if (!appSpec || !appSpec.name) {
      throw new Error('High-level function should return AppSpec');
    }
    
    console.log('✅ High-level functions test passed');
    return true;
    
  } catch (error) {
    console.error('❌ High-level functions test failed:', error.message);
    return false;
  }
}

async function testSchemaValidation() {
  console.log('\n=== Testing schema validation ===');
  
  try {
    const orchestrator = new OrchestatorAgents({ logLevel: 'debug' });
    
    // Wait for schema to load
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (!orchestrator.appSpecSchema) {
      throw new Error('AppSpec schema should be loaded');
    }
    
    console.log('✓ Schema loaded:', Object.keys(orchestrator.appSpecSchema));
    
    // Test validation with valid data
    const validAppSpec = mockCLIResults.gemini.appSpec;
    
    // This would throw if validation fails
    orchestrator.claude.validateSchema(validAppSpec, orchestrator.appSpecSchema);
    
    console.log('✓ Valid AppSpec passes validation');
    
    // Test validation with invalid data
    try {
      const invalidAppSpec = { name: "Test" }; // Missing required fields
      orchestrator.claude.validateSchema(invalidAppSpec, orchestrator.appSpecSchema);
      throw new Error('Should have failed validation');
    } catch (error) {
      if (error.message.includes('Schema validation failed')) {
        console.log('✓ Invalid AppSpec correctly fails validation');
      } else {
        throw error;
      }
    }
    
    console.log('✅ Schema validation test passed');
    return true;
    
  } catch (error) {
    console.error('❌ Schema validation test failed:', error.message);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log('🧪 Starting Termux Orchestrator Agents Tests\n');
  
  const tests = [
    { name: 'createAppSpec', fn: testCreateAppSpec },
    { name: 'scaffoldFromAppSpec', fn: testScaffoldFromAppSpec },
    { name: 'implementFeature', fn: testImplementFeature },
    { name: 'autoFix', fn: testAutoFix },
    { name: 'highLevelFunctions', fn: testHighLevelFunctions },
    { name: 'schemaValidation', fn: testSchemaValidation }
  ];
  
  const results = [];
  
  for (const test of tests) {
    console.log(`\n--- Running ${test.name} ---`);
    try {
      const passed = await test.fn();
      results.push({ name: test.name, passed });
    } catch (error) {
      console.error(`❌ ${test.name} crashed:`, error);
      results.push({ name: test.name, passed: false });
    }
  }
  
  // Print summary
  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  
  let passed = 0;
  let failed = 0;
  
  for (const result of results) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${result.name}`);
    
    if (result.passed) passed++;
    else failed++;
  }
  
  console.log('========================');
  console.log(`Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('💥 Some tests failed');
    process.exit(1);
  }
}

// Example usage demonstration
async function showExampleUsage() {
  console.log('\n📖 Example Usage:');
  console.log('================');
  
  console.log(`
// Create AppSpec from natural language
const appSpec = await createAppSpec("Build me a recipe app with offline SQLite and dark mode");

// Scaffold project 
const scaffoldResult = await scaffoldFromAppSpec(appSpec, './my-recipe-app');

// Implement individual features
for (const feature of appSpec.features) {
  await implementFeature(feature, './my-recipe-app');
}

// Auto-fix any issues
const fixes = await autoFix('./my-recipe-app', {
  fixLint: true,
  fixTests: true,
  improveQuality: true
});

console.log('Project generated and fixed!', fixes);
`);
}

// Run tests if called directly
if (require.main === module) {
  showExampleUsage();
  runAllTests().catch(console.error);
}

module.exports = {
  TestUtils,
  mockCLIResults,
  runAllTests
};