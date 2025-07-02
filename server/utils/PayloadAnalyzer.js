const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const { URL } = require('url');
const { logger } = require('./logger');
const { config } = require('../config');

class PayloadAnalyzer {
  constructor(url, options = {}) {
    this.baseUrl = url;
    this.options = options;
    this.discoveredAssets = new Map();
    this.assetSizes = new Map();
    this.analysisDepth = options.depth || 3; // How deep to analyze dependencies
    this.visitedUrls = new Set();
    this.browser = null;
    this.page = null;
    this.totalEstimatedSize = 0;
    this.completenessScore = 0;
  }

  // Main analysis method - returns complete payload information
  async analyzePayload() {
    try {
      logger.info('Starting comprehensive payload analysis', {
        component: 'PayloadAnalyzer',
        url: this.baseUrl,
        analysisDepth: this.analysisDepth
      });

      // Phase 1: Initial page analysis
      await this.initializeBrowser();
      const initialAssets = await this.analyzeInitialPage();
      
      // Phase 2: Deep dependency analysis
      const dependencyAssets = await this.analyzeDependencies(initialAssets);
      
      // Phase 3: Size estimation for all assets
      await this.estimateAssetSizes();
      
      // Phase 4: Calculate completeness metrics
      const payloadInfo = this.calculatePayloadMetrics();
      
      await this.cleanup();
      
      logger.info('Payload analysis completed', {
        component: 'PayloadAnalyzer',
        totalAssets: this.discoveredAssets.size,
        estimatedSizeMB: (this.totalEstimatedSize / 1024 / 1024).toFixed(2),
        completenessScore: this.completenessScore
      });

      return payloadInfo;
    } catch (error) {
      logger.error('Payload analysis failed', {
        component: 'PayloadAnalyzer',
        error: error.message,
        stack: error.stack
      });
      await this.cleanup();
      throw error;
    }
  }

