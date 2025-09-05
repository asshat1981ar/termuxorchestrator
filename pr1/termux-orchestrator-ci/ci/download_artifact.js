#!/usr/bin/env node
/**
 * Artifact Download Script for Termux Orchestrator
 * Downloads build artifacts from CI providers
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

class ArtifactDownloader {
  constructor() {
    this.logFile = path.join(process.env.HOME, '.orchestrator', 'logs', 'download.log');
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

  async downloadFile(url, outputPath, headers = {}) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      
      this.log(`Downloading ${url} to ${outputPath}`);
      
      const request = client.get(url, { headers }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirect
          this.log(`Redirected to: ${response.headers.location}`);
          return this.downloadFile(response.headers.location, outputPath, headers)
            .then(resolve)
            .catch(reject);
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }
        
        const fileStream = fs.createWriteStream(outputPath);
        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;
        
        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize) {
            const percent = Math.round((downloadedSize / totalSize) * 100);
            process.stdout.write(`\rDownloading: ${percent}% (${downloadedSize}/${totalSize} bytes)`);
          }
        });
        
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          console.log('\nDownload completed');
          fileStream.close();
          resolve(outputPath);
        });
        
        fileStream.on('error', reject);
      });
      
      request.on('error', reject);
      request.setTimeout(300000, () => { // 5 minute timeout
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  async downloadGitHubArtifact(repo, runId, outputDir) {
    this.log(`Downloading GitHub Actions artifact for ${repo}:${runId}`);
    
    try {
      // Get artifact info
      const artifactCmd = `gh api repos/${repo}/actions/runs/${runId}/artifacts --jq '.artifacts[0]'`;
      const artifactInfo = JSON.parse(execSync(artifactCmd, { encoding: 'utf8' }));
      
      if (!artifactInfo || !artifactInfo.archive_download_url) {
        throw new Error('No artifacts found for this run');
      }
      
      this.log(`Artifact: ${artifactInfo.name} (${artifactInfo.size_in_bytes} bytes)`);
      
      // Download artifact (requires authentication)
      const downloadUrl = artifactInfo.archive_download_url;
      const token = execSync('gh auth token', { encoding: 'utf8' }).trim();
      
      const outputPath = path.join(outputDir, `${artifactInfo.name}.zip`);
      await this.downloadFile(downloadUrl, outputPath, {
        'Authorization': `token ${token}`,
        'User-Agent': 'termux-orchestrator'
      });
      
      // Extract if it's a zip file
      if (outputPath.endsWith('.zip')) {
        const extractDir = path.join(outputDir, artifactInfo.name);
        fs.mkdirSync(extractDir, { recursive: true });
        
        try {
          execSync(`unzip -o "${outputPath}" -d "${extractDir}"`, { stdio: 'pipe' });
          this.log(`Extracted to: ${extractDir}`);
          
          // Find APK files
          const apkFiles = this.findFiles(extractDir, '.apk');
          if (apkFiles.length > 0) {
            this.log(`Found APK files: ${apkFiles.join(', ')}`);
            return apkFiles[0]; // Return first APK
          }
        } catch (error) {
          this.log(`Extraction failed: ${error.message}`);
        }
      }
      
      return outputPath;
      
    } catch (error) {
      throw new Error(`GitHub artifact download failed: ${error.message}`);
    }
  }

  async downloadCodemagicArtifact(buildId, outputDir) {
    this.log(`Downloading Codemagic artifact for build ${buildId}`);
    
    try {
      const accessToken = process.env.CODEMAGIC_ACCESS_TOKEN;
      if (!accessToken) {
        throw new Error('CODEMAGIC_ACCESS_TOKEN environment variable required');
      }
      
      // Get build info
      const curlCmd = `curl -s -H "x-auth-token: ${accessToken}" https://api.codemagic.io/builds/${buildId}`;
      const response = execSync(curlCmd, { encoding: 'utf8' });
      const buildInfo = JSON.parse(response);
      
      if (!buildInfo.artefacts || buildInfo.artefacts.length === 0) {
        throw new Error('No artifacts found for this build');
      }
      
      const artifact = buildInfo.artefacts[0];
      this.log(`Artifact: ${artifact.name} (${artifact.size} bytes)`);
      
      const outputPath = path.join(outputDir, artifact.name);
      await this.downloadFile(artifact.url, outputPath);
      
      return outputPath;
      
    } catch (error) {
      throw new Error(`Codemagic artifact download failed: ${error.message}`);
    }
  }

  async downloadEASArtifact(buildId, outputDir) {
    this.log(`Downloading EAS artifact for build ${buildId}`);
    
    try {
      // Get build info
      const cmd = `eas build:view ${buildId} --json`;
      const output = execSync(cmd, { encoding: 'utf8' });
      const buildInfo = JSON.parse(output);
      
      if (!buildInfo.artifacts || !buildInfo.artifacts.buildUrl) {
        throw new Error('No build URL found for this build');
      }
      
      const buildUrl = buildInfo.artifacts.buildUrl;
      const fileName = `eas-build-${buildId}.apk`;
      const outputPath = path.join(outputDir, fileName);
      
      this.log(`Build URL: ${buildUrl}`);
      await this.downloadFile(buildUrl, outputPath);
      
      return outputPath;
      
    } catch (error) {
      throw new Error(`EAS artifact download failed: ${error.message}`);
    }
  }

  async downloadFromUrl(url, outputDir, fileName = null) {
    this.log(`Downloading from URL: ${url}`);
    
    try {
      if (!fileName) {
        fileName = path.basename(url) || `download-${Date.now()}`;
      }
      
      const outputPath = path.join(outputDir, fileName);
      await this.downloadFile(url, outputPath);
      
      return outputPath;
      
    } catch (error) {
      throw new Error(`URL download failed: ${error.message}`);
    }
  }

  findFiles(directory, extension) {
    const files = [];
    
    const searchDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          searchDir(fullPath);
        } else if (entry.name.endsWith(extension)) {
          files.push(fullPath);
        }
      }
    };
    
    searchDir(directory);
    return files;
  }

  setFilePermissions(filePath, mode = 0o644) {
    try {
      fs.chmodSync(filePath, mode);
      this.log(`Set permissions ${mode.toString(8)} on ${filePath}`);
    } catch (error) {
      this.log(`Failed to set permissions: ${error.message}`);
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node download_artifact.js [options]

Options:
  --provider <provider>  CI provider: github, codemagic, eas, url
  --repo <repo>         Repository for GitHub (format: owner/repo)
  --run-id <id>         Run ID for GitHub Actions
  --build-id <id>       Build ID for Codemagic or EAS
  --url <url>           Direct download URL
  --out <dir>           Output directory (default: ./artifacts)
  --filename <name>     Custom filename for URL downloads

Examples:
  node download_artifact.js --provider github --repo user/app --run-id 123456 --out ./downloads
  node download_artifact.js --provider codemagic --build-id abc123 --out ./artifacts
  node download_artifact.js --provider eas --build-id def456
  node download_artifact.js --provider url --url https://example.com/app.apk --filename app.apk

Environment Variables:
  CODEMAGIC_ACCESS_TOKEN - Required for Codemagic downloads
`);
    process.exit(0);
  }

  const provider = args[args.indexOf('--provider') + 1] || 'github';
  const repo = args.includes('--repo') ? args[args.indexOf('--repo') + 1] : null;
  const runId = args.includes('--run-id') ? args[args.indexOf('--run-id') + 1] : null;
  const buildId = args.includes('--build-id') ? args[args.indexOf('--build-id') + 1] : null;
  const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
  const outputDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : './artifacts';
  const fileName = args.includes('--filename') ? args[args.indexOf('--filename') + 1] : null;

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  const downloader = new ArtifactDownloader();

  try {
    let downloadedFile;
    
    switch (provider) {
      case 'github':
        if (!repo || !runId) {
          throw new Error('--repo and --run-id required for GitHub downloads');
        }
        downloadedFile = await downloader.downloadGitHubArtifact(repo, runId, outputDir);
        break;
        
      case 'codemagic':
        if (!buildId) {
          throw new Error('--build-id required for Codemagic downloads');
        }
        downloadedFile = await downloader.downloadCodemagicArtifact(buildId, outputDir);
        break;
        
      case 'eas':
        if (!buildId) {
          throw new Error('--build-id required for EAS downloads');
        }
        downloadedFile = await downloader.downloadEASArtifact(buildId, outputDir);
        break;
        
      case 'url':
        if (!url) {
          throw new Error('--url required for URL downloads');
        }
        downloadedFile = await downloader.downloadFromUrl(url, outputDir, fileName);
        break;
        
      default:
        throw new Error('Invalid provider. Use: github, codemagic, eas, or url');
    }
    
    // Set proper file permissions
    downloader.setFilePermissions(downloadedFile);
    
    console.log('\nDownload completed successfully!');
    console.log(`File: ${downloadedFile}`);
    
    // Output result as JSON for orchestrator consumption
    const result = {
      success: true,
      file: downloadedFile,
      provider: provider,
      size: fs.statSync(downloadedFile).size
    };
    
    console.log(JSON.stringify(result));
    
  } catch (error) {
    console.error('Download failed:', error.message);
    
    const result = {
      success: false,
      error: error.message,
      provider: provider
    };
    
    console.log(JSON.stringify(result));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { ArtifactDownloader };