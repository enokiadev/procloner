const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const path = require("path");
const { URL } = require("url");
const fetch = require("node-fetch");
const mime = require("mime-types");
const { logger } = require('../utils/logger');
const { config } = require('../config');
const HtmlProcessor = require('../utils/HtmlProcessor');
const RetryManager = require('../utils/RetryManager');
const AdvancedUrlResolver = require('../utils/AdvancedUrlResolver');
const CacheManager = require('../utils/CacheManager');

class SmartCrawler {
  constructor(options = {}) {
    this.outputDir = options.outputDir;
    this.onProgress = options.onProgress || (() => {});
    this.onAssetFound = options.onAssetFound || (() => {});
    this.visitedUrls = new Set();
    this.discoveredAssets = new Map();
    this.savedPages = new Map(); // Store page URL -> file path mapping
    this.browser = null;
    this.page = null;
    this.timeout = options.timeout || 120000; // Default 2 minute timeout
    this.lastProgressUpdate = Date.now();
    this.detectedBuildTool = null;
    this.pathMappings = new Map(); // Store detected path mappings
    
    // HTTrack-style enhancements
    this.retryManager = new RetryManager({
      maxRetries: options.maxRetries || 3,
      baseDelay: options.baseDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      enableRateLimit: options.enableRateLimit !== false,
      requestsPerSecond: options.requestsPerSecond || 8,
      concurrentRequests: options.concurrentRequests || 5
    });
    
    this.urlResolver = new AdvancedUrlResolver({
      normalizeCase: true,
      preserveQuery: true,
      preserveFragment: false
    });
    
    this.cacheManager = new CacheManager({
      cacheDir: path.join(this.outputDir, '.cache'),
      maxCacheSize: options.maxCacheSize || 512 * 1024 * 1024, // 512MB
      enableCompression: true,
      enableIntegrityCheck: true
    });
    
    // Enhanced error tracking
    this.errorLog = [];
    this.sessionStats = {
      startTime: Date.now(),
      pagesProcessed: 0,
      assetsDownloaded: 0,
      bytesDownloaded: 0,
      errors: 0,
      retries: 0
    };
  }