  async initializeBrowser() {
    this.browser = await puppeteer.launch({
      headless: config.browser.headless ? "new" : false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox", 
        "--disable-dev-shm-usage",
        "--disable-background-timer-throttling"
      ],
      timeout: config.browser.timeout
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.setDefaultTimeout(30000);
  }

  // Analyze the initial page to discover all immediate assets
  async analyzeInitialPage() {
    try {
      logger.info('Analyzing initial page structure', {
        component: 'PayloadAnalyzer',
        url: this.baseUrl
      });

      // Navigate and wait for full load
      await this.page.goto(this.baseUrl, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Wait for dynamic content
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Trigger lazy loading and dynamic content
      await this.triggerDynamicContent();

      // Extract all assets from the page
      const pageAssets = await this.extractAllPageAssets();
      
      // Add to discovered assets
      pageAssets.forEach(asset => {
        this.discoveredAssets.set(asset.url, asset);
      });

      logger.info('Initial page analysis completed', {
        component: 'PayloadAnalyzer',
        assetsFound: pageAssets.length,
        cssFiles: pageAssets.filter(a => a.type === 'stylesheet').length,
        jsFiles: pageAssets.filter(a => a.type === 'javascript').length,
        images: pageAssets.filter(a => a.type === 'image').length,
        fonts: pageAssets.filter(a => a.type === 'font').length
      });

      return pageAssets;
    } catch (error) {
      logger.error('Initial page analysis failed', {
        component: 'PayloadAnalyzer',
        error: error.message
      });
      return [];
    }
  }

  // Extract comprehensive asset list from the current page
  async extractAllPageAssets() {
    return await this.page.evaluate(() => {
      const assets = [];
      const baseUrl = window.location.origin;
      
      // Helper function to resolve URLs
      const resolveUrl = (url) => {
        try {
          if (url.startsWith('http://') || url.startsWith('https://')) return url;
          if (url.startsWith('//')) return window.location.protocol + url;
          if (url.startsWith('/')) return baseUrl + url;
          return new URL(url, window.location.href).href;
        } catch {
          return url;
        }
      };

      // 1. CSS Stylesheets
      document.querySelectorAll('link[rel="stylesheet"], link[type="text/css"]').forEach(link => {
        if (link.href) {
          assets.push({
            url: resolveUrl(link.href),
            type: 'stylesheet',
            source: 'link_tag',
            critical: true,
            element: 'link'
          });
        }
      });

      // 2. JavaScript files
      document.querySelectorAll('script[src]').forEach(script => {
        if (script.src) {
          assets.push({
            url: resolveUrl(script.src),
            type: 'javascript',
            source: 'script_tag',
            critical: !script.defer && !script.async,
            element: 'script'
          });
        }
      });

      // 3. Images (all types)
      document.querySelectorAll('img').forEach(img => {
        const sources = [
          img.src,
          img.dataset.src,
          img.dataset.lazySrc,
          img.dataset.original,
          img.getAttribute('data-lazy'),
          img.getAttribute('data-srcset')
        ].filter(Boolean);

        sources.forEach(src => {
          if (src) {
            // Handle srcset format
            if (src.includes(',')) {
              src.split(',').forEach(srcsetItem => {
                const url = srcsetItem.trim().split(' ')[0];
                if (url) {
                  assets.push({
                    url: resolveUrl(url),
                    type: 'image',
                    source: 'img_tag',
                    critical: img.loading !== 'lazy',
                    element: 'img'
                  });
                }
              });
            } else {
              assets.push({
                url: resolveUrl(src),
                type: 'image', 
                source: 'img_tag',
                critical: img.loading !== 'lazy',
                element: 'img'
              });
            }
          }
        });
      });

      // 4. Background images from computed styles
      document.querySelectorAll('*').forEach(element => {
        const style = window.getComputedStyle(element);
        const bgImage = style.backgroundImage;
        
        if (bgImage && bgImage !== 'none') {
          const urlMatch = bgImage.match(/url\(['"]?([^'")]+)['"]?\)/);
          if (urlMatch && urlMatch[1]) {
            assets.push({
              url: resolveUrl(urlMatch[1]),
              type: 'image',
              source: 'background_image',
              critical: false,
              element: element.tagName.toLowerCase()
            });
          }
        }
      });

      // 5. Inline CSS url() references
      document.querySelectorAll('style').forEach(styleTag => {
        const css = styleTag.textContent;
        if (css) {
          // @import statements
          const imports = css.match(/@import\s+(?:url\()?['"]?([^'")]+)['"]?(?:\))?[^;]*;/g);
          if (imports) {
            imports.forEach(imp => {
              const urlMatch = imp.match(/@import\s+(?:url\()?['"]?([^'")]+)['"]?/);
              if (urlMatch && urlMatch[1]) {
                assets.push({
                  url: resolveUrl(urlMatch[1]),
                  type: 'stylesheet',
                  source: 'css_import',
                  critical: true,
                  element: 'style'
                });
              }
            });
          }

          // url() references
          const urls = css.match(/url\(['"]?([^'")]+)['"]?\)/g);
          if (urls) {
            urls.forEach(url => {
              const urlMatch = url.match(/url\(['"]?([^'")]+)['"]?\)/);
              if (urlMatch && urlMatch[1]) {
                const assetUrl = resolveUrl(urlMatch[1]);
                const type = assetUrl.match(/\.(woff|woff2|ttf|otf|eot)$/i) ? 'font' : 'image';
                assets.push({
                  url: assetUrl,
                  type,
                  source: 'css_url',
                  critical: type === 'font',
                  element: 'style'
                });
              }
            });
          }
        }
      });

      // 6. Video and Audio sources
      document.querySelectorAll('video, audio').forEach(media => {
        if (media.src) {
          assets.push({
            url: resolveUrl(media.src),
            type: media.tagName.toLowerCase() === 'video' ? 'video' : 'audio',
            source: 'media_tag',
            critical: false,
            element: media.tagName.toLowerCase()
          });
        }

        // Source elements
        media.querySelectorAll('source').forEach(source => {
          if (source.src) {
            assets.push({
              url: resolveUrl(source.src),
              type: media.tagName.toLowerCase() === 'video' ? 'video' : 'audio',
              source: 'source_tag',
              critical: false,
              element: 'source'
            });
          }
        });
      });

      // 7. Favicon and icons
      document.querySelectorAll('link[rel*="icon"]').forEach(link => {
        if (link.href) {
          assets.push({
            url: resolveUrl(link.href),
            type: 'image',
            source: 'favicon',
            critical: true,
            element: 'link'
          });
        }
      });

      // 8. Web App Manifest
      const manifest = document.querySelector('link[rel="manifest"]');
      if (manifest && manifest.href) {
        assets.push({
          url: resolveUrl(manifest.href),
          type: 'manifest',
          source: 'manifest_link',
          critical: false,
          element: 'link'
        });
      }

      // 9. 3D Models and special assets
      document.querySelectorAll('[src*=".glb"], [src*=".gltf"], [href*=".glb"], [href*=".gltf"]').forEach(element => {
        const url = element.src || element.href;
        if (url) {
          assets.push({
            url: resolveUrl(url),
            type: '3d-model',
            source: '3d_model_reference',
            critical: false,
            element: element.tagName.toLowerCase()
          });
        }
      });

      return assets;
    });
  }

  // Trigger dynamic content and lazy loading
  async triggerDynamicContent() {
    try {
      // Scroll to trigger lazy loading
      await this.page.evaluate(() => {
        return new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              window.scrollTo(0, 0); // Reset scroll
              resolve();
            }
          }, 100);
        });
      });

