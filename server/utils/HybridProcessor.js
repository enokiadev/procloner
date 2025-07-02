/**
 * Hybrid Processing Engine
 * Combines HTTrack's fast static parsing with dynamic JavaScript execution
 * Intelligently chooses processing strategy based on content analysis
 */

const cheerio = require('cheerio');
const { logger } = require('./logger');
const AdvancedUrlResolver = require('./AdvancedUrlResolver');

class HybridProcessor {
  constructor(options = {}) {
    this.options = {
      // Performance thresholds
      staticParsingTimeout: options.staticParsingTimeout || 5000,
      dynamicProcessingTimeout: options.dynamicProcessingTimeout || 30000,
      
      // Content analysis thresholds
      jsComplexityThreshold: options.jsComplexityThreshold || 0.3,
      frameworkDetectionThreshold: options.frameworkDetectionThreshold || 0.7,
      
      // Processing strategy preferences
      preferStatic: options.preferStatic !== false,
      fallbackToDynamic: options.fallbackToDynamic !== false,
      
      // Asset discovery limits
      maxStaticAssets: options.maxStaticAssets || 1000,
      maxDynamicAssets: options.maxDynamicAssets || 5000,
      
      ...options
    };

    this.urlResolver = new AdvancedUrlResolver();
    this.contentAnalyzer = new ContentAnalyzer();
    this.staticParser = new StaticHTMLParser(this.urlResolver);
    
    // Performance tracking
    this.stats = {
      staticProcessing: { count: 0, totalTime: 0, assetsFound: 0 },
      dynamicProcessing: { count: 0, totalTime: 0, assetsFound: 0 },
      hybridProcessing: { count: 0, totalTime: 0, assetsFound: 0 }
    };
  }

  /**
   * Main processing method - intelligently chooses strategy
   */
  async processContent(url, content, page = null, context = {}) {
    const startTime = Date.now();
    
    try {
      // Analyze content to determine processing strategy
      const analysis = await this.contentAnalyzer.analyze(content, url);
      const strategy = this.determineProcessingStrategy(analysis, context);

      logger.debug('Processing strategy determined', {
        component: 'HybridProcessor',
        url,
        strategy: strategy.name,
        confidence: strategy.confidence,
        reasons: strategy.reasons
      });

      let result;

      switch (strategy.name) {
        case 'static':
          result = await this._processStatic(url, content, analysis);
          this.stats.staticProcessing.count++;
          this.stats.staticProcessing.totalTime += Date.now() - startTime;
          this.stats.staticProcessing.assetsFound += result.assets.length;
          break;

        case 'dynamic':
          result = await this._processDynamic(url, content, page, analysis);
          this.stats.dynamicProcessing.count++;
          this.stats.dynamicProcessing.totalTime += Date.now() - startTime;
          this.stats.dynamicProcessing.assetsFound += result.assets.length;
          break;

        case 'hybrid':
        default:
          result = await this._processHybrid(url, content, page, analysis);
          this.stats.hybridProcessing.count++;
          this.stats.hybridProcessing.totalTime += Date.now() - startTime;
          this.stats.hybridProcessing.assetsFound += result.assets.length;
          break;
      }

      // Enhance result with processing metadata
      result.processingStrategy = strategy;
      result.processingTime = Date.now() - startTime;
      result.analysis = analysis;

      return result;
    } catch (error) {
      logger.error('Hybrid processing failed', {
        component: 'HybridProcessor',
        url,
        error: error.message,
        stack: error.stack
      });
      
      throw error;
    }
  }

