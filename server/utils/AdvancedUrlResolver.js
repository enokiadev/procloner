/**
 * Advanced URL Resolution System
 * Based on HTTrack's battle-tested URL resolution algorithms
 * Handles complex edge cases accumulated over 20+ years of development
 */

const { URL } = require('url');
const path = require('path');

class AdvancedUrlResolver {
  constructor(options = {}) {
    this.options = {
      // HTTrack-style configuration options
      normalizeCase: options.normalizeCase || false,
      preserveQuery: options.preserveQuery !== false,
      preserveFragment: options.preserveFragment || false,
      maxRedirectionDepth: options.maxRedirectionDepth || 5,
      defaultPorts: { http: 80, https: 443, ftp: 21 },
      ...options
    };
    
    // Track base href contexts for complex nested resolution
    this.baseHrefStack = [];
    this.resolvedCache = new Map();
  }

  /**
   * Main URL resolution function - Port of HTTrack's ident_url_relatif()
   * @param {string} sourceUrl - The URL of the page containing the link
   * @param {string} baseUrl - The base URL (from <base> tag or document URL)
   * @param {string} linkUrl - The link to resolve
   * @param {Object} context - Additional resolution context
   * @returns {string} - Fully resolved absolute URL
   */
  resolveUrl(sourceUrl, baseUrl, linkUrl, context = {}) {
    try {
      // Create cache key for performance
      const cacheKey = `${sourceUrl}|${baseUrl}|${linkUrl}`;
      if (this.resolvedCache.has(cacheKey)) {
        return this.resolvedCache.get(cacheKey);
      }

      let resolvedUrl = this._performResolution(sourceUrl, baseUrl, linkUrl, context);
      
      // Apply HTTrack-style normalizations
      resolvedUrl = this._normalizeUrl(resolvedUrl);
      
      // Cache the result
      this.resolvedCache.set(cacheKey, resolvedUrl);
      
      return resolvedUrl;
    } catch (error) {
      console.warn(`URL resolution failed for ${linkUrl}:`, error.message);
      return linkUrl; // Fallback to original URL
    }
  }

  /**
   * Core resolution logic - handles complex path resolution
   */
  _performResolution(sourceUrl, baseUrl, linkUrl, context) {
    // Handle empty or whitespace-only URLs
    if (!linkUrl || typeof linkUrl !== 'string' || !linkUrl.trim()) {
      return baseUrl || sourceUrl;
    }

    linkUrl = linkUrl.trim();

    // Handle data URLs, javascript: URLs, and other special schemes
    if (this._isSpecialScheme(linkUrl)) {
      return linkUrl;
    }

    // Handle protocol-relative URLs (//example.com/path)
    if (linkUrl.startsWith('//')) {
      const sourceProtocol = new URL(sourceUrl).protocol;
      return `${sourceProtocol}${linkUrl}`;
    }

    // Handle absolute URLs
    if (this._isAbsoluteUrl(linkUrl)) {
      return linkUrl;
    }

    // Determine the effective base URL
    const effectiveBase = this._determineEffectiveBase(sourceUrl, baseUrl, context);
    
    // Handle different types of relative URLs
    if (linkUrl.startsWith('/')) {
      // Root-relative URL
      return this._resolveRootRelative(effectiveBase, linkUrl);
    } else if (linkUrl.startsWith('?')) {
      // Query-only URL
      return this._resolveQueryOnly(effectiveBase, linkUrl);
    } else if (linkUrl.startsWith('#')) {
      // Fragment-only URL
      return this._resolveFragmentOnly(effectiveBase, linkUrl);
    } else {
      // Path-relative URL (the complex case)
      return this._resolvePathRelative(effectiveBase, linkUrl);
    }
  }

  /**
   * HTTrack-style path relative resolution with full ../ handling
   */
  _resolvePathRelative(baseUrl, relativePath) {
    const base = new URL(baseUrl);
    
    // Split the relative path into components
    const pathParts = relativePath.split('/');
    const baseParts = base.pathname.split('/').filter(part => part !== '');
    
    // Remove the filename from base path (keep directory only)
    if (baseParts.length > 0 && !base.pathname.endsWith('/')) {
      baseParts.pop();
    }

    // Process each part of the relative path
    for (const part of pathParts) {
      if (part === '' || part === '.') {
        continue; // Skip empty and current directory references
      } else if (part === '..') {
        if (baseParts.length > 0) {
          baseParts.pop(); // Go up one directory
        }
        // Note: HTTrack behavior - going above root stays at root
      } else {
        baseParts.push(part);
      }
    }

    // Reconstruct the URL
    base.pathname = '/' + baseParts.join('/');
    
    // Handle query and fragment from relative URL
    const queryIndex = relativePath.indexOf('?');
    const fragmentIndex = relativePath.indexOf('#');
    
    if (queryIndex !== -1) {
      const queryPart = fragmentIndex !== -1 && fragmentIndex > queryIndex 
        ? relativePath.substring(queryIndex, fragmentIndex)
        : relativePath.substring(queryIndex);
      base.search = queryPart.substring(1); // Remove the '?'
    }
    
    if (fragmentIndex !== -1) {
      base.hash = relativePath.substring(fragmentIndex);
    }

    return base.toString();
  }