  async crawl(url, options = {}) {
    try {
      logger.info('Starting smart crawl', { url, component: 'SmartCrawler' });

      // Launch browser with resource limits
      this.browser = await puppeteer.launch({
        headless: config.browser.headless ? "new" : false,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--max-old-space-size=2048", // Limit memory usage
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--disable-backgrounding-occluded-windows"
        ],
        timeout: config.browser.timeout
      });

      this.page = await this.browser.newPage();

      // Set up network monitoring
      await this.setupNetworkMonitoring();

      // Set viewport for consistent rendering and resource limits
      await this.page.setViewport({ width: 1920, height: 1080 });
      
      // Set page timeout
      await this.page.setDefaultTimeout(config.browser.timeout);
      
      // Block unnecessary resource types to save bandwidth
      await this.page.setRequestInterception(true);

      // Navigate to the main page
      await this.crawlPage(url, options);

      // Detect build tool and common path patterns
      await this.detectBuildToolAndPaths(url);

      // Discover additional pages if SPA
      await this.discoverSPARoutes(url);

      // Process all discovered assets
      const downloadResult = await this.downloadAssets();

      // Recursive asset discovery - find assets that were missed
      const additionalAssets = await this.performRecursiveDiscovery();
      
      // Download any newly discovered assets
      if (additionalAssets.length > 0) {
        logger.info('Downloading additional discovered assets', {
          component: 'SmartCrawler',
          additionalAssets: additionalAssets.length
        });
        
        const additionalDownloadResult = await this.downloadAssets();
        downloadResult.downloaded += additionalDownloadResult.downloaded;
        downloadResult.failed += additionalDownloadResult.failed;
        downloadResult.total += additionalDownloadResult.total;
      }

      // Process HTML files to rewrite asset URLs after downloads are complete
      await this.processHtmlFiles();

      logger.info('Crawl completed successfully', {
        component: 'SmartCrawler',
        assetsFound: this.discoveredAssets.size,
        pagesVisited: this.visitedUrls.size,
        downloaded: downloadResult.downloaded,
        failed: downloadResult.failed,
        total: downloadResult.total
      });

      return {
        success: true,
        assetsFound: this.discoveredAssets.size,
        pagesVisited: this.visitedUrls.size,
        downloadStats: downloadResult,
      };
    } catch (error) {
      logger.error('Crawling failed', {
        component: 'SmartCrawler',
        error: error.message,
        stack: error.stack,
        url,
        assetsFound: this.discoveredAssets.size,
        pagesVisited: this.visitedUrls.size
      });
      return {
        success: false,
        error: error.message,
        assetsFound: this.discoveredAssets.size,
        pagesVisited: this.visitedUrls.size,
      };
    } finally {
      await this.cleanup();
    }
  }

  async setupNetworkMonitoring() {
    // Request interception was already enabled in crawl method
    
    this.page.on("request", (request) => {
      const resourceType = request.resourceType();
      const url = request.url();
      
      // Block tracking and analytics
      if (this.isTrackingUrl(url)) {
        request.abort();
        return;
      }
      
      // Block unnecessary large media only if explicitly requested
      if (resourceType === 'media' && this.shouldBlockMedia(url)) {
        request.abort();
        return;
      }
      
      // Allow all other requests to proceed, including all images
      request.continue();
    });

    // Monitor all network responses
    this.page.on("response", async (response) => {
      try {
        const url = response.url();
        const status = response.status();

        if (status >= 200 && status < 300) {
          await this.analyzeResponse(response);
        }
      } catch (error) {
        logger.debug('Error analyzing response', {
          component: 'SmartCrawler',
          error: error.message,
          url: response.url()
        });
      }
    });
  }

  async analyzeResponse(response) {
    const url = response.url();
    const contentType = response.headers()["content-type"] || "";

    // Skip if already discovered
    if (this.discoveredAssets.has(url)) {
      return;
    }

    const asset = {
      url,
      type: this.determineAssetType(url, contentType),
      contentType,
      size: parseInt(response.headers()["content-length"]) || 0,
      discoveredAt: new Date(),
    };

    // Filter important assets
    if (this.isImportantAsset(asset)) {
      this.discoveredAssets.set(url, asset);
      this.onAssetFound(asset);
      logger.debug('Asset discovered', {
        component: 'SmartCrawler',
        assetType: asset.type,
        url,
        size: asset.size
      });
    }
  }

  determineAssetType(url, contentType) {
    const urlLower = url.toLowerCase();

    // 3D Assets
    if (urlLower.includes(".glb") || urlLower.includes(".gltf"))
      return "3d-model";
    if (urlLower.includes(".exr") || urlLower.includes("envmap"))
      return "environment-map";

    // Media
    if (
      contentType.startsWith("video/") ||
      urlLower.match(/\.(mp4|webm|mov|avi)$/)
    )
      return "video";
    if (contentType.startsWith("audio/") || urlLower.match(/\.(mp3|wav|ogg)$/))
      return "audio";
    if (
      contentType.startsWith("image/") ||
      urlLower.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)
    )
      return "image";

    // Web Assets
    if (contentType.includes("javascript") || urlLower.endsWith(".js"))
      return "javascript";
    if (contentType.includes("css") || urlLower.endsWith(".css"))
      return "stylesheet";
    if (contentType.includes("html") || urlLower.endsWith(".html"))
      return "html";

    // Fonts
    if (urlLower.match(/\.(woff|woff2|ttf|otf|eot)$/)) return "font";

    // Textures (common patterns)
    if (
      urlLower.includes("texture") ||
      urlLower.includes("normal") ||
      urlLower.includes("diffuse") ||
      urlLower.includes("specular")
    )
      return "texture";

    return "other";
  }

  isImportantAsset(asset) {
    const importantTypes = [
      "3d-model",
      "environment-map",
      "texture",
      "video",
      "audio",
      "javascript",
      "stylesheet",
      "html",
      "font",
      "image",
    ];

    return importantTypes.includes(asset.type);
  }

  isImportantImage(url) {
    // Allow all images to be downloaded - let the user decide what's important
    // Only block tracking pixels and known analytics images
    const urlLower = url.toLowerCase();
    
    // Block known tracking/analytics images
    if (urlLower.includes('google-analytics') ||
        urlLower.includes('facebook.com/tr') ||
        urlLower.includes('pixel') ||
        urlLower.includes('beacon') ||
        urlLower.includes('analytics')) {
      return false;
    }
    
    // Allow all other images
    return true;
  }

  shouldBlockMedia(url) {
    // Only block very large video files to save bandwidth
    // This can be configured based on user preferences
    return false; // For now, allow all media
  }

  isImportantFont(url) {
    const urlLower = url.toLowerCase();
    // Keep custom fonts but block common system fonts
    return !urlLower.includes('google') && 
           !urlLower.includes('fonts.gstatic') &&
           urlLower.match(/\.(woff|woff2|ttf|otf)$/);
  }

  isTrackingUrl(url) {
    const urlLower = url.toLowerCase();
    const trackingDomains = [
      'google-analytics.com',
      'googletagmanager.com',
      'facebook.com',
      'twitter.com',
      'linkedin.com',
      'mixpanel.com',
      'amplitude.com',
      'segment.com',
      'hotjar.com'
    ];
    
    return trackingDomains.some(domain => urlLower.includes(domain));
  }

  async crawlPage(url, options) {
    try {
      if (this.visitedUrls.has(url)) {
        return;
      }

      this.visitedUrls.add(url);
      logger.debug('Crawling page', { component: 'SmartCrawler', url });

      // Navigate to page with timeout
      await Promise.race([
        this.page.goto(url, {
          waitUntil: "networkidle0",
          timeout: 30000,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Page load timeout")), 35000)
        ),
      ]);

      // Wait for dynamic content to load (reduced time)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Wait for SPA frameworks to render content
      await this.waitForSPAContent();

      // Execute JavaScript to trigger lazy loading
      await this.triggerDynamicContent();

      // Extract additional CSS from the page
      await this.extractPageAssets();

      // Save page HTML
      await this.savePageHTML(url);

      // Update progress
      this.onProgress(Math.min(50, (this.visitedUrls.size / 10) * 50));
    } catch (error) {
      logger.warn('Page crawl failed, continuing', {
        component: 'SmartCrawler',
        url,
        error: error.message
      });
      // Don't throw, just log and continue
    }
  }

  async waitForSPAContent() {
    try {
      // Wait for Vue.js apps to render
      await this.page.waitForFunction(() => {
        // Check if content has been rendered (no longer just empty div)
        const appEl = document.querySelector('#app, [data-app], .vue-app, .app');
        if (appEl && appEl.children.length > 0) {
          return true;
        }
        
        // Check for images in the DOM
        const images = document.querySelectorAll('img');
        if (images.length > 0) {
          return true;
        }
        
        // Check for main content sections
        const contentSelectors = ['main', '.main', '.content', '.container', 'section', 'article'];
        for (const selector of contentSelectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent.trim().length > 100) {
            return true;
          }
        }
        
        return false;
      }, { timeout: 10000 });
      
      // Additional wait for assets to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      logger.debug('SPA content rendered', { component: 'SmartCrawler' });
    } catch (error) {
      logger.debug('SPA content wait timeout', { 
        component: 'SmartCrawler',
        error: error.message 
      });
      // Continue anyway - might not be an SPA
    }
  }

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
              resolve();
            }
          }, 100);
        });
      });

      // Wait for any new content to load
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Look for common 3D frameworks and trigger initialization
      await this.page.evaluate(() => {
        // Trigger Three.js scenes
        if (window.THREE) {
          // Three.js detected - will be logged by caller
        }

        // Trigger any canvas elements
        const canvases = document.querySelectorAll("canvas");
        canvases.forEach((canvas) => {
          canvas.click();
        });

        // Trigger common loading patterns
        const buttons = document.querySelectorAll('button, [role="button"]');
        buttons.forEach((btn) => {
          if (
            btn.textContent.toLowerCase().includes("load") ||
            btn.textContent.toLowerCase().includes("start")
          ) {
            btn.click();
          }
        });
      });

      // Wait for triggered content
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      logger.debug('Error triggering dynamic content', {
        component: 'SmartCrawler',
        error: error.message
      });
    }
  }

  async discoverSPARoutes(baseUrl) {
    try {
      // Look for common SPA routing patterns
      const routes = await this.page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a[href]"));
        return links
          .map((link) => link.href)
          .filter((href) => href.startsWith(window.location.origin))
          .filter((href) => !href.includes("#"))
          .slice(0, 5); // Limit to prevent infinite crawling
      });

      // Crawl discovered routes
      for (const route of routes) {
        if (!this.visitedUrls.has(route)) {
          await this.crawlPage(route);
        }
      }
    } catch (error) {
      logger.debug('Error discovering SPA routes', {
        component: 'SmartCrawler',
        error: error.message
      });
    }
  }

  // Extract additional assets from the page DOM
  async extractPageAssets() {
    try {
      const extractedAssets = await this.page.evaluate(() => {
        const assets = [];
        
        // Extract CSS links that might have been missed
        const cssLinks = document.querySelectorAll('link[rel="stylesheet"], link[type="text/css"]');
        cssLinks.forEach(link => {
          if (link.href) {
            assets.push({
              url: link.href,
              type: 'stylesheet',
              source: 'link_tag'
            });
          }
        });

        // Extract inline CSS and find url() references and @import statements
        const styleTags = document.querySelectorAll('style');
        styleTags.forEach(styleTag => {
          const css = styleTag.textContent;
          if (css) {
            // Find @import statements
            const importMatches = css.match(/@import\s+(?:url\()?['"]?([^'")]+)['"]?(?:\))?[^;]*;/g);
            if (importMatches) {
              importMatches.forEach(match => {
                const urlMatch = match.match(/@import\s+(?:url\()?['"]?([^'")]+)['"]?(?:\))?/);
                if (urlMatch && urlMatch[1]) {
                  let assetUrl = urlMatch[1];
                  
                  // Resolve relative URLs
                  if (!assetUrl.startsWith('http') && !assetUrl.startsWith('//')) {
                    if (assetUrl.startsWith('/')) {
                      assetUrl = window.location.origin + assetUrl;
                    } else {
                      assetUrl = new URL(assetUrl, window.location.href).href;
                    }
                  } else if (assetUrl.startsWith('//')) {
                    assetUrl = window.location.protocol + assetUrl;
                  }
                  
                  assets.push({
                    url: assetUrl,
                    type: 'stylesheet',
                    source: 'css_import'
                  });
                }
              });
            }

            // Find url() references in CSS
            const urlMatches = css.match(/url\(['"]?([^'")]+)['"]?\)/g);
            if (urlMatches) {
              urlMatches.forEach(match => {
                const urlMatch = match.match(/url\(['"]?([^'")]+)['"]?\)/);
                if (urlMatch && urlMatch[1]) {
                  let assetUrl = urlMatch[1];
                  
                  // Resolve relative URLs
                  if (!assetUrl.startsWith('http') && !assetUrl.startsWith('//')) {
                    if (assetUrl.startsWith('/')) {
                      assetUrl = window.location.origin + assetUrl;
                    } else {
                      assetUrl = new URL(assetUrl, window.location.href).href;
                    }
                  } else if (assetUrl.startsWith('//')) {
                    assetUrl = window.location.protocol + assetUrl;
                  }
                  
                  assets.push({
                    url: assetUrl,
                    type: 'image', // Could be font, image, etc.
                    source: 'inline_css'
                  });
                }
              });
            }
          }
        });

        // Extract style attributes from elements
        const elementsWithStyle = document.querySelectorAll('[style]');
        elementsWithStyle.forEach(element => {
          const style = element.getAttribute('style');
          if (style) {
            const urlMatches = style.match(/url\(['"]?([^'")]+)['"]?\)/g);
            if (urlMatches) {
              urlMatches.forEach(match => {
                const urlMatch = match.match(/url\(['"]?([^'")]+)['"]?\)/);
                if (urlMatch && urlMatch[1]) {
                  let assetUrl = urlMatch[1];
                  
                  // Resolve relative URLs
                  if (!assetUrl.startsWith('http') && !assetUrl.startsWith('//')) {
                    if (assetUrl.startsWith('/')) {
                      assetUrl = window.location.origin + assetUrl;
                    } else {
                      assetUrl = new URL(assetUrl, window.location.href).href;
                    }
                  } else if (assetUrl.startsWith('//')) {
                    assetUrl = window.location.protocol + assetUrl;
                  }
                  
                  assets.push({
                    url: assetUrl,
                    type: 'image',
                    source: 'inline_style'
                  });
                }
              });
            }
          }
        });

        // Extract additional image sources
        const images = document.querySelectorAll('img[src], img[data-src], img[data-lazy-src]');
        images.forEach(img => {
          const src = img.src || img.dataset.src || img.dataset.lazySrc;
          if (src) {
            assets.push({
              url: src,
              type: 'image',
              source: 'img_tag'
            });
          }
        });

        return assets;
      });

      // Process extracted assets
      for (const extractedAsset of extractedAssets) {
        if (!this.discoveredAssets.has(extractedAsset.url)) {
          const asset = {
            url: extractedAsset.url,
            type: this.determineAssetType(extractedAsset.url, ''),
            contentType: '',
            size: 0,
            discoveredAt: new Date(),
            source: extractedAsset.source
          };

          if (this.isImportantAsset(asset)) {
            this.discoveredAssets.set(extractedAsset.url, asset);
            this.onAssetFound(asset);
            logger.debug('Asset extracted from DOM', {
              component: 'SmartCrawler',
              assetType: asset.type,
              url: extractedAsset.url,
              source: extractedAsset.source
            });
          }
        }
      }

      logger.debug('Page asset extraction completed', {
        component: 'SmartCrawler',
        extractedAssets: extractedAssets.length,
        newAssets: extractedAssets.filter(a => !this.discoveredAssets.has(a.url)).length
      });
    } catch (error) {
      logger.debug('Error extracting page assets', {
        component: 'SmartCrawler',
        error: error.message
      });
    }
  }

  async savePageHTML(url) {
    try {
      const html = await this.page.content();
      const urlObj = new URL(url);
      const filename =
        urlObj.pathname === "/"
          ? "index.html"
          : urlObj.pathname.replace(/\//g, "_") + ".html";

      const filePath = path.join(this.outputDir, filename);
      await fs.writeFile(filePath, html);

      // Store the mapping for later HTML processing
      this.savedPages.set(url, filePath);

      logger.debug('Saved page HTML', {
        component: 'SmartCrawler',
        filename,
        url
      });
    } catch (error) {
      logger.warn('Failed to save page HTML', {
        component: 'SmartCrawler',
        url,
        error: error.message
      });
    }
  }

  async downloadAssets() {
    logger.info('Starting asset downloads', {
      component: 'SmartCrawler',
      totalAssets: this.discoveredAssets.size
    });

    let downloaded = 0;
    let failed = 0;
    const total = this.discoveredAssets.size;
    const startTime = Date.now();

    // Process assets in batches to avoid overwhelming the server
    const batchSize = 5;
    const assetArray = Array.from(this.discoveredAssets.entries());

    for (let i = 0; i < assetArray.length; i += batchSize) {
      const batch = assetArray.slice(i, i + batchSize);

      // Process batch concurrently
      const promises = batch.map(async ([url, asset]) => {
        try {
          await this.downloadAsset(asset);
          downloaded++;
          return { success: true, url };
        } catch (error) {
          failed++;
          logger.debug('Asset download failed', {
            component: 'SmartCrawler',
            url,
            error: error.message
          });
          return { success: false, url, error: error.message };
        }
      });

      await Promise.allSettled(promises);

      // Update progress (50-100%)
      const progress = 50 + ((downloaded + failed) / total) * 50;
      this.onProgress(progress);

      // Log batch completion
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const batchNum = Math.floor(i / batchSize) + 1;
      logger.debug('Download batch completed', {
        component: 'SmartCrawler',
        batchNumber: batchNum,
        downloaded,
        failed,
        elapsedSeconds: elapsed
      });

      // Small delay between batches to be respectful
      if (i + batchSize < assetArray.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    logger.info('Asset downloads completed', {
      component: 'SmartCrawler',
      downloaded,
      failed,
      total,
      successRate: `${((downloaded / total) * 100).toFixed(1)}%`
    });
    return { downloaded, failed, total };
  }

  async downloadAsset(asset) {
    return this.retryManager.executeWithRetry(
      async () => this._downloadAssetWithCache(asset),
      { 
        url: asset.url, 
        operation: 'asset_download',
        asset: asset
      }
    );
  }

  async _downloadAssetWithCache(asset) {
    try {
      logger.debug('Downloading asset with enhanced retry and caching', {
        component: 'SmartCrawler',
        url: asset.url,
        type: asset.type
      });

      // Check cache first
      const cachedAsset = await this.cacheManager.get(asset.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });

      let buffer, contentType, headers;
      
      if (cachedAsset) {
        logger.debug('Using cached asset', {
          component: 'SmartCrawler',
          url: asset.url,
          cacheHit: true
        });
        
        buffer = cachedAsset.data;
        headers = cachedAsset.headers;
        contentType = headers['content-type'] || '';
      } else {
        // Download with enhanced error handling
        const response = await this._fetchWithEnhancedTimeout(asset.url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        buffer = await response.buffer();
        contentType = response.headers.get("content-type") || "";
        headers = Object.fromEntries(response.headers.entries());

        // Cache the asset for future use
        await this.cacheManager.set(asset.url, buffer, {
          type: asset.type,
          contentType: contentType,
          size: buffer.length,
          timestamp: Date.now()
        }, {
          headers: headers,
          ttl: 24 * 60 * 60 * 1000 // 24 hours
        });
      }

      // Enhanced filename generation
      const filename = this._generateIntelligentFilename(asset, contentType, headers);
      
      // Use intelligent path mapping based on detected build tool
      const targetPath = this.getIntelligentAssetPath(asset, filename);
      const assetDir = path.dirname(targetPath);
      await fs.ensureDir(assetDir);

      // Handle duplicate filenames with better strategy
      const filePath = await this._resolveUniqueFilePath(targetPath, filename);

      await fs.writeFile(filePath, buffer);

      // Enhanced asset metadata
      asset.localPath = filePath;
      asset.downloaded = true;
      asset.downloadedAt = new Date();
      asset.size = buffer.length;
      asset.contentType = contentType;
      asset.checksum = require('crypto').createHash('md5').update(buffer).digest('hex');

      // Update session statistics
      this.sessionStats.assetsDownloaded++;
      this.sessionStats.bytesDownloaded += buffer.length;

      logger.debug('Asset downloaded successfully', {
        component: 'SmartCrawler',
        filename,
        targetPath: path.relative(this.outputDir, filePath),
        bytes: buffer.length,
        url: asset.url,
        cached: !!cachedAsset
      });

      return asset;
    } catch (error) {
      // Enhanced error logging and tracking
      this.sessionStats.errors++;
      this.errorLog.push({
        url: asset.url,
        error: error.message,
        timestamp: Date.now(),
        type: 'asset_download'
      });

      logger.warn('Asset download failed after retries', {
        component: 'SmartCrawler',
        url: asset.url,
        error: error.message,
        stack: error.stack
      });

      asset.error = error.message;
      asset.downloaded = false;
      
      throw error; // Re-throw for retry manager
    }
  }

  async _fetchWithEnhancedTimeout(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept": "*/*",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        },
        timeout: 30000
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  _generateIntelligentFilename(asset, contentType, headers) {
    const urlObj = new URL(asset.url);
    let filename = path.basename(urlObj.pathname) || "asset";

    // Handle query parameters in filename
    if (filename.includes("?")) {
      filename = filename.split("?")[0];
    }

    // Enhanced content type detection
    if (!path.extname(filename)) {
      const extension = this._getExtensionFromContentType(contentType) ||
                       this._getExtensionFromUrl(asset.url) ||
                       this._getExtensionFromAssetType(asset.type);
      
      if (extension) {
        filename += extension;
      }
    }

    // Sanitize filename for filesystem compatibility
    filename = filename.replace(/[<>:"|?*]/g, '_');
    filename = filename.replace(/\.\./g, '_');

    return filename;
  }

  _getExtensionFromContentType(contentType) {
    const mimeToExt = {
      'text/javascript': '.js',
      'application/javascript': '.js',
      'application/x-javascript': '.js',
      'text/css': '.css',
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/gif': '.gif',
      'font/woff': '.woff',
      'font/woff2': '.woff2',
      'font/ttf': '.ttf',
      'font/otf': '.otf',
      'application/json': '.json',
      'text/html': '.html',
      'text/xml': '.xml',
      'application/xml': '.xml'
    };

    return mimeToExt[contentType.toLowerCase().split(';')[0]];
  }

  _getExtensionFromUrl(url) {
    const patterns = [
      [/\.js(\?|$)/, '.js'],
      [/\.css(\?|$)/, '.css'],
      [/\.png(\?|$)/, '.png'],
      [/\.jpe?g(\?|$)/, '.jpg'],
      [/\.webp(\?|$)/, '.webp'],
      [/\.svg(\?|$)/, '.svg'],
      [/\.gif(\?|$)/, '.gif'],
      [/\.woff2?(\?|$)/, '.woff'],
      [/\.ttf(\?|$)/, '.ttf'],
      [/\.otf(\?|$)/, '.otf']
    ];

    for (const [pattern, ext] of patterns) {
      if (pattern.test(url)) {
        return ext;
      }
    }

    return null;
  }

  _getExtensionFromAssetType(assetType) {
    const typeToExt = {
      'javascript': '.js',
      'stylesheet': '.css',
      'image': '.png',
      'font': '.woff',
      '3d-model': '.glb',
      'audio': '.mp3',
      'video': '.mp4'
    };

    return typeToExt[assetType] || '.bin';
  }

  async _resolveUniqueFilePath(targetPath, filename) {
    let filePath = targetPath;
    let counter = 1;
    
    while (await fs.pathExists(filePath)) {
      const ext = path.extname(filename);
      const name = path.basename(filename, ext);
      const newFilename = `${name}_${counter}${ext}`;
      filePath = path.join(path.dirname(targetPath), newFilename);
      counter++;
      
      // Prevent infinite loops
      if (counter > 1000) {
        const timestamp = Date.now();
        const newFilename = `${name}_${timestamp}${ext}`;
        filePath = path.join(path.dirname(targetPath), newFilename);
        break;
      }
    }
    
    return filePath;
  }

  // Get intelligent asset path based on detected build tool and path mapping strategy
  getIntelligentAssetPath(asset, filename) {
    const urlObj = new URL(asset.url);
    const originalPath = urlObj.pathname;
    
    if (!this.detectedBuildTool || this.detectedBuildTool.confidence < 0.8) {
      // Fall back to original structure if we're not confident about build tool
      return path.join(this.outputDir, "assets", asset.type, filename);
    }

    const buildTool = this.detectedBuildTool.tool;
    let targetSubPath;

    switch (buildTool) {
      case 'vue-cli':
        targetSubPath = this.getVueCliAssetPath(asset.type, filename, originalPath);
        break;
      
      case 'create-react-app':
        targetSubPath = this.getCRAAssetPath(asset.type, filename, originalPath);
        break;
      
      case 'vite':
        targetSubPath = this.getViteAssetPath(asset.type, filename, originalPath);
        break;
      
      case 'webpack':
        targetSubPath = this.getWebpackAssetPath(asset.type, filename, originalPath);
        break;
      
      case 'angular-cli':
        targetSubPath = this.getAngularAssetPath(asset.type, filename, originalPath);
        break;
      
      default:
        targetSubPath = `assets/${asset.type}/${filename}`;
    }

    return path.join(this.outputDir, targetSubPath);
  }

  // Vue CLI asset path strategy
  getVueCliAssetPath(assetType, filename, originalPath) {
    switch (assetType) {
      case 'image':
        return `img/${filename}`;
      case 'stylesheet':
        return `css/${filename}`;
      case 'javascript':
        return `js/${filename}`;
      case 'font':
        return `fonts/${filename}`;
      case 'video':
      case 'audio':
        return `media/${filename}`;
      default:
        return `assets/${assetType}/${filename}`;
    }
  }

  // Create React App asset path strategy
  getCRAAssetPath(assetType, filename, originalPath) {
    // Preserve static/ structure for CRA
    if (originalPath.startsWith('/static/')) {
      return originalPath.substring(1); // Remove leading slash
    }
    
    switch (assetType) {
      case 'javascript':
        return `static/js/${filename}`;
      case 'stylesheet':
        return `static/css/${filename}`;
      case 'image':
      case 'font':
      case 'video':
      case 'audio':
        return `static/media/${filename}`;
      default:
        return `static/${assetType}/${filename}`;
    }
  }

  // Vite asset path strategy
  getViteAssetPath(assetType, filename, originalPath) {
    switch (assetType) {
      case 'image':
        return `img/${filename}`;
      case 'stylesheet':
        return `css/${filename}`;
      case 'javascript':
        return `js/${filename}`;
      case 'font':
        return `fonts/${filename}`;
      default:
        return `assets/${filename}`;
    }
  }

  // Webpack asset path strategy
  getWebpackAssetPath(assetType, filename, originalPath) {
    switch (assetType) {
      case 'image':
        return `images/${filename}`;
      case 'stylesheet':
        return `css/${filename}`;
      case 'javascript':
        return `js/${filename}`;
      case 'font':
        return `fonts/${filename}`;
      default:
        return `dist/${assetType}/${filename}`;
    }
  }

  // Angular CLI asset path strategy
  getAngularAssetPath(assetType, filename, originalPath) {
    if (originalPath.startsWith('/assets/')) {
      return originalPath.substring(1); // Remove leading slash, keep assets/ structure
    }
    
    return `assets/${filename}`;
  }

  // Perform recursive asset discovery to find missed dependencies
  async performRecursiveDiscovery() {
    logger.info('Starting recursive asset discovery', {
      component: 'SmartCrawler',
      currentAssets: this.discoveredAssets.size
    });

    const initialAssetCount = this.discoveredAssets.size;
    const maxRecursions = 3; // Limit recursion depth
    let currentRecursion = 0;
    let newAssetsFound = 0;

    while (currentRecursion < maxRecursions) {
      const beforeCount = this.discoveredAssets.size;
      
      // Discover assets from downloaded CSS files
      await this.discoverAssetsFromCssFiles();
      
      // Discover assets from downloaded JavaScript files
      await this.discoverAssetsFromJsFiles();
      
      // Discover assets from HTML content
      await this.discoverAssetsFromHtmlFiles();

      const afterCount = this.discoveredAssets.size;
      const foundInThisIteration = afterCount - beforeCount;
      newAssetsFound += foundInThisIteration;

      logger.debug('Recursive discovery iteration completed', {
        component: 'SmartCrawler',
        iteration: currentRecursion + 1,
        assetsFoundThisIteration: foundInThisIteration,
        totalAssets: afterCount
      });

      // If no new assets found, we're done
      if (foundInThisIteration === 0) {
        break;
      }

      currentRecursion++;
    }

    logger.info('Recursive asset discovery completed', {
      component: 'SmartCrawler',
      totalRecursions: currentRecursion,
      initialAssets: initialAssetCount,
      finalAssets: this.discoveredAssets.size,
      newAssetsDiscovered: newAssetsFound
    });

    return newAssetsFound;
  }

  // Discover additional assets from downloaded CSS files
  async discoverAssetsFromCssFiles() {
    const cssAssets = Array.from(this.discoveredAssets.values())
      .filter(asset => asset.type === 'stylesheet' && asset.downloaded && asset.localPath);

    for (const cssAsset of cssAssets) {
      try {
        if (await fs.pathExists(cssAsset.localPath)) {
          const cssContent = await fs.readFile(cssAsset.localPath, 'utf8');
          await this.extractAssetsFromCssContent(cssContent, cssAsset.url);
        }
      } catch (error) {
        logger.debug('Error discovering assets from CSS file', {
          component: 'SmartCrawler',
          cssFile: cssAsset.localPath,
          error: error.message
        });
      }
    }
  }

  // Extract assets from CSS content
  async extractAssetsFromCssContent(cssContent, baseUrl) {
    // @import statements
    const imports = cssContent.match(/@import\s+(?:url\()?['"]?([^'")]+)['"]?(?:\))?[^;]*;/g);
    if (imports) {
      imports.forEach(imp => {
        const urlMatch = imp.match(/@import\s+(?:url\()?['"]?([^'")]+)['"]?/);
        if (urlMatch && urlMatch[1]) {
          const assetUrl = this.resolveAssetUrl(urlMatch[1], baseUrl);
          this.addDiscoveredAsset(assetUrl, 'stylesheet', 'css_import_recursive');
        }
      });
    }

    // url() references  
    const urls = cssContent.match(/url\(['"]?([^'")]+)['"]?\)/g);
    if (urls) {
      urls.forEach(url => {
        const urlMatch = url.match(/url\(['"]?([^'")]+)['"]?\)/);
        if (urlMatch && urlMatch[1]) {
          const assetUrl = this.resolveAssetUrl(urlMatch[1], baseUrl);
          const assetType = this.determineAssetType(assetUrl, '');
          this.addDiscoveredAsset(assetUrl, assetType, 'css_url_recursive');
        }
      });
    }
  }

  // Discover assets from downloaded JavaScript files
  async discoverAssetsFromJsFiles() {
    const jsAssets = Array.from(this.discoveredAssets.values())
      .filter(asset => asset.type === 'javascript' && asset.downloaded && asset.localPath);

    for (const jsAsset of jsAssets) {
      try {
        if (await fs.pathExists(jsAsset.localPath)) {
          const jsContent = await fs.readFile(jsAsset.localPath, 'utf8');
          await this.extractAssetsFromJsContent(jsContent, jsAsset.url);
        }
      } catch (error) {
        logger.debug('Error discovering assets from JS file', {
          component: 'SmartCrawler',
          jsFile: jsAsset.localPath,
          error: error.message
        });
      }
    }
  }

  // Extract assets from JavaScript content
  async extractAssetsFromJsContent(jsContent, baseUrl) {
    // Look for asset URLs in string literals
    const patterns = [
      /"([^"]*\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|glb|gltf|mp4|mp3)[^"]*)"/g,
      /'([^']*\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|glb|gltf|mp4|mp3)[^']*)'/g,
      /`([^`]*\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|glb|gltf|mp4|mp3)[^`]*)`/g
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(jsContent)) !== null) {
        const url = match[1];
        if (this.isValidAssetUrl(url)) {
          const assetUrl = this.resolveAssetUrl(url, baseUrl);
          const assetType = this.determineAssetType(assetUrl, '');
          this.addDiscoveredAsset(assetUrl, assetType, 'js_string_recursive');
        }
      }
    });

    // Look for dynamic imports
    const dynamicImports = jsContent.match(/import\(['"`]([^'"`]+)['"`]\)/g);
    if (dynamicImports) {
      dynamicImports.forEach(imp => {
        const urlMatch = imp.match(/import\(['"`]([^'"`]+)['"`]\)/);
        if (urlMatch && urlMatch[1]) {
          const assetUrl = this.resolveAssetUrl(urlMatch[1], baseUrl);
          this.addDiscoveredAsset(assetUrl, 'javascript', 'js_dynamic_import');
        }
      });
    }
  }

  // Discover assets from HTML files
  async discoverAssetsFromHtmlFiles() {
    for (const [pageUrl, filePath] of this.savedPages) {
      try {
        if (await fs.pathExists(filePath)) {
          const htmlContent = await fs.readFile(filePath, 'utf8');
          await this.extractAssetsFromHtmlContent(htmlContent, pageUrl);
        }
      } catch (error) {
        logger.debug('Error discovering assets from HTML file', {
          component: 'SmartCrawler',
          htmlFile: filePath,
          error: error.message
        });
      }
    }
  }

  // Extract additional assets from HTML content
  async extractAssetsFromHtmlContent(htmlContent, baseUrl) {
    // Look for data attributes that might contain asset URLs
    const dataAttrPatterns = [
      /data-src=["']([^"']+)["']/g,
      /data-lazy=["']([^"']+)["']/g,
      /data-original=["']([^"']+)["']/g,
      /data-bg=["']([^"']+)["']/g,
      /data-background=["']([^"']+)["']/g
    ];

    dataAttrPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        const url = match[1];
        if (this.isValidAssetUrl(url)) {
          const assetUrl = this.resolveAssetUrl(url, baseUrl);
          const assetType = this.determineAssetType(assetUrl, '');
          this.addDiscoveredAsset(assetUrl, assetType, 'html_data_attr_recursive');
        }
      }
    });

    // Look for srcset attributes
    const srcsetMatches = htmlContent.match(/srcset=["']([^"']+)["']/g);
    if (srcsetMatches) {
      srcsetMatches.forEach(srcset => {
        const urlMatch = srcset.match(/srcset=["']([^"']+)["']/);
        if (urlMatch && urlMatch[1]) {
          // Parse srcset format: "url1 1x, url2 2x" or "url1 300w, url2 600w"
          const urls = urlMatch[1].split(',');
          urls.forEach(urlEntry => {
            const url = urlEntry.trim().split(' ')[0];
            if (this.isValidAssetUrl(url)) {
              const assetUrl = this.resolveAssetUrl(url, baseUrl);
              this.addDiscoveredAsset(assetUrl, 'image', 'html_srcset_recursive');
            }
          });
        }
      });
    }
  }

  // Enhanced URL resolution using HTTrack-style algorithms
  resolveAssetUrl(url, baseUrl, context = {}) {
    try {
      return this.urlResolver.resolveUrl(baseUrl, baseUrl, url, context);
    } catch (error) {
      logger.debug('Advanced URL resolution failed, falling back to basic', {
        component: 'SmartCrawler',
        url,
        baseUrl,
        error: error.message
      });
      
      // Fallback to basic resolution
      try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          return url;
        }
        if (url.startsWith('//')) {
          return 'https:' + url;
        }
        if (url.startsWith('/')) {
          const base = new URL(baseUrl);
          return base.origin + url;
        }
        return new URL(url, baseUrl).href;
      } catch (fallbackError) {
        logger.warn('All URL resolution attempts failed', {
          component: 'SmartCrawler',
          url,
          baseUrl,
          error: fallbackError.message
        });
        return url;
      }
    }
  }

  // Helper method to validate asset URLs
  isValidAssetUrl(url) {
    if (!url || url.length < 3) return false;
    if (url.startsWith('data:')) return false;
    if (url.startsWith('blob:')) return false;
    if (url.startsWith('javascript:')) return false;
    if (url.startsWith('#')) return false;
    if (url.includes('localhost') && !url.includes(window.location?.origin)) return false;
    
    return true;
  }

  // Helper method to add discovered assets
  addDiscoveredAsset(url, type, source) {
    if (!this.discoveredAssets.has(url)) {
      const asset = {
        url,
        type,
        contentType: '',
        size: 0,
        discoveredAt: new Date(),
        source,
        downloaded: false
      };

      if (this.isImportantAsset(asset)) {
        this.discoveredAssets.set(url, asset);
        this.onAssetFound(asset);
        logger.debug('New asset discovered recursively', {
          component: 'SmartCrawler',
          url,
          type,
          source
        });
      }
    }
  }

  // Process all saved HTML files to rewrite asset URLs
  async processHtmlFiles() {
    logger.info('Processing HTML files for asset URL rewriting', {
      component: 'SmartCrawler',
      htmlFiles: this.savedPages.size,
      discoveredAssets: this.discoveredAssets.size,
      buildTool: this.detectedBuildTool?.tool || 'unknown',
      buildToolConfidence: this.detectedBuildTool?.confidence || 0
    });

    try {
      const htmlProcessor = new HtmlProcessor(this.outputDir, this.discoveredAssets, this.detectedBuildTool);

      // Process CSS files first to rewrite their internal URLs
      await htmlProcessor.processCssFiles();

      // Process each saved HTML file
      for (const [pageUrl, filePath] of this.savedPages) {
        try {
          if (await fs.pathExists(filePath)) {
            const originalHtml = await fs.readFile(filePath, 'utf8');
            const processedHtml = await htmlProcessor.processHtml(originalHtml, pageUrl);
            
            if (processedHtml !== originalHtml) {
              await fs.writeFile(filePath, processedHtml);
              logger.debug('HTML file processed and updated', {
                component: 'SmartCrawler',
                filePath,
                pageUrl,
                originalSize: originalHtml.length,
                processedSize: processedHtml.length
              });
            }
          } else {
            logger.warn('HTML file not found for processing', {
              component: 'SmartCrawler',
              filePath,
              pageUrl
            });
          }
        } catch (error) {
          logger.error('Failed to process HTML file', {
            component: 'SmartCrawler',
            filePath,
            pageUrl,
            error: error.message
          });
        }
      }

      logger.info('HTML processing completed', {
        component: 'SmartCrawler',
        processedFiles: this.savedPages.size
      });
    } catch (error) {
      logger.error('HTML processing failed', {
        component: 'SmartCrawler',
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Detect build tool and analyze path patterns
  async detectBuildToolAndPaths(url) {
    try {
      logger.info('Detecting build tool and path patterns', {
        component: 'SmartCrawler',
        url
      });

      // Analyze page content for build tool signatures
      const buildToolInfo = await this.page.evaluate(() => {
        const info = {
          hasVue: false,
          hasReact: false,
          hasWebpack: false,
          hasVite: false,
          hasAngular: false,
          metaTags: [],
          scriptSources: [],
          linkHrefs: [],
          pathPatterns: []
        };

        // Check for Vue.js
        if (window.Vue || document.querySelector('[data-v-]') || document.querySelector('#app')) {
          info.hasVue = true;
        }

        // Check for React
        if (window.React || document.querySelector('[data-reactroot]') || document.querySelector('#root')) {
          info.hasReact = true;
        }

        // Check for Angular
        if (window.ng || document.querySelector('[ng-app]') || document.querySelector('app-root')) {
          info.hasAngular = true;
        }

        // Check meta tags for build tool signatures
        const metaTags = document.querySelectorAll('meta');
        metaTags.forEach(tag => {
          const name = tag.getAttribute('name') || tag.getAttribute('property') || '';
          const content = tag.getAttribute('content') || '';
          if (name.includes('generator') || content.includes('webpack') || content.includes('vite') || content.includes('vue')) {
            info.metaTags.push({ name, content });
          }
        });

        // Collect script sources to analyze patterns
        const scripts = document.querySelectorAll('script[src]');
        scripts.forEach(script => {
          const src = script.src;
          if (src) {
            info.scriptSources.push(src);
            
            // Detect Webpack chunk patterns
            if (src.includes('chunk') || src.includes('runtime') || src.includes('vendor')) {
              info.hasWebpack = true;
            }
            
            // Detect Vite patterns
            if (src.includes('/@vite/') || src.includes('.vite/') || src.includes('?v=')) {
              info.hasVite = true;
            }
          }
        });

        // Collect link hrefs for CSS patterns
        const links = document.querySelectorAll('link[href]');
        links.forEach(link => {
          const href = link.href;
          if (href && (link.rel === 'stylesheet' || href.endsWith('.css'))) {
            info.linkHrefs.push(href);
          }
        });

        // Extract common path patterns from images
        const images = document.querySelectorAll('img[src]');
        images.forEach(img => {
          const src = img.src;
          if (src && src.startsWith(window.location.origin)) {
            const path = new URL(src).pathname;
            info.pathPatterns.push(path);
          }
        });

        return info;
      });

      // Analyze the collected information
      this.detectedBuildTool = this.analyzeBuildTool(buildToolInfo);
      this.analyzePathPatterns(buildToolInfo.pathPatterns);

      logger.info('Build tool detection completed', {
        component: 'SmartCrawler',
        detectedBuildTool: this.detectedBuildTool,
        pathMappings: Array.from(this.pathMappings.entries()),
        scriptCount: buildToolInfo.scriptSources.length,
        pathPatternCount: buildToolInfo.pathPatterns.length
      });

      // Save build tool information for later use
      await this.saveBuildToolInfo(buildToolInfo);

    } catch (error) {
      logger.debug('Build tool detection failed', {
        component: 'SmartCrawler',
        error: error.message
      });
    }
  }

  // Analyze build tool signatures
  analyzeBuildTool(buildToolInfo) {
    let buildTool = 'unknown';
    let confidence = 0;

    // Vue.js detection
    if (buildToolInfo.hasVue) {
      buildTool = 'vue-cli';
      confidence = 0.8;
      
      // Check for specific Vue CLI patterns
      const hasVueChunks = buildToolInfo.scriptSources.some(src => 
        src.includes('chunk-vendors') || src.includes('app.') && src.includes('.js')
      );
      if (hasVueChunks) confidence = 0.9;
    }

    // React detection
    if (buildToolInfo.hasReact) {
      buildTool = 'create-react-app';
      confidence = 0.8;
      
      // Check for CRA patterns
      const hasCRAPattern = buildToolInfo.scriptSources.some(src => 
        src.includes('static/js/') || src.includes('runtime-main') || src.includes('chunk.js')
      );
      if (hasCRAPattern) confidence = 0.9;
    }

    // Vite detection (can override others if stronger signals)
    if (buildToolInfo.hasVite) {
      buildTool = 'vite';
      confidence = 0.95; // Vite has very distinctive patterns
    }

    // Webpack detection
    if (buildToolInfo.hasWebpack && confidence < 0.7) {
      buildTool = 'webpack';
      confidence = 0.7;
    }

    // Angular detection
    if (buildToolInfo.hasAngular) {
      buildTool = 'angular-cli';
      confidence = 0.8;
      
      const hasAngularPattern = buildToolInfo.scriptSources.some(src => 
        src.includes('polyfills') || src.includes('main.') || src.includes('runtime.')
      );
      if (hasAngularPattern) confidence = 0.9;
    }

    return { tool: buildTool, confidence };
  }

  // Analyze path patterns to predict common mappings
  analyzePathPatterns(pathPatterns) {
    const pathCounts = new Map();
    
    // Count occurrences of different path prefixes
    pathPatterns.forEach(path => {
      const parts = path.split('/').filter(p => p.length > 0);
      if (parts.length > 0) {
        const prefix = '/' + parts[0];
        pathCounts.set(prefix, (pathCounts.get(prefix) || 0) + 1);
      }
    });

    // Determine likely path mappings based on patterns
    const commonMappings = [
      { expected: '/img/', actual: '/assets/image/' },
      { expected: '/images/', actual: '/assets/image/' },
      { expected: '/static/', actual: '/assets/' },
      { expected: '/css/', actual: '/assets/stylesheet/' },
      { expected: '/js/', actual: '/assets/javascript/' },
      { expected: '/fonts/', actual: '/assets/font/' },
      { expected: '/media/', actual: '/assets/video/' }
    ];

    // Check which mappings are likely needed
    pathCounts.forEach((count, prefix) => {
      const mapping = commonMappings.find(m => m.expected === prefix + '/');
      if (mapping && count > 0) {
        this.pathMappings.set(mapping.expected, mapping.actual);
        logger.debug('Detected likely path mapping', {
          component: 'SmartCrawler',
          expected: mapping.expected,
          actual: mapping.actual,
          occurrences: count
        });
      }
    });
  }

  // Save build tool information to output directory
  async saveBuildToolInfo(buildToolInfo) {
    try {
      const buildInfo = {
        detectedAt: new Date(),
        buildTool: this.detectedBuildTool,
        pathMappings: Array.from(this.pathMappings.entries()),
        signatures: {
          hasVue: buildToolInfo.hasVue,
          hasReact: buildToolInfo.hasReact,
          hasWebpack: buildToolInfo.hasWebpack,
          hasVite: buildToolInfo.hasVite,
          hasAngular: buildToolInfo.hasAngular
        },
        scriptPatterns: buildToolInfo.scriptSources.slice(0, 10), // First 10 for analysis
        pathPatterns: buildToolInfo.pathPatterns.slice(0, 20) // First 20 for analysis
      };

      const buildInfoPath = path.join(this.outputDir, 'build-tool-info.json');
      await fs.writeFile(buildInfoPath, JSON.stringify(buildInfo, null, 2));

      logger.debug('Build tool information saved', {
        component: 'SmartCrawler',
        buildInfoPath
      });
    } catch (error) {
      logger.debug('Failed to save build tool information', {
        component: 'SmartCrawler',
        error: error.message
      });
    }
  }

  // Enhanced cleanup method with HTTrack-style resource management
  async cleanup() {
    logger.info('Starting comprehensive cleanup', { 
      component: 'SmartCrawler',
      sessionStats: this.sessionStats
    });
    
    try {
      // Finalize cache operations
      if (this.cacheManager) {
        await this.cacheManager.close();
        logger.debug('Cache manager closed', { component: 'SmartCrawler' });
      }
    } catch (error) {
      logger.warn('Cache cleanup error', {
        component: 'SmartCrawler',
        error: error.message
      });
    }

    try {
      // Close all pages first
      if (this.browser) {
        const pages = await this.browser.pages();
        await Promise.all(pages.map(page => 
          page.close().catch(err => 
            logger.debug('Page close error', {
              component: 'SmartCrawler',
              error: err.message
            })
          )
        ));
      }
    } catch (error) {
      logger.debug('Error closing pages', {
        component: 'SmartCrawler',
        error: error.message
      });
    }

    try {
      // Close browser
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
        logger.debug('Browser cleanup completed', { component: 'SmartCrawler' });
      }
    } catch (cleanupError) {
      logger.warn('Browser cleanup error', {
        component: 'SmartCrawler',
        error: cleanupError.message
      });
    }

    try {
      // Shutdown retry manager
      if (this.retryManager) {
        await this.retryManager.shutdown();
        logger.debug('Retry manager shutdown completed', { component: 'SmartCrawler' });
      }
    } catch (error) {
      logger.warn('Retry manager cleanup error', {
        component: 'SmartCrawler',
        error: error.message
      });
    }

    // Log final session statistics
    const finalStats = this.getSessionStatistics();
    logger.info('Crawling session completed', {
      component: 'SmartCrawler',
      stats: finalStats
    });

    // Clear references to help GC
    this.visitedUrls.clear();
    this.discoveredAssets.clear();
    this.savedPages.clear();
    this.errorLog = [];
  }

  // Get comprehensive session statistics (HTTrack-style reporting)
  getSessionStatistics() {
    const now = Date.now();
    const duration = now - this.sessionStats.startTime;
    
    const retryStats = this.retryManager ? this.retryManager.getStats() : {};
    const cacheStats = this.cacheManager ? this.cacheManager.getStats() : {};

    return {
      session: {
        duration: duration,
        durationFormatted: this._formatDuration(duration),
        startTime: new Date(this.sessionStats.startTime).toISOString(),
        endTime: new Date(now).toISOString()
      },
      processing: {
        pagesProcessed: this.sessionStats.pagesProcessed,
        assetsDownloaded: this.sessionStats.assetsDownloaded,
        totalAssets: this.discoveredAssets.size,
        bytesDownloaded: this.sessionStats.bytesDownloaded,
        bytesDownloadedFormatted: this._formatBytes(this.sessionStats.bytesDownloaded),
        avgAssetSize: this.sessionStats.assetsDownloaded > 0 
          ? Math.round(this.sessionStats.bytesDownloaded / this.sessionStats.assetsDownloaded)
          : 0
      },
      reliability: {
        errors: this.sessionStats.errors,
        errorRate: this.discoveredAssets.size > 0 
          ? (this.sessionStats.errors / this.discoveredAssets.size) * 100
          : 0,
        successRate: this.discoveredAssets.size > 0 
          ? ((this.discoveredAssets.size - this.sessionStats.errors) / this.discoveredAssets.size) * 100
          : 100
      },
      performance: {
        avgDownloadSpeed: duration > 0 
          ? Math.round((this.sessionStats.bytesDownloaded / duration) * 1000) // bytes per second
          : 0,
        avgDownloadSpeedFormatted: duration > 0 
          ? this._formatBytes(Math.round((this.sessionStats.bytesDownloaded / duration) * 1000)) + '/s'
          : '0 B/s',
        assetsPerSecond: duration > 0 
          ? Math.round((this.sessionStats.assetsDownloaded / duration) * 1000)
          : 0
      },
      retry: retryStats.global || {},
      cache: {
        hitRate: cacheStats.hitRate || 0,
        entryCount: cacheStats.entryCount || 0,
        totalSize: cacheStats.totalSizeFormatted || '0 B'
      },
      buildTool: this.detectedBuildTool || { tool: 'unknown', confidence: 0 },
      errors: this.errorLog.slice(-10) // Last 10 errors
    };
  }

  // Get detailed error report
  getErrorReport() {
    const errorsByType = {};
    const errorsByDomain = {};
    
    this.errorLog.forEach(error => {
      // Group by error type
      const errorType = error.type || 'unknown';
      if (!errorsByType[errorType]) {
        errorsByType[errorType] = [];
      }
      errorsByType[errorType].push(error);
      
      // Group by domain
      try {
        const domain = new URL(error.url).hostname;
        if (!errorsByDomain[domain]) {
          errorsByDomain[domain] = [];
        }
        errorsByDomain[domain].push(error);
      } catch (e) {
        // Invalid URL
      }
    });

    return {
      totalErrors: this.errorLog.length,
      errorsByType,
      errorsByDomain,
      recentErrors: this.errorLog.slice(-20)
    };
  }

  // Utility methods for formatting
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  _formatBytes(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }
}

module.exports = SmartCrawler;