  /**
   * Determine optimal processing strategy based on content analysis
   */
  determineProcessingStrategy(analysis, context = {}) {
    const reasons = [];
    let score = 0;
    let strategy = 'hybrid';

    // Factor 1: JavaScript complexity
    if (analysis.jsComplexity < 0.2) {
      score += 3;
      reasons.push('Low JavaScript complexity');
    } else if (analysis.jsComplexity > 0.7) {
      score -= 2;
      reasons.push('High JavaScript complexity');
    }

    // Factor 2: Framework detection
    if (analysis.frameworks.length === 0) {
      score += 2;
      reasons.push('No modern frameworks detected');
    } else if (analysis.frameworks.some(f => f.confidence > 0.8)) {
      score -= 3;
      reasons.push('Strong framework signals detected');
    }

    // Factor 3: Dynamic content indicators
    if (analysis.dynamicContentSignals < 0.3) {
      score += 2;
      reasons.push('Minimal dynamic content signals');
    } else if (analysis.dynamicContentSignals > 0.6) {
      score -= 2;
      reasons.push('Strong dynamic content signals');
    }

    // Factor 4: Asset count predictions
    if (analysis.estimatedAssetCount < 50) {
      score += 1;
      reasons.push('Low asset count');
    } else if (analysis.estimatedAssetCount > 200) {
      score -= 1;
      reasons.push('High asset count');
    }

    // Factor 5: Context hints
    if (context.forceDynamic) {
      score -= 5;
      reasons.push('Dynamic processing forced by context');
    } else if (context.forceStatic) {
      score += 5;
      reasons.push('Static processing forced by context');
    }

    // Factor 6: Page size and complexity
    if (analysis.htmlSize < 50000) { // 50KB
      score += 1;
      reasons.push('Small page size');
    } else if (analysis.htmlSize > 500000) { // 500KB
      score -= 1;
      reasons.push('Large page size');
    }

    // Decision logic
    if (score >= 4) {
      strategy = 'static';
    } else if (score <= -3) {
      strategy = 'dynamic';
    } else {
      strategy = 'hybrid';
    }

    const confidence = Math.min(Math.abs(score) / 5, 1);

    return {
      name: strategy,
      confidence,
      score,
      reasons
    };
  }

  /**
   * Static-only processing (HTTrack-style)
   */
  async _processStatic(url, content, analysis) {
    const startTime = Date.now();
    
    logger.debug('Processing with static parser', {
      component: 'HybridProcessor',
      url
    });

    try {
      const result = await Promise.race([
        this.staticParser.parse(url, content),
        this._createTimeout(this.options.staticParsingTimeout, 'Static parsing timeout')
      ]);

      logger.debug('Static processing completed', {
        component: 'HybridProcessor',
        url,
        assetsFound: result.assets.length,
        processingTime: Date.now() - startTime
      });

      return {
        ...result,
        processingMethod: 'static',
        completeness: this._calculateStaticCompleteness(result, analysis)
      };
    } catch (error) {
      if (this.options.fallbackToDynamic) {
        logger.warn('Static processing failed, falling back to dynamic', {
          component: 'HybridProcessor',
          url,
          error: error.message
        });
        
        return this._processDynamic(url, content, null, analysis);
      }
      
      throw error;
    }
  }