      // Wait for any triggered content
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Click interactive elements that might load content
      await this.page.evaluate(() => {
        // Click buttons that might load content
        document.querySelectorAll('button, [role="button"]').forEach(btn => {
          const text = btn.textContent.toLowerCase();
          if (text.includes('load') || text.includes('show') || text.includes('more')) {
            try { btn.click(); } catch (e) {}
          }
        });

        // Hover over elements that might trigger asset loading
        document.querySelectorAll('[data-src], [data-lazy]').forEach(element => {
          try {
            element.dispatchEvent(new Event('mouseenter'));
            element.dispatchEvent(new Event('focus'));
          } catch (e) {}
        });
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      logger.debug('Error triggering dynamic content', {
        component: 'PayloadAnalyzer',
        error: error.message
      });
    }
  }

  // Analyze dependencies recursively
  async analyzeDependencies(initialAssets) {
    const dependencyAssets = [];
    const cssAssets = initialAssets.filter(asset => asset.type === 'stylesheet');
    
    logger.info('Analyzing asset dependencies', {
      component: 'PayloadAnalyzer',
      cssFilesToAnalyze: cssAssets.length,
      analysisDepth: this.analysisDepth
    });

    // Analyze CSS files for dependencies
    for (const cssAsset of cssAssets) {
      try {
        const cssContent = await this.fetchAssetContent(cssAsset.url);
        if (cssContent) {
          const cssDependencies = this.extractCssDependencies(cssContent, cssAsset.url);
          cssDependencies.forEach(dep => {
            if (!this.discoveredAssets.has(dep.url)) {
              this.discoveredAssets.set(dep.url, dep);
              dependencyAssets.push(dep);
            }
          });
        }
      } catch (error) {
        logger.debug('Failed to analyze CSS dependencies', {
          component: 'PayloadAnalyzer',
          cssUrl: cssAsset.url,
          error: error.message
        });
      }
    }

    logger.info('Dependency analysis completed', {
      component: 'PayloadAnalyzer',
      dependenciesFound: dependencyAssets.length
    });

    return dependencyAssets;
  }

  // Fetch asset content for analysis
  async fetchAssetContent(url) {
    try {
      const response = await fetch(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.ok) {
        return await response.text();
      }
    } catch (error) {
      logger.debug('Failed to fetch asset content', {
        component: 'PayloadAnalyzer',
        url,
        error: error.message
      });
    }
    return null;
  }

