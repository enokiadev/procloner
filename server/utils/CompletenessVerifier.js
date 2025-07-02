const fs = require('fs-extra');
const path = require('path');
const fetch = require('node-fetch');
const { logger } = require('./logger');

class CompletenessVerifier {
  constructor(outputDir, expectedAssets) {
    this.outputDir = outputDir;
    this.expectedAssets = expectedAssets; // Map from PayloadAnalyzer
    this.verificationResults = {
      totalExpected: 0,
      totalDownloaded: 0,
      totalMissing: 0,
      totalFailed: 0,
      missingAssets: [],
      failedAssets: [],
      sizeMismatch: [],
      completenessPercentage: 0
    };
  }

  // Main verification method
  async verifyCompleteness(discoveredAssets) {
    try {
      logger.info('Starting completeness verification', {
        component: 'CompletenessVerifier',
        expectedAssets: this.expectedAssets.size,
        discoveredAssets: discoveredAssets.size,
        outputDir: this.outputDir
      });

      // Phase 1: Verify expected assets were downloaded
      await this.verifyExpectedAssets(discoveredAssets);

      // Phase 2: Check for missing critical assets
      await this.identifyMissingCriticalAssets();

      // Phase 3: Verify file integrity and sizes
      await this.verifyFileIntegrity(discoveredAssets);

      // Phase 4: Discover additional assets that might have been missed
      const additionalAssets = await this.discoverMissedAssets();

      // Phase 5: Calculate final completeness metrics
      this.calculateCompletenessMetrics();

      logger.info('Completeness verification completed', {
        component: 'CompletenessVerifier',
        completenessPercentage: this.verificationResults.completenessPercentage,
        missingAssets: this.verificationResults.totalMissing,
        failedAssets: this.verificationResults.totalFailed
      });

      return {
        ...this.verificationResults,
        additionalAssetsFound: additionalAssets
      };
    } catch (error) {
      logger.error('Completeness verification failed', {
        component: 'CompletenessVerifier',
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Verify that expected assets were actually downloaded
  async verifyExpectedAssets(discoveredAssets) {
    this.verificationResults.totalExpected = this.expectedAssets.size;
    
    for (const [expectedUrl, expectedAsset] of this.expectedAssets) {
      const downloadedAsset = discoveredAssets.get(expectedUrl);
      
      if (!downloadedAsset) {
        // Asset was expected but not discovered during crawling
        this.verificationResults.missingAssets.push({
          url: expectedUrl,
          type: expectedAsset.type,
          critical: expectedAsset.critical || false,
          reason: 'not_discovered',
          source: expectedAsset.source
        });
        this.verificationResults.totalMissing++;
        continue;
      }

      if (!downloadedAsset.downloaded || !downloadedAsset.localPath) {
        // Asset was discovered but failed to download
        this.verificationResults.failedAssets.push({
          url: expectedUrl,
          type: expectedAsset.type,
          critical: expectedAsset.critical || false,
          reason: downloadedAsset.error || 'download_failed',
          source: expectedAsset.source
        });
        this.verificationResults.totalFailed++;
        continue;
      }

      // Check if file actually exists
      if (!await fs.pathExists(downloadedAsset.localPath)) {
        this.verificationResults.failedAssets.push({
          url: expectedUrl,
          type: expectedAsset.type,
          critical: expectedAsset.critical || false,
          reason: 'file_missing_on_disk',
          localPath: downloadedAsset.localPath
        });
        this.verificationResults.totalFailed++;
        continue;
      }

      this.verificationResults.totalDownloaded++;
    }

    logger.debug('Expected assets verification completed', {
      component: 'CompletenessVerifier',
      expected: this.verificationResults.totalExpected,
      downloaded: this.verificationResults.totalDownloaded,
      missing: this.verificationResults.totalMissing,
      failed: this.verificationResults.totalFailed
    });
  }

  // Identify missing critical assets that must be recovered
  async identifyMissingCriticalAssets() {
    const criticalMissing = this.verificationResults.missingAssets
      .concat(this.verificationResults.failedAssets)
      .filter(asset => asset.critical);

    if (criticalMissing.length > 0) {
      logger.warn('Critical assets are missing', {
        component: 'CompletenessVerifier',
        criticalMissingCount: criticalMissing.length,
        criticalAssets: criticalMissing.map(a => ({ url: a.url, type: a.type, reason: a.reason }))
      });

      // Attempt to recover critical assets
      const recoveryResults = await this.attemptAssetRecovery(criticalMissing);
      
      return recoveryResults;
    }

    return { recovered: 0, stillMissing: 0 };
  }

  // Attempt to recover missing critical assets
  async attemptAssetRecovery(missingAssets) {
    logger.info('Attempting to recover missing critical assets', {
      component: 'CompletenessVerifier',
      assetsToRecover: missingAssets.length
    });

    let recovered = 0;
    let stillMissing = 0;

    for (const missingAsset of missingAssets) {
      try {
        const success = await this.recoverSingleAsset(missingAsset);
        if (success) {
          recovered++;
          // Remove from missing/failed arrays
          this.removeMissingAsset(missingAsset.url);
          this.verificationResults.totalDownloaded++;
          this.verificationResults.totalMissing = Math.max(0, this.verificationResults.totalMissing - 1);
          this.verificationResults.totalFailed = Math.max(0, this.verificationResults.totalFailed - 1);
        } else {
          stillMissing++;
        }
      } catch (error) {
        logger.debug('Asset recovery failed', {
          component: 'CompletenessVerifier',
          url: missingAsset.url,
          error: error.message
        });
        stillMissing++;
      }
    }

    logger.info('Asset recovery completed', {
      component: 'CompletenessVerifier',
      recovered,
      stillMissing
    });

    return { recovered, stillMissing };
  }

  // Recover a single missing asset
  async recoverSingleAsset(missingAsset) {
    try {
      logger.debug('Attempting to recover asset', {
        component: 'CompletenessVerifier',
        url: missingAsset.url,
        type: missingAsset.type
      });

      const response = await fetch(missingAsset.url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = await response.buffer();
      
      // Determine local path
      const localPath = this.generateLocalPath(missingAsset.url, missingAsset.type);
      await fs.ensureDir(path.dirname(localPath));
      await fs.writeFile(localPath, buffer);

      logger.info('Asset recovered successfully', {
        component: 'CompletenessVerifier',
        url: missingAsset.url,
        localPath,
        size: buffer.length
      });

      return true;
    } catch (error) {
      logger.debug('Asset recovery failed', {
        component: 'CompletenessVerifier',
        url: missingAsset.url,
        error: error.message
      });
      return false;
    }
  }

  // Generate local path for recovered asset
  generateLocalPath(url, type) {
    const urlObj = new URL(url);
    let filename = path.basename(urlObj.pathname) || 'asset';
    
    // Handle query parameters
    if (filename.includes('?')) {
      filename = filename.split('?')[0];
    }

    // Ensure extension
    if (!path.extname(filename)) {
      const extensions = {
        'stylesheet': '.css',
        'javascript': '.js',
        'image': '.png',
        'font': '.woff2',
        'video': '.mp4',
        'audio': '.mp3',
        '3d-model': '.glb'
      };
      filename += extensions[type] || '.bin';
    }

    const assetDir = path.join(this.outputDir, 'assets', type);
    return path.join(assetDir, filename);
  }

  // Remove asset from missing/failed arrays
  removeMissingAsset(url) {
    this.verificationResults.missingAssets = this.verificationResults.missingAssets
      .filter(asset => asset.url !== url);
    this.verificationResults.failedAssets = this.verificationResults.failedAssets
      .filter(asset => asset.url !== url);
  }

  // Verify file integrity and detect size mismatches
  async verifyFileIntegrity(discoveredAssets) {
    logger.info('Verifying file integrity', {
      component: 'CompletenessVerifier',
      totalFiles: discoveredAssets.size
    });

    for (const [url, asset] of discoveredAssets) {
      if (asset.downloaded && asset.localPath) {
        try {
          const stats = await fs.stat(asset.localPath);
          const actualSize = stats.size;
          const expectedSize = asset.size || 0;

          // Check for significant size mismatch (more than 10% difference)
          if (expectedSize > 0 && Math.abs(actualSize - expectedSize) / expectedSize > 0.1) {
            this.verificationResults.sizeMismatch.push({
              url,
              type: asset.type,
              expectedSize,
              actualSize,
              localPath: asset.localPath,
              sizeDifference: actualSize - expectedSize,
              percentageDifference: ((actualSize - expectedSize) / expectedSize * 100).toFixed(1)
            });
          }

          // Check for suspiciously small files that might be error pages
          if (actualSize < 100 && asset.type !== 'other') {
            logger.warn('Suspiciously small file detected', {
              component: 'CompletenessVerifier',
              url,
              type: asset.type,
              size: actualSize,
              localPath: asset.localPath
            });
          }
        } catch (error) {
          logger.debug('File integrity check failed', {
            component: 'CompletenessVerifier',
            url,
            localPath: asset.localPath,
            error: error.message
          });
        }
      }
    }
  }

  // Discover additional assets that might have been missed
  async discoverMissedAssets() {
    logger.info('Scanning for missed assets in downloaded files', {
      component: 'CompletenessVerifier',
      outputDir: this.outputDir
    });

    const additionalAssets = [];

    try {
      // Scan HTML files for missed references
      const htmlFiles = await this.findFiles(this.outputDir, ['.html', '.htm']);
      for (const htmlFile of htmlFiles) {
        const missedFromHtml = await this.scanHtmlForMissedAssets(htmlFile);
        additionalAssets.push(...missedFromHtml);
      }

      // Scan CSS files for missed references
      const cssFiles = await this.findFiles(path.join(this.outputDir, 'assets', 'stylesheet'), ['.css']);
      for (const cssFile of cssFiles) {
        const missedFromCss = await this.scanCssForMissedAssets(cssFile);
        additionalAssets.push(...missedFromCss);
      }

      // Scan JS files for dynamic asset references
      const jsFiles = await this.findFiles(path.join(this.outputDir, 'assets', 'javascript'), ['.js']);
      for (const jsFile of jsFiles) {
        const missedFromJs = await this.scanJsForMissedAssets(jsFile);
        additionalAssets.push(...missedFromJs);
      }

      // Remove duplicates
      const uniqueAssets = additionalAssets.filter((asset, index, self) =>
        index === self.findIndex(a => a.url === asset.url)
      );

      if (uniqueAssets.length > 0) {
        logger.info('Discovered additional missed assets', {
          component: 'CompletenessVerifier',
          additionalAssets: uniqueAssets.length,
          fromHtml: additionalAssets.filter(a => a.source.includes('html')).length,
          fromCss: additionalAssets.filter(a => a.source.includes('css')).length,
          fromJs: additionalAssets.filter(a => a.source.includes('js')).length
        });
      }

      return uniqueAssets;
    } catch (error) {
      logger.error('Failed to discover missed assets', {
        component: 'CompletenessVerifier',
        error: error.message
      });
      return [];
    }
  }

  // Find files with specific extensions
  async findFiles(dir, extensions) {
    const files = [];
    
    try {
      if (!await fs.pathExists(dir)) return files;

      const items = await fs.readdir(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        
        if (item.isDirectory()) {
          const subFiles = await this.findFiles(fullPath, extensions);
          files.push(...subFiles);
        } else if (extensions.some(ext => item.name.toLowerCase().endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      logger.debug('Error finding files', {
        component: 'CompletenessVerifier',
        dir,
        error: error.message
      });
    }

    return files;
  }

  // Scan HTML file for missed asset references
  async scanHtmlForMissedAssets(htmlFile) {
    try {
      const content = await fs.readFile(htmlFile, 'utf8');
      const missedAssets = [];

      // Find asset URLs that might not have been discovered
      const patterns = [
        /src=["']([^"']+)["']/g,
        /href=["']([^"']+)["']/g,
        /url\(["']?([^"')]+)["']?\)/g,
        /data-src=["']([^"']+)["']/g,
        /data-lazy=["']([^"']+)["']/g
      ];

      patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const url = match[1];
          if (this.isValidAssetUrl(url) && !this.isAssetDiscovered(url)) {
            missedAssets.push({
              url: this.resolveUrl(url, htmlFile),
              type: this.determineAssetType(url),
              source: 'html_scan',
              discoveredIn: htmlFile
            });
          }
        }
      });

      return missedAssets;
    } catch (error) {
      logger.debug('HTML scanning failed', {
        component: 'CompletenessVerifier',
        file: htmlFile,
        error: error.message
      });
      return [];
    }
  }

  // Scan CSS file for missed asset references
  async scanCssForMissedAssets(cssFile) {
    try {
      const content = await fs.readFile(cssFile, 'utf8');
      const missedAssets = [];

      // @import statements
      const imports = content.match(/@import\s+(?:url\()?['"]?([^'")]+)['"]?(?:\))?[^;]*;/g);
      if (imports) {
        imports.forEach(imp => {
          const urlMatch = imp.match(/@import\s+(?:url\()?['"]?([^'")]+)['"]?/);
          if (urlMatch && urlMatch[1] && !this.isAssetDiscovered(urlMatch[1])) {
            missedAssets.push({
              url: this.resolveUrl(urlMatch[1], cssFile),
              type: 'stylesheet',
              source: 'css_import_scan',
              discoveredIn: cssFile
            });
          }
        });
      }

      // url() references
      const urls = content.match(/url\(['"]?([^'")]+)['"]?\)/g);
      if (urls) {
        urls.forEach(url => {
          const urlMatch = url.match(/url\(['"]?([^'")]+)['"]?\)/);
          if (urlMatch && urlMatch[1] && !this.isAssetDiscovered(urlMatch[1])) {
            missedAssets.push({
              url: this.resolveUrl(urlMatch[1], cssFile),
              type: this.determineAssetType(urlMatch[1]),
              source: 'css_url_scan',
              discoveredIn: cssFile
            });
          }
        });
      }

      return missedAssets;
    } catch (error) {
      logger.debug('CSS scanning failed', {
        component: 'CompletenessVerifier',
        file: cssFile,
        error: error.message
      });
      return [];
    }
  }

  // Scan JS file for dynamic asset references
  async scanJsForMissedAssets(jsFile) {
    try {
      const content = await fs.readFile(jsFile, 'utf8');
      const missedAssets = [];

      // Look for string literals that might be asset URLs
      const urlPatterns = [
        /"([^"]*\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|glb|gltf)[^"]*)"/g,
        /'([^']*\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|glb|gltf)[^']*)'/g
      ];

      urlPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const url = match[1];
          if (this.isValidAssetUrl(url) && !this.isAssetDiscovered(url)) {
            missedAssets.push({
              url: this.resolveUrl(url, jsFile),
              type: this.determineAssetType(url),
              source: 'js_scan',
              discoveredIn: jsFile
            });
          }
        }
      });

      return missedAssets;
    } catch (error) {
      logger.debug('JS scanning failed', {
        component: 'CompletenessVerifier',
        file: jsFile,
        error: error.message
      });
      return [];
    }
  }

  // Check if asset was already discovered
  isAssetDiscovered(url) {
    const fullUrl = this.resolveUrl(url);
    return this.expectedAssets.has(fullUrl);
  }

  // Validate if URL looks like a valid asset
  isValidAssetUrl(url) {
    if (!url || url.length < 3) return false;
    if (url.startsWith('data:')) return false;
    if (url.startsWith('blob:')) return false;
    if (url.startsWith('javascript:')) return false;
    if (url.startsWith('#')) return false;
    if (url.includes('localhost') && !url.includes(this.baseUrl)) return false;
    
    return true;
  }

  // Resolve relative URL to absolute
  resolveUrl(url, relativeTo = null) {
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) return url;
      if (url.startsWith('//')) return 'https:' + url;
      
      // For file-based resolution, we need the base URL
      // This would need to be enhanced based on the original website URL
      return url; // Simplified for now
    } catch {
      return url;
    }
  }

  // Determine asset type from URL
  determineAssetType(url) {
    const urlLower = url.toLowerCase();
    
    if (urlLower.match(/\.(css)$/)) return 'stylesheet';
    if (urlLower.match(/\.(js|mjs)$/)) return 'javascript';
    if (urlLower.match(/\.(png|jpg|jpeg|gif|svg|webp|avif)$/)) return 'image';
    if (urlLower.match(/\.(woff|woff2|ttf|otf|eot)$/)) return 'font';
    if (urlLower.match(/\.(mp4|webm|mov|avi)$/)) return 'video';
    if (urlLower.match(/\.(mp3|wav|ogg|flac)$/)) return 'audio';
    if (urlLower.match(/\.(glb|gltf)$/)) return '3d-model';
    
    return 'other';
  }

  // Calculate final completeness metrics
  calculateCompletenessMetrics() {
    const total = this.verificationResults.totalExpected;
    const success = this.verificationResults.totalDownloaded;
    
    this.verificationResults.completenessPercentage = total > 0 
      ? Math.round((success / total) * 100) 
      : 0;

    // Additional quality metrics
    this.verificationResults.qualityScore = this.calculateQualityScore();
    this.verificationResults.criticalAssetsMissing = this.verificationResults.missingAssets
      .concat(this.verificationResults.failedAssets)
      .filter(asset => asset.critical).length;
  }

  // Calculate quality score based on what types of assets are missing
  calculateQualityScore() {
    const weights = {
      'stylesheet': 25,    // CSS is critical for appearance
      'javascript': 20,    // JS affects functionality
      'font': 15,         // Fonts affect typography
      'image': 10,        // Images affect visual content
      '3d-model': 30,     // 3D models are specialized content
      'video': 15,        // Media content
      'audio': 10,
      'other': 5
    };

    let totalWeight = 0;
    let missingWeight = 0;

    this.expectedAssets.forEach(asset => {
      const weight = weights[asset.type] || weights['other'];
      totalWeight += weight;
      
      const isMissing = this.verificationResults.missingAssets
        .concat(this.verificationResults.failedAssets)
        .some(missing => missing.url === asset.url);
      
      if (isMissing) {
        missingWeight += weight;
      }
    });

    return totalWeight > 0 ? Math.round(((totalWeight - missingWeight) / totalWeight) * 100) : 100;
  }
}

module.exports = CompletenessVerifier;