  /**
   * Resolve root-relative URLs (/path/to/resource)
   */
  _resolveRootRelative(baseUrl, rootRelativePath) {
    const base = new URL(baseUrl);
    const url = new URL(rootRelativePath, `${base.protocol}//${base.host}`);
    return url.toString();
  }

  /**
   * Resolve query-only URLs (?param=value)
   */
  _resolveQueryOnly(baseUrl, queryString) {
    const base = new URL(baseUrl);
    base.search = queryString.substring(1); // Remove the '?'
    if (!this.options.preserveFragment) {
      base.hash = '';
    }
    return base.toString();
  }

  /**
   * Resolve fragment-only URLs (#section)
   */
  _resolveFragmentOnly(baseUrl, fragment) {
    if (!this.options.preserveFragment) {
      return baseUrl; // Return base without fragment
    }
    const base = new URL(baseUrl);
    base.hash = fragment;
    return base.toString();
  }

  /**
   * Determine the effective base URL considering <base> tags and context
   */
  _determineEffectiveBase(sourceUrl, baseUrl, context) {
    // Priority: explicit baseUrl > base href stack > source URL
    if (baseUrl && baseUrl !== sourceUrl) {
      return baseUrl;
    }
    
    if (this.baseHrefStack.length > 0) {
      return this.baseHrefStack[this.baseHrefStack.length - 1];
    }
    
    return sourceUrl;
  }

  /**
   * HTTrack-style URL normalization
   */
  _normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Remove default ports (HTTrack behavior)
      const defaultPort = this.options.defaultPorts[urlObj.protocol.slice(0, -1)];
      if (urlObj.port && parseInt(urlObj.port) === defaultPort) {
        urlObj.port = '';
      }

      // Normalize hostname case
      if (this.options.normalizeCase) {
        urlObj.hostname = urlObj.hostname.toLowerCase();
      }

      // Handle trailing slash normalization
      if (urlObj.pathname === '') {
        urlObj.pathname = '/';
      }

      // Remove fragment if not preserving
      if (!this.options.preserveFragment) {
        urlObj.hash = '';
      }

      // Remove query if not preserving
      if (!this.options.preserveQuery) {
        urlObj.search = '';
      }

      return urlObj.toString();
    } catch (error) {
      return url; // Return original if normalization fails
    }
  }

  /**
   * Check if URL uses a special scheme
   */
  _isSpecialScheme(url) {
    const specialSchemes = [
      'data:', 'javascript:', 'mailto:', 'tel:', 'sms:', 'file:', 
      'ftp:', 'ftps:', 'blob:', 'about:', 'chrome:', 'moz-extension:', 
      'webkit:', 'ms-browser-extension:'
    ];
    
    const lowerUrl = url.toLowerCase();
    return specialSchemes.some(scheme => lowerUrl.startsWith(scheme));
  }

  /**
   * Check if URL is absolute
   */
  _isAbsoluteUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Manage base href stack for nested contexts
   */
  pushBaseHref(baseHref) {
    if (baseHref && typeof baseHref === 'string') {
      this.baseHrefStack.push(baseHref.trim());
    }
  }

  popBaseHref() {
    return this.baseHrefStack.pop();
  }

  clearBaseHrefStack() {
    this.baseHrefStack = [];
  }

  /**
   * Batch resolve multiple URLs for performance
   */
  resolveUrls(sourceUrl, baseUrl, links, context = {}) {
    return links.map(link => ({
      original: link,
      resolved: this.resolveUrl(sourceUrl, baseUrl, link, context)
    }));
  }

  /**
   * Get resolution statistics
   */
  getStats() {
    return {
      cacheSize: this.resolvedCache.size,
      baseHrefStackDepth: this.baseHrefStack.length,
      cacheHitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0
    };
  }

  /**
   * Clear resolution cache
   */
  clearCache() {
    this.resolvedCache.clear();
  }

  /**
   * HTTrack-style URL comparison (handles case sensitivity, trailing slashes, etc.)
   */
  urlsEqual(url1, url2) {
    if (!url1 || !url2) return false;
    
    const normalized1 = this._normalizeUrl(url1);
    const normalized2 = this._normalizeUrl(url2);
    
    return normalized1 === normalized2;
  }

  /**
   * Extract domain from URL (HTTrack-style)
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  /**
   * Check if URL is within the same domain
   */
  isSameDomain(url1, url2) {
    const domain1 = this.extractDomain(url1);
    const domain2 = this.extractDomain(url2);
    return domain1 && domain2 && domain1 === domain2;
  }

  /**
   * Generate local file path from URL (HTTrack-style)
   */
  urlToLocalPath(url, basePath = '') {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      
      // Handle directory index files
      if (pathname.endsWith('/')) {
        pathname += 'index.html';
      }
      
      // Replace unsafe characters for filesystem
      pathname = pathname.replace(/[<>:"|?*]/g, '_');
      
      // Combine with base path
      return path.join(basePath, urlObj.hostname, pathname);
    } catch {
      return path.join(basePath, 'invalid-url.html');
    }
  }
}

module.exports = AdvancedUrlResolver;