/**
 * Advanced Caching System - HTTrack Style
 * ZIP-based persistent storage with checksums and incremental updates
 * Implements HTTrack's proven caching strategies for maximum efficiency
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const archiver = require('archiver');
const extract = require('extract-zip');

class CacheManager {
  constructor(options = {}) {
    this.options = {
      cacheDir: options.cacheDir || path.join(process.cwd(), '.cache'),
      maxCacheSize: options.maxCacheSize || 1024 * 1024 * 1024, // 1GB default
      compressionLevel: options.compressionLevel || 6,
      checksumAlgorithm: options.checksumAlgorithm || 'sha256',
      indexFile: options.indexFile || 'cache.index',
      manifestFile: options.manifestFile || 'cache.manifest',
      retentionDays: options.retentionDays || 30,
      enableCompression: options.enableCompression !== false,
      enableIntegrityCheck: options.enableIntegrityCheck !== false,
      ...options
    };

    // Cache index - stores metadata about cached items
    this.cacheIndex = new Map();
    this.manifestData = {};
    this.isInitialized = false;
    
    // Performance counters
    this.stats = {
      hits: 0,
      misses: 0,
      saves: 0,
      errors: 0,
      totalSize: 0,
      lastCleanup: Date.now()
    };
  }

  /**
   * Initialize cache system - create directories and load existing cache
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Ensure cache directory exists
      await fs.mkdir(this.options.cacheDir, { recursive: true });
      
      // Load existing cache index
      await this._loadCacheIndex();
      await this._loadManifest();
      
      // Verify cache integrity
      if (this.options.enableIntegrityCheck) {
        await this._verifyIntegrity();
      }
      
      // Clean up old entries
      await this._performMaintenance();
      
      this.isInitialized = true;
      console.log(`Cache initialized: ${this.cacheIndex.size} entries, ${this._formatSize(this.stats.totalSize)}`);
    } catch (error) {
      console.error('Cache initialization failed:', error);
      throw error;
    }
  }

  /**
   * Generate cache key from URL (HTTrack-style)
   */
  _generateCacheKey(url, options = {}) {
    // Normalize URL for consistent caching
    const normalizedUrl = this._normalizeUrl(url);
    
    // Include relevant options in key
    const keyData = {
      url: normalizedUrl,
      userAgent: options.userAgent || 'default',
      headers: options.headers || {},
      timestamp: options.ignoreCache ? Date.now() : undefined
    };
    
    const keyString = JSON.stringify(keyData);
    return crypto.createHash('md5').update(keyString).digest('hex');
  }

  /**
   * Get cached resource
   */
  async get(url, options = {}) {
    if (!this.isInitialized) await this.initialize();

    const cacheKey = this._generateCacheKey(url, options);
    const cacheEntry = this.cacheIndex.get(cacheKey);

    if (!cacheEntry) {
      this.stats.misses++;
      return null;
    }

    // Check if cache entry is expired
    if (this._isExpired(cacheEntry, options)) {
      await this._removeEntry(cacheKey);
      this.stats.misses++;
      return null;
    }

    try {
      // Load cached data
      const cachedData = await this._loadCachedData(cacheEntry);
      
      // Verify integrity if enabled
      if (this.options.enableIntegrityCheck && !this._verifyChecksum(cachedData, cacheEntry.checksum)) {
        console.warn(`Cache integrity check failed for ${url}`);
        await this._removeEntry(cacheKey);
        this.stats.errors++;
        return null;
      }

      // Update access time
      cacheEntry.lastAccessed = Date.now();
      await this._updateCacheIndex();

      this.stats.hits++;
      return {
        data: cachedData.content,
        metadata: cachedData.metadata,
        headers: cacheEntry.headers,
        timestamp: cacheEntry.timestamp,
        url: cacheEntry.originalUrl
      };
    } catch (error) {
      console.error(`Failed to load cached data for ${url}:`, error);
      await this._removeEntry(cacheKey);
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Store resource in cache
   */
  async set(url, data, metadata = {}, options = {}) {
    if (!this.isInitialized) await this.initialize();

    const cacheKey = this._generateCacheKey(url, options);
    
    try {
      // Prepare cache entry
      const cacheEntry = {
        key: cacheKey,
        originalUrl: url,
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        size: Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data),
        checksum: this._calculateChecksum(data),
        headers: options.headers || {},
        metadata: metadata,
        compressed: this.options.enableCompression,
        ttl: options.ttl || (24 * 60 * 60 * 1000) // 24 hours default
      };

      // Check cache size limits
      if (this.stats.totalSize + cacheEntry.size > this.options.maxCacheSize) {
        await this._evictLeastRecentlyUsed(cacheEntry.size);
      }

      // Store the data
      await this._storeCachedData(cacheEntry, data, metadata);
      
      // Update index
      this.cacheIndex.set(cacheKey, cacheEntry);
      this.stats.totalSize += cacheEntry.size;
      this.stats.saves++;

      // Persist index
      await this._updateCacheIndex();

      return cacheKey;
    } catch (error) {
      console.error(`Failed to cache ${url}:`, error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Create ZIP-based cache archive (HTTrack-style)
   */
  async createArchive(sessionId, outputPath) {
    if (!this.isInitialized) await this.initialize();

    const archive = archiver('zip', {
      zlib: { level: this.options.compressionLevel }
    });

    const output = require('fs').createWriteStream(outputPath);
    archive.pipe(output);

    // Add cache entries to archive
    for (const [cacheKey, entry] of this.cacheIndex) {
      try {
        const cachedData = await this._loadCachedData(entry);
        const fileName = `${entry.originalUrl.replace(/[^a-zA-Z0-9]/g, '_')}.cache`;
        
        archive.append(JSON.stringify({
          url: entry.originalUrl,
          headers: entry.headers,
          metadata: entry.metadata,
          timestamp: entry.timestamp,
          content: cachedData.content.toString('base64')
        }), { name: fileName });
      } catch (error) {
        console.warn(`Failed to add ${entry.originalUrl} to archive:`, error);
      }
    }

    // Add manifest
    archive.append(JSON.stringify(this.manifestData), { name: 'manifest.json' });

    await archive.finalize();
    return outputPath;
  }

  /**
   * Load cache from ZIP archive
   */
  async loadFromArchive(archivePath) {
    if (!this.isInitialized) await this.initialize();

    const tempDir = path.join(this.options.cacheDir, 'temp_extract');
    
    try {
      await extract(archivePath, { dir: tempDir });
      
      const files = await fs.readdir(tempDir);
      
      for (const file of files) {
        if (file.endsWith('.cache')) {
          const filePath = path.join(tempDir, file);
          const cacheData = JSON.parse(await fs.readFile(filePath, 'utf8'));
          
          const content = Buffer.from(cacheData.content, 'base64');
          await this.set(cacheData.url, content, cacheData.metadata, {
            headers: cacheData.headers,
            timestamp: cacheData.timestamp
          });
        }
      }

      // Clean up temp directory
      await fs.rmdir(tempDir, { recursive: true });
      
      console.log(`Loaded cache from archive: ${files.length} entries`);
    } catch (error) {
      console.error('Failed to load cache from archive:', error);
      throw error;
    }
  }

  /**
   * Store cached data with compression
   */
  async _storeCachedData(cacheEntry, data, metadata) {
    const dataPath = path.join(this.options.cacheDir, `${cacheEntry.key}.data`);
    const metaPath = path.join(this.options.cacheDir, `${cacheEntry.key}.meta`);

    // Prepare data for storage
    let contentToStore = Buffer.isBuffer(data) ? data : Buffer.from(data);
    
    if (this.options.enableCompression) {
      contentToStore = await promisify(zlib.gzip)(contentToStore);
    }

    // Store content and metadata
    await fs.writeFile(dataPath, contentToStore);
    await fs.writeFile(metaPath, JSON.stringify({
      metadata,
      originalSize: Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data),
      compressed: this.options.enableCompression
    }));

    cacheEntry.dataPath = dataPath;
    cacheEntry.metaPath = metaPath;
  }

  /**
   * Load cached data with decompression
   */
  async _loadCachedData(cacheEntry) {
    const content = await fs.readFile(cacheEntry.dataPath);
    const metaData = JSON.parse(await fs.readFile(cacheEntry.metaPath, 'utf8'));

    let decompressedContent = content;
    if (metaData.compressed) {
      decompressedContent = await promisify(zlib.gunzip)(content);
    }

    return {
      content: decompressedContent,
      metadata: metaData.metadata
    };
  }

  /**
   * Calculate checksum for integrity verification
   */
  _calculateChecksum(data) {
    return crypto.createHash(this.options.checksumAlgorithm)
      .update(Buffer.isBuffer(data) ? data : Buffer.from(data))
      .digest('hex');
  }

  /**
   * Verify data integrity
   */
  _verifyChecksum(data, expectedChecksum) {
    const actualChecksum = this._calculateChecksum(data.content);
    return actualChecksum === expectedChecksum;
  }

  /**
   * Check if cache entry is expired
   */
  _isExpired(cacheEntry, options) {
    if (options.ignoreCache) return true;
    if (options.maxAge && (Date.now() - cacheEntry.timestamp) > options.maxAge) return true;
    if (cacheEntry.ttl && (Date.now() - cacheEntry.timestamp) > cacheEntry.ttl) return true;
    return false;
  }

  /**
   * Evict least recently used entries
   */
  async _evictLeastRecentlyUsed(requiredSpace) {
    const entries = Array.from(this.cacheIndex.values())
      .sort((a, b) => a.lastAccessed - b.lastAccessed);

    let freedSpace = 0;
    for (const entry of entries) {
      if (freedSpace >= requiredSpace) break;
      
      await this._removeEntry(entry.key);
      freedSpace += entry.size;
    }
  }

  /**
   * Remove cache entry
   */
  async _removeEntry(cacheKey) {
    const entry = this.cacheIndex.get(cacheKey);
    if (!entry) return;

    try {
      // Remove files
      if (entry.dataPath) await fs.unlink(entry.dataPath).catch(() => {});
      if (entry.metaPath) await fs.unlink(entry.metaPath).catch(() => {});

      // Update stats
      this.stats.totalSize -= entry.size;
      
      // Remove from index
      this.cacheIndex.delete(cacheKey);
    } catch (error) {
      console.warn(`Failed to remove cache entry ${cacheKey}:`, error);
    }
  }

  /**
   * Load cache index from disk
   */
  async _loadCacheIndex() {
    const indexPath = path.join(this.options.cacheDir, this.options.indexFile);
    
    try {
      const indexData = await fs.readFile(indexPath, 'utf8');
      const parsedIndex = JSON.parse(indexData);
      
      this.cacheIndex = new Map(parsedIndex.entries || []);
      this.stats = { ...this.stats, ...parsedIndex.stats };
      
      console.log(`Loaded cache index: ${this.cacheIndex.size} entries`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to load cache index:', error);
      }
    }
  }

  /**
   * Save cache index to disk
   */
  async _updateCacheIndex() {
    const indexPath = path.join(this.options.cacheDir, this.options.indexFile);
    
    const indexData = {
      version: '1.0',
      timestamp: Date.now(),
      entries: Array.from(this.cacheIndex.entries()),
      stats: this.stats
    };

    await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2));
  }

  /**
   * Load manifest data
   */
  async _loadManifest() {
    const manifestPath = path.join(this.options.cacheDir, this.options.manifestFile);
    
    try {
      const manifestData = await fs.readFile(manifestPath, 'utf8');
      this.manifestData = JSON.parse(manifestData);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to load manifest:', error);
      }
    }
  }

  /**
   * Verify cache integrity
   */
  async _verifyIntegrity() {
    let corruptedEntries = 0;
    
    for (const [cacheKey, entry] of this.cacheIndex) {
      try {
        const cachedData = await this._loadCachedData(entry);
        if (!this._verifyChecksum(cachedData, entry.checksum)) {
          await this._removeEntry(cacheKey);
          corruptedEntries++;
        }
      } catch (error) {
        await this._removeEntry(cacheKey);
        corruptedEntries++;
      }
    }

    if (corruptedEntries > 0) {
      console.warn(`Removed ${corruptedEntries} corrupted cache entries`);
      await this._updateCacheIndex();
    }
  }

  /**
   * Perform cache maintenance
   */
  async _performMaintenance() {
    const now = Date.now();
    const retentionTime = this.options.retentionDays * 24 * 60 * 60 * 1000;
    
    // Remove expired entries
    let removedCount = 0;
    for (const [cacheKey, entry] of this.cacheIndex) {
      if (now - entry.timestamp > retentionTime) {
        await this._removeEntry(cacheKey);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`Cache maintenance: removed ${removedCount} expired entries`);
      await this._updateCacheIndex();
    }

    this.stats.lastCleanup = now;
  }

  /**
   * Normalize URL for consistent caching
   */
  _normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Remove fragment
      urlObj.hash = '';
      
      // Sort query parameters for consistency
      urlObj.searchParams.sort();
      
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  /**
   * Format byte size for display
   */
  _formatSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      entryCount: this.cacheIndex.size,
      totalSizeFormatted: this._formatSize(this.stats.totalSize)
    };
  }

  /**
   * Clear entire cache
   */
  async clearCache() {
    for (const cacheKey of this.cacheIndex.keys()) {
      await this._removeEntry(cacheKey);
    }
    
    await this._updateCacheIndex();
    console.log('Cache cleared');
  }

  /**
   * Cleanup and close cache
   */
  async close() {
    if (this.isInitialized) {
      await this._updateCacheIndex();
      await this._performMaintenance();
    }
  }
}

module.exports = CacheManager;