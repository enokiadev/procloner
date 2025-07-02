const fs = require('fs-extra');
const path = require('path');
const { URL } = require('url');
const { logger } = require('./logger');

class HtmlProcessor {
  constructor(outputDir, discoveredAssets, buildToolInfo = null) {
    this.outputDir = outputDir;
    this.discoveredAssets = discoveredAssets; // Map of original URL -> asset info
    this.baseUrl = null;
    this.buildToolInfo = buildToolInfo;
    this.pathMappingStrategy = this.determineMappingStrategy(buildToolInfo);
  }

  // Determine the optimal path mapping strategy based on build tool
  determineMappingStrategy(buildToolInfo) {
    if (!buildToolInfo) {
      return 'preserve-structure'; // Default: keep original structure
    }

    const tool = buildToolInfo.tool || 'unknown';
    const confidence = buildToolInfo.confidence || 0;

    // Only apply aggressive rewriting if we're confident about the build tool
    if (confidence > 0.8) {
      switch (tool) {
        case 'vue-cli':
          return 'vue-standard';
        case 'create-react-app':
          return 'cra-standard';
        case 'vite':
          return 'vite-standard';
        case 'webpack':
          return 'webpack-standard';
        case 'angular-cli':
          return 'angular-standard';
        default:
          return 'preserve-structure';
      }
    }

    return 'preserve-structure';
  }

  // Get the target path for an asset based on the mapping strategy
  getTargetAssetPath(originalUrl, assetType) {
    const urlObj = new URL(originalUrl);
    const originalPath = urlObj.pathname;
    
    // Extract filename
    const filename = path.basename(originalPath) || 'asset';
    
    switch (this.pathMappingStrategy) {
      case 'vue-standard':
        return this.getVueStandardPath(assetType, filename, originalPath);
      
      case 'cra-standard':
        return this.getCRAStandardPath(assetType, filename, originalPath);
      
      case 'vite-standard':
        return this.getViteStandardPath(assetType, filename, originalPath);
      
      case 'webpack-standard':
        return this.getWebpackStandardPath(assetType, filename, originalPath);
      
      case 'angular-standard':
        return this.getAngularStandardPath(assetType, filename, originalPath);
      
      default:
        return this.getPreservedStructurePath(assetType, filename, originalPath);
    }
  }

