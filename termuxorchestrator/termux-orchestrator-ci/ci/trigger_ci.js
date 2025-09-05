#!/usr/bin/env node
/**
 * CI Trigger Script for Termux Orchestrator
 * Triggers builds on GitHub Actions, Codemagic, or EAS
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class CITrigger {
  constructor() {
    this.logFile = path.join(process.env.HOME, '.orchestrator', 'logs', 'ci-trigger.log');
    this.ensureLogDir();
  }

  ensureLogDir() {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    console.log(logEntry.trim());
    fs.appendFileSync(this.logFile, logEntry);
  }

  async triggerGitHubActions(repo, branch = 'main') {
    this.log(`Triggering GitHub Actions for ${repo}:${branch}`);
    
    try {
      // Check if GitHub CLI is available
      execSync('gh --version', { stdio: 'ignore' });
      
      // Trigger workflow dispatch
      const cmd = `gh api repos/${repo}/actions/workflows/android-build.yml/dispatches -f ref=${branch}`;
      execSync(cmd, { stdio: 'pipe' });
      
      this.log('GitHub Actions workflow triggered successfully');
      
      // Get the latest run ID
      const runListCmd = `gh api repos/${repo}/actions/runs --jq '.workflow_runs[0].id'`;
      const runId = execSync(runListCmd, { encoding: 'utf8' }).trim();
      
      this.log(`GitHub Actions run ID: ${runId}`);
      return { provider: 'github', runId, repo, branch };
      
    } catch (error) {
      throw new Error(`GitHub Actions trigger failed: ${error.message}`);
    }
  }

  async triggerCodemagic(repo, branch = 'main') {
    this.log(`Triggering Codemagic for ${repo}:${branch}`);
    
    try {
      // Codemagic API requires project ID and access token
      const projectId = process.env.CODEMAGIC_PROJECT_ID;
      const accessToken = process.env.CODEMAGIC_ACCESS_TOKEN;
      
      if (!projectId || !accessToken) {
        throw new Error('CODEMAGIC_PROJECT_ID and CODEMAGIC_ACCESS_TOKEN environment variables required');
      }
      
      const payload = {
        appId: projectId,
        workflowId: 'android-workflow',
        branch: branch,
        environment: {
          variables: {
            CM_BUILD_STEP_NAME: 'Orchestrator Build'
          }
        }
      };
      
      const curlCmd = `curl -X POST https://api.codemagic.io/builds ` +
        `-H "Content-Type: application/json" ` +
        `-H "x-auth-token: ${accessToken}" ` +
        `-d '${JSON.stringify(payload)}'`;
      
      const response = execSync(curlCmd, { encoding: 'utf8' });
      const result = JSON.parse(response);
      
      if (result.buildId) {
        this.log(`Codemagic build triggered: ${result.buildId}`);
        return { provider: 'codemagic', buildId: result.buildId, repo, branch };
      } else {
        throw new Error(`Unexpected Codemagic response: ${response}`);
      }
      
    } catch (error) {
      throw new Error(`Codemagic trigger failed: ${error.message}`);
    }
  }

  async triggerEAS(appSlug, platform = 'android') {
    this.log(`Triggering EAS build for ${appSlug}:${platform}`);
    
    try {
      // Check if EAS CLI is available
      execSync('eas --version', { stdio: 'ignore' });
      
      // Trigger EAS build
      const cmd = `eas build --platform ${platform} --profile production --non-interactive --json`;
      const output = execSync(cmd, { encoding: 'utf8', cwd: process.cwd() });
      
      // Parse EAS output to get build ID
      const lines = output.split('\n');
      let buildId = null;
      
      for (const line of lines) {
        if (line.includes('Build ID:')) {
          buildId = line.split('Build ID:')[1].trim();
          break;
        }
      }
      
      if (buildId) {
        this.log(`EAS build triggered: ${buildId}`);
        return { provider: 'eas', buildId, appSlug, platform };
      } else {
        throw new Error('Failed to extract EAS build ID');
      }
      
    } catch (error) {
      throw new Error(`EAS trigger failed: ${error.message}`);
    }
  }

  async pollGitHubActions(repo, runId, maxWaitMinutes = 30) {
    this.log(`Polling GitHub Actions run ${runId} (max ${maxWaitMinutes} minutes)`);
    
    const maxAttempts = maxWaitMinutes * 2; // Poll every 30 seconds
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const statusCmd = `gh api repos/${repo}/actions/runs/${runId} --jq '.status + ":" + (.conclusion // "null")'`;
        const status = execSync(statusCmd, { encoding: 'utf8' }).trim();
        const [runStatus, conclusion] = status.split(':');
        
        this.log(`Attempt ${attempt}/${maxAttempts}: ${runStatus} (${conclusion})`);
        
        if (runStatus === 'completed') {
          if (conclusion === 'success') {
            // Get artifacts
            const artifactsCmd = `gh api repos/${repo}/actions/runs/${runId}/artifacts --jq '.artifacts[0].archive_download_url'`;
            const artifactUrl = execSync(artifactsCmd, { encoding: 'utf8' }).trim();
            
            this.log(`Build completed successfully. Artifact: ${artifactUrl}`);
            return { success: true, artifactUrl, runId };
          } else {
            throw new Error(`Build failed with conclusion: ${conclusion}`);
          }
        }
        
        // Wait 30 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 30000));
        
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        this.log(`Polling attempt ${attempt} failed: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }
    
    throw new Error(`Build did not complete within ${maxWaitMinutes} minutes`);
  }

  async pollCodemagic(buildId, maxWaitMinutes = 30) {
    this.log(`Polling Codemagic build ${buildId} (max ${maxWaitMinutes} minutes)`);
    
    const accessToken = process.env.CODEMAGIC_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error('CODEMAGIC_ACCESS_TOKEN environment variable required');
    }
    
    const maxAttempts = maxWaitMinutes * 2; // Poll every 30 seconds
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const curlCmd = `curl -s -H "x-auth-token: ${accessToken}" https://api.codemagic.io/builds/${buildId}`;
        const response = execSync(curlCmd, { encoding: 'utf8' });
        const result = JSON.parse(response);
        
        this.log(`Attempt ${attempt}/${maxAttempts}: ${result.status}`);
        
        if (result.status === 'finished') {
          if (result.success) {
            const artifactUrl = result.artefacts?.[0]?.url || null;
            this.log(`Build completed successfully. Artifact: ${artifactUrl}`);
            return { success: true, artifactUrl, buildId };
          } else {
            throw new Error('Codemagic build failed');
          }
        }
        
        // Wait 30 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 30000));
        
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        this.log(`Polling attempt ${attempt} failed: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }
    
    throw new Error(`Build did not complete within ${maxWaitMinutes} minutes`);
  }

  async pollEAS(buildId, maxWaitMinutes = 45) {
    this.log(`Polling EAS build ${buildId} (max ${maxWaitMinutes} minutes)`);
    
    const maxAttempts = maxWaitMinutes * 2; // Poll every 30 seconds
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const cmd = `eas build:view ${buildId} --json`;
        const output = execSync(cmd, { encoding: 'utf8' });
        const result = JSON.parse(output);
        
        this.log(`Attempt ${attempt}/${maxAttempts}: ${result.status}`);
        
        if (result.status === 'finished') {
          if (result.artifacts?.buildUrl) {
            this.log(`Build completed successfully. Artifact: ${result.artifacts.buildUrl}`);
            return { success: true, artifactUrl: result.artifacts.buildUrl, buildId };
          } else {
            throw new Error('EAS build finished but no artifact URL found');
          }
        } else if (result.status === 'errored' || result.status === 'canceled') {
          throw new Error(`EAS build ${result.status}: ${result.error || 'Unknown error'}`);
        }
        
        // Wait 30 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 30000));
        
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        this.log(`Polling attempt ${attempt} failed: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }
    
    throw new Error(`Build did not complete within ${maxWaitMinutes} minutes`);
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node trigger_ci.js --ci <provider> --repo <repo> [options]

Options:
  --ci <provider>        CI provider: github, codemagic, eas
  --repo <repo>         Repository (format: owner/repo)
  --branch <branch>     Branch to build (default: main)
  --platform <platform> Platform for EAS (default: android)
  --poll               Wait for build completion and return artifact URL
  --timeout <minutes>  Max wait time in minutes (default: 30)

Examples:
  node trigger_ci.js --ci github --repo myuser/myapp --poll
  node trigger_ci.js --ci codemagic --repo myuser/myapp --branch develop
  node trigger_ci.js --ci eas --platform android --poll

Environment Variables:
  CODEMAGIC_PROJECT_ID     - Required for Codemagic
  CODEMAGIC_ACCESS_TOKEN   - Required for Codemagic
  EXPO_TOKEN              - Required for EAS
`);
    process.exit(0);
  }

  const ci = args[args.indexOf('--ci') + 1];
  const repo = args[args.indexOf('--repo') + 1];
  const branch = args.includes('--branch') ? args[args.indexOf('--branch') + 1] : 'main';
  const platform = args.includes('--platform') ? args[args.indexOf('--platform') + 1] : 'android';
  const poll = args.includes('--poll');
  const timeout = args.includes('--timeout') ? parseInt(args[args.indexOf('--timeout') + 1]) : 30;

  const trigger = new CITrigger();

  try {
    let result;
    
    switch (ci) {
      case 'github':
        if (!repo) throw new Error('--repo required for GitHub Actions');
        result = await trigger.triggerGitHubActions(repo, branch);
        if (poll) {
          const pollResult = await trigger.pollGitHubActions(repo, result.runId, timeout);
          result = { ...result, ...pollResult };
        }
        break;
        
      case 'codemagic':
        if (!repo) throw new Error('--repo required for Codemagic');
        result = await trigger.triggerCodemagic(repo, branch);
        if (poll) {
          const pollResult = await trigger.pollCodemagic(result.buildId, timeout);
          result = { ...result, ...pollResult };
        }
        break;
        
      case 'eas':
        result = await trigger.triggerEAS(repo || 'app', platform);
        if (poll) {
          const pollResult = await trigger.pollEAS(result.buildId, timeout);
          result = { ...result, ...pollResult };
        }
        break;
        
      default:
        throw new Error('Invalid CI provider. Use: github, codemagic, or eas');
    }
    
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('CI trigger failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { CITrigger };