  /**
   * Dynamic-only processing (browser-based)
   */
  async _processDynamic(url, content, page, analysis) {
    const startTime = Date.now();
    
    if (!page) {
      throw new Error('Dynamic processing requires a page instance');
    }

    logger.debug('Processing with dynamic execution', {
      component: 'HybridProcessor',
      url
    });

    try {
      // Execute dynamic content discovery
      const result = await Promise.race([
        this._dynamicAssetDiscovery(page, url),
        this._createTimeout(this.options.dynamicProcessingTimeout, 'Dynamic processing timeout')
      ]);

      logger.debug('Dynamic processing completed', {
        component: 'HybridProcessor',
        url,
        assetsFound: result.assets.length,
        processingTime: Date.now() - startTime
      });

      return {
        ...result,
        processingMethod: 'dynamic',
        completeness: this._calculateDynamicCompleteness(result, analysis)
      };
    } catch (error) {
      logger.error('Dynamic processing failed', {
        component: 'HybridProcessor',
        url,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Hybrid processing - combines both approaches
   */
  async _processHybrid(url, content, page, analysis) {
    const startTime = Date.now();
    
    logger.debug('Processing with hybrid approach', {
      component: 'HybridProcessor',
      url
    });

    try {
      // Start static parsing immediately
      const staticPromise = this.staticParser.parse(url, content)
        .catch(error => {
          logger.debug('Static parsing failed in hybrid mode', {
            component: 'HybridProcessor',
            error: error.message
          });
          return { assets: [], links: [], errors: [error.message] };
        });

      // Start dynamic processing if page available
      let dynamicPromise = Promise.resolve({ assets: [], networkRequests: [] });
      if (page) {
        dynamicPromise = this._dynamicAssetDiscovery(page, url)
          .catch(error => {
            logger.debug('Dynamic processing failed in hybrid mode', {
              component: 'HybridProcessor',
              error: error.message
            });
            return { assets: [], networkRequests: [], errors: [error.message] };
          });
      }

      // Wait for both to complete
      const [staticResult, dynamicResult] = await Promise.all([
        staticPromise,
        dynamicPromise
      ]);

      // Merge results intelligently
      const mergedResult = this._mergeResults(staticResult, dynamicResult, url);

      logger.debug('Hybrid processing completed', {
        component: 'HybridProcessor',
        url,
        staticAssets: staticResult.assets.length,
        dynamicAssets: dynamicResult.assets.length,
        totalAssets: mergedResult.assets.length,
        processingTime: Date.now() - startTime
      });

      return {
        ...mergedResult,
        processingMethod: 'hybrid',
        staticResult,
        dynamicResult,
        completeness: this._calculateHybridCompleteness(mergedResult, staticResult, dynamicResult, analysis)
      };
    } catch (error) {
      logger.error('Hybrid processing failed', {
        component: 'HybridProcessor',
        url,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Dynamic asset discovery using browser automation
   */
  async _dynamicAssetDiscovery(page, url) {
    const discoveredAssets = new Set();
    const networkRequests = [];
    
    // Monitor network requests
    const requestHandler = (request) => {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        timestamp: Date.now()
      });
    };

    page.on('request', requestHandler);

    try {
      // Trigger dynamic content loading
      await this._triggerDynamicContent(page);
      
      // Extract assets from final DOM state
      const pageAssets = await page.evaluate(() => {
        const assets = [];
        
        // Images
        document.querySelectorAll('img[src]').forEach(img => {
          assets.push({ url: img.src, type: 'image', source: 'img-src' });
        });
        
        // Scripts
        document.querySelectorAll('script[src]').forEach(script => {
          assets.push({ url: script.src, type: 'javascript', source: 'script-src' });
        });
        
        // Stylesheets
        document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
          assets.push({ url: link.href, type: 'stylesheet', source: 'link-href' });
        });
        
        // CSS background images
        const elements = document.querySelectorAll('*');
        elements.forEach(el => {
          const style = window.getComputedStyle(el);
          const bgImage = style.backgroundImage;
          if (bgImage && bgImage !== 'none') {
            const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
            if (match) {
              assets.push({ url: match[1], type: 'image', source: 'css-background' });
            }
          }
        });

        return assets;
      });

      // Add network-discovered assets
      networkRequests.forEach(req => {
        if (['image', 'stylesheet', 'script', 'font'].includes(req.resourceType)) {
          discoveredAssets.add(JSON.stringify({
            url: req.url,
            type: this._mapResourceTypeToAssetType(req.resourceType),
            source: 'network-monitor'
          }));
        }
      });

      // Add page-extracted assets
      pageAssets.forEach(asset => {
        discoveredAssets.add(JSON.stringify(asset));
      });

      const assets = Array.from(discoveredAssets).map(asset => JSON.parse(asset));

      return {
        assets,
        networkRequests,
        discoveryMethod: 'dynamic'
      };
    } finally {
      page.off('request', requestHandler);
    }
  }

  /**
   * Trigger dynamic content loading
   */
  async _triggerDynamicContent(page) {
    try {
      // Scroll to trigger lazy loading
      await page.evaluate(() => {
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

      // Wait for potential AJAX requests
      await page.waitForTimeout(2000);

      // Trigger common interaction patterns
      await page.evaluate(() => {
        // Click elements that might trigger content loading
        const buttons = document.querySelectorAll('button, [role="button"]');
        buttons.forEach(btn => {
          if (btn.textContent.toLowerCase().includes('load') ||
              btn.textContent.toLowerCase().includes('more')) {
            try {
              btn.click();
            } catch (e) {
              // Ignore click errors
            }
          }
        });

        // Hover over elements that might have lazy loading
        const elements = document.querySelectorAll('[data-src], [data-lazy]');
        elements.forEach(el => {
          try {
            el.dispatchEvent(new Event('mouseenter'));
          } catch (e) {
            // Ignore event errors
          }
        });
      });

      // Final wait for triggered content
      await page.waitForTimeout(1000);
    } catch (error) {
      logger.debug('Error triggering dynamic content', {
        component: 'HybridProcessor',
        error: error.message
      });
    }
  }

  /**
   * Merge static and dynamic results intelligently
   */
  _mergeResults(staticResult, dynamicResult, baseUrl) {
    const assetMap = new Map();
    const allAssets = [];

    // Add static assets (higher priority for duplicates)
    staticResult.assets.forEach(asset => {
      const resolvedUrl = this.urlResolver.resolveUrl(baseUrl, baseUrl, asset.url);
      assetMap.set(resolvedUrl, { ...asset, discoveryMethod: 'static' });
    });

    // Add dynamic assets (if not already found statically)
    dynamicResult.assets.forEach(asset => {
      const resolvedUrl = this.urlResolver.resolveUrl(baseUrl, baseUrl, asset.url);
      if (!assetMap.has(resolvedUrl)) {
        assetMap.set(resolvedUrl, { ...asset, discoveryMethod: 'dynamic' });
      } else {
        // Mark as found by both methods
        const existingAsset = assetMap.get(resolvedUrl);
        existingAsset.discoveryMethod = 'both';
      }
    });

    // Convert back to array
    assetMap.forEach(asset => allAssets.push(asset));

    return {
      assets: allAssets,
      links: staticResult.links || [],
      networkRequests: dynamicResult.networkRequests || [],
      staticAssets: staticResult.assets.length,
      dynamicAssets: dynamicResult.assets.length,
      totalAssets: allAssets.length
    };
  }

  /**
   * Calculate completeness scores
   */
  _calculateStaticCompleteness(result, analysis) {
    // Base score from asset discovery
    let score = Math.min(result.assets.length / Math.max(analysis.estimatedAssetCount, 1), 1) * 0.7;
    
    // Bonus for finding expected asset types
    if (result.assets.some(a => a.type === 'stylesheet')) score += 0.1;
    if (result.assets.some(a => a.type === 'javascript')) score += 0.1;
    if (result.assets.some(a => a.type === 'image')) score += 0.1;
    
    return Math.min(score, 1);
  }

  _calculateDynamicCompleteness(result, analysis) {
    let score = 0.8; // Base score for dynamic processing
    
    // Bonus for network monitoring
    if (result.networkRequests && result.networkRequests.length > 0) score += 0.1;
    
    // Bonus for discovering assets that static parsing might miss
    if (result.assets.some(a => a.source === 'network-monitor')) score += 0.1;
    
    return Math.min(score, 1);
  }

  _calculateHybridCompleteness(merged, staticResult, dynamicResult, analysis) {
    const staticScore = this._calculateStaticCompleteness(staticResult, analysis);
    const dynamicScore = this._calculateDynamicCompleteness(dynamicResult, analysis);
    
    // Weighted average with bonus for finding assets through multiple methods
    const baseScore = (staticScore * 0.6) + (dynamicScore * 0.4);
    const bothMethodsBonus = merged.assets.filter(a => a.discoveryMethod === 'both').length * 0.02;
    
    return Math.min(baseScore + bothMethodsBonus, 1);
  }

  /**
   * Utility methods
   */
  _mapResourceTypeToAssetType(resourceType) {
    const mapping = {
      'image': 'image',
      'stylesheet': 'stylesheet',
      'script': 'javascript',
      'font': 'font',
      'media': 'media'
    };
    return mapping[resourceType] || 'other';
  }

  _createTimeout(ms, message) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Get processing statistics
   */
  getStats() {
    const totalProcessing = this.stats.staticProcessing.count + 
                           this.stats.dynamicProcessing.count + 
                           this.stats.hybridProcessing.count;

    return {
      totalProcessed: totalProcessing,
      strategies: {
        static: {
          ...this.stats.staticProcessing,
          avgTime: this.stats.staticProcessing.count > 0 
            ? this.stats.staticProcessing.totalTime / this.stats.staticProcessing.count 
            : 0,
          avgAssets: this.stats.staticProcessing.count > 0 
            ? this.stats.staticProcessing.assetsFound / this.stats.staticProcessing.count 
            : 0
        },
        dynamic: {
          ...this.stats.dynamicProcessing,
          avgTime: this.stats.dynamicProcessing.count > 0 
            ? this.stats.dynamicProcessing.totalTime / this.stats.dynamicProcessing.count 
            : 0,
          avgAssets: this.stats.dynamicProcessing.count > 0 
            ? this.stats.dynamicProcessing.assetsFound / this.stats.dynamicProcessing.count 
            : 0
        },
        hybrid: {
          ...this.stats.hybridProcessing,
          avgTime: this.stats.hybridProcessing.count > 0 
            ? this.stats.hybridProcessing.totalTime / this.stats.hybridProcessing.count 
            : 0,
          avgAssets: this.stats.hybridProcessing.count > 0 
            ? this.stats.hybridProcessing.assetsFound / this.stats.hybridProcessing.count 
            : 0
        }
      },
      efficiency: {
        staticPercentage: totalProcessing > 0 ? (this.stats.staticProcessing.count / totalProcessing) * 100 : 0,
        dynamicPercentage: totalProcessing > 0 ? (this.stats.dynamicProcessing.count / totalProcessing) * 100 : 0,
        hybridPercentage: totalProcessing > 0 ? (this.stats.hybridProcessing.count / totalProcessing) * 100 : 0
      }
    };
  }
}

/**
 * Content Analyzer - determines content characteristics
 */
class ContentAnalyzer {
  async analyze(content, url) {
    const $ = cheerio.load(content);
    
    const analysis = {
      htmlSize: Buffer.byteLength(content, 'utf8'),
      jsComplexity: this._analyzeJSComplexity($),
      frameworks: this._detectFrameworks($),
      dynamicContentSignals: this._analyzeDynamicSignals($),
      estimatedAssetCount: this._estimateAssetCount($),
      hasLazyLoading: this._detectLazyLoading($),
      hasSPA: this._detectSPA($),
      interactiveElements: this._countInteractiveElements($)
    };

    return analysis;
  }

  _analyzeJSComplexity($) {
    const scripts = $('script');
    let complexity = 0;
    let totalLines = 0;

    scripts.each((i, script) => {
      const content = $(script).html() || '';
      const lines = content.split('\n').length;
      totalLines += lines;
      
      // Look for complexity indicators
      if (content.includes('import ') || content.includes('require(')) complexity += 0.2;
      if (content.includes('class ') || content.includes('function ')) complexity += 0.1;
      if (content.includes('async ') || content.includes('await ')) complexity += 0.1;
      if (content.includes('fetch(') || content.includes('XMLHttpRequest')) complexity += 0.2;
      if (content.includes('addEventListener') || content.includes('onClick')) complexity += 0.1;
    });

    // Normalize by total content
    return Math.min(complexity + (totalLines / 10000), 1);
  }

  _detectFrameworks($) {
    const frameworks = [];
    const html = $.html();
    
    // React
    if (html.includes('react') || html.includes('ReactDOM') || $('[data-reactroot]').length > 0) {
      frameworks.push({ name: 'React', confidence: 0.8 });
    }
    
    // Vue
    if (html.includes('vue') || html.includes('Vue') || $('[v-]').length > 0) {
      frameworks.push({ name: 'Vue', confidence: 0.8 });
    }
    
    // Angular
    if (html.includes('angular') || html.includes('ng-') || $('[ng-]').length > 0) {
      frameworks.push({ name: 'Angular', confidence: 0.8 });
    }

    return frameworks;
  }

  _analyzeDynamicSignals($) {
    let signals = 0;
    
    // Look for dynamic loading indicators
    if ($('[data-src]').length > 0) signals += 0.3;
    if ($('[data-lazy]').length > 0) signals += 0.3;
    if ($('script[async]').length > 0) signals += 0.2;
    if ($('script[defer]').length > 0) signals += 0.1;
    if ($('.loading, .spinner, .skeleton').length > 0) signals += 0.2;
    
    return Math.min(signals, 1);
  }

  _estimateAssetCount($) {
    return $('img, script, link[rel="stylesheet"], audio, video, source').length;
  }

  _detectLazyLoading($) {
    return $('[loading="lazy"], [data-src], [data-lazy]').length > 0;
  }

  _detectSPA($) {
    const html = $.html();
    return html.includes('pushState') || 
           html.includes('history.push') || 
           html.includes('router') ||
           $('[data-route]').length > 0;
  }

  _countInteractiveElements($) {
    return $('button, [role="button"], [onclick], [data-click]').length;
  }
}

/**
 * Static HTML Parser - HTTrack-style parsing
 */
class StaticHTMLParser {
  constructor(urlResolver) {
    this.urlResolver = urlResolver;
  }

  async parse(baseUrl, content) {
    const $ = cheerio.load(content);
    const assets = [];
    const links = [];

    // Extract images
    $('img[src]').each((i, el) => {
      const src = $(el).attr('src');
      if (src) {
        assets.push({
          url: this.urlResolver.resolveUrl(baseUrl, baseUrl, src),
          type: 'image',
          source: 'img-src',
          element: 'img'
        });
      }
    });

    // Extract scripts
    $('script[src]').each((i, el) => {
      const src = $(el).attr('src');
      if (src) {
        assets.push({
          url: this.urlResolver.resolveUrl(baseUrl, baseUrl, src),
          type: 'javascript',
          source: 'script-src',
          element: 'script'
        });
      }
    });

    // Extract stylesheets
    $('link[rel="stylesheet"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) {
        assets.push({
          url: this.urlResolver.resolveUrl(baseUrl, baseUrl, href),
          type: 'stylesheet',
          source: 'link-href',
          element: 'link'
        });
      }
    });

    // Extract links
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        links.push({
          url: this.urlResolver.resolveUrl(baseUrl, baseUrl, href),
          text: $(el).text().trim(),
          element: 'a'
        });
      }
    });

    // Extract CSS background images
    $('*').each((i, el) => {
      const style = $(el).attr('style');
      if (style) {
        const bgMatch = style.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/);
        if (bgMatch) {
          assets.push({
            url: this.urlResolver.resolveUrl(baseUrl, baseUrl, bgMatch[1]),
            type: 'image',
            source: 'css-background',
            element: el.tagName
          });
        }
      }
    });

    return {
      assets,
      links,
      parsingMethod: 'static'
    };
  }
}

module.exports = HybridProcessor;