  // Vue CLI standard paths
  getVueStandardPath(assetType, filename, originalPath) {
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

  // Create React App standard paths
  getCRAStandardPath(assetType, filename, originalPath) {
    // CRA typically uses /static/ structure
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

  // Vite standard paths
  getViteStandardPath(assetType, filename, originalPath) {
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

  // Webpack standard paths
  getWebpackStandardPath(assetType, filename, originalPath) {
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

  // Angular CLI standard paths
  getAngularStandardPath(assetType, filename, originalPath) {
    if (originalPath.startsWith('/assets/')) {
      return originalPath.substring(1); // Remove leading slash, keep assets/ structure
    }
    
    return `assets/${filename}`;
  }

  // Preserve original structure (safest approach)
  getPreservedStructurePath(assetType, filename, originalPath) {
    // Remove leading slash and preserve the path structure
    let preservedPath = originalPath.startsWith('/') ? originalPath.substring(1) : originalPath;
    
    // If the path is just a filename, put it in an appropriate directory
    if (!preservedPath.includes('/')) {
      return `assets/${assetType}/${filename}`;
    }
    
    return preservedPath;
  }

  // Process HTML to rewrite asset URLs to local paths
  async processHtml(htmlContent, pageUrl) {
    try {
      this.baseUrl = new URL(pageUrl).origin;
      logger.debug('Processing HTML for asset rewriting', {
        component: 'HtmlProcessor',
        pageUrl,
        baseUrl: this.baseUrl,
        assetsToRewrite: this.discoveredAssets.size
      });

      let processedHtml = htmlContent;

      // Rewrite CSS links
      processedHtml = this.rewriteCssLinks(processedHtml);
      
      // Rewrite JavaScript sources
      processedHtml = this.rewriteJavaScriptSources(processedHtml);
      
      // Rewrite image sources
      processedHtml = this.rewriteImageSources(processedHtml);
      
      // Rewrite font sources in CSS
      processedHtml = this.rewriteFontSources(processedHtml);
      
      // Rewrite video/audio sources
      processedHtml = this.rewriteMediaSources(processedHtml);

      // Add base tag to handle relative URLs
      processedHtml = this.addBaseTag(processedHtml, pageUrl);

      // Fix SPA routing issues for cloned sites
      processedHtml = this.fixSPARouting(processedHtml, this.outputDir);

      logger.debug('HTML processing completed', {
        component: 'HtmlProcessor',
        originalLength: htmlContent.length,
        processedLength: processedHtml.length
      });

      return processedHtml;
    } catch (error) {
      logger.error('HTML processing failed', {
        component: 'HtmlProcessor',
        error: error.message,
        pageUrl
      });
      return htmlContent; // Return original if processing fails
    }
  }

  // Rewrite CSS link tags
  rewriteCssLinks(html) {
    const cssLinkRegex = /<link[^>]*href=["']([^"']+)["'][^>]*>/gi;
    
    return html.replace(cssLinkRegex, (match, href) => {
      const absoluteUrl = this.resolveUrl(href);
      const localPath = this.getLocalAssetPath(absoluteUrl);
      
      if (localPath) {
        const newMatch = match.replace(href, localPath);
        const linkType = this.isStylesheet(match) ? 'CSS link' : 'link';
        logger.debug(`Rewritten ${linkType}`, {
          component: 'HtmlProcessor',
          original: href,
          rewritten: localPath
        });
        return newMatch;
      }
      return match;
    });
  }

  // Rewrite JavaScript src attributes
  rewriteJavaScriptSources(html) {
    const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;
    
    return html.replace(scriptRegex, (match, src) => {
      const absoluteUrl = this.resolveUrl(src);
      const localPath = this.getLocalAssetPath(absoluteUrl);
      
      if (localPath) {
        const newMatch = match.replace(src, localPath);
        logger.debug('Rewritten JavaScript source', {
          component: 'HtmlProcessor',
          original: src,
          rewritten: localPath
        });
        return newMatch;
      }
      return match;
    });
  }

  // Rewrite image src attributes
  rewriteImageSources(html) {
    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
    
    return html.replace(imgRegex, (match, src) => {
      const absoluteUrl = this.resolveUrl(src);
      const localPath = this.getLocalAssetPath(absoluteUrl);
      
      if (localPath) {
        const newMatch = match.replace(src, localPath);
        logger.debug('Rewritten image source', {
          component: 'HtmlProcessor',
          original: src,
          rewritten: localPath
        });
        return newMatch;
      }
      return match;
    });
  }

  // Rewrite font sources in inline CSS and style tags
  rewriteFontSources(html) {
    // Process style tags
    const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    
    return html.replace(styleTagRegex, (match, cssContent) => {
      const processedCss = this.processCssContent(cssContent);
      return match.replace(cssContent, processedCss);
    });
  }

  // Rewrite video and audio sources
  rewriteMediaSources(html) {
    // Video sources
    const videoRegex = /<video[^>]*src=["']([^"']+)["'][^>]*>/gi;
    html = html.replace(videoRegex, (match, src) => {
      const absoluteUrl = this.resolveUrl(src);
      const localPath = this.getLocalAssetPath(absoluteUrl);
      return localPath ? match.replace(src, localPath) : match;
    });

    // Audio sources
    const audioRegex = /<audio[^>]*src=["']([^"']+)["'][^>]*>/gi;
    html = html.replace(audioRegex, (match, src) => {
      const absoluteUrl = this.resolveUrl(src);
      const localPath = this.getLocalAssetPath(absoluteUrl);
      return localPath ? match.replace(src, localPath) : match;
    });

    // Source tags within video/audio
    const sourceRegex = /<source[^>]*src=["']([^"']+)["'][^>]*>/gi;
    html = html.replace(sourceRegex, (match, src) => {
      const absoluteUrl = this.resolveUrl(src);
      const localPath = this.getLocalAssetPath(absoluteUrl);
      return localPath ? match.replace(src, localPath) : match;
    });

    return html;
  }

  // Process CSS content to rewrite url() references and @import statements
  processCssContent(cssContent, cssFilePath = null) {
    let processedCss = cssContent;

    // Process @import statements first
    const importRegex = /@import\s+(?:url\()?["']?([^"')]+)["']?(?:\))?[^;]*;/gi;
    processedCss = processedCss.replace(importRegex, (match, url) => {
      const absoluteUrl = this.resolveUrl(url);
      const localPath = this.getLocalAssetPath(absoluteUrl, cssFilePath);
      
      if (localPath) {
        logger.debug('Rewritten CSS @import statement', {
          component: 'HtmlProcessor',
          original: url,
          rewritten: localPath
        });
        return match.replace(url, localPath);
      }
      return match;
    });

    // Match url() references in CSS
    const urlRegex = /url\(["']?([^"')]+)["']?\)/gi;
    processedCss = processedCss.replace(urlRegex, (match, url) => {
      const absoluteUrl = this.resolveUrl(url);
      const localPath = this.getLocalAssetPath(absoluteUrl, cssFilePath);
      
      if (localPath) {
        logger.debug('Rewritten CSS url() reference', {
          component: 'HtmlProcessor',
          original: url,
          rewritten: localPath
        });
        return `url('${localPath}')`;
      }
      return match;
    });

    return processedCss;
  }

  // Check if a link tag is for a stylesheet
  isStylesheet(linkTag) {
    return linkTag.includes('rel="stylesheet"') || 
           linkTag.includes("rel='stylesheet'") ||
           linkTag.includes('type="text/css"') ||
           linkTag.includes("type='text/css'");
  }

  // Resolve relative URLs to absolute URLs
  resolveUrl(url) {
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      if (url.startsWith('//')) {
        return `https:${url}`;
      }
      if (url.startsWith('/')) {
        return `${this.baseUrl}${url}`;
      }
      return new URL(url, this.baseUrl).href;
    } catch (error) {
      logger.debug('URL resolution failed', {
        component: 'HtmlProcessor',
        url,
        baseUrl: this.baseUrl,
        error: error.message
      });
      return url;
    }
  }

  // Get local path for an asset if it was downloaded
  getLocalAssetPath(absoluteUrl, fromFilePath = null) {
    const asset = this.discoveredAssets.get(absoluteUrl);
    
    if (asset && asset.downloaded && asset.localPath) {
      // Use intelligent path mapping to determine the expected path
      const expectedPath = this.getTargetAssetPath(absoluteUrl, asset.type);
      
      // If we're processing a CSS file, calculate path relative to that CSS file
      if (fromFilePath) {
        const fromDir = path.dirname(fromFilePath);
        const targetPath = path.join(this.outputDir, expectedPath);
        const relativePath = path.relative(fromDir, targetPath);
        // Ensure forward slashes for web paths
        return relativePath.replace(/\\/g, '/');
      }
      
      // Return the expected path (relative to output directory)
      return expectedPath.replace(/\\/g, '/');
    }
    
    return null;
  }

  // Add base tag to help with relative URLs
  addBaseTag(html, pageUrl) {
    try {
      const headRegex = /<head[^>]*>/i;
      
      if (headRegex.test(html) && !html.includes('<base')) {
        return html.replace(headRegex, (match) => {
          return `${match}\n  <base href="./">`;
        });
      }
    } catch (error) {
      logger.debug('Failed to add base tag', {
        component: 'HtmlProcessor',
        error: error.message,
        pageUrl
      });
    }
    
    return html;
  }

  // Process and save downloaded CSS files to rewrite their internal URLs
  async processCssFiles() {
    try {
      const cssAssets = Array.from(this.discoveredAssets.values())
        .filter(asset => asset.type === 'stylesheet' && asset.downloaded && asset.localPath);

      logger.info('Processing CSS files for URL rewriting', {
        component: 'HtmlProcessor',
        cssFileCount: cssAssets.length
      });

      for (const cssAsset of cssAssets) {
        await this.processCssFile(cssAsset);
      }

      // Discover additional CSS assets from processed files
      await this.discoverCssImports();
    } catch (error) {
      logger.error('CSS file processing failed', {
        component: 'HtmlProcessor',
        error: error.message
      });
    }
  }

  // Discover @import statements in downloaded CSS files
  async discoverCssImports() {
    try {
      const cssAssets = Array.from(this.discoveredAssets.values())
        .filter(asset => asset.type === 'stylesheet' && asset.downloaded && asset.localPath);

      const newAssets = [];

      for (const cssAsset of cssAssets) {
        try {
          if (await fs.pathExists(cssAsset.localPath)) {
            const cssContent = await fs.readFile(cssAsset.localPath, 'utf8');
            
            // Find @import statements
            const importMatches = cssContent.match(/@import\s+(?:url\()?['"]?([^'")]+)['"]?(?:\))?[^;]*;/g);
            if (importMatches) {
              importMatches.forEach(match => {
                const urlMatch = match.match(/@import\s+(?:url\()?['"]?([^'")]+)['"]?(?:\))?/);
                if (urlMatch && urlMatch[1]) {
                  const importUrl = this.resolveUrl(urlMatch[1]);
                  
                  if (!this.discoveredAssets.has(importUrl)) {
                    newAssets.push({
                      url: importUrl,
                      type: 'stylesheet',
                      contentType: 'text/css',
                      size: 0,
                      discoveredAt: new Date(),
                      source: 'css_import_file'
                    });
                  }
                }
              });
            }

            // Find url() references for additional assets
            const urlMatches = cssContent.match(/url\(['"]?([^'")]+)['"]?\)/g);
            if (urlMatches) {
              urlMatches.forEach(match => {
                const urlMatch = match.match(/url\(['"]?([^'")]+)['"]?\)/);
                if (urlMatch && urlMatch[1]) {
                  const assetUrl = this.resolveUrl(urlMatch[1]);
                  
                  if (!this.discoveredAssets.has(assetUrl)) {
                    // Determine asset type based on URL
                    const assetType = this.determineAssetTypeFromUrl(assetUrl);
                    
                    newAssets.push({
                      url: assetUrl,
                      type: assetType,
                      contentType: '',
                      size: 0,
                      discoveredAt: new Date(),
                      source: 'css_url_reference'
                    });
                  }
                }
              });
            }
          }
        } catch (error) {
          logger.debug('Error processing CSS file for imports', {
            component: 'HtmlProcessor',
            cssFile: cssAsset.localPath,
            error: error.message
          });
        }
      }

      // Add newly discovered assets
      newAssets.forEach(asset => {
        this.discoveredAssets.set(asset.url, asset);
      });

      if (newAssets.length > 0) {
        logger.info('Discovered additional assets from CSS files', {
          component: 'HtmlProcessor',
          newAssets: newAssets.length,
          stylesheets: newAssets.filter(a => a.type === 'stylesheet').length,
          fonts: newAssets.filter(a => a.type === 'font').length,
          images: newAssets.filter(a => a.type === 'image').length
        });
      }
    } catch (error) {
      logger.error('CSS import discovery failed', {
        component: 'HtmlProcessor',
        error: error.message
      });
    }
  }

  // Determine asset type from URL
  determineAssetTypeFromUrl(url) {
    const urlLower = url.toLowerCase();
    
    if (urlLower.match(/\.(woff|woff2|ttf|otf|eot)$/)) return 'font';
    if (urlLower.match(/\.(css)$/)) return 'stylesheet';
    if (urlLower.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) return 'image';
    if (urlLower.match(/\.(js)$/)) return 'javascript';
    
    return 'other';
  }

  // Process individual CSS file
  async processCssFile(cssAsset) {
    try {
      if (!await fs.pathExists(cssAsset.localPath)) {
        logger.warn('CSS file not found for processing', {
          component: 'HtmlProcessor',
          localPath: cssAsset.localPath,
          originalUrl: cssAsset.url
        });
        return;
      }

      const cssContent = await fs.readFile(cssAsset.localPath, 'utf8');
      const processedCss = this.processCssContent(cssContent, cssAsset.localPath);

      if (processedCss !== cssContent) {
        await fs.writeFile(cssAsset.localPath, processedCss);
        logger.debug('CSS file processed and updated', {
          component: 'HtmlProcessor',
          localPath: cssAsset.localPath,
          originalSize: cssContent.length,
          processedSize: processedCss.length
        });
      }
    } catch (error) {
      logger.error('Failed to process CSS file', {
        component: 'HtmlProcessor',
        cssAsset: cssAsset.url,
        localPath: cssAsset.localPath,
        error: error.message
      });
    }
  }

  // Fix SPA routing issues for cloned sites
  fixSPARouting(html, baseDir) {
    try {
      // Convert Vue.js router links to static file references
      const routeMap = {
        '/tulpen': '_tulpen.html',
        '/moontime': '_moontime.html', 
        '/pridelands': '_pridelands.html',
        '/cvletter': '_cvletter.html'
      };

      let processedHtml = html;

      // Fix router-link href attributes
      Object.entries(routeMap).forEach(([route, file]) => {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(baseDir, file);
        
        // Only replace if the static file exists
        if (fs.existsSync(filePath)) {
          // Replace both regular links and router-link hrefs
          const routeRegex = new RegExp(`href="${route}"`, 'g');
          const routeRegexAlt = new RegExp(`href='${route}'`, 'g');
          processedHtml = processedHtml.replace(routeRegex, `href="${file}"`);
          processedHtml = processedHtml.replace(routeRegexAlt, `href="${file}"`);
        }
      });

      // Fix anchor links to use proper fragments
      processedHtml = processedHtml.replace(/href="\/\#([^"]+)"/g, 'href="#$1"');
      processedHtml = processedHtml.replace(/href='\/\#([^']+)'/g, "href='#$1'");

      // Remove router-link-active classes that might cause issues
      processedHtml = processedHtml.replace(/\s*router-link-active\s*/g, ' ');
      processedHtml = processedHtml.replace(/\s*router-link-exact-active\s*/g, ' ');

      return processedHtml;
    } catch (error) {
      this.logger.warn('SPA routing fix error', { error: error.message });
      return html;
    }
  }
}

module.exports = HtmlProcessor;