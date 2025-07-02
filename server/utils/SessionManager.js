/**
 * Session Management System with Resume Capability
 * HTTrack-style session persistence and recovery
 * Allows interrupted crawling sessions to be resumed seamlessly
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { logger } = require('./logger');

class SessionManager {
  constructor(options = {}) {
    this.options = {
      sessionDir: options.sessionDir || path.join(process.cwd(), '.sessions'),
      autoSave: options.autoSave !== false,
      autoSaveInterval: options.autoSaveInterval || 30000, // 30 seconds
      maxSessions: options.maxSessions || 100,
      sessionExpiration: options.sessionExpiration || 7 * 24 * 60 * 60 * 1000, // 7 days
      compressionEnabled: options.compressionEnabled !== false,
      ...options
    };

    this.currentSession = null;
    this.autoSaveTimer = null;
    this.sessionData = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize session management system
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Ensure session directory exists
      await fs.mkdir(this.options.sessionDir, { recursive: true });
      
      // Clean up old sessions
      await this._cleanupExpiredSessions();
      
      this.isInitialized = true;
      
      logger.info('Session manager initialized', {
        component: 'SessionManager',
        sessionDir: this.options.sessionDir
      });
    } catch (error) {
      logger.error('Failed to initialize session manager', {
        component: 'SessionManager',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create a new crawling session
   */
  async createSession(url, options = {}) {
    await this.initialize();

    const sessionId = this._generateSessionId(url);
    const sessionData = {
      id: sessionId,
      url: url,
      startTime: Date.now(),
      lastSaved: Date.now(),
      status: 'created',
      options: options,
      
      // Crawling state
      visitedUrls: new Set(),
      discoveredAssets: new Map(),
      downloadedAssets: new Map(),
      failedAssets: new Map(),
      queuedUrls: [],
      
      // Progress tracking
      stats: {
        totalUrls: 0,
        processedUrls: 0,
        totalAssets: 0,
        downloadedAssets: 0,
        failedAssets: 0,
        bytesDownloaded: 0,
        errorsEncountered: 0
      },
      
      // Browser state
      cookies: [],
      localStorage: {},
      sessionStorage: {},
      
      // Configuration snapshot
      configSnapshot: options.config || {},
      
      // Error log
      errors: [],
      
      // Resume points
      resumePoints: [],
      lastResumePoint: null,
      
      // Metadata
      userAgent: options.userAgent || 'ProCloner/2.0',
      originalIP: options.originalIP || null,
      version: '2.0'
    };

    this.currentSession = sessionData;
    this.sessionData.set(sessionId, sessionData);

    // Start auto-save if enabled
    if (this.options.autoSave) {
      this._startAutoSave();
    }

    // Save initial session
    await this.saveSession(sessionId);

    logger.info('New crawling session created', {
      component: 'SessionManager',
      sessionId,
      url
    });

    return sessionId;
  }

  /**
   * Resume an existing session
   */
  async resumeSession(sessionId) {
    await this.initialize();

    try {
      const sessionData = await this._loadSessionFromDisk(sessionId);
      
      if (!sessionData) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Restore session state
      this.currentSession = sessionData;
      this.sessionData.set(sessionId, sessionData);

      // Convert Sets and Maps from serialized format
      sessionData.visitedUrls = new Set(sessionData.visitedUrls || []);
      sessionData.discoveredAssets = new Map(sessionData.discoveredAssets || []);
      sessionData.downloadedAssets = new Map(sessionData.downloadedAssets || []);
      sessionData.failedAssets = new Map(sessionData.failedAssets || []);

      // Update session status
      sessionData.status = 'resumed';
      sessionData.resumeCount = (sessionData.resumeCount || 0) + 1;
      sessionData.lastResumed = Date.now();

      // Create resume point
      await this._createResumePoint('session_resumed');

      // Start auto-save
      if (this.options.autoSave) {
        this._startAutoSave();
      }

      logger.info('Session resumed successfully', {
        component: 'SessionManager',
        sessionId,
        resumeCount: sessionData.resumeCount,
        processedUrls: sessionData.stats.processedUrls,
        downloadedAssets: sessionData.stats.downloadedAssets
      });

      return sessionData;
    } catch (error) {
      logger.error('Failed to resume session', {
        component: 'SessionManager',
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Save current session state
   */
  async saveSession(sessionId = null) {
    const targetSessionId = sessionId || this.currentSession?.id;
    
    if (!targetSessionId) {
      throw new Error('No session to save');
    }

    const sessionData = this.sessionData.get(targetSessionId);
    if (!sessionData) {
      throw new Error(`Session ${targetSessionId} not found in memory`);
    }

    try {
      // Update last saved timestamp
      sessionData.lastSaved = Date.now();

      // Prepare data for serialization
      const dataToSave = {
        ...sessionData,
        visitedUrls: Array.from(sessionData.visitedUrls),
        discoveredAssets: Array.from(sessionData.discoveredAssets.entries()),
        downloadedAssets: Array.from(sessionData.downloadedAssets.entries()),
        failedAssets: Array.from(sessionData.failedAssets.entries())
      };

      // Save to disk
      const sessionPath = this._getSessionPath(targetSessionId);
      await fs.writeFile(sessionPath, JSON.stringify(dataToSave, null, 2));

      logger.debug('Session saved', {
        component: 'SessionManager',
        sessionId: targetSessionId,
        size: JSON.stringify(dataToSave).length
      });
    } catch (error) {
      logger.error('Failed to save session', {
        component: 'SessionManager',
        sessionId: targetSessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update session with crawling progress
   */
  async updateSession(updates) {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    try {
      // Update session data
      if (updates.visitedUrl) {
        this.currentSession.visitedUrls.add(updates.visitedUrl);
        this.currentSession.stats.processedUrls = this.currentSession.visitedUrls.size;
      }

      if (updates.discoveredAsset) {
        const { url, data } = updates.discoveredAsset;
        this.currentSession.discoveredAssets.set(url, data);
        this.currentSession.stats.totalAssets = this.currentSession.discoveredAssets.size;
      }

      if (updates.downloadedAsset) {
        const { url, data } = updates.downloadedAsset;
        this.currentSession.downloadedAssets.set(url, data);
        this.currentSession.stats.downloadedAssets = this.currentSession.downloadedAssets.size;
        this.currentSession.stats.bytesDownloaded += data.size || 0;
      }

      if (updates.failedAsset) {
        const { url, error } = updates.failedAsset;
        this.currentSession.failedAssets.set(url, { error, timestamp: Date.now() });
        this.currentSession.stats.failedAssets = this.currentSession.failedAssets.size;
      }

      if (updates.error) {
        this.currentSession.errors.push({
          ...updates.error,
          timestamp: Date.now()
        });
        this.currentSession.stats.errorsEncountered = this.currentSession.errors.length;
      }

      if (updates.queuedUrls) {
        this.currentSession.queuedUrls = updates.queuedUrls;
      }

      if (updates.cookies) {
        this.currentSession.cookies = updates.cookies;
      }

      if (updates.localStorage) {
        this.currentSession.localStorage = { ...this.currentSession.localStorage, ...updates.localStorage };
      }

      if (updates.sessionStorage) {
        this.currentSession.sessionStorage = { ...this.currentSession.sessionStorage, ...updates.sessionStorage };
      }

      // Update status if provided
      if (updates.status) {
        this.currentSession.status = updates.status;
      }

      // Create resume point if significant progress made
      if (this._shouldCreateResumePoint()) {
        await this._createResumePoint('progress_checkpoint');
      }

    } catch (error) {
      logger.error('Failed to update session', {
        component: 'SessionManager',
        sessionId: this.currentSession.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Complete current session
   */
  async completeSession(sessionId = null) {
    const targetSessionId = sessionId || this.currentSession?.id;
    
    if (!targetSessionId) {
      throw new Error('No session to complete');
    }

    const sessionData = this.sessionData.get(targetSessionId);
    if (!sessionData) {
      throw new Error(`Session ${targetSessionId} not found`);
    }

    // Update session status
    sessionData.status = 'completed';
    sessionData.endTime = Date.now();
    sessionData.duration = sessionData.endTime - sessionData.startTime;

    // Create final resume point
    await this._createResumePoint('session_completed');

    // Save final state
    await this.saveSession(targetSessionId);

    // Stop auto-save
    this._stopAutoSave();

    logger.info('Session completed', {
      component: 'SessionManager',
      sessionId: targetSessionId,
      duration: sessionData.duration,
      processedUrls: sessionData.stats.processedUrls,
      downloadedAssets: sessionData.stats.downloadedAssets,
      bytesDownloaded: sessionData.stats.bytesDownloaded
    });

    return sessionData;
  }

  /**
   * List all available sessions
   */
  async listSessions() {
    await this.initialize();

    try {
      const sessionFiles = await fs.readdir(this.options.sessionDir);
      const sessions = [];

      for (const file of sessionFiles) {
        if (file.endsWith('.session.json')) {
          try {
            const sessionPath = path.join(this.options.sessionDir, file);
            const sessionData = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
            
            sessions.push({
              id: sessionData.id,
              url: sessionData.url,
              status: sessionData.status,
              startTime: sessionData.startTime,
              lastSaved: sessionData.lastSaved,
              stats: sessionData.stats,
              resumeCount: sessionData.resumeCount || 0
            });
          } catch (error) {
            logger.warn('Failed to read session file', {
              component: 'SessionManager',
              file,
              error: error.message
            });
          }
        }
      }

      return sessions.sort((a, b) => b.lastSaved - a.lastSaved);
    } catch (error) {
      logger.error('Failed to list sessions', {
        component: 'SessionManager',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId) {
    await this.initialize();

    try {
      const sessionPath = this._getSessionPath(sessionId);
      await fs.unlink(sessionPath);
      
      // Remove from memory if loaded
      this.sessionData.delete(sessionId);
      
      if (this.currentSession?.id === sessionId) {
        this.currentSession = null;
        this._stopAutoSave();
      }

      logger.info('Session deleted', {
        component: 'SessionManager',
        sessionId
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to delete session', {
          component: 'SessionManager',
          sessionId,
          error: error.message
        });
        throw error;
      }
    }
  }

  /**
   * Get session recovery options
   */
  async getRecoveryOptions(sessionId) {
    const sessionData = await this._loadSessionFromDisk(sessionId);
    
    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const options = {
      canResume: sessionData.status !== 'completed',
      resumePoints: sessionData.resumePoints || [],
      lastActivity: sessionData.lastSaved,
      progress: {
        processedUrls: sessionData.stats.processedUrls,
        totalEstimated: sessionData.stats.totalUrls || sessionData.stats.processedUrls,
        downloadedAssets: sessionData.stats.downloadedAssets,
        failedAssets: sessionData.stats.failedAssets
      },
      issues: []
    };

    // Check for potential issues
    const timeSinceLastActivity = Date.now() - sessionData.lastSaved;
    if (timeSinceLastActivity > 24 * 60 * 60 * 1000) {
      options.issues.push('Session is over 24 hours old');
    }

    if (sessionData.stats.errorsEncountered > 50) {
      options.issues.push('High error count detected');
    }

    if (sessionData.resumeCount > 5) {
      options.issues.push('Multiple resume attempts detected');
    }

    return options;
  }

  /**
   * Export session for backup or sharing
   */
  async exportSession(sessionId, includeAssets = false) {
    const sessionData = await this._loadSessionFromDisk(sessionId);
    
    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const exportData = {
      version: '2.0',
      exportTimestamp: Date.now(),
      sessionData: sessionData
    };

    if (!includeAssets) {
      // Remove large asset data to reduce export size
      delete exportData.sessionData.downloadedAssets;
      delete exportData.sessionData.discoveredAssets;
    }

    return exportData;
  }

  /**
   * Import session from export
   */
  async importSession(exportData, newSessionId = null) {
    if (exportData.version !== '2.0') {
      throw new Error('Unsupported export version');
    }

    const sessionId = newSessionId || this._generateSessionId(exportData.sessionData.url);
    
    // Restore session data
    const sessionData = {
      ...exportData.sessionData,
      id: sessionId,
      importedAt: Date.now(),
      originalId: exportData.sessionData.id
    };

    // Save imported session
    this.sessionData.set(sessionId, sessionData);
    await this.saveSession(sessionId);

    logger.info('Session imported', {
      component: 'SessionManager',
      sessionId,
      originalId: exportData.sessionData.id
    });

    return sessionId;
  }

  /**
   * Private methods
   */
  _generateSessionId(url) {
    const timestamp = Date.now();
    const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
    return `${timestamp}-${urlHash}`;
  }

  _getSessionPath(sessionId) {
    return path.join(this.options.sessionDir, `${sessionId}.session.json`);
  }

  async _loadSessionFromDisk(sessionId) {
    try {
      const sessionPath = this._getSessionPath(sessionId);
      const sessionData = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
      return sessionData;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  _startAutoSave() {
    if (this.autoSaveTimer) {
      this._stopAutoSave();
    }

    this.autoSaveTimer = setInterval(async () => {
      if (this.currentSession) {
        try {
          await this.saveSession();
        } catch (error) {
          logger.error('Auto-save failed', {
            component: 'SessionManager',
            error: error.message
          });
        }
      }
    }, this.options.autoSaveInterval);
  }

  _stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  _shouldCreateResumePoint() {
    if (!this.currentSession) return false;
    
    const lastResumePoint = this.currentSession.lastResumePoint;
    const now = Date.now();
    
    // Create resume point every 5 minutes or every 100 processed URLs
    return !lastResumePoint || 
           (now - lastResumePoint > 300000) || 
           (this.currentSession.stats.processedUrls % 100 === 0);
  }

  async _createResumePoint(type) {
    if (!this.currentSession) return;

    const resumePoint = {
      type,
      timestamp: Date.now(),
      stats: { ...this.currentSession.stats },
      queuedUrlsCount: this.currentSession.queuedUrls.length,
      visitedUrlsCount: this.currentSession.visitedUrls.size,
      discoveredAssetsCount: this.currentSession.discoveredAssets.size
    };

    this.currentSession.resumePoints.push(resumePoint);
    this.currentSession.lastResumePoint = Date.now();

    // Keep only last 20 resume points
    if (this.currentSession.resumePoints.length > 20) {
      this.currentSession.resumePoints = this.currentSession.resumePoints.slice(-20);
    }
  }

  async _cleanupExpiredSessions() {
    try {
      const sessionFiles = await fs.readdir(this.options.sessionDir);
      const now = Date.now();
      let cleanedCount = 0;

      for (const file of sessionFiles) {
        if (file.endsWith('.session.json')) {
          try {
            const sessionPath = path.join(this.options.sessionDir, file);
            const stats = await fs.stat(sessionPath);
            
            // Delete sessions older than expiration time
            if (now - stats.mtime.getTime() > this.options.sessionExpiration) {
              await fs.unlink(sessionPath);
              cleanedCount++;
            }
          } catch (error) {
            // Ignore errors when cleaning individual files
          }
        }
      }

      if (cleanedCount > 0) {
        logger.info('Cleaned up expired sessions', {
          component: 'SessionManager',
          cleanedCount
        });
      }
    } catch (error) {
      logger.warn('Session cleanup failed', {
        component: 'SessionManager',
        error: error.message
      });
    }
  }

  /**
   * Get current session information
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * Check if session can be resumed
   */
  async canResumeSession(sessionId) {
    const sessionData = await this._loadSessionFromDisk(sessionId);
    return sessionData && sessionData.status !== 'completed';
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId = null) {
    const targetSessionId = sessionId || this.currentSession?.id;
    const sessionData = this.sessionData.get(targetSessionId);
    
    if (!sessionData) {
      return null;
    }

    return {
      ...sessionData.stats,
      progressPercentage: sessionData.stats.totalUrls > 0 
        ? Math.round((sessionData.stats.processedUrls / sessionData.stats.totalUrls) * 100)
        : 0,
      successRate: sessionData.stats.totalAssets > 0
        ? Math.round(((sessionData.stats.downloadedAssets) / sessionData.stats.totalAssets) * 100)
        : 0,
      duration: sessionData.endTime 
        ? sessionData.endTime - sessionData.startTime
        : Date.now() - sessionData.startTime
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.currentSession) {
      await this.saveSession();
    }
    
    this._stopAutoSave();
    
    logger.info('Session manager shutdown completed', {
      component: 'SessionManager'
    });
  }
}

module.exports = SessionManager;