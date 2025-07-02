/**
 * Advanced Retry & Error Recovery System
 * Based on HTTrack's battle-tested retry mechanisms
 * Implements exponential backoff, circuit breakers, and graceful degradation
 */

const { logger } = require('./logger');

class RetryManager {
  constructor(options = {}) {
    this.options = {
      // HTTrack-style retry configuration
      maxRetries: options.maxRetries || 3,
      baseDelay: options.baseDelay || 1000, // 1 second base delay
      maxDelay: options.maxDelay || 30000, // 30 seconds max delay
      exponentialBase: options.exponentialBase || 2,
      jitter: options.jitter !== false, // Add randomness to delays
      
      // Circuit breaker configuration
      circuitBreakerThreshold: options.circuitBreakerThreshold || 5, // Failures before breaking
      circuitBreakerTimeout: options.circuitBreakerTimeout || 60000, // 1 minute timeout
      
      // Request-specific timeouts
      connectTimeout: options.connectTimeout || 10000, // 10 seconds
      readTimeout: options.readTimeout || 30000, // 30 seconds
      totalTimeout: options.totalTimeout || 120000, // 2 minutes total
      
      // Error categorization
      retryableErrors: options.retryableErrors || [
        'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT',
        'EPIPE', 'EHOSTUNREACH', 'EAI_AGAIN', 'ENETUNREACH'
      ],
      
      retryableStatusCodes: options.retryableStatusCodes || [
        408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524
      ],
      
      // Rate limiting
      enableRateLimit: options.enableRateLimit !== false,
      requestsPerSecond: options.requestsPerSecond || 10,
      concurrentRequests: options.concurrentRequests || 5,
      
      ...options
    };

    // Internal state
    this.circuitBreakers = new Map(); // Per-domain circuit breakers
    this.requestQueue = []; // Rate-limited request queue
    this.activeRequests = new Set(); // Track concurrent requests
    this.domainStats = new Map(); // Per-domain statistics
    this.globalStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      totalRetries: 0
    };