  // Extract dependencies from CSS content
  extractCssDependencies(cssContent, baseUrl) {
    const dependencies = [];
    const base = new URL(baseUrl);

    // @import statements
    const imports = cssContent.match(/@import\s+(?:url\()?['"]?([^'")]+)['"]?(?:\))?[^;]*;/g);
    if (imports) {
      imports.forEach(imp => {
        const urlMatch = imp.match(/@import\s+(?:url\()?['"]?([^'")]+)['"]?/);
        if (urlMatch && urlMatch[1]) {
          dependencies.push({
            url: new URL(urlMatch[1], base).href,
            type: 'stylesheet',
            source: 'css_import_dependency',
            critical: true,
            parent: baseUrl
          });
        }
      });
    }

    // url() references
    const urls = cssContent.match(/url\(['"]?([^'")]+)['"]?\)/g);
    if (urls) {
      urls.forEach(url => {
        const urlMatch = url.match(/url\(['"]?([^'")]+)['"]?\)/);
        if (urlMatch && urlMatch[1]) {
          const assetUrl = new URL(urlMatch[1], base).href;
          const type = this.determineAssetType(assetUrl);
          dependencies.push({
            url: assetUrl,
            type,
            source: 'css_url_dependency',
            critical: type === 'font',
            parent: baseUrl
          });
        }
      });
    }

    return dependencies;
  }

  // Determine asset type from URL
  determineAssetType(url) {
    const urlLower = url.toLowerCase();
    
    if (urlLower.match(/\.(woff|woff2|ttf|otf|eot)$/)) return 'font';
    if (urlLower.match(/\.(css)$/)) return 'stylesheet';
    if (urlLower.match(/\.(jpg|jpeg|png|gif|svg|webp|avif)$/)) return 'image';
    if (urlLower.match(/\.(js|mjs)$/)) return 'javascript';
    if (urlLower.match(/\.(mp4|webm|mov|avi)$/)) return 'video';
    if (urlLower.match(/\.(mp3|wav|ogg|flac)$/)) return 'audio';
    if (urlLower.match(/\.(glb|gltf)$/)) return '3d-model';
    
    return 'other';
  }

  // Estimate sizes for all discovered assets
  async estimateAssetSizes() {
    logger.info('Estimating asset sizes', {
      component: 'PayloadAnalyzer',
      totalAssets: this.discoveredAssets.size
    });

    const sizePromises = Array.from(this.discoveredAssets.values()).map(async (asset) => {
      try {
        const response = await fetch(asset.url, {
          method: 'HEAD',
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (response.ok) {
          const contentLength = response.headers.get('content-length');
          const size = contentLength ? parseInt(contentLength) : this.estimateAssetSize(asset);
          this.assetSizes.set(asset.url, size);
          asset.estimatedSize = size;
          return size;
        }
      } catch (error) {
        // Use heuristic estimation if HEAD request fails
        const estimatedSize = this.estimateAssetSize(asset);
        this.assetSizes.set(asset.url, estimatedSize);
        asset.estimatedSize = estimatedSize;
        return estimatedSize;
      }
      return 0;
    });

    const sizes = await Promise.allSettled(sizePromises);
    this.totalEstimatedSize = sizes
      .filter(result => result.status === 'fulfilled')
      .reduce((total, result) => total + result.value, 0);

    logger.info('Asset size estimation completed', {
      component: 'PayloadAnalyzer',
      totalEstimatedSizeMB: (this.totalEstimatedSize / 1024 / 1024).toFixed(2),
      avgAssetSize: Math.round(this.totalEstimatedSize / this.discoveredAssets.size)
    });
  }

  // Heuristic asset size estimation when Content-Length is not available
  estimateAssetSize(asset) {
    const type = asset.type;
    const url = asset.url.toLowerCase();

    // Size estimates in bytes based on asset type and common patterns
    const estimates = {
      'stylesheet': url.includes('bootstrap') || url.includes('framework') ? 200000 : 50000,
      'javascript': url.includes('framework') || url.includes('library') ? 300000 : 100000,
      'image': url.includes('hero') || url.includes('banner') ? 500000 : 150000,
      'font': url.includes('woff2') ? 50000 : 100000,
      'video': 5000000, // 5MB average
      'audio': 3000000, // 3MB average
      '3d-model': url.includes('glb') ? 2000000 : 1000000,
      'other': 50000
    };

    return estimates[type] || estimates['other'];
  }

  // Calculate comprehensive payload metrics
  calculatePayloadMetrics() {
    const assetsByType = {};
    const sizesByType = {};
    let criticalAssets = 0;
    let criticalSize = 0;

    // Categorize assets
    this.discoveredAssets.forEach(asset => {
      const type = asset.type;
      assetsByType[type] = (assetsByType[type] || 0) + 1;
      sizesByType[type] = (sizesByType[type] || 0) + (asset.estimatedSize || 0);

      if (asset.critical) {
        criticalAssets++;
        criticalSize += (asset.estimatedSize || 0);
      }
    });

    // Calculate completeness score
    this.completenessScore = this.calculateCompletenessScore();

    return {
      // Basic metrics
      totalAssets: this.discoveredAssets.size,
      totalEstimatedSize: this.totalEstimatedSize,
      totalEstimatedSizeMB: (this.totalEstimatedSize / 1024 / 1024).toFixed(2),

      // Critical path metrics
      criticalAssets,
      criticalSize,
      criticalSizeMB: (criticalSize / 1024 / 1024).toFixed(2),

      // Asset breakdown
      assetsByType,
      sizesByType,

      // Completeness metrics
      completenessScore: this.completenessScore,
      analysisDepth: this.analysisDepth,

      // Performance indicators
      estimatedDownloadTime: this.estimateDownloadTime(),
      complexityScore: this.calculateComplexityScore(),

      // Asset details for verification
      assetManifest: Array.from(this.discoveredAssets.values()).map(asset => ({
        url: asset.url,
        type: asset.type,
        source: asset.source,
        critical: asset.critical || false,
        estimatedSize: asset.estimatedSize || 0
      }))
    };
  }

  // Calculate completeness score (0-100)
  calculateCompletenessScore() {
    const factors = {
      hasCSS: Array.from(this.discoveredAssets.values()).some(a => a.type === 'stylesheet') ? 25 : 0,
      hasJS: Array.from(this.discoveredAssets.values()).some(a => a.type === 'javascript') ? 20 : 0,
      hasImages: Array.from(this.discoveredAssets.values()).some(a => a.type === 'image') ? 20 : 0,
      hasFonts: Array.from(this.discoveredAssets.values()).some(a => a.type === 'font') ? 15 : 0,
      depthAnalysis: Math.min(this.analysisDepth * 5, 20) // Max 20 points for depth
    };

    return Object.values(factors).reduce((sum, score) => sum + score, 0);
  }

  // Estimate download time based on asset sizes and typical connection speeds
  estimateDownloadTime() {
    const avgConnectionSpeed = 5 * 1024 * 1024; // 5 Mbps in bytes per second
    const estimatedSeconds = this.totalEstimatedSize / avgConnectionSpeed;
    
    return {
      seconds: Math.round(estimatedSeconds),
      formatted: this.formatDuration(estimatedSeconds)
    };
  }

  // Calculate complexity score based on asset types and dependencies
  calculateComplexityScore() {
    const weights = {
      'stylesheet': 3,
      'javascript': 4,
      '3d-model': 10,
      'video': 8,
      'font': 2,
      'image': 1,
      'audio': 5,
      'other': 1
    };

    let complexityScore = 0;
    this.discoveredAssets.forEach(asset => {
      complexityScore += weights[asset.type] || 1;
    });

    return Math.min(complexityScore, 100); // Cap at 100
  }

  // Format duration in human-readable format
  formatDuration(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  }

  async cleanup() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }
    } catch (error) {
      logger.debug('Cleanup error in PayloadAnalyzer', {
        component: 'PayloadAnalyzer',
        error: error.message
      });
    }
  }
}

module.exports = PayloadAnalyzer;