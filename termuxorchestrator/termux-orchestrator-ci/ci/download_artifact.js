#!/usr/bin/env node
/**
 * Artifact Download Script for Termux Orchestrator
 * Downloads build artifacts from GitHub Actions, Codemagic, or EAS
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ArtifactDownloader {
  constructor() {
    this.logFile = path.join(process.env.HOME, '.orchestrator', 'logs', 'artifact-download.log');
    this.downloadDir = path.join(process.env.HOME, 'Downloads', 'orchestrator');
    this.ensureLogDir();
    this.ensureDownloadDir();
  }

  ensureLogDir() {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  ensureDownloadDir() {
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    console.log(logEntry.trim());
    fs.appendFileSync(this.logFile, logEntry);
  }

  /**
   * Download artifact from GitHub Actions
   */
  async downloadFromGitHub(repo, runId, artifactName = null) {
    this.log(`Downloading GitHub Actions artifact: ${repo}:${runId}`);
    
    try {
      // Check if GitHub CLI is available
      execSync('gh --version', { stdio: 'ignore' });
      
      // List artifacts for the run
      const listCmd = `gh api repos/${repo}/actions/runs/${runId}/artifacts --jq '.artifacts[]'`;
      const artifactsJson = execSync(listCmd, { encoding: 'utf8' });
      const artifacts = JSON.parse(`[${artifactsJson.trim().split('\n').join(',')}]`);
      
      if (artifacts.length === 0) {
        throw new Error('No artifacts found for this run');
      }
      
      // Find the artifact to download (prioritize APK artifacts)
      let targetArtifact;
      if (artifactName) {
        targetArtifact = artifacts.find(a => a.name === artifactName);
      } else {
        // Auto-select APK or Android artifacts
        targetArtifact = artifacts.find(a => 
          a.name.toLowerCase().includes('apk') || 
          a.name.toLowerCase().includes('android') ||
          a.name.toLowerCase().includes('app')
        ) || artifacts[0];
      }
      
      if (!targetArtifact) {
        throw new Error(`Artifact not found: ${artifactName || 'auto-select'}`);
      }
      
      this.log(`Found artifact: ${targetArtifact.name} (${targetArtifact.size_in_bytes} bytes)`);
      
      // Download artifact
      const outputPath = path.join(this.downloadDir, `${targetArtifact.name}.zip`);
      const downloadCmd = `gh api repos/${repo}/actions/artifacts/${targetArtifact.id}/zip > "${outputPath}"`;
      
      execSync(downloadCmd, { stdio: 'inherit' });
      
      // Extract if it's a zip file
      const extractedPath = await this.extractArtifact(outputPath);
      
      this.log(`Artifact downloaded successfully: ${extractedPath}`);
      return {
        success: true,
        artifactPath: extractedPath,
        originalPath: outputPath,
        artifact: targetArtifact
      };
      
    } catch (error) {
      this.log(`GitHub artifact download failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download artifact from Codemagic
   */
  async downloadFromCodemagic(buildId) {
    this.log(`Downloading Codemagic artifact: ${buildId}`);
    
    try {
      const accessToken = process.env.CODEMAGIC_ACCESS_TOKEN;
      if (!accessToken) {
        throw new Error('CODEMAGIC_ACCESS_TOKEN not set');
      }
      
      // Get build details
      const buildDetailsCmd = `curl -s -H "x-auth-token: ${accessToken}" "https://api.codemagic.io/builds/${buildId}"`;
      const buildDetails = JSON.parse(execSync(buildDetailsCmd, { encoding: 'utf8' }));
      
      if (!buildDetails.build) {
        throw new Error('Build not found or access denied');
      }
      
      const build = buildDetails.build;
      this.log(`Build status: ${build.status}`);
      
      if (build.status !== 'finished') {
        throw new Error(`Build not finished. Status: ${build.status}`);
      }
      
      // Find APK artifact
      const artifacts = build.artefacts || [];
      const apkArtifact = artifacts.find(a => 
        a.name.endsWith('.apk') || 
        a.type === 'apk' ||
        a.name.toLowerCase().includes('apk')
      );
      
      if (!apkArtifact) {
        throw new Error('No APK artifact found in build');
      }
      
      this.log(`Found APK: ${apkArtifact.name} (${apkArtifact.size || 'unknown size'})`);
      
      // Download APK
      const outputPath = path.join(this.downloadDir, apkArtifact.name);
      const downloadCmd = `curl -L -H "x-auth-token: ${accessToken}" "${apkArtifact.url}" -o "${outputPath}"`;
      
      execSync(downloadCmd, { stdio: 'inherit' });
      
      this.log(`APK downloaded successfully: ${outputPath}`);
      return {
        success: true,
        artifactPath: outputPath,
        artifact: apkArtifact,
        build: build
      };
      
    } catch (error) {
      this.log(`Codemagic artifact download failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download artifact from EAS Build
   */
  async downloadFromEAS(buildId) {
    this.log(`Downloading EAS artifact: ${buildId}`);
    
    try {
      // Check if EAS CLI is available
      execSync('eas --version', { stdio: 'ignore' });
      
      // Get build details
      const buildCmd = `eas build:view ${buildId} --json`;
      const buildDetails = JSON.parse(execSync(buildCmd, { encoding: 'utf8' }));
      
      if (!buildDetails) {
        throw new Error('Build not found');
      }
      
      this.log(`Build status: ${buildDetails.status}`);
      
      if (buildDetails.status !== 'finished') {
        throw new Error(`Build not finished. Status: ${buildDetails.status}`);
      }
      
      const artifactUrl = buildDetails.artifacts?.buildUrl;
      if (!artifactUrl) {
        throw new Error('No build artifact URL found');
      }
      
      this.log(`Found artifact URL: ${artifactUrl}`);
      
      // Determine file extension from URL or build type
      const extension = buildDetails.platform === 'ios' ? '.ipa' : '.apk';
      const filename = `${buildDetails.appId}-${buildDetails.buildVersion}${extension}`;
      const outputPath = path.join(this.downloadDir, filename);
      
      // Download artifact
      const downloadCmd = `curl -L "${artifactUrl}" -o "${outputPath}"`;
      execSync(downloadCmd, { stdio: 'inherit' });
      
      this.log(`EAS artifact downloaded successfully: ${outputPath}`);
      return {
        success: true,
        artifactPath: outputPath,
        artifact: {
          url: artifactUrl,
          name: filename,
          platform: buildDetails.platform
        },
        build: buildDetails
      };
      
    } catch (error) {
      this.log(`EAS artifact download failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract compressed artifacts (zip files)
   */
  async extractArtifact(zipPath) {
    if (!zipPath.endsWith('.zip')) {
      return zipPath; // Not a zip file, return as-is
    }
    
    try {
      const extractDir = path.join(path.dirname(zipPath), path.basename(zipPath, '.zip'));
      
      // Create extraction directory
      if (!fs.existsSync(extractDir)) {
        fs.mkdirSync(extractDir, { recursive: true });
      }
      
      // Extract zip file
      const extractCmd = `cd "${extractDir}" && unzip -o "${zipPath}"`;
      execSync(extractCmd, { stdio: 'inherit' });
      
      // Find the main artifact file (APK, IPA, etc.)
      const files = fs.readdirSync(extractDir);
      const artifactFile = files.find(f => 
        f.endsWith('.apk') || 
        f.endsWith('.ipa') || 
        f.endsWith('.aab')
      );
      
      if (artifactFile) {
        const artifactPath = path.join(extractDir, artifactFile);
        this.log(`Extracted artifact: ${artifactPath}`);
        return artifactPath;
      } else {
        this.log(`No mobile artifact found in extracted files: ${files.join(', ')}`);
        return extractDir; // Return directory if no specific artifact found
      }
      
    } catch (error) {
      this.log(`Failed to extract ${zipPath}: ${error.message}`);
      return zipPath; // Return original if extraction fails
    }
  }

  /**
   * Validate downloaded artifact
   */
  validateArtifact(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Artifact file not found: ${filePath}`);
    }
    
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      throw new Error(`Artifact file is empty: ${filePath}`);
    }
    
    const ext = path.extname(filePath).toLowerCase();
    if (!['.apk', '.ipa', '.aab'].includes(ext)) {
      this.log(`Warning: Unexpected file type: ${ext}`);
    }
    
    this.log(`Artifact validation passed: ${filePath} (${stats.size} bytes)`);
    return true;
  }

  /**
   * Clean up old downloads
   */
  cleanupOldDownloads(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days default
    this.log('Cleaning up old downloads...');
    
    try {
      const files = fs.readdirSync(this.downloadDir);
      const now = Date.now();
      let cleaned = 0;
      
      for (const file of files) {
        const filePath = path.join(this.downloadDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          if (stats.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filePath);
          }
          cleaned++;
          this.log(`Removed old file: ${file}`);
        }
      }
      
      this.log(`Cleanup complete: ${cleaned} files removed`);
    } catch (error) {
      this.log(`Cleanup failed: ${error.message}`);
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`Usage: node download_artifact.js <provider> <build-id> [options]

Providers:
  github <repo> <run-id> [artifact-name]
  codemagic <build-id>
  eas <build-id>

Options:
  --output <dir>     Download directory (default: ~/Downloads/orchestrator)
  --cleanup          Clean old downloads before starting

Examples:
  node download_artifact.js github user/repo 123456
  node download_artifact.js github user/repo 123456 android-apk
  node download_artifact.js codemagic abc123def456
  node download_artifact.js eas build_12345678
  node download_artifact.js --cleanup github user/repo 123456`);
    process.exit(1);
  }
  
  const provider = args[0];
  const downloader = new ArtifactDownloader();
  
  try {
    // Handle cleanup option
    if (args.includes('--cleanup')) {
      downloader.cleanupOldDownloads();
    }
    
    // Handle output directory option
    const outputIndex = args.indexOf('--output');
    if (outputIndex !== -1 && args[outputIndex + 1]) {
      downloader.downloadDir = args[outputIndex + 1];
      downloader.ensureDownloadDir();
    }
    
    let result;
    
    switch (provider) {
      case 'github':
        if (args.length < 3) {
          throw new Error('GitHub provider requires: <repo> <run-id> [artifact-name]');
        }
        const [, repo, runId, artifactName] = args;
        result = await downloader.downloadFromGitHub(repo, runId, artifactName);
        break;
        
      case 'codemagic':
        if (args.length < 2) {
          throw new Error('Codemagic provider requires: <build-id>');
        }
        const [, buildId] = args;
        result = await downloader.downloadFromCodemagic(buildId);
        break;
        
      case 'eas':
        if (args.length < 2) {
          throw new Error('EAS provider requires: <build-id>');
        }
        const [, easBuildId] = args;
        result = await downloader.downloadFromEAS(easBuildId);
        break;
        
      default:
        throw new Error(`Unknown provider: ${provider}. Use: github, codemagic, or eas`);
    }
    
    // Validate downloaded artifact
    downloader.validateArtifact(result.artifactPath);
    
    console.log(`\n✅ Download completed successfully!`);
    console.log(`📁 Artifact: ${result.artifactPath}`);
    console.log(`📊 Provider: ${provider}`);
    
    // Output JSON for programmatic use
    if (args.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    }
    
  } catch (error) {
    console.error(`❌ Download failed: ${error.message}`);
    process.exit(1);
  }
}

// Export for use as module
module.exports = { ArtifactDownloader };

// Run CLI if called directly
if (require.main === module) {
  main().catch(console.error);
}