    // Start request processor
    if (this.options.enableRateLimit) {
      this._startRequestProcessor();
    }
  }

  /**
   * Execute a function with HTTrack-style retry logic
   */
  async executeWithRetry(fn, context = {}) {
    const { url, operation = 'request' } = context;
    const domain = url ? this._extractDomain(url) : 'unknown';
    
    // Check circuit breaker
    if (this._isCircuitOpen(domain)) {
      throw new Error(`Circuit breaker open for domain: ${domain}`);
    }

    let lastError;
    let attempt = 0;
    
    while (attempt <= this.options.maxRetries) {
      try {
        // Wait for rate limiting if enabled
        if (this.options.enableRateLimit && url) {
          await this._waitForRateLimit();
        }

        // Record attempt
        this._recordAttempt(domain, attempt > 0);
        
        // Execute the function with timeout
        const result = await this._executeWithTimeout(fn, context, attempt);
        
        // Record success
        this._recordSuccess(domain);
        
        return result;
      } catch (error) {
        lastError = error;
        attempt++;
        
        // Record failure
        this._recordFailure(domain, error);
        
        // Check if error is retryable
        if (!this._isRetryable(error) || attempt > this.options.maxRetries) {
          break;
        }
        
        // Calculate delay with exponential backoff and jitter
        const delay = this._calculateDelay(attempt);
        
        logger.warn(`Retry attempt ${attempt}/${this.options.maxRetries} for ${operation}`, {
          url,
          error: error.message,
          delay,
          component: 'RetryManager'
        });
        
        // Wait before retry
        await this._delay(delay);
      }
    }

    // All retries exhausted
    this._updateCircuitBreaker(domain);
    throw lastError;
  }

  /**
   * Execute with timeout wrapper
   */
  async _executeWithTimeout(fn, context, attempt) {
    const timeout = this._getTimeoutForAttempt(attempt);
    
    return Promise.race([
      fn(context),
      this._createTimeout(timeout, `Operation timeout after ${timeout}ms`)
    ]);
  }

  /**
   * Check if error is retryable based on HTTrack logic
   */
  _isRetryable(error) {
    // Check error codes
    if (error.code && this.options.retryableErrors.includes(error.code)) {
      return true;
    }
    
    // Check HTTP status codes
    if (error.response && error.response.status) {
      return this.options.retryableStatusCodes.includes(error.response.status);
    }
    
    // Check error messages for common patterns
    const errorMessage = error.message.toLowerCase();
    const retryablePatterns = [
      'timeout', 'connection', 'network', 'dns', 'socket',
      'reset', 'refused', 'unreachable', 'temporary'
    ];
    
    return retryablePatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  _calculateDelay(attempt) {
    const exponentialDelay = this.options.baseDelay * 
      Math.pow(this.options.exponentialBase, attempt - 1);
    
    const cappedDelay = Math.min(exponentialDelay, this.options.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (this.options.jitter) {
      const jitterRange = cappedDelay * 0.1; // 10% jitter
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      return Math.max(0, cappedDelay + jitter);
    }
    
    return cappedDelay;
  }

  /**
   * Get timeout for specific attempt (progressive timeout)
   */
  _getTimeoutForAttempt(attempt) {
    const baseTimeout = this.options.connectTimeout;
    const progressiveTimeout = baseTimeout * (1 + attempt * 0.5);
    return Math.min(progressiveTimeout, this.options.totalTimeout);
  }

  /**
   * Circuit breaker implementation
   */
  _isCircuitOpen(domain) {
    const breaker = this.circuitBreakers.get(domain);
    if (!breaker) return false;
    
    if (breaker.state === 'open') {
      // Check if circuit should be half-open
      if (Date.now() - breaker.lastFailure > this.options.circuitBreakerTimeout) {
        breaker.state = 'half-open';
        breaker.failures = 0;
        return false;
      }
      return true;
    }
    
    return false;
  }

  /**
   * Update circuit breaker state
   */
  _updateCircuitBreaker(domain) {
    const stats = this.domainStats.get(domain);
    if (!stats) return;
    
    let breaker = this.circuitBreakers.get(domain);
    if (!breaker) {
      breaker = { state: 'closed', failures: 0, lastFailure: 0 };
      this.circuitBreakers.set(domain, breaker);
    }
    
    // Calculate recent failure rate
    const recentFailures = stats.failures;
    const recentTotal = stats.requests;
    const failureRate = recentTotal > 0 ? recentFailures / recentTotal : 0;
    
    if (failureRate > 0.5 && recentFailures >= this.options.circuitBreakerThreshold) {
      breaker.state = 'open';
      breaker.lastFailure = Date.now();
      
      logger.warn(`Circuit breaker opened for domain: ${domain}`, {
        failures: recentFailures,
        total: recentTotal,
        failureRate,
        component: 'RetryManager'
      });
    }
  }

  /**
   * Record attempt statistics
   */
  _recordAttempt(domain, isRetry) {
    this.globalStats.totalRequests++;
    if (isRetry) {
      this.globalStats.retriedRequests++;
      this.globalStats.totalRetries++;
    }
    
    let domainStats = this.domainStats.get(domain);
    if (!domainStats) {
      domainStats = { requests: 0, failures: 0, successes: 0, retries: 0 };
      this.domainStats.set(domain, domainStats);
    }
    
    domainStats.requests++;
    if (isRetry) domainStats.retries++;
  }

  /**
   * Record successful request
   */
  _recordSuccess(domain) {
    this.globalStats.successfulRequests++;
    
    const domainStats = this.domainStats.get(domain);
    if (domainStats) {
      domainStats.successes++;
    }
    
    // Reset circuit breaker on success
    const breaker = this.circuitBreakers.get(domain);
    if (breaker && breaker.state === 'half-open') {
      breaker.state = 'closed';
      breaker.failures = 0;
    }
  }

  /**
   * Record failed request
   */
  _recordFailure(domain, error) {
    this.globalStats.failedRequests++;
    
    const domainStats = this.domainStats.get(domain);
    if (domainStats) {
      domainStats.failures++;
    }
    
    // Update circuit breaker failures
    let breaker = this.circuitBreakers.get(domain);
    if (!breaker) {
      breaker = { state: 'closed', failures: 0, lastFailure: 0 };
      this.circuitBreakers.set(domain, breaker);
    }
    
    breaker.failures++;
    breaker.lastFailure = Date.now();
  }

  /**
   * Rate limiting implementation
   */
  async _waitForRateLimit() {
    return new Promise((resolve) => {
      this.requestQueue.push(resolve);
    });
  }

  /**
   * Start request processor for rate limiting
   */
  _startRequestProcessor() {
    const intervalMs = 1000 / this.options.requestsPerSecond;
    
    setInterval(() => {
      // Process requests within concurrent limit
      while (this.requestQueue.length > 0 && 
             this.activeRequests.size < this.options.concurrentRequests) {
        const resolve = this.requestQueue.shift();
        
        // Track active request
        const requestId = Symbol('request');
        this.activeRequests.add(requestId);
        
        // Resolve with cleanup
        resolve();
        
        // Schedule cleanup
        setTimeout(() => {
          this.activeRequests.delete(requestId);
        }, 100); // Small delay to prevent immediate reuse
      }
    }, intervalMs);
  }

  /**
   * Utility functions
   */
  _extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _createTimeout(ms, message) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Get retry statistics
   */
  getStats() {
    const stats = {
      global: { ...this.globalStats },
      domains: Object.fromEntries(this.domainStats),
      circuitBreakers: Object.fromEntries(
        Array.from(this.circuitBreakers.entries()).map(([domain, breaker]) => [
          domain,
          { state: breaker.state, failures: breaker.failures }
        ])
      ),
      rateLimiting: {
        queueLength: this.requestQueue.length,
        activeRequests: this.activeRequests.size
      }
    };

    // Calculate derived statistics
    stats.global.successRate = stats.global.totalRequests > 0
      ? stats.global.successfulRequests / stats.global.totalRequests
      : 0;
    
    stats.global.retryRate = stats.global.totalRequests > 0
      ? stats.global.retriedRequests / stats.global.totalRequests
      : 0;

    return stats;
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.globalStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      totalRetries: 0
    };
    this.domainStats.clear();
  }

  /**
   * Manually open circuit breaker for domain
   */
  openCircuitBreaker(domain) {
    this.circuitBreakers.set(domain, {
      state: 'open',
      failures: this.options.circuitBreakerThreshold,
      lastFailure: Date.now()
    });
    
    logger.info(`Manually opened circuit breaker for domain: ${domain}`, {
      component: 'RetryManager'
    });
  }

  /**
   * Manually close circuit breaker for domain
   */
  closeCircuitBreaker(domain) {
    this.circuitBreakers.set(domain, {
      state: 'closed',
      failures: 0,
      lastFailure: 0
    });
    
    logger.info(`Manually closed circuit breaker for domain: ${domain}`, {
      component: 'RetryManager'
    });
  }

  /**
   * Create a retry wrapper for a specific function
   */
  createRetryWrapper(fn, defaultContext = {}) {
    return async (context = {}) => {
      const mergedContext = { ...defaultContext, ...context };
      return this.executeWithRetry(fn, mergedContext);
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    // Process remaining requests in queue
    const remainingRequests = [...this.requestQueue];
    this.requestQueue = [];
    
    // Resolve all queued requests to prevent hanging
    remainingRequests.forEach(resolve => resolve());
    
    logger.info('RetryManager shutdown completed', {
      component: 'RetryManager',
      stats: this.getStats()
    });
  }
}

module.exports = RetryManager;