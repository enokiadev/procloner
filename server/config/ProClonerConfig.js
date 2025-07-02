/**
 * ProCloner Advanced Configuration System
 * Based on HTTrack's extensive configuration capabilities (100+ options)
 * Provides granular control over all aspects of website cloning
 */

const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');

class ProClonerConfig {
  constructor(configPath = null) {
    this.configPath = configPath;
    this.config = this._getDefaultConfig();
    this.profiles = new Map();
    this.activeProfile = 'default';
  }

  /**
   * Load configuration from file or use defaults
   */
  async initialize(configPath = null) {
    if (configPath) {
      this.configPath = configPath;
    }

    if (this.configPath && await this._fileExists(this.configPath)) {
      await this.loadFromFile(this.configPath);
    }

    // Load built-in profiles
    await this._loadBuiltInProfiles();
    
    logger.info('Configuration system initialized', {
      component: 'ProClonerConfig',
      profilesLoaded: this.profiles.size,
      activeProfile: this.activeProfile
    });
  }

  /**
   * Get default configuration (HTTrack-inspired with modern additions)
   */
  _getDefaultConfig() {
    return {
      // === GENERAL SETTINGS ===
      general: {
        // Basic options
        maxDepth: 3,                    // Maximum recursion depth
        maxFiles: 1000,                 // Maximum files to download
        maxSize: 1024 * 1024 * 1024,    // Maximum total size (1GB)
        maxFileSize: 100 * 1024 * 1024, // Maximum individual file size (100MB)
        maxTime: 3600,                  // Maximum crawling time (seconds)
        
        // Path and file handling
        preserveStructure: true,        // Maintain original directory structure
        flattenStructure: false,        // Flatten all files to single directory
        followSymlinks: false,          // Follow symbolic links
        caseSensitive: true,            // Case sensitive file operations
        
        // Unicode and encoding
        useUTF8: true,                  // Use UTF-8 encoding
        convertCharset: true,           // Convert character sets
        preserveOriginalCharset: false, // Keep original charset when possible
        
        // Timestamps and metadata
        preserveTimestamps: true,       // Keep original file timestamps
        preservePermissions: false,     // Keep original file permissions
        addTimestampSuffix: false,      // Add timestamp to duplicate files
        
        // Progress and logging
        verboseLogging: false,          // Detailed logging
        showProgress: true,             // Display progress information
        logLevel: 'info',               // Logging level (debug, info, warn, error)
        progressUpdateInterval: 1000,   // Progress update frequency (ms)
      },

      // === CRAWLING BEHAVIOR ===
      crawling: {
        // Spider behavior
        followRobotsTxt: true,          // Respect robots.txt
        respectCrawlDelay: true,        // Honor crawl-delay directive
        followRedirects: true,          // Follow HTTP redirects
        maxRedirects: 5,                // Maximum redirect chain length
        
        // Link following
        followExternalLinks: false,     // Follow links to other domains
        followSubdomains: true,         // Follow subdomain links
        followHTTPS: true,              // Follow HTTPS links from HTTP pages
        followFTP: false,               // Follow FTP links
        
        // Content discovery
        parseCSS: true,                 // Parse CSS for asset URLs
        parseJavaScript: true,          // Parse JavaScript for asset URLs
        parseComments: false,           // Parse HTML comments for URLs
        parseSVG: true,                 // Parse SVG files for embedded content
        parseXML: true,                 // Parse XML files for references
        
        // Modern web features
        executeDynamicContent: true,    // Execute JavaScript for dynamic content
        handleSPA: true,                // Handle Single Page Applications
        discoverAPIEndpoints: true,     // Discover and map API endpoints
        handleWebComponents: true,      // Process web components
        processServiceWorkers: false,   // Process service worker files
        
        // Depth and scope control
        depthByMimeType: {              // Different depths for different content types
          'text/html': 3,
          'text/css': 2,
          'application/javascript': 1,
          'image/*': 1
        },
        excludeDepthCheck: ['css', 'js', 'image'], // Asset types to ignore for depth
      },

      // === NETWORK SETTINGS ===
      network: {
        // Connection settings
        maxConcurrentConnections: 5,   // Maximum parallel downloads
        connectionTimeout: 30000,      // Connection timeout (ms)
        readTimeout: 60000,            // Read timeout (ms)
        retryAttempts: 3,              // Number of retry attempts
        retryDelay: 1000,              // Base retry delay (ms)
        
        // Rate limiting
        requestsPerSecond: 8,           // Maximum requests per second
        delayBetweenRequests: 125,     // Minimum delay between requests (ms)
        respectServerLoad: true,        // Adjust speed based on server response
        
        // User agent and headers
        userAgent: 'ProCloner/2.0 (Advanced Website Cloner)',
        acceptLanguage: 'en-US,en;q=0.9',
        acceptEncoding: 'gzip, deflate, br',
        customHeaders: {},              // Custom HTTP headers
        
        // Authentication
        httpUsername: null,             // HTTP basic auth username
        httpPassword: null,             // HTTP basic auth password
        bearerToken: null,              // Bearer token for API access
        cookieJar: true,                // Maintain cookie session
        
        // Proxy settings
        proxyEnabled: false,            // Use proxy server
        proxyHost: null,                // Proxy server host
        proxyPort: null,                // Proxy server port
        proxyUsername: null,            // Proxy authentication username
        proxyPassword: null,            // Proxy authentication password
        
        // SSL/TLS settings
        ignoreCertificateErrors: false, // Ignore SSL certificate errors
        verifySSL: true,                // Verify SSL certificates
        useHTTP2: true,                 // Use HTTP/2 when available
      },

      // === CONTENT FILTERING ===
      filters: {
        // File type filters
        includeTypes: ['html', 'css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'woff', 'woff2', 'ttf', 'otf'],
        excludeTypes: ['exe', 'zip', 'rar', '7z', 'tar', 'gz'],
        
        // Size filters
        minFileSize: 0,                 // Minimum file size (bytes)
        maxImageSize: 10 * 1024 * 1024, // Maximum image size (10MB)
        maxScriptSize: 5 * 1024 * 1024, // Maximum script size (5MB)
        maxStyleSize: 2 * 1024 * 1024,  // Maximum stylesheet size (2MB)
        
        // URL pattern filters
        urlIncludePatterns: [],         // URL patterns to include
        urlExcludePatterns: [           // URL patterns to exclude
          '/admin/*',
          '/login/*',
          '/logout/*',
          '*.tmp',
          '*.log',
          '/cgi-bin/*'
        ],
        
        // Content filters
        excludeEmptyFiles: true,        // Skip empty files
        excludeErrorPages: true,        // Skip HTTP error pages
        excludeRedirectPages: false,    // Skip pages that redirect
        
        // Domain and path filters
        allowedDomains: [],             // Allowed domains (empty = current domain only)
        blockedDomains: [],             // Blocked domains
        allowedPaths: [],               // Allowed path patterns
        blockedPaths: [],               // Blocked path patterns
        
        // Content type specific filters
        skipBinaryContent: false,       // Skip binary content
        skipLargeImages: false,         // Skip images over maxImageSize
        skipCompressedFiles: true,      // Skip compressed archives
        skipExecutables: true,          // Skip executable files
      },

      // === BROWSER AUTOMATION ===
      browser: {
        // Browser selection and options
        browserType: 'chromium',        // Browser type (chromium, firefox, webkit)
        headless: true,                 // Run browser in headless mode
        disableImages: false,           // Disable image loading
        disableCSS: false,              // Disable CSS loading
        disableJavaScript: false,       // Disable JavaScript execution
        
        // Viewport and rendering
        viewportWidth: 1920,            // Browser viewport width
        viewportHeight: 1080,           // Browser viewport height
        deviceScaleFactor: 1,           // Device pixel ratio
        
        // Performance settings
        pageTimeout: 30000,             // Page load timeout (ms)
        waitForSelector: null,          // Wait for specific selector
        waitForFunction: null,          // Wait for custom function
        
        // Interaction simulation
        simulateUser: true,             // Simulate user interactions
        scrollToTriggerLazy: true,      // Scroll to trigger lazy loading
        clickInteractiveElements: false, // Click buttons/links to discover content
        hoverElements: false,           // Hover over elements
        
        // Resource handling
        blockAds: true,                 // Block advertising content
        blockTrackers: true,            // Block tracking scripts
        blockSocialMedia: false,        // Block social media widgets
        resourceInterception: true,     // Intercept and modify requests
        
        // Mobile simulation
        emulateDevice: null,            // Emulate specific device
        userAgentOverride: null,        // Override user agent
        touchEvents: false,             // Enable touch events
      },

      // === ASSET PROCESSING ===
      assets: {
        // Image processing
        optimizeImages: false,          // Optimize/compress images
        convertWebP: false,             // Convert images to WebP
        generateThumbnails: false,      // Generate image thumbnails
        maxImageDimensions: null,       // Maximum image dimensions
        
        // CSS processing
        minifyCSS: false,               // Minify CSS files
        inlineSmallCSS: false,          // Inline small CSS files
        processCSSImports: true,        // Process @import statements
        extractCSSAssets: true,         // Extract assets referenced in CSS
        
        // JavaScript processing
        minifyJS: false,                // Minify JavaScript files
        inlineSmallJS: false,           // Inline small JavaScript files
        processJSImports: true,         // Process import statements
        extractJSAssets: true,          // Extract assets referenced in JS
        
        // Font processing
        downloadFonts: true,            // Download font files
        convertFontFormats: false,      // Convert font formats
        subsetFonts: false,             // Subset fonts to used characters
        
        // 3D content processing
        download3DModels: true,         // Download 3D model files
        optimizeModels: false,          // Optimize 3D models
        extractTextures: true,          // Extract texture files
        
        // Audio/Video processing
        downloadMedia: true,            // Download audio/video files
        convertMediaFormats: false,     // Convert media formats
        extractMediaMetadata: true,     // Extract media metadata
      },

      // === CACHING SYSTEM ===
      cache: {
        // Cache behavior
        enableCaching: true,            // Enable caching system
        cacheDirectory: '.cache',       // Cache directory path
        maxCacheSize: 1024 * 1024 * 1024, // Maximum cache size (1GB)
        cacheExpiration: 86400,         // Cache expiration time (seconds)
        
        // Cache strategies
        cacheCompression: true,         // Compress cached content
        cacheIntegrityCheck: true,      // Verify cached content integrity
        aggressiveCaching: false,       // Cache everything possible
        
        // Cache sharing
        shareCacheBetweenSessions: true, // Share cache across sessions
        exportCacheArchive: false,      // Export cache as archive
        importCacheArchive: false,      // Import cache from archive
      },

      // === OUTPUT SETTINGS ===
      output: {
        // Directory structure
        outputDirectory: './output',     // Base output directory
        createDateDirectory: false,     // Create subdirectory with date
        useSessionID: true,             // Use session ID for directory
        
        // File naming
        preserveOriginalNames: true,    // Keep original filenames
        sanitizeFilenames: true,        // Sanitize filenames for filesystem
        lowercaseFilenames: false,      // Convert filenames to lowercase
        
        // HTML processing
        rewriteLinks: true,             // Rewrite links to local files
        addBaseHref: false,             // Add base href to HTML
        removeScripts: false,           // Remove JavaScript from HTML
        removeComments: false,          // Remove HTML comments
        prettifyHTML: false,            // Format HTML nicely
        
        // Archive creation
        createZipArchive: false,        // Create ZIP archive of output
        createTarArchive: false,        // Create TAR archive of output
        archiveCompression: 'gzip',     // Archive compression method
        
        // Metadata
        generateSitemap: false,         // Generate sitemap.xml
        generateManifest: true,         // Generate manifest.json
        includeSourceInfo: true,        // Include source URL info
        generateReport: true,           // Generate crawling report
      },

      // === ERROR HANDLING ===
      errorHandling: {
        // Error behavior
        continueOnError: true,          // Continue crawling on errors
        maxErrors: 100,                 // Maximum errors before stopping
        maxConsecutiveErrors: 10,       // Maximum consecutive errors
        
        // Error logging
        logErrors: true,                // Log errors to file
        errorLogPath: 'errors.log',     // Error log file path
        detailedErrorInfo: true,        // Include detailed error information
        
        // Retry strategy
        retryOnTimeout: true,           // Retry on timeout errors
        retryOn5xx: true,               // Retry on 5xx server errors
        retryOn4xx: false,              // Retry on 4xx client errors
        exponentialBackoff: true,       // Use exponential backoff for retries
        
        // Graceful degradation
        skipOnError: false,             // Skip problematic content
        useFallbackMethods: true,       // Use fallback processing methods
        savePartialContent: true,       // Save partially downloaded content
      },

      // === SECURITY SETTINGS ===
      security: {
        // Content security
        sanitizeHTML: false,            // Sanitize HTML content
        removeScriptTags: false,        // Remove script tags
        validateURLs: true,             // Validate URLs before processing
        checkFileTypes: true,           // Verify file types by content
        
        // Access control
        respectHttpAuth: true,          // Respect HTTP authentication
        followAuthenticatedLinks: false, // Follow links requiring authentication
        
        // Privacy
        removeTrackingCode: false,      // Remove tracking scripts
        removeAnalytics: false,         // Remove analytics code
        anonymizeURLs: false,           // Remove identifying URL parameters
      },

      // === ADVANCED FEATURES ===
      advanced: {
        // Processing strategies
        useHybridProcessing: true,      // Use hybrid static/dynamic processing
        preferStaticParsing: true,      // Prefer static parsing when possible
        staticParsingTimeout: 5000,     // Static parsing timeout (ms)
        dynamicProcessingTimeout: 30000, // Dynamic processing timeout (ms)
        
        // Resource discovery
        networkMonitoring: true,        // Monitor network requests
        deepLinkAnalysis: true,         // Perform deep link analysis
        contentInference: true,         // Infer content types intelligently
        
        // Build tool awareness
        detectBuildTools: true,         // Detect build tools (webpack, vite, etc.)
        optimizeForBuildTool: true,     // Optimize processing for detected tools
        extractSourceMaps: false,       // Extract and process source maps
        
        // Modern web features
        handleWebWorkers: false,        // Process web workers
        extractPWAManifest: true,       // Extract PWA manifest
        processWebAssembly: false,      // Process WebAssembly files
        
        // Machine learning
        smartContentDetection: false,   // Use ML for content detection
        learnFromUserBehavior: false,   // Learn from user interactions
        adaptiveProcessing: false,      // Adapt processing based on content
      },

      // === PERFORMANCE TUNING ===
      performance: {
        // Memory management
        maxMemoryUsage: 2048,           // Maximum memory usage (MB)
        garbageCollectionInterval: 60000, // GC interval (ms)
        
        // CPU utilization
        maxCPUUsage: 80,                // Maximum CPU usage percentage
        processingThreads: 4,           // Number of processing threads
        
        // I/O optimization
        bufferSize: 64 * 1024,          // I/O buffer size (bytes)
        writeQueueSize: 100,            // Write queue size
        
        // Monitoring
        enableProfiling: false,         // Enable performance profiling
        profileOutputPath: 'profile.json', // Profiling output path
      }
    };
  }

  /**
   * Load built-in configuration profiles
   */
  async _loadBuiltInProfiles() {
    // Fast & Lightweight Profile
    this.profiles.set('fast', this._createFastProfile());
    
    // Complete & Thorough Profile  
    this.profiles.set('complete', this._createCompleteProfile());
    
    // SPA Optimized Profile
    this.profiles.set('spa', this._createSPAProfile());
    
    // Static Sites Profile
    this.profiles.set('static', this._createStaticProfile());
    
    // Development Profile
    this.profiles.set('development', this._createDevelopmentProfile());
    
    // Production Profile
    this.profiles.set('production', this._createProductionProfile());
    
    // Security Focused Profile
    this.profiles.set('secure', this._createSecureProfile());
    
    // Mobile Optimized Profile
    this.profiles.set('mobile', this._createMobileProfile());
  }

  _createFastProfile() {
    return this._mergeConfigs(this.config, {
      general: { maxDepth: 2, maxFiles: 500 },
      network: { maxConcurrentConnections: 10, requestsPerSecond: 15 },
      browser: { headless: true, disableImages: true },
      crawling: { executeDynamicContent: false },
      assets: { optimizeImages: false, downloadFonts: false },
      cache: { aggressiveCaching: true }
    });
  }

  _createCompleteProfile() {
    return this._mergeConfigs(this.config, {
      general: { maxDepth: 5, maxFiles: 5000 },
      crawling: { 
        followExternalLinks: true, 
        parseComments: true,
        executeDynamicContent: true,
        handleSPA: true 
      },
      browser: { simulateUser: true, scrollToTriggerLazy: true },
      assets: { 
        optimizeImages: true, 
        downloadMedia: true,
        download3DModels: true 
      },
      output: { generateSitemap: true, createZipArchive: true }
    });
  }

  _createSPAProfile() {
    return this._mergeConfigs(this.config, {
      crawling: { 
        executeDynamicContent: true,
        handleSPA: true,
        discoverAPIEndpoints: true 
      },
      browser: { 
        simulateUser: true,
        scrollToTriggerLazy: true,
        pageTimeout: 60000 
      },
      advanced: { useHybridProcessing: true, networkMonitoring: true }
    });
  }

  _createStaticProfile() {
    return this._mergeConfigs(this.config, {
      crawling: { executeDynamicContent: false },
      browser: { headless: true },
      advanced: { preferStaticParsing: true, useHybridProcessing: false },
      performance: { processingThreads: 8 }
    });
  }

  _createDevelopmentProfile() {
    return this._mergeConfigs(this.config, {
      general: { verboseLogging: true, logLevel: 'debug' },
      network: { maxConcurrentConnections: 2, requestsPerSecond: 5 },
      browser: { headless: false },
      errorHandling: { detailedErrorInfo: true, logErrors: true },
      performance: { enableProfiling: true }
    });
  }

  _createProductionProfile() {
    return this._mergeConfigs(this.config, {
      general: { verboseLogging: false, logLevel: 'warn' },
      network: { maxConcurrentConnections: 8, requestsPerSecond: 12 },
      assets: { optimizeImages: true, minifyCSS: true, minifyJS: true },
      output: { createZipArchive: true, generateReport: true },
      performance: { maxMemoryUsage: 4096 }
    });
  }

  _createSecureProfile() {
    return this._mergeConfigs(this.config, {
      security: { 
        sanitizeHTML: true,
        removeTrackingCode: true,
        removeAnalytics: true,
        validateURLs: true 
      },
      browser: { blockAds: true, blockTrackers: true },
      filters: { excludeTypes: [...this.config.filters.excludeTypes, 'exe', 'msi', 'dmg'] }
    });
  }

  _createMobileProfile() {
    return this._mergeConfigs(this.config, {
      browser: { 
        viewportWidth: 375,
        viewportHeight: 667,
        touchEvents: true,
        emulateDevice: 'iPhone X' 
      },
      assets: { 
        optimizeImages: true,
        maxImageDimensions: { width: 800, height: 600 } 
      }
    });
  }

  /**
   * Configuration management methods
   */
  async loadProfile(profileName) {
    if (!this.profiles.has(profileName)) {
      throw new Error(`Profile '${profileName}' not found`);
    }
    
    this.config = { ...this.profiles.get(profileName) };
    this.activeProfile = profileName;
    
    logger.info('Configuration profile loaded', {
      component: 'ProClonerConfig',
      profile: profileName
    });
  }

  async saveProfile(profileName, config = null) {
    const configToSave = config || this.config;
    this.profiles.set(profileName, { ...configToSave });
    
    logger.info('Configuration profile saved', {
      component: 'ProClonerConfig',
      profile: profileName
    });
  }

  async loadFromFile(filePath) {
    try {
      const configData = await fs.readFile(filePath, 'utf8');
      const loadedConfig = JSON.parse(configData);
      this.config = this._mergeConfigs(this._getDefaultConfig(), loadedConfig);
      
      logger.info('Configuration loaded from file', {
        component: 'ProClonerConfig',
        filePath
      });
    } catch (error) {
      logger.error('Failed to load configuration from file', {
        component: 'ProClonerConfig',
        filePath,
        error: error.message
      });
      throw error;
    }
  }

  async saveToFile(filePath = null) {
    const targetPath = filePath || this.configPath;
    if (!targetPath) {
      throw new Error('No file path specified for saving configuration');
    }

    try {
      await fs.writeFile(targetPath, JSON.stringify(this.config, null, 2));
      
      logger.info('Configuration saved to file', {
        component: 'ProClonerConfig',
        filePath: targetPath
      });
    } catch (error) {
      logger.error('Failed to save configuration to file', {
        component: 'ProClonerConfig',
        filePath: targetPath,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Configuration access methods
   */
  get(path, defaultValue = undefined) {
    return this._getNestedValue(this.config, path, defaultValue);
  }

  set(path, value) {
    this._setNestedValue(this.config, path, value);
  }

  validate() {
    const errors = [];
    
    // Validate numeric ranges
    if (this.config.general.maxDepth < 0 || this.config.general.maxDepth > 10) {
      errors.push('maxDepth must be between 0 and 10');
    }
    
    if (this.config.network.maxConcurrentConnections < 1 || this.config.network.maxConcurrentConnections > 50) {
      errors.push('maxConcurrentConnections must be between 1 and 50');
    }
    
    // Validate file paths
    if (this.config.output.outputDirectory && !path.isAbsolute(this.config.output.outputDirectory)) {
      if (!this.config.output.outputDirectory.startsWith('.')) {
        errors.push('outputDirectory must be absolute or relative (starting with .)');
      }
    }
    
    // Validate URL patterns
    this.config.filters.urlExcludePatterns.forEach(pattern => {
      try {
        new RegExp(pattern);
      } catch (e) {
        errors.push(`Invalid URL exclude pattern: ${pattern}`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Utility methods
   */
  _mergeConfigs(base, override) {
    const result = { ...base };
    
    for (const key in override) {
      if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
        result[key] = this._mergeConfigs(result[key] || {}, override[key]);
      } else {
        result[key] = override[key];
      }
    }
    
    return result;
  }

  _getNestedValue(obj, path, defaultValue) {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current === null || current === undefined || !(key in current)) {
        return defaultValue;
      }
      current = current[key];
    }
    
    return current;
  }

  _setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  async _fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all available profiles
   */
  getProfiles() {
    return Array.from(this.profiles.keys());
  }

  /**
   * Get current configuration summary
   */
  getSummary() {
    return {
      activeProfile: this.activeProfile,
      maxDepth: this.config.general.maxDepth,
      maxFiles: this.config.general.maxFiles,
      executeDynamic: this.config.crawling.executeDynamicContent,
      maxConnections: this.config.network.maxConcurrentConnections,
      cacheEnabled: this.config.cache.enableCaching,
      outputDir: this.config.output.outputDirectory
    };
  }

  /**
   * Export configuration for sharing
   */
  exportConfig() {
    return {
      version: '2.0',
      timestamp: new Date().toISOString(),
      profile: this.activeProfile,
      config: this.config
    };
  }

  /**
   * Import configuration from export
   */
  async importConfig(exportedConfig) {
    if (exportedConfig.version !== '2.0') {
      throw new Error('Unsupported configuration version');
    }
    
    this.config = this._mergeConfigs(this._getDefaultConfig(), exportedConfig.config);
    
    logger.info('Configuration imported', {
      component: 'ProClonerConfig',
      version: exportedConfig.version,
      timestamp: exportedConfig.timestamp
    });
  }
}

module.exports = ProClonerConfig;